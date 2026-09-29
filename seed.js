require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const User = require('./schemas/user.schemas');
const Product = require('./schemas/products.schema');

async function seed() {
    if (!process.env.MONGODB_URI) {
        console.log('Falta MONGODB_URI en el .env');
        process.exit(1);
    }

    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Conectado a MongoDB');

    await User.deleteMany({});
    await Product.deleteMany({});

    await User.create([
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
    ]);

    await Product.create([
        {
            name: 'Clásica',
            description: 'Carne, queso, lechuga, tomate',
            price: 5500,
            categorie_id: 'Simples',
            IMG: 'https://via.placeholder.com/300x200?text=Clasica',
        },
        {
            name: 'Doble Bacon',
            description: 'Doble carne, doble queso, bacon',
            price: 8200,
            categorie_id: 'Dobles',
            IMG: 'https://via.placeholder.com/300x200?text=Doble+Bacon',
        },
        {
            name: 'Veggie',
            description: 'Medallón de vegetales, queso, rúcula',
            price: 6000,
            categorie_id: 'Vegetarianas',
            IMG: 'https://via.placeholder.com/300x200?text=Veggie',
        },
    ]);

    console.log('Seed completo: 2 usuarios, 3 productos');
    console.log('Login admin -> admin@bigburger.com / admin123');
    await mongoose.disconnect();
}

seed().catch((err) => {
    console.error(err);
    process.exit(1);
});
