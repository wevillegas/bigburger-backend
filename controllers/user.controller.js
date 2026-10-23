const User = require('../models/user.model');
const bcrypt = require('bcrypt');
const salt = 10;
const jwt = require('jsonwebtoken');
const secret = require('../config/config').secret;
const { COOKIE_NAME } = require('../utils/authUser');
const { pickAllowedFields, validatePassword, validateSignup } = require('../utils/sanitize');


const ALLOWED_UPDATE_FIELDS = ['fullName', 'email', 'active', 'role', 'phone', 'address']
const ALLOWED_PROFILE_FIELDS = ['fullName', 'phone', 'address']

// registro público: solo nombre/email/contraseña. El rol nunca sale del body
// (si no, cualquiera podría autoasignarse ADMINISTRADOR en el signup) y queda en el default del schema.
// el resto de los campos (maxlength, formato) los valida el schema al guardar
async function addUser(req, res){
    const validation = validateSignup(req.body)
    if (!validation.ok) return res.status(validation.status).send({message: validation.message})

    const userData = validation.data
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
    // un usuario común solo puede ver su propio perfil; el admin puede ver cualquiera
    if (req.user.role !== 'ADMINISTRADOR' && String(userId) !== String(req.user._id)) {
        return res.status(403).send('no tiene los permisos necesarios para ver este usuario');
    }
    //buscamos ese Id en nuestra BD
    const user = await User.findById(userId).select('-password');
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

    if (typeof currentPassword !== 'string' || !currentPassword || !newPassword) {
        return res.status(400).send({ message: 'Ingresá tu contraseña actual y la nueva' })
    }
    const passwordError = validatePassword(newPassword)
    if (passwordError) return res.status(400).send({ message: passwordError })

    const userDB = await User.findById(req.user._id)
    if (!userDB) return res.status(404).send({ message: 'No se encontro el usuario' })

    const isValidPassword = await bcrypt.compare(currentPassword, userDB.password)
    if (!isValidPassword) return res.status(401).send({ message: 'La contraseña actual no es correcta' })

    userDB.password = await bcrypt.hash(newPassword, salt)
    await userDB.save()

    return res.status(200).send({ ok: true, message: 'Contraseña actualizada correctamente' })
}

//LOGIN
// cross-site (front y API en dominios distintos) exige SameSite=None + Secure; en local, Lax alcanza
const isProduction = process.env.NODE_ENV === 'production'
const cookieOptions = { httpOnly: true, secure: isProduction, sameSite: isProduction ? 'none' : 'lax' }
// hash descartable para gastar el mismo tiempo de bcrypt cuando el email no existe (evita enumerar cuentas por latencia)
const DUMMY_HASH = bcrypt.hashSync('no-es-una-contraseña', salt)
const INVALID_CREDENTIALS = { msg: 'Email o contraseña incorrectos' }

async function login (req, res){
    const { email, password } = req.body

    // solo strings: un objeto como {"$ne": null} en email llegaría como operador a Mongo
    if (typeof email !== 'string' || typeof password !== 'string') {
        return res.status(401).send(INVALID_CREDENTIALS)
    }

    const userDB = await User.findOne({ email: email.trim().toLowerCase() });

    // misma respuesta (y mismo costo) si el usuario no existe o la contraseña es incorrecta
    const isValidPassword = await bcrypt.compare(password, userDB ? userDB.password : DUMMY_HASH);
    if(!userDB || !isValidPassword) return res.status(401).send(INVALID_CREDENTIALS);

    // recién con la contraseña correcta avisamos que la cuenta está desactivada
    if(!userDB.active) return res.status(403).send({ msg:'Tu cuenta está desactivada' });

    userDB.password = undefined;

    // el token solo lleva el _id: rol y estado se consultan en la base en cada request (ver utils/authUser.js)
    const token = jwt.sign({ _id: userDB._id }, secret, { expiresIn: '1d' });

    // el navegador guarda la sesión en una cookie HttpOnly (un XSS no puede leerla); el token también va en el body para clientes de API
    res.cookie(COOKIE_NAME, token, { ...cookieOptions, maxAge: 24 * 60 * 60 * 1000 });

    return res.status(200).send({
        ok: true,
        msg:'Login correcto',
        user: userDB,
        token
    })
}


function logout (req, res){
    res.clearCookie(COOKIE_NAME, cookieOptions);
    return res.status(200).send({ ok: true });
}

module.exports = {
    addUser,
    logout,
    getUsers,
    getUser,
    deleteUser,
    login,
    updateUser,
    updateOwnProfile,
    changeOwnPassword
}