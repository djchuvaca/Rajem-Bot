'use strict';

/**
 * Registro central de comandos.
 *
 * Cada grupo de comandos registra sus definiciones aquí.
 * El router consume esta lista para enrutar cada mensaje.
 *
 * Una definición de comando:
 * {
 *   patron:   RegExp,       // coincide con el texto del mensaje
 *   nombre:   string,       // identificador corto (para logs y ayuda)
 *   contexto: CONTEXTO.*,   // GRUPO | PRIVADO | CUALQUIERA
 *   permisos: PERMISO.*,    // ADMIN | CUALQUIERA
 *   giro:     string|null,  // null = todos; 'taqueria' = solo en ese giro
 *   ayuda:    string,       // texto de una línea para !ayuda
 *   ejecutar: async (ctx) => void,
 *   //  ctx = { msg, client, texto, args }
 * }
 */

let _comandos = null; // cargado de forma diferida

function _cargar() {
  if (_comandos !== null) return;
  _comandos = [
    ...require('./grupos/generales'),
    ...require('./grupos/pedidos'),
    ...require('./grupos/gestion'),
    ...require('./grupos/clientes'),
    ...require('./grupos/sesiones'),
    ...require('./grupos/reportes'),
    ...require('./grupos/negocio'),
  ];

  // Comandos específicos de giro — cada giro puede registrar los suyos.
  // Si el módulo no existe el registro continúa sin error.
  const girosConComandos = ['taqueria'];
  for (const slug of girosConComandos) {
    try {
      const defs = require(`../../giros/${slug}/comandos`);
      if (Array.isArray(defs)) _comandos.push(...defs);
    } catch (_) {}
  }
}

function obtenerComandos() {
  _cargar();
  return _comandos;
}

// Permite resetear el registro en tests (nueva BD, nueva sesión).
function _resetearRegistro() {
  _comandos = null;
}

module.exports = { obtenerComandos, _resetearRegistro };
