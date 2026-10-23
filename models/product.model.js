var mongoose = require("mongoose")
var Schema = mongoose.Schema

var Categories = [
    "Simples",
    "Dobles",
    "Triples",
    "Vegetarianas",
    "Panchos",
    "Papas Fritas",
    "Nuggets",
]

var ProductSchema = new Schema ({
    name: {
        type: String,
        required: true,
        maxlength: 40,
        minlength: 2,
    },
    description: {
        type: String,
        required: true,
        maxlength: 250,
        minlength: 1,
    },
    price: {
        type: Number,
        required: true,
        min: 1,
        max: 10000,

    },
    // unidades disponibles (0 = sin stock); cada pedido las descuenta de forma atómica
    stock: {
        type: Number,
        min: 0,
        default: 100,
        validate: { validator: Number.isInteger, message: 'El stock debe ser un número entero' },
    },
    categorie_id: {
        type: String,
        enum: Categories,
        default: "Simples",
        required: true,
    },

    IMG: {
        type: String,
        required: true,
        default: "unknow",
    },

    createdAt: {
        type: Date,
        required: true,
        default: Date.now,
    },
    updatedAt: {
        type: Date,
    },
    clientId: {
        type: String,
        ref: "User",
        default: "Unknow",

    }
})

module.exports = mongoose.model("Product", ProductSchema)