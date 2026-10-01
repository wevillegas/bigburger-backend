var express = require('express');

var api = express.Router();
var userController = require('../controllers/user.controllers');
const checkAuthentication = require('../middlewares/authentication')
const isAdmin = require('../middlewares/isAdmin')
const asyncHandler = require('../middlewares/asyncHandler')
const loginLimiter = require('../middlewares/loginLimiter')


api.post('/user', asyncHandler(userController.addUser));

api.get('/users', checkAuthentication, asyncHandler(userController.getUsers));

api.get('/user', checkAuthentication, asyncHandler(userController.getUser));

api.delete('/user/:id', [checkAuthentication, isAdmin], asyncHandler(userController.deleteUser));

// va antes que "/user/:id" — si no, Express tomaría "me" como un id y lo mandaría al endpoint de admin
api.put('/user/me', checkAuthentication, asyncHandler(userController.updateOwnProfile));

api.put('/user/me/password', checkAuthentication, asyncHandler(userController.changeOwnPassword));

// editar (rol/estado/datos) de un usuario es una operación de administrador
api.put('/user/:id', [checkAuthentication, isAdmin], asyncHandler(userController.updateUser));

api.post('/login', loginLimiter, asyncHandler(userController.login));

module.exports = api;

