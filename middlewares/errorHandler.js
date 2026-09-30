// formatea cualquier error que llegue por next(err) con un status y mensaje consistentes,
// en vez de que cada controller invente su propio try/catch y código de estado
module.exports = (err, req, res, next) => {
    if (res.headersSent) return next(err);

    if (err.name === 'ValidationError') {
        const message = Object.values(err.errors).map((e) => e.message).join(', ');
        return res.status(400).send({ message });
    }

    if (err.name === 'CastError') {
        return res.status(400).send({ message: 'Identificador inválido' });
    }

    if (err.code === 11000) {
        const field = Object.keys(err.keyValue || {})[0] || 'campo';
        return res.status(400).send({ message: `Ya existe un registro con ese ${field}` });
    }

    if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
        return res.status(401).send({ message: 'Token inválido o expirado' });
    }

    console.error(err);
    res.status(err.status || 500).send({ message: err.message || 'Error interno del servidor' });
};
