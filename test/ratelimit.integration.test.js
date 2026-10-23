// El límite de altas y de pedidos de invitado: va en su propio archivo (proceso aparte) para que el resto
// de los tests pueda correr con DISABLE_RATE_LIMIT=1 sin afectar a este.
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret'
process.env.FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000'
delete process.env.DISABLE_RATE_LIMIT

const { test, before, after } = require('node:test')
const assert = require('node:assert/strict')
const mongoose = require('mongoose')
const request = require('supertest')

const app = require('../app')
const User = require('../models/user.model')

const TEST_DB_URI = process.env.MONGODB_URI_TEST || 'mongodb://127.0.0.1:27017/bigburger_test'

before(async () => { await mongoose.connect(TEST_DB_URI) })
after(async () => {
    await mongoose.connection.dropDatabase()
    await mongoose.disconnect()
})

test('el registro se limita a 10 altas por hora desde la misma conexion', async () => {
    await User.deleteMany({})
    const statuses = []
    for (let i = 0; i < 11; i++) {
        const res = await request(app).post('/api/user').send({ fullName: 'Ana', email: `rl${i}@test.com`, password: 'secreto123' })
        statuses.push(res.status)
    }
    assert.deepEqual(statuses, [...Array(10).fill(200), 429])
})

test('el login se limita por email: 10 fallos y el 11 se bloquea, vengan de la IP que vengan', async () => {
    await User.deleteMany({})
    const statuses = []
    for (let i = 0; i < 11; i++) {
        const res = await request(app).post('/api/login').send({ email: 'victima@test.com', password: 'mala' })
        statuses.push(res.status)
    }
    assert.deepEqual(statuses, [...Array(10).fill(401), 429])
})
