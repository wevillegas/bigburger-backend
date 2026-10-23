var mongoose = require("mongoose");
var Schema = mongoose.Schema;

var estadosValidos = [
    'pendiente',
    'realizado',
    'cancelado'

]

var canalesValidos = ['online', 'caja']
var metodosPagoValidos = ['efectivo', 'transferencia', 'tarjeta']
var metodosEntregaValidos = ['retiro', 'envio']

// foto del cliente al momento del pedido (no una referencia: el pedido no cambia si el usuario edita su perfil)
var UserSnapshotSchema = new Schema({
    _id: { type: String },
    fullName: { type: String, required: true },
    email: { type: String },
    role: { type: String },
    guest: { type: Boolean }
})

// ítem del carrito ya validado contra el catálogo: nombre y precio son los del momento de la compra
var MenuItemSchema = new Schema({
    _id: { type: Schema.Types.ObjectId },
    name: { type: String, required: true },
    IMG: { type: String },
    price: { type: Number, required: true },
    categorie_id: { type: String },
    cantidad: { type: Number, required: true, min: 1 },
    note: { type: String, maxlength: 120 }
})

var OrderSchema = new Schema({
    user: { type: UserSnapshotSchema, required: true },
    createdAt: {
        type: Date,
        default: Date.now
    },
    menu: {
        type: [MenuItemSchema],
        validate: { validator: (items) => items.length > 0, message: 'El pedido no tiene productos' }
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
    // clave secreta del invitado para consultar el estado de su pedido sin cuenta (no se expone en los listados)
    trackingToken: { type: String, select: false, index: true, sparse: true },
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