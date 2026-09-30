var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var rolesValidos = [

    'ADMINISTRADOR',
    'USUARIO'

]

var UserSchema = new Schema({
    fullName: { type: String, required: true, maxlength: 40 },
    email: { type: String, required: true, unique: true, maxlength: 40 },
    password: { type: String, required: true },
    active: { type: Boolean, default: true },
    role: { type: String, required: true, default: 'USUARIO', enum: rolesValidos },
    phone: { type: String, maxlength: 20 },
    address: { type: String, maxlength: 120 },
    // programa de puntos: se ganan al completar un pedido y se pueden canjear como descuento
    points: { type: Number, default: 0, min: 0 }

});

module.exports = mongoose.model('User', UserSchema)