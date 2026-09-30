var express = require("express")
var api = express.Router()
var productController = require("../controllers/product.controller")
const checkAuthentication = require('../middlewares/authentication')
const isAdmin = require('../middlewares/isAdmin')
const asyncHandler = require('../middlewares/asyncHandler')

api.post("/product", [checkAuthentication, isAdmin] ,asyncHandler(productController.addProducts))
api.get("/products", asyncHandler(productController.getProducts))
api.get("/product", asyncHandler(productController.getProduct))
api.delete("/product/", [checkAuthentication, isAdmin] ,asyncHandler(productController.deleteProduct))
api.put("/product/upd_id", [checkAuthentication, isAdmin] ,asyncHandler(productController.updateProduct))

module.exports = api
