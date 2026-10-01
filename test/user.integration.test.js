// Integration test: cambio de contraseña propio contra la app Express real + una MongoDB real.
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret'
process.env.FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000'

const { test, before, after, beforeEach } = require('node:test')
const assert = require('node:assert/strict')
const mongoose = require('mongoose')
const request = require('supertest')

const app = require('../app')
const User = require('../schemas/user.schemas')

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
        .expect(403)
})
