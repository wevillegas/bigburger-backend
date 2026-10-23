var express = require("express")
var api = express.Router()
var orderController = require("../controllers/order.controller");
const checkAuthentication = require("../middlewares/authentication");
const optionalAuth = require("../middlewares/optionalAuth");
const isAdmin = require("../middlewares/isAdmin");
const asyncHandler = require("../middlewares/asyncHandler");
const { guestOrderLimiter } = require("../middlewares/limiters");

// el checkout acepta invitados: si no hay token, el pedido sigue sin cuenta (con nombre/teléfono de contacto)
api.post("/order", optionalAuth, (req, res, next) => (req.user ? next() : guestOrderLimiter(req, res, next)), asyncHandler(orderController.createOrder))
api.get("/order/track/:token", asyncHandler(orderController.trackOrder))
api.put("/order/track/:token/cancel", asyncHandler(orderController.cancelGuestOrder))
api.put("/order/:id/cancel", checkAuthentication, asyncHandler(orderController.cancelOrder))
api.get("/orders", checkAuthentication, asyncHandler(orderController.getOrders))
api.put("/order/:upd_id", [checkAuthentication, isAdmin], asyncHandler(orderController.updateOrder))

module.exports = api
