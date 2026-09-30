// envuelve un controller async: cualquier rechazo de promesa cae en el error handler central
module.exports = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
