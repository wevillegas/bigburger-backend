const jwt = require('jsonwebtoken')
const User = require('../models/user.model')
const secret = require('../config/config').secret

// el token solo identifica al usuario (_id); rol y estado se leen de la base en cada request,
// así un cambio de rol o una baja tiene efecto inmediato en vez de esperar a que expire el JWT
const COOKIE_NAME = 'bb_token'

// el navegador manda la cookie HttpOnly; clientes de API (y los tests) pueden seguir usando el header Authorization
function tokenFrom(req) {
    const header = req.headers.authorization
    if (header) return String(header).replace(/^Bearer\s+/i, '')
    const cookie = new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]+)`).exec(req.headers.cookie || '')
    return cookie ? decodeURIComponent(cookie[1]) : ''
}

async function userFromToken(req) {
    const { _id } = jwt.verify(tokenFrom(req), secret)

    const user = await User.findById(_id).select('-password -__v').lean()
    if (!user || !user.active) {
        const error = new Error('Sesión inválida')
        error.name = 'JsonWebTokenError' // el errorHandler lo traduce a 401
        throw error
    }
    user._id = String(user._id)
    return user
}

module.exports = userFromToken
module.exports.tokenFrom = tokenFrom
module.exports.COOKIE_NAME = COOKIE_NAME
