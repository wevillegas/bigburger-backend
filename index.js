require('dotenv').config();
var app = require('./app');
var port = process.env.PORT || 3100;
var URL = process.env.MONGODB_URI;
var mongoose = require('mongoose')

if (!URL) {
    console.log('\x1b[31m Falta MONGODB_URI en el .env \x1b[37m');
    process.exit(1);
}

async function connect() {
    try {
    await mongoose.connect(URL);
    console.log('\x1b[36m connected to mongoDB \x1b[37m');
    app.listen(port, () => {
        console.log(`\x1b[36m Server started on port: ${port} \x1b[37m`);
        });
    }
    catch(error) {
        console.log('\x1b[31m Error al conectar con MongoDB \x1b[37m');
    } 
}
connect();
