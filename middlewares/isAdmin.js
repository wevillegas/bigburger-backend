const isAdmin = (req, res, next) => {
    if(req.user.role !== 'ADMINISTRADOR') return res.status(401).send('no tiene los permisos necesarios para borrar un usuario');
    // rastro mínimo de auditoría: quién hizo qué acción de administrador
    console.info(`[admin] ${req.user._id} ${req.method} ${req.originalUrl}`)
    next();
}

module.exports = isAdmin;