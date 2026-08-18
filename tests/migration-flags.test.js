"use strict";
/**
 * tests/migration-flags.test.js
 * Fase 8 — Etapa 5: interruptores de compatibilidad (feature flags).
 *
 * Verifica que:
 *   - Los 5 flags existen con sus defaults conservadores.
 *   - La precedencia override > env > default funciona.
 *   - activar/desactivar/resetear operan correctamente en memoria.
 *   - Las variables de entorno MIGRATION_* son reconocidas.
 *   - Los flags desconocidos lanzan error.
 *   - estado() devuelve snapshot completo.
 *   - El módulo es idempotente (no hay estado residual entre tests).
 *
 * Todos los tests manipulan SOLO la capa de override en memoria;
 * nunca tocan la BD ni el proceso WhatsApp.
 */

const { test, describe, afterEach } = require("node:test");
const assert = require("node:assert/strict");

// Cargar el módulo una vez — los tests manipulan overrides en memoria
const flags = require("../src/migration/flags");

// Limpiar overrides y vars de entorno de migración después de cada test
afterEach(() => {
  flags.resetear(); // limpia todos los overrides en memoria
  // Limpiar cualquier variable de entorno de migración que un test haya seteado
  for (const nombre of flags.listar()) {
    delete process.env[`MIGRATION_${nombre}`];
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECCIÓN 1 — Valores por defecto (conservadores)
// ═══════════════════════════════════════════════════════════════════════════════

describe("Flags — defaults conservadores", () => {
  test("GIRO_CATALOGO_UNICO arranca en false", () => {
    assert.equal(flags.leer("GIRO_CATALOGO_UNICO"), false);
  });

  test("PEDIDO_NEUTRAL_UNICO arranca en false", () => {
    assert.equal(flags.leer("PEDIDO_NEUTRAL_UNICO"), false);
  });

  test("PRECIOS_GIRO_UNICO arranca en false", () => {
    assert.equal(flags.leer("PRECIOS_GIRO_UNICO"), false);
  });

  test("COMANDOS_MODULARES arranca en false", () => {
    assert.equal(flags.leer("COMANDOS_MODULARES"), false);
  });

  test("LEGACY_READ_FALLBACK arranca en true (fallback habilitado por defecto)", () => {
    // true = la ruta antigua está disponible como fallback; se desactiva al completar la migración
    assert.equal(flags.leer("LEGACY_READ_FALLBACK"), true);
  });

  test("listar() devuelve los 5 flags definidos", () => {
    const lista = flags.listar();
    assert.equal(lista.length, 5);
    for (const nombre of ["GIRO_CATALOGO_UNICO", "PEDIDO_NEUTRAL_UNICO", "PRECIOS_GIRO_UNICO",
                          "COMANDOS_MODULARES", "LEGACY_READ_FALLBACK"]) {
      assert.ok(lista.includes(nombre), `falta el flag ${nombre}`);
    }
  });

  test("estado() devuelve snapshot con todos los flags en sus defaults", () => {
    const snap = flags.estado();
    assert.equal(snap.GIRO_CATALOGO_UNICO,   false);
    assert.equal(snap.PEDIDO_NEUTRAL_UNICO,  false);
    assert.equal(snap.PRECIOS_GIRO_UNICO,    false);
    assert.equal(snap.COMANDOS_MODULARES,    false);
    assert.equal(snap.LEGACY_READ_FALLBACK,  true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECCIÓN 2 — Overrides en memoria (activar/desactivar/resetear)
// ═══════════════════════════════════════════════════════════════════════════════

describe("Flags — overrides en memoria", () => {
  test("activar() cambia el flag a true", () => {
    flags.activar("GIRO_CATALOGO_UNICO");
    assert.equal(flags.leer("GIRO_CATALOGO_UNICO"), true);
  });

  test("desactivar() cambia el flag a false", () => {
    flags.activar("LEGACY_READ_FALLBACK");    // primero activo
    flags.desactivar("LEGACY_READ_FALLBACK"); // luego desactivo
    assert.equal(flags.leer("LEGACY_READ_FALLBACK"), false);
  });

  test("resetear(nombre) elimina el override de ese flag volviendo al default", () => {
    flags.activar("PRECIOS_GIRO_UNICO");
    assert.equal(flags.leer("PRECIOS_GIRO_UNICO"), true);
    flags.resetear("PRECIOS_GIRO_UNICO");
    assert.equal(flags.leer("PRECIOS_GIRO_UNICO"), false, "debe volver al default false");
  });

  test("resetear() sin argumento elimina todos los overrides", () => {
    flags.activar("GIRO_CATALOGO_UNICO");
    flags.activar("PEDIDO_NEUTRAL_UNICO");
    flags.desactivar("LEGACY_READ_FALLBACK");
    flags.resetear();
    // Todos vuelven a sus defaults
    assert.equal(flags.leer("GIRO_CATALOGO_UNICO"),  false);
    assert.equal(flags.leer("PEDIDO_NEUTRAL_UNICO"), false);
    assert.equal(flags.leer("LEGACY_READ_FALLBACK"), true);
  });

  test("múltiples overrides son independientes entre sí", () => {
    flags.activar("GIRO_CATALOGO_UNICO");
    flags.desactivar("LEGACY_READ_FALLBACK");
    assert.equal(flags.leer("GIRO_CATALOGO_UNICO"),   true);
    assert.equal(flags.leer("PEDIDO_NEUTRAL_UNICO"),  false); // no tocado
    assert.equal(flags.leer("PRECIOS_GIRO_UNICO"),    false); // no tocado
    assert.equal(flags.leer("COMANDOS_MODULARES"),    false); // no tocado
    assert.equal(flags.leer("LEGACY_READ_FALLBACK"),  false);
  });

  test("override toma precedencia sobre variable de entorno", () => {
    process.env.MIGRATION_GIRO_CATALOGO_UNICO = "false";
    flags.activar("GIRO_CATALOGO_UNICO"); // override en memoria
    assert.equal(flags.leer("GIRO_CATALOGO_UNICO"), true,
      "el override en memoria tiene mayor precedencia que env"
    );
  });

  test("estado() refleja los overrides activos", () => {
    flags.activar("PRECIOS_GIRO_UNICO");
    flags.desactivar("LEGACY_READ_FALLBACK");
    const snap = flags.estado();
    assert.equal(snap.PRECIOS_GIRO_UNICO,   true);
    assert.equal(snap.LEGACY_READ_FALLBACK, false);
    assert.equal(snap.GIRO_CATALOGO_UNICO,  false); // sin cambio
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECCIÓN 3 — Variables de entorno MIGRATION_*
// ═══════════════════════════════════════════════════════════════════════════════

describe("Flags — variables de entorno MIGRATION_*", () => {
  test("MIGRATION_GIRO_CATALOGO_UNICO=true activa el flag", () => {
    process.env.MIGRATION_GIRO_CATALOGO_UNICO = "true";
    assert.equal(flags.leer("GIRO_CATALOGO_UNICO"), true);
  });

  test("MIGRATION_GIRO_CATALOGO_UNICO=1 activa el flag", () => {
    process.env.MIGRATION_GIRO_CATALOGO_UNICO = "1";
    assert.equal(flags.leer("GIRO_CATALOGO_UNICO"), true);
  });

  test("MIGRATION_LEGACY_READ_FALLBACK=false desactiva el flag", () => {
    process.env.MIGRATION_LEGACY_READ_FALLBACK = "false";
    assert.equal(flags.leer("LEGACY_READ_FALLBACK"), false);
  });

  test("env acepta 'TRUE' (case-insensitive)", () => {
    process.env.MIGRATION_PEDIDO_NEUTRAL_UNICO = "TRUE";
    assert.equal(flags.leer("PEDIDO_NEUTRAL_UNICO"), true);
  });

  test("env con valor desconocido ('yes', 'si', '2') queda en false", () => {
    process.env.MIGRATION_COMANDOS_MODULARES = "yes";
    assert.equal(flags.leer("COMANDOS_MODULARES"), false,
      "solo 'true' y '1' activan el flag"
    );
  });

  test("al eliminar la env var, el flag vuelve al default", () => {
    process.env.MIGRATION_PRECIOS_GIRO_UNICO = "true";
    assert.equal(flags.leer("PRECIOS_GIRO_UNICO"), true);
    delete process.env.MIGRATION_PRECIOS_GIRO_UNICO;
    assert.equal(flags.leer("PRECIOS_GIRO_UNICO"), false, "debe volver al default false");
  });

  test("el override en memoria prevalece sobre la env var", () => {
    process.env.MIGRATION_COMANDOS_MODULARES = "true";
    flags.desactivar("COMANDOS_MODULARES"); // override explícito en false
    assert.equal(flags.leer("COMANDOS_MODULARES"), false,
      "override desactivar() debe ganar sobre env var true"
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECCIÓN 4 — Manejo de errores
// ═══════════════════════════════════════════════════════════════════════════════

describe("Flags — manejo de errores", () => {
  test("leer() lanza Error para flag desconocido", () => {
    assert.throws(
      () => flags.leer("FLAG_QUE_NO_EXISTE"),
      /desconocido/i
    );
  });

  test("activar() lanza Error para flag desconocido", () => {
    assert.throws(
      () => flags.activar("OTRO_FLAG_INVENTADO"),
      /desconocido/i
    );
  });

  test("desactivar() lanza Error para flag desconocido", () => {
    assert.throws(
      () => flags.desactivar("FLAG_FALSO"),
      /desconocido/i
    );
  });

  test("resetear() con nombre desconocido no lanza (solo hace nop)", () => {
    // resetear() con argumento simplemente elimina el override; si no existe, nop
    assert.doesNotThrow(() => flags.resetear("FLAG_QUE_NO_EXISTE"));
  });

  test("la API del módulo es estable — todos los métodos existen", () => {
    assert.equal(typeof flags.leer,        "function");
    assert.equal(typeof flags.activar,     "function");
    assert.equal(typeof flags.desactivar,  "function");
    assert.equal(typeof flags.resetear,    "function");
    assert.equal(typeof flags.estado,      "function");
    assert.equal(typeof flags.listar,      "function");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECCIÓN 5 — Idempotencia y aislamiento entre tests
// ═══════════════════════════════════════════════════════════════════════════════

describe("Flags — idempotencia", () => {
  test("activar dos veces el mismo flag no tiene efecto secundario", () => {
    flags.activar("GIRO_CATALOGO_UNICO");
    flags.activar("GIRO_CATALOGO_UNICO");
    assert.equal(flags.leer("GIRO_CATALOGO_UNICO"), true);
  });

  test("resetear() sobre un flag sin override no lanza ni modifica otros", () => {
    flags.activar("PRECIOS_GIRO_UNICO");
    flags.resetear("GIRO_CATALOGO_UNICO"); // sin override, nop seguro
    assert.equal(flags.leer("PRECIOS_GIRO_UNICO"), true, "otro flag no afectado");
  });

  test("el módulo no conserva estado entre resetear() completos", () => {
    flags.activar("GIRO_CATALOGO_UNICO");
    flags.activar("PEDIDO_NEUTRAL_UNICO");
    flags.resetear();
    const snap = flags.estado();
    assert.equal(snap.GIRO_CATALOGO_UNICO,  false);
    assert.equal(snap.PEDIDO_NEUTRAL_UNICO, false);
    assert.equal(snap.PRECIOS_GIRO_UNICO,   false);
    assert.equal(snap.COMANDOS_MODULARES,   false);
    assert.equal(snap.LEGACY_READ_FALLBACK, true);
  });
});
