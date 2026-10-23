const rateLimit = require('express-rate-limit')

const limiter = (max, windowMs, message, extra = {}) => rateLimit({
    ...extra,
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    // los tests de integración hacen decenas de altas/logins desde la misma IP
    skip: () => process.env.DISABLE_RATE_LIMIT === '1',
    message: { message }
})

// frena altas masivas de cuentas falsas
module.exports.signupLimiter = limiter(10, 60 * 60 * 1000, 'Demasiados registros desde esta conexión. Probá más tarde.')

// frena el spam de pedidos de invitado (el único endpoint de escritura sin cuenta)
module.exports.guestOrderLimiter = limiter(20, 60 * 60 * 1000, 'Demasiados pedidos desde esta conexión. Probá más tarde.')

// fuerza bruta distribuida: 10 intentos fallidos cada 15 min contra el mismo email, vengan de la IP que vengan
module.exports.emailLoginLimiter = limiter(10, 15 * 60 * 1000, 'Demasiados intentos para esta cuenta. Probá de nuevo en unos minutos.', {
    skipSuccessfulRequests: true,
    keyGenerator: (req) => (typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : 'sin-email')
})
