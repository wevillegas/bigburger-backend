const User = require('../schemas/user.schemas');
const bcrypt = require('bcrypt');
const salt = 10;
const jwt = require('jsonwebtoken');
const secret = require('../config/config').secret;
const { pickAllowedFields } = require('../utils/sanitize');


const ALLOWED_SIGNUP_FIELDS = ['fullName', 'email', 'password']
const ALLOWED_UPDATE_FIELDS = ['fullName', 'email', 'active', 'role', 'phone', 'address']
const ALLOWED_PROFILE_FIELDS = ['fullName', 'phone', 'address']

// registro público: solo nombre/email/contraseña. El rol nunca sale del body
// (si no, cualquiera podría autoasignarse ADMINISTRADOR en el signup) y queda en el default del schema.
// el resto de los campos (maxlength, formato) los valida el schema al guardar
async function addUser(req, res){
    if(!req.body.password) return res.status(400).send({message:'falta la contraseña'});

    const userData = pickAllowedFields(req.body, ALLOWED_SIGNUP_FIELDS)
    userData.password = await bcrypt.hash(userData.password, salt);

    let newUser = new User(userData);
    await newUser.save()// Guardamos en la BD
    newUser.password = undefined;
    res.send({ usuarioNuevo: newUser })
}

async function getUsers(req, res){
    const usuariosDB = await User.find().select('-password')
    res.send({ users: usuariosDB })
}

async function getUser(req, res){
    //id que recibimos desde el endpoint
    const userId = req.query.user_id;
    //buscamos ese Id en nuestra BD
    const user = await User.findById(userId).select('-password');
    console.log(user)
    // si no encontramos el usuario
    if(!user) return res.status(404).send ('no se encontro el usuario que busca');

    return res.status(200).send({ user: user })
}

async function deleteUser(req, res){
    
    const user_deleted = req.params.id;

    const user = await User.findByIdAndDelete(user_deleted).select('-password');

    res.send({ userDeleted: user });
}

//UPADATE USER
// solo campos en la whitelist (nunca "password" por acá: no pasa por bcrypt y rompería el login)
async function updateUser(req, res) {
    const id = req.params.id;

    const userChangesToApply = pickAllowedFields(req.body, ALLOWED_UPDATE_FIELDS)

    const updatedUser = await User.findByIdAndUpdate(id, userChangesToApply, {
        new: true,
        runValidators: true,
        context: 'query'
    }).select('-password');
    if(!updatedUser) return res.status(404).send('No se encontro el usuario');

    return res.status(200).send(updatedUser)
}

// edita los propios datos (nombre/teléfono/dirección) — nunca email/rol/password desde acá.
// usa siempre req.user._id, nunca un id que venga del body, para que nadie edite el perfil de otro
async function updateOwnProfile(req, res) {
    const changes = pickAllowedFields(req.body, ALLOWED_PROFILE_FIELDS)

    const updatedUser = await User.findByIdAndUpdate(req.user._id, changes, {
        new: true,
        runValidators: true,
        context: 'query'
    }).select('-password');
    if (!updatedUser) return res.status(404).send('No se encontro el usuario');

    return res.status(200).send(updatedUser)
}

// cambio de contraseña propio: exige la contraseña actual para confirmar identidad,
// nunca se puede cambiar la de otro usuario (siempre usa req.user._id)
async function changeOwnPassword(req, res) {
    const { currentPassword, newPassword } = req.body

    if (!currentPassword || !newPassword) {
        return res.status(400).send({ message: 'Ingresá tu contraseña actual y la nueva' })
    }
    if (newPassword.length < 8) {
        return res.status(400).send({ message: 'La nueva contraseña debe tener 8 o más caracteres' })
    }

    const userDB = await User.findById(req.user._id)
    if (!userDB) return res.status(404).send({ message: 'No se encontro el usuario' })

    const isValidPassword = await bcrypt.compare(currentPassword, userDB.password)
    if (!isValidPassword) return res.status(401).send({ message: 'La contraseña actual no es correcta' })

    userDB.password = await bcrypt.hash(newPassword, salt)
    await userDB.save()

    return res.status(200).send({ ok: true, message: 'Contraseña actualizada correctamente' })
}

//LOGIN
async function login (req, res){
    const email = req.body.email;
    const password = req.body.password;

//checkeamos que el usuario exista y nos traemos sus datos
    const userDB = await User.findOne({ email: req.body.email });

    if(!userDB) return res.status(404).send({ msg:'El suario no existe en nuestra BD' });

//comparamos password proveniente del front con el password del usuario
    const isValidPassword = await bcrypt.compare(password, userDB.password);
    if(!isValidPassword) return res.status(401).send({ msg:'Alguno de los datos ingresados no es correcto' });

//elimino del objeto user el password
    userDB.password = undefined;

//generamos un token de acceso
    const token = jwt.sign(userDB.toJSON(), secret, { expiresIn: '7d' });

    return res.status(200).send({
        ok: true,
        msg:'Login correcto',
        user: userDB,
        token
    })
}


module.exports = {
    addUser,
    getUsers,
    getUser,
    deleteUser,
    login,
    updateUser,
    updateOwnProfile,
    changeOwnPassword
}