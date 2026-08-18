"use strict";
/**
 * src/migration/flags.js
 * Fase 8 — Etapa 5: interruptores de compatibilidad.
 *
 * Permiten activar gradualmente la arquitectura nueva sin eliminar la anterior.
 * Cada flag tiene un valor por defecto conservador (false = ruta antigua activa).
 *
 * Flags disponibles:
 *
 *   GIRO_CATALOGO_UNICO     — El catálogo operativo sale SOLO del módulo Giro + menu_items.
 *                             Desactiva cualquier lectura de la tabla `productos` en tiempo real.
 *
 *   PEDIDO_NEUTRAL_UNICO    — Los pedidos se representan y procesan SOLO en formato neutral.
 *                             Desactiva los adaptadores legacy (plato_separado, grupo_repetido).
 *
 *   PRECIOS_GIRO_UNICO      — Los precios se calculan SOLO mediante el motor del Giro.
 *                             Desactiva getPrecios() y calcularPrecioItem() en flujos de pedido.
 *
 *   COMANDOS_MODULARES      — El router de comandos usa SOLO el registro modular.
 *                             Desactiva la fachada legacy de src/handlers/comandos.js.
 *
 *   LEGACY_READ_FALLBACK    — Permite leer de fuentes antiguas si la nueva no responde.
 *                             Debe estar en false en producción una vez migrado.
 *
 * Activar desde .env:
 *   MIGRATION_GIRO_CATALOGO_UNICO=true
 *   MIGRATION_PEDIDO_NEUTRAL_UNICO=true
 *   MIGRATION_PRECIOS_GIRO_UNICO=true
 *   MIGRATION_COMANDOS_MODULARES=true
 *   MIGRATION_LEGACY_READ_FALLBACK=false
 *
 * O programáticamente en tests:
 *   const flags = require('./src/migration/flags');
 *   flags.activar('GIRO_CATALOGO_UNICO');
 *   flags.desactivar('LEGACY_READ_FALLBACK');
 *   flags.resetear();
 *
 * Importante: estos interruptores son TEMPORALES. Se retiran al finalizar la Fase 8.
 */

const _DEFAULTS = {
  GIRO_CATALOGO_UNICO:    false,
  PEDIDO_NEUTRAL_UNICO:   false,
  PRECIOS_GIRO_UNICO:     false,
  COMANDOS_MODULARES:     false,
  LEGACY_READ_FALLBACK:   true,
};

// Sobreescritura en memoria (para tests y transición controlada)
const _overrides = {};

function _leerEnv(nombre) {
  const varName = `MIGRATION_${nombre}`;
  const val = process.env[varName];
  if (val === undefined) return undefined;
  return val.toLowerCase() === "true" || val === "1";
}

/**
 * Lee el valor actual de un flag.
 * Precedencia: override en memoria → variable de entorno → default conservador.
 */
function leer(nombre) {
  if (!(nombre in _DEFAULTS)) {
    throw new Error(`Flag de migración desconocido: '${nombre}'`);
  }
  if (nombre in _overrides) return _overrides[nombre];
  const fromEnv = _leerEnv(nombre);
  if (fromEnv !== undefined) return fromEnv;
  return _DEFAULTS[nombre];
}

/** Activa un flag temporalmente (en memoria). */
function activar(nombre) {
  if (!(nombre in _DEFAULTS)) throw new Error(`Flag desconocido: '${nombre}'`);
  _overrides[nombre] = true;
}

/** Desactiva un flag temporalmente (en memoria). */
function desactivar(nombre) {
  if (!(nombre in _DEFAULTS)) throw new Error(`Flag desconocido: '${nombre}'`);
  _overrides[nombre] = false;
}

/** Elimina un override en memoria, volviendo al valor de env/default. */
function resetear(nombre) {
  if (nombre) {
    delete _overrides[nombre];
  } else {
    Object.keys(_overrides).forEach(k => delete _overrides[k]);
  }
}

/** Devuelve un snapshot completo del estado actual de todos los flags. */
function estado() {
  return Object.fromEntries(
    Object.keys(_DEFAULTS).map(nombre => [nombre, leer(nombre)])
  );
}

/** Lista los nombres de todos los flags disponibles. */
function listar() {
  return Object.keys(_DEFAULTS);
}

module.exports = { leer, activar, desactivar, resetear, estado, listar };
