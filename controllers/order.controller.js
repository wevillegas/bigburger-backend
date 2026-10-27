const crypto = require("crypto")
var Order = require("../models/order.model")
var Product = require("../models/product.model")
var User = require("../models/user.model")
const {
    sanitizeQuantity,
    validateCajaOrder,
    validateGuestContact,
    validateDelivery,
    computeRedemption,
    computeEarnedPoints,
    resolvePointsRecipientId,
    MAX_CART_ITEMS,
    CANCEL_WINDOW_MINUTES
} = require("../utils/sanitize")

async function createOrder(req, res){
    const cartItems = Array.isArray(req.body.menu) ? req.body.menu : []
    if(cartItems.length === 0) return res.status(400).send({message:"El carrito esta vacio"})
    if(cartItems.length > MAX_CART_ITEMS) return res.status(400).send({message:`El carrito admite hasta ${MAX_CART_ITEMS} productos distintos`})

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
        if(cantidad > product.stock) return res.status(400).send({message:`Solo quedan ${product.stock} de ${product.name}`})
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

    // canje de puntos: solo un cliente con cuenta pidiendo online puede pagar parte con sus puntos.
    // el descuento se calcula acá, pero los puntos se descuentan recién al guardar el pedido y de forma atómica
    let pointsRedeemed = 0, discount = 0
    if (channel === 'online' && req.user && req.body.redeemPoints) {
        const accountUser = await User.findById(req.user._id)
        if (accountUser && accountUser.points > 0) {
            const redemption = computeRedemption(accountUser.points, true, subtotal)
            pointsRedeemed = redemption.pointsRedeemed
            discount = redemption.discount
        }
    }

    // reserva de stock: descuento atómico por ítem (stock >= cantidad en el mismo update),
    // así dos pedidos simultáneos no pueden vender la misma unidad dos veces
    const reservedItems = []
    const releaseStock = () => Promise.all(
        reservedItems.map((item) => Product.updateOne({ _id: item._id }, { $inc: { stock: item.cantidad } }))
    )
    for (const item of sanitizedMenu) {
        const reserved = await Product.findOneAndUpdate(
            { _id: item._id, stock: { $gte: item.cantidad } },
            { $inc: { stock: -item.cantidad } }
        )
        if (!reserved) {
            await releaseStock()
            return res.status(409).send({message: `No hay stock suficiente de ${item.name}`})
        }
        reservedItems.push(item)
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
        trackingToken: guestContact ? crypto.randomBytes(16).toString('hex') : undefined,
        deliveryMethod: deliveryValidation.deliveryMethod,
        deliveryAddress: deliveryValidation.deliveryAddress,
        discount,
        pointsRedeemed,
        linkedCustomer
    })

    if (pointsRedeemed > 0) {
        // condición points >= n en el mismo update: si dos pedidos compiten por los mismos puntos, solo uno gana
        const charged = await User.findOneAndUpdate(
            { _id: req.user._id, points: { $gte: pointsRedeemed } },
            { $inc: { points: -pointsRedeemed } }
        )
        if (!charged) {
            await releaseStock()
            return res.status(409).send({message: 'Tus puntos cambiaron, volvé a intentar el pedido'})
        }
    }

    try {
        await newOrder.save()
    } catch (error) {
        // si el pedido no se guardó, devolvemos el stock y los puntos que acabamos de descontar
        await releaseStock()
        if (pointsRedeemed > 0) await User.findByIdAndUpdate(req.user._id, { $inc: { points: pointsRedeemed } })
        throw error
    }
    res.status(200).send({
        newOrder: newOrder
    })
}

// el invitado consulta su pedido con el token que recibió al comprar (16 bytes aleatorios: no se adivina)
async function trackOrder(req, res){
    const order = await Order.findOne({ trackingToken: req.params.token })
    if(!order) return res.status(404).send({message:'No encontramos ese pedido'})
    const { _id, state, total, menu, deliveryMethod, deliveryAddress, createdAt } = order
    res.status(200).send({ order: { _id, state, total, menu, deliveryMethod, deliveryAddress, createdAt } })
}

async function getOrders(req, res){
    // un usuario común solo ve sus propios pedidos (más los de caja vinculados a su cuenta), solo el admin ve todos
    const filter = req.user.role === 'ADMINISTRADOR' ? {} : { $or: [{ 'user._id': req.user._id }, { 'linkedCustomer._id': req.user._id }] }
    const ordersDB = await Order.find(filter).sort({createdAt:-1})
    res.status(200).send({ ticket: ordersDB })
}

// cancela un pedido pendiente y devuelve stock y puntos canjeados. La transición pendiente -> cancelado
// es atómica: si dos cancelaciones compiten, solo una la gana y el stock se repone una única vez
async function cancelAndRestore(filter, res, { enforceWindow }){
    const windowStart = new Date(Date.now() - CANCEL_WINDOW_MINUTES * 60 * 1000)
    const claim = { ...filter, state: 'pendiente' }
    if(enforceWindow) claim.createdAt = { $gte: windowStart }
    const order = await Order.findOneAndUpdate(claim, { state: 'cancelado' }, { new: true })
    if(!order){
        const existing = await Order.findOne(filter)
        if(!existing) return res.status(404).send({message:'No encontramos ese pedido'})
        if(existing.state === 'pendiente') return res.status(409).send({message:`Ya pasaron más de ${CANCEL_WINDOW_MINUTES} minutos: el pedido ya no se puede cancelar. Comunicate con el local.`})
        return res.status(409).send({message:'Solo se puede cancelar un pedido pendiente'})
    }
    await Promise.all(order.menu.map((item) => Product.updateOne({ _id: item._id }, { $inc: { stock: item.cantidad } })))
    if(order.pointsRedeemed > 0 && order.user.guest !== true){
        await User.updateOne({ _id: order.user._id }, { $inc: { points: order.pointsRedeemed } })
    }
    return res.status(200).send({ order: { _id: order._id, state: order.state } })
}

// el cliente cancela su propio pedido; el admin puede cancelar cualquiera
async function cancelOrder(req, res){
    const filter = { _id: req.params.id }
    if(req.user.role !== 'ADMINISTRADOR') filter['user._id'] = String(req.user._id)
    return cancelAndRestore(filter, res, { enforceWindow: req.user.role !== 'ADMINISTRADOR' })
}

// el invitado cancela con el mismo token con el que sigue su pedido
async function cancelGuestOrder(req, res){
    return cancelAndRestore({ trackingToken: req.params.token }, res, { enforceWindow: true })
}

//UPADATE ORDER
// única modificación permitida desde este endpoint: el estado del pedido
async function updateOrder(req, res) {
    const id = req.params.upd_id;

    const orderChangesToApply = {}
    if (req.body.state !== undefined) orderChangesToApply.state = req.body.state

    const existingOrder = await Order.findById(id)
    if (!existingOrder) return res.status(404).send('No se encontro la orden');

    // cancelar repone stock y puntos: solo por PUT /order/:id/cancel, y un pedido cancelado no se reabre
    if (orderChangesToApply.state === 'cancelado' || existingOrder.state === 'cancelado') {
        return res.status(400).send({message: 'Un pedido cancelado no se puede modificar, y para cancelar usá la opción Cancelar'})
    }

    const updatedOrder = await Order.findByIdAndUpdate(id, orderChangesToApply, {
        new: true,
        runValidators: true,
        context: 'query'
    });

    // se gana 1 punto cada $100 al completar el pedido, una sola vez, y solo si hay una cuenta real detrás
    // (invitados no tienen cuenta; en caja solo suma si el admin vinculó el pedido a un cliente registrado)
    // (pointsEarned > 0 marca que ya se acreditó: alternar pendiente/realizado no vuelve a sumar)
    const becomesRealizado = orderChangesToApply.state === 'realizado' && existingOrder.state !== 'realizado' && !existingOrder.pointsEarned
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
module.exports = {createOrder,getOrders,trackOrder,cancelOrder,cancelGuestOrder,updateOrder
}