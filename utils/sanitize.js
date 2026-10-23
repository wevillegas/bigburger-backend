// solo copia al objeto de salida los campos de allowedFields que vinieron definidos en body
function pickAllowedFields(body, allowedFields) {
    const picked = {}
    for (const field of allowedFields) {
        if (body[field] !== undefined) picked[field] = body[field]
    }
    return picked
}

// cantidad de un ítem de carrito: siempre un entero >= 1, ante cualquier valor raro del cliente
// con tope: un cliente no puede pedir 1e9 unidades de un ítem
const MAX_QUANTITY = 50
const MAX_CART_ITEMS = 30
// tiempo que tienen clientes e invitados para cancelar un pedido (el admin no tiene límite)
const CANCEL_WINDOW_MINUTES = 5

function sanitizeQuantity(value) {
    return Math.min(MAX_QUANTITY, Math.max(1, parseInt(value, 10) || 1))
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// bcrypt solo mira los primeros 72 bytes: una contraseña más larga se truncaría en silencio
function validatePassword(password) {
    if (typeof password !== 'string' || password.length < 8) {
        return 'La contraseña debe tener 8 o más caracteres'
    }
    if (Buffer.byteLength(password) > 72) {
        return 'La contraseña no puede superar los 72 caracteres'
    }
    return null
}

// registro público: tipos string, email normalizado (minúsculas, sin espacios) y contraseña válida
function validateSignup(body) {
    const fullName = typeof body.fullName === 'string' ? body.fullName.trim() : ''
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
    if (!fullName) return { ok: false, status: 400, message: 'Ingresá tu nombre' }
    if (!EMAIL_REGEX.test(email)) return { ok: false, status: 400, message: 'Ingresá un email válido' }

    const passwordError = validatePassword(body.password)
    if (passwordError) return { ok: false, status: 400, message: passwordError }

    return { ok: true, data: { fullName, email, password: body.password } }
}

const PAYMENT_METHODS = ['efectivo', 'transferencia', 'tarjeta']

// valida los datos extra que solo aplican a un pedido cargado desde caja (mostrador/mesa).
// separado de createOrder para poder testearlo sin tocar la base de datos.
function validateCajaOrder(body, userRole) {
    if (userRole !== 'ADMINISTRADOR') {
        return { ok: false, status: 403, message: 'Solo un administrador puede cargar pedidos de caja' }
    }

    const customerLabel = typeof body.customerLabel === 'string' ? body.customerLabel.trim().slice(0, 60) : ''
    if (!customerLabel) {
        return { ok: false, status: 400, message: 'Indicá para quién o para qué mesa es el pedido' }
    }

    if (!PAYMENT_METHODS.includes(body.paymentMethod)) {
        return { ok: false, status: 400, message: 'Seleccioná un método de pago' }
    }

    return { ok: true, customerLabel, paymentMethod: body.paymentMethod }
}

// datos de contacto de un pedido online sin cuenta
function validateGuestContact(body) {
    const name = typeof body.guestName === 'string' ? body.guestName.trim().slice(0, 40) : ''
    const phone = typeof body.guestPhone === 'string' ? body.guestPhone.trim().slice(0, 20) : ''
    if (!name || !phone) {
        return { ok: false, status: 400, message: 'Ingresá tu nombre y teléfono para continuar sin cuenta' }
    }
    return { ok: true, name, phone }
}

const DELIVERY_METHODS = ['retiro', 'envio']

// retiro en el local (default) o envío a domicilio; el envío exige dirección
function validateDelivery(body) {
    const deliveryMethod = DELIVERY_METHODS.includes(body.deliveryMethod) ? body.deliveryMethod : 'retiro'
    if (deliveryMethod === 'envio') {
        const deliveryAddress = typeof body.deliveryAddress === 'string' ? body.deliveryAddress.trim().slice(0, 150) : ''
        if (!deliveryAddress) {
            return { ok: false, status: 400, message: 'Indicá la dirección de envío' }
        }
        return { ok: true, deliveryMethod, deliveryAddress }
    }
    return { ok: true, deliveryMethod, deliveryAddress: undefined }
}

// programa de puntos: 1 punto = $10 de descuento (se canjean todos los disponibles, sin canje parcial),
// y se gana 1 punto cada $100 del total ya pagado (con descuento aplicado)
const POINT_VALUE = 10
const POINTS_PER_CURRENCY = 100

function computeRedemption(userPoints, wantsRedeem, subtotal) {
    if (!wantsRedeem || !userPoints) return { pointsRedeemed: 0, discount: 0 }
    const discount = Math.min(userPoints * POINT_VALUE, subtotal)
    const pointsRedeemed = Math.floor(discount / POINT_VALUE)
    return { pointsRedeemed, discount: pointsRedeemed * POINT_VALUE }
}

function computeEarnedPoints(total) {
    return Math.floor((total || 0) / POINTS_PER_CURRENCY)
}

// a quién hay que acreditarle los puntos de un pedido: en uno online es el dueño de la cuenta;
// en uno de caja "user" es el admin que lo cargó, así que solo suma si el admin vinculó una cuenta real
function resolvePointsRecipientId(order) {
    if (order.channel === 'caja') return order.linkedCustomer?._id || null
    return order.user?._id || null
}

module.exports = {
    MAX_QUANTITY,
    MAX_CART_ITEMS,
    CANCEL_WINDOW_MINUTES,
    validatePassword,
    validateSignup,
    pickAllowedFields,
    sanitizeQuantity,
    validateCajaOrder,
    validateGuestContact,
    validateDelivery,
    computeRedemption,
    computeEarnedPoints,
    resolvePointsRecipientId,
    PAYMENT_METHODS,
    POINT_VALUE,
    POINTS_PER_CURRENCY
}
