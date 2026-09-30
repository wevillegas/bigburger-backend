var Order = require("../schemas/order.schema")
var Product = require("../schemas/products.schema")
var User = require("../schemas/user.schemas")
const {
    sanitizeQuantity,
    validateCajaOrder,
    validateGuestContact,
    validateDelivery,
    computeRedemption,
    computeEarnedPoints,
    resolvePointsRecipientId
} = require("../utils/sanitize")

async function createOrder(req, res){
    const cartItems = Array.isArray(req.body.menu) ? req.body.menu : []
    if(cartItems.length === 0) return res.status(400).send({message:"El carrito esta vacio"})

    // pedido de mostrador/mesa cargado por un admin, a diferencia del checkout online de un cliente
    const channel = req.body.channel === 'caja' ? 'caja' : 'online'
    let customerLabel, paymentMethod, linkedCustomer
    if (channel === 'caja') {
        const validation = validateCajaOrder(req.body, req.user?.role)
        if (!validation.ok) return res.status(validation.status).send({message: validation.message})
        customerLabel = validation.customerLabel
        paymentMethod = validation.paymentMethod

        // opcional: vincular el pedido de mostrador a una cuenta real para que sume puntos
        if (req.body.linkedCustomerId) {
            const account = await User.findById(req.body.linkedCustomerId).select('_id fullName')
            if (account) linkedCustomer = { _id: account._id, fullName: account.fullName }
        }
    }

    // checkout online sin cuenta: pide nombre y teléfono de contacto en vez de exigir login
    let guestContact
    if (channel === 'online' && !req.user) {
        const guestValidation = validateGuestContact(req.body)
        if (!guestValidation.ok) return res.status(guestValidation.status).send({message: guestValidation.message})
        guestContact = { name: guestValidation.name, phone: guestValidation.phone }
    }

    // retiro en el local (default) o envío a domicilio
    const deliveryValidation = validateDelivery(req.body)
    if (!deliveryValidation.ok) return res.status(deliveryValidation.status).send({message: deliveryValidation.message})

    // el precio y el stock se recalculan desde la base, nunca se confía en lo que manda el cliente
    const sanitizedMenu = []
    for(const item of cartItems){
        const product = await Product.findById(item._id)
        if(!product) return res.status(400).send({message:`Un producto del carrito ya no existe`})
        if(!product.stock) return res.status(400).send({message:`${product.name} está sin stock`})

        const cantidad = sanitizeQuantity(item.cantidad)
        sanitizedMenu.push({
            _id: product._id,
            name: product.name,
            IMG: product.IMG,
            price: product.price,
            categorie_id: product.categorie_id,
            cantidad,
            note: typeof item.note === 'string' ? item.note.slice(0, 120) : ''
        })
    }

    const subtotal = sanitizedMenu.reduce((sum, item) => sum + item.price * item.cantidad, 0)

    // canje de puntos: solo un cliente con cuenta pidiendo online puede pagar parte con sus puntos
    let pointsRedeemed = 0, discount = 0
    if (channel === 'online' && req.user && req.body.redeemPoints) {
        const accountUser = await User.findById(req.user._id)
        if (accountUser && accountUser.points > 0) {
            const redemption = computeRedemption(accountUser.points, true, subtotal)
            pointsRedeemed = redemption.pointsRedeemed
            discount = redemption.discount
            if (pointsRedeemed > 0) {
                await User.findByIdAndUpdate(accountUser._id, { $inc: { points: -pointsRedeemed } })
            }
        }
    }

    const total = subtotal - discount
    const orderUser = req.user || { fullName: guestContact.name, guest: true }

    let newOrder = new Order({
        user: orderUser,
        menu: sanitizedMenu,
        total,
        channel,
        customerLabel,
        paymentMethod,
        guestContact,
        deliveryMethod: deliveryValidation.deliveryMethod,
        deliveryAddress: deliveryValidation.deliveryAddress,
        discount,
        pointsRedeemed,
        linkedCustomer
    })
    await newOrder.save()
    res.status(200).send({
        newOrder: newOrder
    })
}

async function getOrders(req, res){
    // un usuario común solo ve sus propios pedidos, solo el admin ve todos
    const filter = req.user.role === 'ADMINISTRADOR' ? {} : { 'user._id': req.user._id }
    const ordersDB = await Order.find(filter).sort({cretatedAt:-1})
    res.status(200).send({ ticket: ordersDB })
}

//UPADATE ORDER
// única modificación permitida desde este endpoint: el estado del pedido
async function updateOrder(req, res) {
    const id = req.params.upd_id;

    const orderChangesToApply = {}
    if (req.body.state !== undefined) orderChangesToApply.state = req.body.state

    const existingOrder = await Order.findById(id)
    if (!existingOrder) return res.status(404).send('No se encontro la orden');

    const updatedOrder = await Order.findByIdAndUpdate(id, orderChangesToApply, {
        new: true,
        runValidators: true,
        context: 'query'
    });

    // se gana 1 punto cada $100 al completar el pedido, una sola vez, y solo si hay una cuenta real detrás
    // (invitados no tienen cuenta; en caja solo suma si el admin vinculó el pedido a un cliente registrado)
    const becomesRealizado = orderChangesToApply.state === 'realizado' && existingOrder.state !== 'realizado'
    const pointsRecipientId = becomesRealizado ? resolvePointsRecipientId(existingOrder) : null
    if (pointsRecipientId) {
        const earned = computeEarnedPoints(existingOrder.total)
        if (earned > 0) {
            await User.findByIdAndUpdate(pointsRecipientId, { $inc: { points: earned } })
            updatedOrder.pointsEarned = earned
            await updatedOrder.save()
        }
    }

    return res.status(200).send(updatedOrder)
}
module.exports = {createOrder,getOrders,updateOrder
}