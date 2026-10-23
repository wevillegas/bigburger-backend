// Migra una base existente al esquema actual. Es idempotente: se puede correr más de una vez.
//   - cretatedAt (typo) -> createdAt en pedidos y productos
//   - stock booleano -> numérico (true = 100 unidades, false = 0; ajustalo después desde el panel)
//   - _id del cliente en la foto del pedido: ObjectId -> string (para que "mis pedidos" lo encuentre)
require('dotenv').config();
const mongoose = require('mongoose');

async function migrate() {
    if (!process.env.MONGODB_URI) {
        console.log('Falta MONGODB_URI en el .env');
        process.exit(1);
    }
    await mongoose.connect(process.env.MONGODB_URI);
    const orders = mongoose.connection.collection('orders');
    const products = mongoose.connection.collection('products');

    const rename = { $rename: { cretatedAt: 'createdAt' } };
    const o = await orders.updateMany({ cretatedAt: { $exists: true } }, rename);
    const p = await products.updateMany({ cretatedAt: { $exists: true } }, rename);
    const inStock = await products.updateMany({ stock: true }, { $set: { stock: 100 } });
    const outOfStock = await products.updateMany({ stock: false }, { $set: { stock: 0 } });
    const snapshots = await orders.updateMany(
        { 'user._id': { $type: 'objectId' } },
        [{ $set: { 'user._id': { $toString: '$user._id' } } }]
    );

    console.log(`pedidos con createdAt: ${o.modifiedCount}, productos con createdAt: ${p.modifiedCount}`);
    console.log(`stock true->100: ${inStock.modifiedCount}, false->0: ${outOfStock.modifiedCount}`);
    console.log(`pedidos con user._id convertido a string: ${snapshots.modifiedCount}`);
    await mongoose.disconnect();
}

migrate().catch((err) => {
    console.error(err);
    process.exit(1);
});
