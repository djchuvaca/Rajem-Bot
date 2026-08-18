'use strict';

// Contextos donde puede ejecutarse un comando.
const CONTEXTO = Object.freeze({
  GRUPO:      'grupo',       // solo en un grupo de WhatsApp
  PRIVADO:    'privado',     // solo en chat privado
  CUALQUIERA: 'cualquiera', // ambos
});

// Permisos necesarios para ejecutar el comando.
const PERMISO = Object.freeze({
  ADMIN:      'admin',      // debe ser administrador del grupo
  CUALQUIERA: 'cualquiera', // cualquier participante
});

module.exports = { CONTEXTO, PERMISO };
