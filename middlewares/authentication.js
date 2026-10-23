const userFromToken = require('../utils/authUser')

// cualquier fallo (sin token, token inválido/expirado, usuario inexistente o desactivado) termina en el
// errorHandler como un 401 genérico, sin exponer el detalle del error de jsonwebtoken
const checkAuthentication = async (req, res, next) => {
    try {
        req.user = await userFromToken(req)
        next()
    } catch (error) {
        next(error)
    }
}

module.exports = checkAuthentication
