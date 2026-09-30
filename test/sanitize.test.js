const { test } = require('node:test')
const assert = require('node:assert/strict')
const {
    pickAllowedFields,
    sanitizeQuantity,
    validateCajaOrder,
    validateGuestContact,
    validateDelivery,
    computeRedemption,
    computeEarnedPoints,
    resolvePointsRecipientId
} = require('../utils/sanitize')

test('pickAllowedFields solo copia campos permitidos', () => {
    const body = { fullName: 'Ana', role: 'ADMINISTRADOR', password: 'secreto' }
    assert.deepEqual(pickAllowedFields(body, ['fullName', 'email']), { fullName: 'Ana' })
})

test('pickAllowedFields ignora campos ausentes en el body', () => {
    assert.deepEqual(pickAllowedFields({}, ['fullName']), {})
})

test('sanitizeQuantity fuerza un entero positivo', () => {
    assert.equal(sanitizeQuantity(3), 3)
    assert.equal(sanitizeQuantity('7'), 7)
    assert.equal(sanitizeQuantity(0), 1)
    assert.equal(sanitizeQuantity(-5), 1)
    assert.equal(sanitizeQuantity('no-numero'), 1)
    assert.equal(sanitizeQuantity(undefined), 1)
})

test('validateCajaOrder rechaza a quien no es administrador', () => {
    const result = validateCajaOrder({ customerLabel: 'Mesa 4', paymentMethod: 'efectivo' }, 'USUARIO')
    assert.equal(result.ok, false)
    assert.equal(result.status, 403)
})

test('validateCajaOrder exige cliente/mesa y método de pago válido', () => {
    assert.equal(validateCajaOrder({ paymentMethod: 'efectivo' }, 'ADMINISTRADOR').ok, false)
    assert.equal(validateCajaOrder({ customerLabel: '   ' }, 'ADMINISTRADOR').ok, false)
    assert.equal(validateCajaOrder({ customerLabel: 'Mesa 4', paymentMethod: 'bitcoin' }, 'ADMINISTRADOR').ok, false)
})

test('validateCajaOrder acepta datos válidos y recorta espacios', () => {
    const result = validateCajaOrder({ customerLabel: '  Mesa 4  ', paymentMethod: 'transferencia' }, 'ADMINISTRADOR')
    assert.deepEqual(result, { ok: true, customerLabel: 'Mesa 4', paymentMethod: 'transferencia' })
})

test('validateGuestContact exige nombre y teléfono', () => {
    assert.equal(validateGuestContact({}).ok, false)
    assert.equal(validateGuestContact({ guestName: 'Ana' }).ok, false)
    assert.equal(validateGuestContact({ guestName: '  ', guestPhone: '123' }).ok, false)
})

test('validateGuestContact acepta datos válidos y recorta espacios', () => {
    const result = validateGuestContact({ guestName: '  Ana  ', guestPhone: ' 3815551234 ' })
    assert.deepEqual(result, { ok: true, name: 'Ana', phone: '3815551234' })
})

test('validateDelivery por defecto es retiro sin exigir dirección', () => {
    assert.deepEqual(validateDelivery({}), { ok: true, deliveryMethod: 'retiro', deliveryAddress: undefined })
})

test('validateDelivery exige dirección cuando es envío', () => {
    const sinDireccion = validateDelivery({ deliveryMethod: 'envio' })
    assert.equal(sinDireccion.ok, false)

    const conDireccion = validateDelivery({ deliveryMethod: 'envio', deliveryAddress: '  Calle Falsa 123  ' })
    assert.deepEqual(conDireccion, { ok: true, deliveryMethod: 'envio', deliveryAddress: 'Calle Falsa 123' })
})

test('computeRedemption no canjea si no se pide o no hay puntos', () => {
    assert.deepEqual(computeRedemption(50, false, 1000), { pointsRedeemed: 0, discount: 0 })
    assert.deepEqual(computeRedemption(0, true, 1000), { pointsRedeemed: 0, discount: 0 })
})

test('computeRedemption canjea todos los puntos disponibles sin superar el subtotal', () => {
    assert.deepEqual(computeRedemption(50, true, 1000), { pointsRedeemed: 50, discount: 500 })
    // 200 puntos = $2000, pero el subtotal es $1500: el descuento no puede superar el subtotal
    assert.deepEqual(computeRedemption(200, true, 1500), { pointsRedeemed: 150, discount: 1500 })
})

test('computeEarnedPoints da 1 punto cada $100', () => {
    assert.equal(computeEarnedPoints(5500), 55)
    assert.equal(computeEarnedPoints(99), 0)
    assert.equal(computeEarnedPoints(0), 0)
})

test('resolvePointsRecipientId usa el dueño de la cuenta en un pedido online', () => {
    const order = { channel: 'online', user: { _id: 'u1' } }
    assert.equal(resolvePointsRecipientId(order), 'u1')
})

test('resolvePointsRecipientId ignora invitados (sin _id de cuenta)', () => {
    const order = { channel: 'online', user: { fullName: 'Invitado', guest: true } }
    assert.equal(resolvePointsRecipientId(order), null)
})

test('resolvePointsRecipientId en caja solo usa el cliente vinculado, nunca al admin que lo cargó', () => {
    const sinVincular = { channel: 'caja', user: { _id: 'admin1' } }
    assert.equal(resolvePointsRecipientId(sinVincular), null)

    const vinculado = { channel: 'caja', user: { _id: 'admin1' }, linkedCustomer: { _id: 'cliente1' } }
    assert.equal(resolvePointsRecipientId(vinculado), 'cliente1')
})
