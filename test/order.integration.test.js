// Integration test: flujo completo de un pedido contra la app Express real + una MongoDB real
// (en CI, el servicio "mongodb" del workflow; en local, una instancia en MONGODB_URI_TEST o localhost:27017).
// No mockea nada entre capas: ejercita rutas -> controllers -> models -> DB tal como en producción.
process.env.DISABLE_RATE_LIMIT = '1'
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret'
process.env.FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000'

const { test, before, after, beforeEach } = require('node:test')
const assert = require('node:assert/strict')
const mongoose = require('mongoose')
const request = require('supertest')

const app = require('../app')
const User = require('../models/user.model')
const Product = require('../models/product.model')
const Order = require('../models/order.model')

const TEST_DB_URI = process.env.MONGODB_URI_TEST || 'mongodb://127.0.0.1:27017/bigburger_test'

before(async () => {
    await mongoose.connect(TEST_DB_URI)
})

after(async () => {
    await mongoose.connection.dropDatabase()
    await mongoose.disconnect()
})

beforeEach(async () => {
    await Promise.all([
        User.deleteMany({}),
        Product.deleteMany({}),
        Order.deleteMany({})
    ])
})

async function registerAndLogin(overrides = {}) {
    const body = { fullName: 'Cliente Test', email: 'cliente@test.com', password: 'secreto123', ...overrides }
    await request(app).post('/api/user').send(body).expect(200)
    if (overrides.role) {
        await User.updateOne({ email: body.email }, { role: overrides.role })
    }
    const { body: loginBody } = await request(app)
        .post('/api/login')
        .send({ email: body.email, password: body.password })
        .expect(200)
    return loginBody
}

async function createProduct(token) {
    const { body } = await request(app)
        .post('/api/product')
        .set('authorization', token)
        .send({ name: 'Doble Bacon', description: 'Con bacon', price: 100, categorie_id: 'Dobles', IMG: 'doble.png' })
        .expect(200)
    return body.nuevoProducto
}

test('invitado hace un pedido online sin cuenta', async () => {
    const admin = await registerAndLogin({ email: 'admin@test.com', role: 'ADMINISTRADOR' })
    const product = await createProduct(admin.token)

    const { body } = await request(app)
        .post('/api/order')
        .send({
            menu: [{ _id: product._id, cantidad: 2 }],
            guestName: 'Juan Invitado',
            guestPhone: '3815551234'
        })
        .expect(200)

    assert.equal(body.newOrder.total, 200)
    assert.equal(body.newOrder.guestContact.name, 'Juan Invitado')
    assert.equal(body.newOrder.channel, 'online')

    // el invitado sigue su pedido con el token; sin token válido no se ve nada
    const tracked = await request(app).get(`/api/order/track/${body.newOrder.trackingToken}`).expect(200)
    assert.equal(tracked.body.order.state, 'pendiente')
    assert.equal(tracked.body.order.guestContact, undefined)
    await request(app).get('/api/order/track/inexistente').expect(404)
})

test('cancelar un pedido repone el stock una sola vez y solo lo puede cancelar su dueno o un admin', async () => {
    const admin = await registerAndLogin({ email: 'admin-cancel@test.com', role: 'ADMINISTRADOR' })
    const cliente = await registerAndLogin({ email: 'cliente-cancel@test.com' })
    const otro = await registerAndLogin({ email: 'otro-cancel@test.com' })
    const product = await createProduct(admin.token)
    const stockOf = async () => (await request(app).get('/api/products')).body.products.find(p => p._id === product._id).stock

    const guest = await request(app).post('/api/order')
        .send({ menu: [{ _id: product._id, cantidad: 2 }], guestName: 'Ana', guestPhone: '381' }).expect(200)
    const before = await stockOf()
    await request(app).put(`/api/order/track/${guest.body.newOrder.trackingToken}/cancel`).expect(200)
    assert.equal(await stockOf(), before + 2)
    await request(app).put(`/api/order/track/${guest.body.newOrder.trackingToken}/cancel`).expect(409)
    assert.equal(await stockOf(), before + 2)

    const mine = await request(app).post('/api/order').set('authorization', cliente.token)
        .send({ menu: [{ _id: product._id, cantidad: 1 }] })
    const id = mine.body.newOrder._id
    await request(app).put(`/api/order/${id}/cancel`).set('authorization', otro.token).expect(404)
    await request(app).put(`/api/order/${id}/cancel`).set('authorization', cliente.token).expect(200)
    await request(app).put(`/api/order/${id}`).set('authorization', admin.token).send({ state: 'pendiente' }).expect(400)
})

test('cancelar devuelve los puntos canjeados y solo se puede dentro de los 5 minutos (el admin no tiene limite)', async () => {
    const admin = await registerAndLogin({ email: 'admin-ventana@test.com', role: 'ADMINISTRADOR' })
    const cliente = await registerAndLogin({ email: 'cliente-ventana@test.com' })
    const product = await createProduct(admin.token)
    await User.updateOne({ email: 'cliente-ventana@test.com' }, { points: 50 })
    const pointsOf = async () => (await User.findOne({ email: 'cliente-ventana@test.com' })).points

    const withPoints = await request(app).post('/api/order').set('authorization', cliente.token)
        .send({ menu: [{ _id: product._id, cantidad: 1 }], redeemPoints: true }).expect(200)
    assert.ok(withPoints.body.newOrder.pointsRedeemed > 0)
    assert.ok(await pointsOf() < 50)
    await request(app).put(`/api/order/${withPoints.body.newOrder._id}/cancel`).set('authorization', cliente.token).expect(200)
    assert.equal(await pointsOf(), 50)

    const old = await request(app).post('/api/order').set('authorization', cliente.token)
        .send({ menu: [{ _id: product._id, cantidad: 1 }] }).expect(200)
    await Order.updateOne({ _id: old.body.newOrder._id }, { createdAt: new Date(Date.now() - 6 * 60 * 1000) })
    await request(app).put(`/api/order/${old.body.newOrder._id}/cancel`).set('authorization', cliente.token).expect(409)
    await request(app).put(`/api/order/${old.body.newOrder._id}/cancel`).set('authorization', admin.token).expect(200)
})

test('precio y stock se recalculan en el servidor, no se confia en lo que manda el cliente', async () => {
    const admin = await registerAndLogin({ email: 'admin2@test.com', role: 'ADMINISTRADOR' })
    const product = await createProduct(admin.token)

    const { body } = await request(app)
        .post('/api/order')
        .send({
            // el cliente intenta mandar un precio manipulado; el server debe ignorarlo y usar el de la DB
            menu: [{ _id: product._id, cantidad: 1, price: 1 }],
            guestName: 'Ana',
            guestPhone: '3815550000'
        })
        .expect(200)

    assert.equal(body.newOrder.total, 100)
})

test('flujo completo: cliente con cuenta pide, el admin marca el pedido como realizado y el cliente gana puntos', async () => {
    const admin = await registerAndLogin({ email: 'admin3@test.com', role: 'ADMINISTRADOR' })
    const cliente = await registerAndLogin({ email: 'cliente3@test.com' })
    const product = await createProduct(admin.token)

    const { body: orderBody } = await request(app)
        .post('/api/order')
        .set('authorization', cliente.token)
        .send({ menu: [{ _id: product._id, cantidad: 1 }] })
        .expect(200)

    assert.equal(orderBody.newOrder.total, 100)
    assert.equal(orderBody.newOrder.user.email, 'cliente3@test.com')

    const { body: updatedOrder } = await request(app)
        .put(`/api/order/${orderBody.newOrder._id}`)
        .set('authorization', admin.token)
        .send({ state: 'realizado' })
        .expect(200)

    assert.equal(updatedOrder.state, 'realizado')
    assert.equal(updatedOrder.pointsEarned, 1) // 1 punto cada $100

    const { body: clienteDB } = await request(app)
        .get('/api/user')
        .set('authorization', cliente.token)
        .query({ user_id: orderBody.newOrder.user._id })
        .expect(200)
    assert.equal(clienteDB.user.points, 1)
})

test('un pedido online sin nombre/telefono de invitado es rechazado', async () => {
    const admin = await registerAndLogin({ email: 'admin4@test.com', role: 'ADMINISTRADOR' })
    const product = await createProduct(admin.token)

    await request(app)
        .post('/api/order')
        .send({ menu: [{ _id: product._id, cantidad: 1 }] })
        .expect(400)
})

test('un cliente sin rol admin no puede crear productos', async () => {
    const cliente = await registerAndLogin({ email: 'cliente5@test.com' })

    await request(app)
        .post('/api/product')
        .set('authorization', cliente.token)
        .send({ name: 'Hack Burger', description: 'x', price: 1, categorie_id: 'Simples', IMG: 'x.png' })
        .expect(401)
})

test('un usuario comun no puede listar usuarios ni ver el perfil de otro', async () => {
    const admin = await registerAndLogin({ email: 'admin4@test.com', role: 'ADMINISTRADOR' })
    const cliente = await registerAndLogin({ email: 'cliente4@test.com' })

    await request(app).get('/api/users').set('authorization', cliente.token).expect(401)
    await request(app).get('/api/users').set('authorization', admin.token).expect(200)

    await request(app).get('/api/user').set('authorization', cliente.token).query({ user_id: admin.user._id }).expect(403)
    await request(app).get('/api/user').set('authorization', cliente.token).query({ user_id: cliente.user._id }).expect(200)
    await request(app).get('/api/user').set('authorization', admin.token).query({ user_id: cliente.user._id }).expect(200)
})

test('alternar el estado del pedido no vuelve a acreditar puntos', async () => {
    const admin = await registerAndLogin({ email: 'admin5@test.com', role: 'ADMINISTRADOR' })
    const cliente = await registerAndLogin({ email: 'cliente5@test.com' })
    const product = await createProduct(admin.token)

    const { body } = await request(app).post('/api/order').set('authorization', cliente.token)
        .send({ menu: [{ _id: product._id, cantidad: 1 }] }).expect(200)
    const id = body.newOrder._id

    for (const state of ['realizado', 'pendiente', 'realizado']) {
        await request(app).put(`/api/order/${id}`).set('authorization', admin.token).send({ state }).expect(200)
    }
    assert.equal((await User.findById(cliente.user._id)).points, 1)
})

test('dos pedidos simultaneos no pueden gastar los mismos puntos', async () => {
    const admin = await registerAndLogin({ email: 'admin6@test.com', role: 'ADMINISTRADOR' })
    const cliente = await registerAndLogin({ email: 'cliente6@test.com' })
    const product = await createProduct(admin.token)
    await User.updateOne({ _id: cliente.user._id }, { points: 5 })

    const send = () => request(app).post('/api/order').set('authorization', cliente.token)
        .send({ menu: [{ _id: product._id, cantidad: 1 }], redeemPoints: true })
    const results = await Promise.all([send(), send()])

    assert.deepEqual(results.map(r => r.status).sort(), [200, 409])
    assert.equal((await User.findById(cliente.user._id)).points, 0)
    assert.equal(await Order.countDocuments({}), 1)
})

test('el buscador de productos trata el texto como literal, no como regex', async () => {
    const admin = await registerAndLogin({ email: 'admin7@test.com', role: 'ADMINISTRADOR' })
    await createProduct(admin.token)

    const { body } = await request(app).get('/api/products').query({ name: '(.*' }).expect(200)
    assert.equal(body.total, 0)
    await request(app).get('/api/products').query({ name: 'doble', page: 'x', itemsPerPage: '999999' }).expect(200)
})

test('la cantidad por item y el tamano del carrito tienen tope', async () => {
    const admin = await registerAndLogin({ email: 'admin8@test.com', role: 'ADMINISTRADOR' })
    const cliente = await registerAndLogin({ email: 'cliente8@test.com' })
    const product = await createProduct(admin.token)

    const { body } = await request(app).post('/api/order').set('authorization', cliente.token)
        .send({ menu: [{ _id: product._id, cantidad: 1e9 }] }).expect(200)
    assert.equal(body.newOrder.menu[0].cantidad, 50)

    const bigCart = Array.from({ length: 31 }, () => ({ _id: product._id, cantidad: 1 }))
    await request(app).post('/api/order').set('authorization', cliente.token).send({ menu: bigCart }).expect(400)
})

test('crear producto ignora campos fuera de la lista permitida y la paginacion usa itemsPerPage', async () => {
    const admin = await registerAndLogin({ email: 'admin9@test.com', role: 'ADMINISTRADOR' })
    for (const name of ['Uno', 'Dos', 'Tres']) {
        await request(app).post('/api/product').set('authorization', admin.token)
            .send({ name, description: 'x', price: 100, IMG: 'a.png', clientId: 'hack', updatedAt: '2000-01-01' }).expect(200)
    }
    const stored = await Product.findOne({ name: 'Uno' })
    assert.equal(stored.clientId, 'Unknow')
    assert.equal(stored.updatedAt, undefined)

    const page0 = await request(app).get('/api/products').query({ itemsPerPage: 2, page: 0 }).expect(200)
    const page1 = await request(app).get('/api/products').query({ itemsPerPage: 2, page: 1 }).expect(200)
    assert.equal(page0.body.products.length, 2)
    assert.equal(page1.body.products.length, 1)
    assert.equal(page1.body.total, 3)
})

test('rutas REST de producto: GET, PUT y DELETE por id en la URL', async () => {
    const admin = await registerAndLogin({ email: 'admin10@test.com', role: 'ADMINISTRADOR' })
    const cliente = await registerAndLogin({ email: 'cliente10@test.com' })
    const product = await createProduct(admin.token)

    const { body: found } = await request(app).get(`/api/product/${product._id}`).expect(200)
    assert.equal(found.product.name, 'Doble Bacon')

    await request(app).put(`/api/product/${product._id}`).set('authorization', cliente.token).send({ price: 1 }).expect(401)
    const { body: updated } = await request(app).put(`/api/product/${product._id}`).set('authorization', admin.token).send({ price: 250 }).expect(200)
    assert.equal(updated.price, 250)

    await request(app).delete(`/api/product/${product._id}`).set('authorization', admin.token).expect(200)
    await request(app).get(`/api/product/${product._id}`).expect(404)
})

test('el stock numerico se descuenta al pedir y se rechaza lo que supera lo disponible', async () => {
    const admin = await registerAndLogin({ email: 'admin11@test.com', role: 'ADMINISTRADOR' })
    const cliente = await registerAndLogin({ email: 'cliente11@test.com' })
    const product = await createProduct(admin.token)
    await Product.updateOne({ _id: product._id }, { stock: 3 })

    const order = (cantidad) => request(app).post('/api/order').set('authorization', cliente.token)
        .send({ menu: [{ _id: product._id, cantidad }] })

    await order(2).expect(200)
    assert.equal((await Product.findById(product._id)).stock, 1)

    const tooMany = await order(2).expect(400)
    assert.match(tooMany.body.message, /Solo quedan 1/)

    await order(1).expect(200)
    assert.equal((await Product.findById(product._id)).stock, 0)
    await order(1).expect(400) // sin stock
})

test('dos pedidos simultaneos no pueden vender la misma ultima unidad', async () => {
    const admin = await registerAndLogin({ email: 'admin12@test.com', role: 'ADMINISTRADOR' })
    const cliente = await registerAndLogin({ email: 'cliente12@test.com' })
    const product = await createProduct(admin.token)
    await Product.updateOne({ _id: product._id }, { stock: 1 })

    const send = () => request(app).post('/api/order').set('authorization', cliente.token)
        .send({ menu: [{ _id: product._id, cantidad: 1 }] })
    const results = await Promise.all([send(), send()])

    assert.deepEqual(results.map(r => r.status).sort(), [200, 409])
    assert.equal((await Product.findById(product._id)).stock, 0)
    assert.equal(await Order.countDocuments({}), 1)
})

test('el pedido guarda foto tipada del cliente e items, sin campos sueltos', async () => {
    const admin = await registerAndLogin({ email: 'admin13@test.com', role: 'ADMINISTRADOR' })
    const cliente = await registerAndLogin({ email: 'cliente13@test.com' })
    const product = await createProduct(admin.token)

    const { body } = await request(app).post('/api/order').set('authorization', cliente.token)
        .send({ menu: [{ _id: product._id, cantidad: 2, note: 'sin cebolla' }] }).expect(200)

    assert.deepEqual(Object.keys(body.newOrder.user).sort(), ['_id', 'email', 'fullName', 'role'])
    assert.equal(body.newOrder.user._id, cliente.user._id)
    assert.equal(body.newOrder.menu[0].note, 'sin cebolla')
    assert.ok(body.newOrder.createdAt)
    assert.equal(body.newOrder.cretatedAt, undefined)
})
