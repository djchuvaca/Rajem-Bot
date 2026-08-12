// src/superadmin/standalone.js
// Punto de entrada del super admin como proceso independiente.
// No tiene cliente de WhatsApp ni lógica de bot — solo el panel de gestión.
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const { startSuperAdmin } = require('./server');
startSuperAdmin(parseInt(process.env.SUPERADMIN_PORT || '3001'), null);
