let express = require('express');
let app = express();
let user_routes = require('./routes/user.routes');
let product_routes = require("./routes/product.routes")
let order_routes = require("./routes/order.routes")
let errorHandler = require('./middlewares/errorHandler')
let cors = require('cors')
let helmet = require('helmet')

// cabeceras de seguridad estándar (CSP se desactiva: no servimos HTML/assets propios, solo API JSON)
app.use(helmet({ contentSecurityPolicy: false }))

// detrás de un proxy (Render, Heroku, nginx) req.ip sería la IP del proxy y los rate limits se compartirían
// entre todos los usuarios: TRUST_PROXY = cantidad de proxies delante de la app (normalmente 1)
const trustProxyHops = parseInt(process.env.TRUST_PROXY, 10)
if (trustProxyHops) app.set('trust proxy', trustProxyHops)

// solo el frontend conocido puede llamar a la API desde el navegador (credentials: la sesión viaja en una cookie)
const allowedOrigin = process.env.FRONTEND_URL || 'http://localhost:3000'
app.use(cors({ origin: allowedOrigin, credentials: true }))

// la sesión va en una cookie, así que hay que cortar el CSRF: una escritura que el navegador marca
// como venida de otro sitio se rechaza (sin Origin = cliente no-navegador, que no manda cookies ajenas)
app.use((req, res, next) => {
    const isWrite = !['GET', 'HEAD', 'OPTIONS'].includes(req.method)
    if (isWrite && req.headers.origin && req.headers.origin !== allowedOrigin) {
        return res.status(403).send({ message: 'Origen no permitido' })
    }
    next()
})

app.use(express.json())

app.use('/api',[
    user_routes,
    product_routes,
    order_routes

]);

app.use(errorHandler);

module.exports = app;