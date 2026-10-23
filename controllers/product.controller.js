var Product = require('../models/product.model')
const { pickAllowedFields } = require('../utils/sanitize')

const MAX_ITEMS_PER_PAGE = 200
const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const ALLOWED_FIELDS = ['name', 'description', 'price', 'stock', 'categorie_id', 'IMG']

// Agregar menú
// la validación de campos obligatorios/tipos/límites la hace el schema de Mongoose al guardar
async function addProducts(req, res){
    let newProduct = new Product(pickAllowedFields(req.body, ALLOWED_FIELDS))
    await newProduct.save()
    res.send({
        nuevoProducto: newProduct
    })
}


// Obtener todos los menús
async function getProducts(req, res){
    // tope de 200 por request (el catálogo es chico); page/itemsPerPage inválidos caen al default
    const itemsPerPage = Math.min(Math.max(parseInt(req.query.itemsPerPage, 10) || MAX_ITEMS_PER_PAGE, 1), MAX_ITEMS_PER_PAGE)

    const itemsToSkip = Math.max(parseInt(req.query.page, 10) || 0, 0) * itemsPerPage

    // el texto del usuario se escapa: nunca se interpreta como regex (evita ReDoS)
    const parametrosDeBusqueda = typeof req.query.name === 'string' && req.query.name
        ? {name: new RegExp(escapeRegex(req.query.name), "i")}
        : {}

    const [productosDataBase, totalProducts] = await Promise.all([
        Product.find(parametrosDeBusqueda)
        // .populate('clientId')
        .collation({locale: "es"})
        .sort({

            category: -1,

            price: 1,
        })
        .skip(itemsToSkip)
        .limit(itemsPerPage),
        Product.countDocuments(parametrosDeBusqueda)])

        res.send({
            products: productosDataBase,
            total: totalProducts
        })
}


// funcion para obtener un menú por id
async function getProduct(req, res){
    const productId = req.params.id
    const product = await Product.findById(productId)
    if(!product) return res.status(404).send("No se encontró el producto buscado")
    return res.status(200).send({
        product: product
    })
}


// funcion para borrar menú
async function deleteProduct(req, res) {
    const ProductIdDelete = req.params.id;
    const productDelete = await Product.findByIdAndDelete(ProductIdDelete);
    if (!productDelete) return res.status(404).send('El producto que desea borrar no fue encontrado')

    return res.status(200).send({msg: `El producto ${productDelete.name} ha sido borrado correctamente`});
}


// funcion para editar menú
// solo se aplican los campos permitidos (evita que el body inyecte campos no previstos por el schema)
async function updateProduct (req, res){
    const id = req.params.id

    const productChanges = { ...pickAllowedFields(req.body, ALLOWED_FIELDS), updatedAt: new Date() }

    const updatedProduct = await Product.findByIdAndUpdate(id, productChanges, {
        new: true,
        runValidators: true,
        context: 'query'
    })

    if (!updatedProduct) return res.status(404).send({message: "El producto a modificar no fue encontrado"})
    return res.status(200).send(updatedProduct)
}

module.exports = {
    addProducts,
    getProduct,
    getProducts,
    deleteProduct,
    updateProduct
}