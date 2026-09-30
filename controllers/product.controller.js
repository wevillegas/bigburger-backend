var Product = require('../schemas/products.schema')
const { pickAllowedFields } = require('../utils/sanitize')

const ALLOWED_FIELDS = ['name', 'description', 'price', 'stock', 'categorie_id', 'IMG']

// Agregar menú
// la validación de campos obligatorios/tipos/límites la hace el schema de Mongoose al guardar
async function addProducts(req, res){
    let newProduct = new Product(req.body)
    await newProduct.save()
    res.send({
        nuevoProducto: newProduct
    })
}


// Obtener todos los menús
async function getProducts(req, res){
    const itemsPerPage = req.query.itemsPerPage ? req.query.itemsPerPage : Infinity

    const itemsToSkip = req.query.page * 5

    const parametrosDeBusqueda = req.query.name ? {name: new RegExp(req.query.name, "i")} : {} 

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
    const productId = req.query.query_id
    const product = await Product.findById(productId)
    if(!product) return res.status(404).send("No se encontró el producto buscado")
    return res.status(200).send({
        product: product
    })
}


// funcion para borrar menú
async function deleteProduct(req, res) {
    const ProductIdDelete = req.query.product_id_delete;
    const productDelete = await Product.findByIdAndDelete(ProductIdDelete);
    if (!productDelete) return res.status(404).send('El producto que desea borrar no fue encontrado')

    return res.status(200).send({msg: `El producto ${productDelete.name} ha sido borrado correctamente`});
}


// funcion para editar menú
// solo se aplican los campos permitidos (evita que el body inyecte campos no previstos por el schema)
async function updateProduct (req, res){
    const id = req.query.updateId

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