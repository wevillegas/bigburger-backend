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

// solo el frontend conocido puede llamar a la API desde el navegador
const allowedOrigin = process.env.FRONTEND_URL || 'http://localhost:3000'
app.use(cors({ origin: allowedOrigin }))

app.use(express.json())
app.use(express.urlencoded({extended:false}))

app.use('/api',[
    user_routes,
    product_routes,
    order_routes

]);

app.use(errorHandler);

module.exports = app;