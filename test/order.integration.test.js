// Integration test: flujo completo de un pedido contra la app Express real + una MongoDB real
// (en CI, el servicio "mongodb" del workflow; en local, una instancia en MONGODB_URI_TEST o localhost:27017).
// No mockea nada entre capas: ejercita rutas -> controllers -> schemas -> DB tal como en producción.
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret'
process.env.FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000'

const { test, before, after, beforeEach } = require('node:test')
const assert = require('node:assert/strict')
const mongoose = require('mongoose')
const request = require('supertest')

const app = require('../app')
const User = require('../schemas/user.schemas')
const Product = require('../schemas/products.schema')
const Order = require('../schemas/order.schema')

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
