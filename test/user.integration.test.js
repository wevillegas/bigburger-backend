// Integration test: cambio de contraseña propio contra la app Express real + una MongoDB real.
process.env.DISABLE_RATE_LIMIT = '1'
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret'
process.env.FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000'

const { test, before, after, beforeEach } = require('node:test')
const assert = require('node:assert/strict')
const mongoose = require('mongoose')
const request = require('supertest')

const app = require('../app')
const User = require('../models/user.model')

const TEST_DB_URI = process.env.MONGODB_URI_TEST || 'mongodb://127.0.0.1:27017/bigburger_test'

before(async () => {
    await mongoose.connect(TEST_DB_URI)
})

after(async () => {
    await mongoose.connection.dropDatabase()
    await mongoose.disconnect()
})

beforeEach(async () => {
    await User.deleteMany({})
})

async function registerAndLogin(email) {
    await request(app).post('/api/user').send({ fullName: 'Cliente Test', email, password: 'secreto123' }).expect(200)
    const { body } = await request(app).post('/api/login').send({ email, password: 'secreto123' }).expect(200)
    return body.token
}

test('cambia la contraseña con la actual correcta y permite loguearse con la nueva', async () => {
    const token = await registerAndLogin('cambia1@test.com')

    await request(app)
        .put('/api/user/me/password')
        .set('authorization', token)
        .send({ currentPassword: 'secreto123', newPassword: 'nuevaClave123' })
        .expect(200)

    await request(app)
        .post('/api/login')
        .send({ email: 'cambia1@test.com', password: 'secreto123' })
        .expect(401)

    await request(app)
        .post('/api/login')
        .send({ email: 'cambia1@test.com', password: 'nuevaClave123' })
        .expect(200)
})

test('rechaza el cambio si la contraseña actual es incorrecta', async () => {
    const token = await registerAndLogin('cambia2@test.com')

    await request(app)
        .put('/api/user/me/password')
        .set('authorization', token)
        .send({ currentPassword: 'incorrecta', newPassword: 'nuevaClave123' })
        .expect(401)
})

test('rechaza una contraseña nueva demasiado corta', async () => {
    const token = await registerAndLogin('cambia3@test.com')

    await request(app)
        .put('/api/user/me/password')
        .set('authorization', token)
        .send({ currentPassword: 'secreto123', newPassword: '123' })
        .expect(400)
})

test('requiere autenticacion', async () => {
    await request(app)
        .put('/api/user/me/password')
        .send({ currentPassword: 'x', newPassword: 'nuevaClave123' })
        .expect(401)
})

test('login responde igual si el email no existe o la contraseña es incorrecta, y rechaza operadores NoSQL', async () => {
    await registerAndLogin('enum1@test.com')

    const wrongPassword = await request(app).post('/api/login').send({ email: 'enum1@test.com', password: 'mala' }).expect(401)
    const unknownEmail = await request(app).post('/api/login').send({ email: 'nadie@test.com', password: 'mala' }).expect(401)
    assert.deepEqual(wrongPassword.body, unknownEmail.body)

    await request(app).post('/api/login').send({ email: { $ne: null }, password: 'secreto123' }).expect(401)
})

test('el email se normaliza a minusculas y el registro valida contraseña y formato', async () => {
    await request(app).post('/api/user').send({ fullName: 'Ana', email: 'Ana@Test.com', password: 'secreto123' }).expect(200)
    await request(app).post('/api/login').send({ email: 'ANA@test.com', password: 'secreto123' }).expect(200)

    await request(app).post('/api/user').send({ fullName: 'Ana', email: 'otra@test.com', password: 'corta' }).expect(400)
    await request(app).post('/api/user').send({ fullName: 'Ana', email: 'no-es-email', password: 'secreto123' }).expect(400)
    await request(app).post('/api/user').send({ fullName: 'Ana', email: 'larga@test.com', password: 'a'.repeat(73) }).expect(400)
})

test('el token solo lleva el _id: un cambio de rol o una baja aplican de inmediato', async () => {
    const token = await registerAndLogin('sesion1@test.com')
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString())
    assert.deepEqual(Object.keys(payload).sort(), ['_id', 'exp', 'iat'])

    await request(app).get('/api/user').set('authorization', token).query({ user_id: payload._id }).expect(200)
    await request(app).get('/api/users').set('authorization', token).expect(401) // aún no es admin

    await User.updateOne({ _id: payload._id }, { role: 'ADMINISTRADOR' })
    await request(app).get('/api/users').set('authorization', token).expect(200)

    await User.updateOne({ _id: payload._id }, { active: false })
    await request(app).get('/api/user').set('authorization', token).query({ user_id: payload._id }).expect(401)
    await request(app).post('/api/login').send({ email: 'sesion1@test.com', password: 'secreto123' }).expect(403)
})

test('un token invalido responde 401 generico sin detalle del error', async () => {
    const { body } = await request(app).get('/api/users').set('authorization', 'basura').expect(401)
    assert.deepEqual(body, { message: 'Token inválido o expirado' })
})

test('el login deja la sesion en una cookie HttpOnly y esa cookie autentica; logout la borra', async () => {
    await request(app).post('/api/user').send({ fullName: 'Ana', email: 'cookie1@test.com', password: 'secreto123' }).expect(200)
    const login = await request(app).post('/api/login').send({ email: 'cookie1@test.com', password: 'secreto123' }).expect(200)

    const setCookie = login.headers['set-cookie'][0]
    assert.match(setCookie, /^bb_token=/)
    assert.match(setCookie, /HttpOnly/)

    const cookie = setCookie.split(';')[0]
    await request(app).get('/api/user').set('Cookie', cookie).query({ user_id: login.body.user._id }).expect(200)

    const logout = await request(app).post('/api/logout').expect(200)
    assert.match(logout.headers['set-cookie'][0], /^bb_token=;/)
})

test('CSRF: una escritura desde otro origen se rechaza aunque lleve la cookie', async () => {
    await request(app).post('/api/user').send({ fullName: 'Ana', email: 'csrf1@test.com', password: 'secreto123' }).expect(200)
    const login = await request(app).post('/api/login').send({ email: 'csrf1@test.com', password: 'secreto123' }).expect(200)
    const cookie = login.headers['set-cookie'][0].split(';')[0]

    await request(app).put('/api/user/me').set('Cookie', cookie).set('Origin', 'https://sitio-malo.com').send({ fullName: 'Hack' }).expect(403)
    await request(app).put('/api/user/me').set('Cookie', cookie).set('Origin', process.env.FRONTEND_URL).send({ fullName: 'Ok' }).expect(200)
})
