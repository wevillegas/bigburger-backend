require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const User = require('./schemas/user.schemas');
const Product = require('./schemas/products.schema');
const Order = require('./schemas/order.schema');

async function seed() {
    if (!process.env.MONGODB_URI) {
        console.log('Falta MONGODB_URI en el .env');
        process.exit(1);
    }

    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Conectado a MongoDB');

    await User.deleteMany({});
    await Product.deleteMany({});
    await Order.deleteMany({});

    const users = await User.create([
        {
            fullName: 'Admin BigBurger',
            email: 'admin@bigburger.com',
            password: await bcrypt.hash('admin123', 10),
            role: 'ADMINISTRADOR',
        },
        {
            fullName: 'Usuario Demo',
            email: 'demo@bigburger.com',
            password: await bcrypt.hash('demo1234', 10),
            role: 'USUARIO',
        },
        {
            fullName: 'Martina Gomez',
            email: 'martina@bigburger.com',
            password: await bcrypt.hash('demo1234', 10),
            role: 'USUARIO',
        },
        {
            fullName: 'Lucas Fernandez',
            email: 'lucas@bigburger.com',
            password: await bcrypt.hash('demo1234', 10),
            role: 'USUARIO',
        },
    ]);
    const [admin, demo, martina, lucas] = users;

    const products = await Product.create([
        {
            name: 'Clásica',
            description: 'Carne, queso, lechuga, tomate',
            price: 5500,
            categorie_id: 'Simples',
            IMG: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=400&h=300&fit=crop&auto=format',
        },
        {
            name: 'Doble Bacon',
            description: 'Doble carne, doble queso, bacon',
            price: 8200,
            categorie_id: 'Dobles',
            IMG: 'https://images.unsplash.com/photo-1571091718767-18b5b1457add?w=400&h=300&fit=crop&auto=format',
        },
        {
            name: 'Veggie',
            description: 'Medallón de vegetales, queso, rúcula',
            price: 6000,
            categorie_id: 'Vegetarianas',
            IMG: 'https://images.unsplash.com/photo-1550317138-10000687a72b?w=400&h=300&fit=crop&auto=format',
        },
        {
            name: 'Triple Cheddar',
            description: 'Triple carne, cheddar fundido, cebolla crispy',
            price: 9800,
            categorie_id: 'Triples',
            IMG: 'https://images.unsplash.com/photo-1553979459-d2229ba7433b?w=400&h=300&fit=crop&auto=format',
        },
        {
            name: 'BBQ Bacon',
            description: 'Carne, salsa BBQ, bacon, aros de cebolla',
            price: 7300,
            categorie_id: 'Dobles',
            IMG: 'https://images.unsplash.com/photo-1586190848861-99aa4a171e90?w=400&h=300&fit=crop&auto=format',
        },
        {
            name: 'Clásica con Cheddar',
            description: 'Carne, cheddar, lechuga, tomate, pepinillos',
            price: 5900,
            categorie_id: 'Simples',
            IMG: 'https://images.unsplash.com/photo-1520072959219-c595dc870360?w=400&h=300&fit=crop&auto=format',
        },
        {
            name: 'Portobello Veggie',
            description: 'Medallón de portobello, queso brie, rúcula',
            price: 6800,
            categorie_id: 'Vegetarianas',
            IMG: 'https://images.unsplash.com/photo-1615297928064-24977384d0da?w=400&h=300&fit=crop&auto=format',
        },
        {
            name: 'Smash Original',
            description: 'Carne smash, queso americano, salsa especial',
            price: 5200,
            categorie_id: 'Simples',
            IMG: 'https://images.unsplash.com/photo-1607013251379-e6eecfffe234?w=400&h=300&fit=crop&auto=format',
        },
        {
            name: 'Pancho Clásico',
            description: 'Salchicha, papas pay, salsas a elección',
            price: 3200,
            categorie_id: 'Panchos',
            IMG: 'https://images.unsplash.com/photo-1612392061787-2d078b3e573b?w=400&h=300&fit=crop&auto=format',
        },
        {
            name: 'Papas Cheddar y Bacon',
            description: 'Papas fritas, cheddar fundido, bacon crocante',
            price: 4100,
            categorie_id: 'Papas Fritas',
            IMG: 'https://images.unsplash.com/photo-1585109649139-366815a0d713?w=400&h=300&fit=crop&auto=format',
        },
        {
            name: 'Nuggets x8',
            description: '8 nuggets de pollo crocantes con salsa a elección',
            price: 3900,
            categorie_id: 'Nuggets',
            IMG: 'https://images.unsplash.com/photo-1562967914-608f82629710?w=400&h=300&fit=crop&auto=format',
        },
    ]);
    const [clasica, dobleBacon, veggie, triple, bbq, clasicaCheddar, portobello, smash] = products;

    const userSnapshot = (u) => ({
        _id: u._id,
        fullName: u.fullName,
        email: u.email,
        role: u.role,
        active: u.active,
    });
    const lineItem = (p, cantidad) => ({
        _id: p._id,
        name: p.name,
        price: p.price,
        IMG: p.IMG,
        cantidad,
    });
    const total = (items) => items.reduce((sum, it) => sum + it.price * it.cantidad, 0);

    const menu1 = [lineItem(clasica, 2), lineItem(dobleBacon, 1)];
    const menu2 = [lineItem(veggie, 1)];
    const menu3 = [lineItem(triple, 1), lineItem(bbq, 1)];
    const menu4 = [lineItem(smash, 3)];
    const menu5 = [lineItem(clasicaCheddar, 2), lineItem(portobello, 1)];
    const menu6 = [lineItem(dobleBacon, 2)];

    await Order.create([
        { user: userSnapshot(demo), menu: menu1, total: total(menu1), state: 'realizado' },
        { user: userSnapshot(martina), menu: menu2, total: total(menu2), state: 'pendiente' },
        { user: userSnapshot(lucas), menu: menu3, total: total(menu3), state: 'pendiente' },
        { user: userSnapshot(demo), menu: menu4, total: total(menu4), state: 'realizado' },
        { user: userSnapshot(martina), menu: menu5, total: total(menu5), state: 'pendiente' },
        { user: userSnapshot(lucas), menu: menu6, total: total(menu6), state: 'realizado' },
    ]);

    console.log('Seed completo: 4 usuarios, 11 productos, 6 pedidos');
    console.log('Login admin       -> admin@bigburger.com / admin123');
    console.log('Login demo        -> demo@bigburger.com / demo1234');
    console.log('Login martina     -> martina@bigburger.com / demo1234');
    console.log('Login lucas       -> lucas@bigburger.com / demo1234');
    await mongoose.disconnect();
}

seed().catch((err) => {
    console.error(err);
    process.exit(1);
});
