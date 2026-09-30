const secret = require('../config/config').secret;
const jwt = require('jsonwebtoken');

// para rutas que un invitado puede usar (ej. checkout): si no hay token, sigue como invitado (req.user = null);
// si hay un token pero es inválido/expirado, sí rechaza (evita que un token roto se cuele silenciosamente)
const optionalAuth = (req, res, next) => {
    const token = req.headers.authorization;
    if (!token) {
        req.user = null;
        return next();
    }

    jwt.verify(token, secret, (error, jwtDecoded) => {
        if (error) return res.status(403).send({ ok: false, msg: error });
        req.user = jwtDecoded;
        next();
    });
};

module.exports = optionalAuth;
