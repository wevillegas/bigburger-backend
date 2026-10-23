const userFromToken = require('../utils/authUser')

// para rutas que un invitado puede usar (ej. checkout): si no hay token, sigue como invitado (req.user = null);
// si hay un token pero es inválido/expirado, sí rechaza (evita que un token roto se cuele silenciosamente)
const optionalAuth = async (req, res, next) => {
    if (!userFromToken.tokenFrom(req)) {
        req.user = null
        return next()
    }
    try {
        req.user = await userFromToken(req)
        next()
    } catch (error) {
        next(error)
    }
}

module.exports = optionalAuth
