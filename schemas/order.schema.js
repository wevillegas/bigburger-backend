var mongoose = require("mongoose");
var Schema = mongoose.Schema;

var estadosValidos = [
    'pendiente',
    'realizado'

]

var canalesValidos = ['online', 'caja']
var metodosPagoValidos = ['efectivo', 'transferencia', 'tarjeta']
var metodosEntregaValidos = ['retiro', 'envio']

var OrderSchema = new Schema({
    user:{type: Object,
        required:true},
    cretatedAt: {
        type: Date,
        default: Date.now
    },
    menu:{
        type: Object,
        required:true,
        default:"Menu Vacio"
    },
    state:{
        type: String,
        enum: estadosValidos,
        default:'pendiente'
    },
    total:{type:Number},
    // pedidos cargados desde el panel de administración (mostrador/mesa), a diferencia de los que hace el cliente online
    channel: {
        type: String,
        enum: canalesValidos,
        default: 'online'
    },
    customerLabel: {
        type: String,
        maxlength: 60
    },
    paymentMethod: {
        type: String,
        enum: metodosPagoValidos
    },
    // contacto de un pedido online hecho sin cuenta
    guestContact: {
        name: { type: String, maxlength: 40 },
        phone: { type: String, maxlength: 20 }
    },
    deliveryMethod: {
        type: String,
        enum: metodosEntregaValidos,
        default: 'retiro'
    },
    deliveryAddress: {
        type: String,
        maxlength: 150
    },
    discount: { type: Number, default: 0 },
    pointsRedeemed: { type: Number, default: 0 },
    pointsEarned: { type: Number, default: 0 },
    // pedido de caja vinculado a una cuenta real (elegida por el admin) para que sume puntos;
    // "user" en un pedido de caja sigue siendo el admin que lo cargó, esto es aparte
    linkedCustomer: {
        _id: { type: Schema.Types.ObjectId, ref: 'User' },
        fullName: { type: String, maxlength: 40 }
    }

})

module.exports = mongoose.model("Order", OrderSchema)