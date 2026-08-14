// src/superadmin/standalone.js
// Punto de entrada del super admin como proceso independiente.
// No tiene cliente de WhatsApp ni lógica de bot — solo el panel de gestión.
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

process.on('uncaughtException', err => {
  console.error('[superadmin] Error no capturado:', err.stack || err.message);
  setTimeout(() => process.exit(1), 250).unref();
});
process.on('unhandledRejection', reason => {
  console.error('[superadmin] Promesa rechazada:', reason?.stack || reason);
});

const { startSuperAdmin } = require('./server');
startSuperAdmin(parseInt(process.env.SUPERADMIN_PORT || '3001'), null);
