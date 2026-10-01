# BigBurger — Backend

![CI](https://github.com/wevillegas/bigburger-backend/actions/workflows/ci.yml/badge.svg)

API REST para BigBurger, una app de pedidos de comida rápida (mini e-commerce) hecha como proyecto de portfolio. Cubre catálogo, carrito/checkout (con o sin cuenta), roles de usuario, pedidos de mostrador y un programa de puntos de fidelidad.

Repo hermano: [bigburger-frontend](https://github.com/wevillegas/bigburger-frontend).

## Stack

- Node.js + Express
- MongoDB + Mongoose
- JWT (`jsonwebtoken`) para autenticación, `bcrypt` para passwords
- `helmet` (cabeceras de seguridad) + `express-rate-limit` (fuerza bruta en `/login`) + CORS restringido por origen
- Tests: runner nativo de Node (`node --test`) + `supertest` para las pruebas de integración

## Setup local

```bash
npm install
cp .env.example .env   # completar MONGODB_URI y JWT_SECRET
npm run seed            # opcional: carga productos/usuarios de ejemplo
npm run dev              # nodemon, http://localhost:3100
```

### Variables de entorno

| Variable | Descripción |
|---|---|
| `PORT` | Puerto del servidor (default `3100`) |
| `MONGODB_URI` | Connection string de MongoDB (Atlas o local) |
| `JWT_SECRET` | Secreto para firmar tokens JWT (`openssl rand -hex 32`) |
| `FRONTEND_URL` | Origen permitido por CORS para llamadas del navegador |

## Tests

```bash
npm test
```

Incluye:
- **Unitarios** (`test/sanitize.test.js`): validaciones y lógica de puntos/descuentos en aislamiento, sin tocar la base.
- **Integración** (`test/order.integration.test.js`): flujo completo de un pedido contra la app Express real — signup/login, alta de producto por un admin, checkout de invitado, revalidación server-side de precio/stock, actualización de estado de orden y acreditación de puntos — usando `supertest` sobre una MongoDB real.

La integración necesita una MongoDB accesible. En CI la levanta un `services: mongodb` del workflow; en local, corré una instancia propia (`mongod` o `docker run -p 27017:27017 mongo`) y opcionalmente seteá `MONGODB_URI_TEST` si no es `mongodb://127.0.0.1:27017/bigburger_test`.

## CI

GitHub Actions (`.github/workflows/ci.yml`) corre `npm test` en cada push/PR, con un contenedor de MongoDB como servicio para las pruebas de integración.

## Decisiones de arquitectura

- **`app.js` separado de `index.js`**: la app de Express no conoce el puerto ni abre la conexión a Mongo, así los tests de integración pueden importar `app.js` y apuntar a una base de test sin levantar el servidor real.
- **Revalidación server-side de pedidos**: el checkout nunca confía en precio/stock que manda el cliente — `createOrder` siempre relee el producto desde la base antes de armar el total.
- **Checkout invitado vs. autenticado con el mismo middleware**: `optionalAuth` deja pasar sin token (invitado) pero rechaza un token inválido/expirado, en vez de tener dos rutas distintas para el mismo flujo.
- **Whitelist de campos en updates**: tanto el alta de usuario como las ediciones de perfil/admin pasan por `pickAllowedFields` para evitar mass-assignment (p. ej. que alguien se autoasigne `role: ADMINISTRADOR` en el signup).
- **Error handling centralizado**: los controllers no tienen try/catch propios; `asyncHandler` envuelve cada handler async y delega al middleware de error único.
