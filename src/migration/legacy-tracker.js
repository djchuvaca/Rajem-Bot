"use strict";
/**
 * src/migration/legacy-tracker.js
 * Fase 8 — Etapa 4: instrumentación de rutas antiguas.
 *
 * Registra cada llamada a código legacy para:
 *   - Confirmar que una ruta antigua TODAVÍA SE USA antes de eliminarla.
 *   - Detectar si una ruta que debería estar migrada sigue activa.
 *   - Producir logs [LEGACY] en pruebas y producción para el periodo de observación.
 *
 * Uso:
 *   const { registrar } = require('../migration/legacy-tracker');
 *   registrar('getPrecios');   // en la función legacy
 *
 * En tests: obtenerContadores() para hacer aserciones.
 * En producción: los logs llegan al logger como WARN con etiqueta [LEGACY].
 *
 * NO registra datos sensibles: sin contraseñas, tokens, teléfonos ni pedidos.
 */

// Contador en memoria. Se resetea al arrancar el proceso.
const _contadores = new Map();

// Buffer de llamadas recientes (máx. 500) para diagnóstico en tests.
const _buffer = [];
const BUFFER_MAX = 500;

function registrar(nombre, contexto = {}) {
  const actual = (_contadores.get(nombre) || 0) + 1;
  _contadores.set(nombre, actual);

  const entrada = {
    nombre,
    ts: Date.now(),
    ...(Object.keys(contexto).length ? { ctx: contexto } : {}),
  };

  _buffer.push(entrada);
  if (_buffer.length > BUFFER_MAX) _buffer.shift();

  // En producción/desarrollo, emitir WARN visible para el periodo de observación.
  if (process.env.NODE_ENV !== "test" && process.env.BOT_TEST_MODE !== "1") {
    try {
      const logger = require("../logger");
      logger.warn(`[LEGACY] ${nombre}`, contexto);
    } catch (_) {
      // El logger puede no estar disponible en todos los contextos (scripts)
    }
  }
}

/** Retorna el número total de llamadas registradas para un nombre. */
function obtenerContador(nombre) {
  return _contadores.get(nombre) || 0;
}

/** Retorna un objeto { nombre: número } con todos los contadores activos. */
function obtenerContadores() {
  return Object.fromEntries(_contadores);
}

/** Retorna las N llamadas más recientes del buffer. */
function obtenerBuffer(n = 20) {
  return _buffer.slice(-n);
}

/** Resetea todos los contadores. Útil en pruebas. */
function resetearContadores() {
  _contadores.clear();
  _buffer.length = 0;
}

module.exports = { registrar, obtenerContador, obtenerContadores, obtenerBuffer, resetearContadores };
