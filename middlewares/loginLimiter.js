const rateLimit = require('express-rate-limit')

// frena fuerza bruta de contraseña: 10 intentos cada 15 min por IP
module.exports = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { msg: 'Demasiados intentos de inicio de sesión. Probá de nuevo en unos minutos.' }
})
