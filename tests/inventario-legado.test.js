"use strict";
/**
 * tests/inventario-legado.test.js
 * Fase 8 — Etapa 2: inventario del código antiguo.
 *
 * Objetivo: detectar si la deuda técnica de vocabulario taquería en handlers
 * genéricos ha CRECIDO respecto al baseline documentado hoy.
 *
 * Funciona como un ratchet: los contadores sólo pueden bajar (mejorar),
 * nunca subir. Si alguien añade un nuevo uso de `getPrecios()` en un handler
 * genérico, este test falla.
 *
 * Clasificación de archivos (ver plan/acople.txt, Etapa 2):
 *   1. Pertenece correctamente al Giro          → src/giros/**
 *   2. Dependencia antigua que debe migrarse    → src/pedido/precios.js, orden.js, resumen.js, respuestas.js
 *   3. Adaptador temporal                       → src/handlers/comandos.js (fachada legacy)
 *   4. Migración de BD que debe conservarse     → src/db/seed.js, src/db/cortes.js
 *   5. Código muerto que puede eliminarse       → (ninguno identificado hoy — ver búsqueda abajo)
 *   6. Documentación o prueba desactualizada    → comentarios en test files
 *
 * Regla clave: una referencia a "taco" dentro de src/giros/taqueria/ es CORRECTA.
 * La misma referencia en src/handlers/ es una VIOLACIÓN que debe migrarse.
 */

const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const fs   = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

// ── Helper para leer y filtrar líneas de código (sin comentarios ni tests) ──
function leerLineasCodigo(rutaRelativa) {
  const absPath = path.join(ROOT, rutaRelativa);
  if (!fs.existsSync(absPath)) return [];
  return fs.readFileSync(absPath, "utf8")
    .split("\n")
    .filter(l => !l.trim().startsWith("//") && !l.trim().startsWith("*"))
    .filter(l => l.trim().length > 0);
}

function contarPatron(lineas, regex) {
  return lineas.filter(l => regex.test(l)).length;
}

function contarEnArchivos(archivos, regex) {
  return archivos.reduce((total, archivo) => {
    return total + contarPatron(leerLineasCodigo(archivo), regex);
  }, 0);
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECCIÓN 1 — Zonas protegidas: deben estar libres de lógica de taquería
// ═══════════════════════════════════════════════════════════════════════════════

describe("Zonas protegidas — vocabulario de taquería prohibido", () => {
  const VOCABUALARIO_TAQUERIA = /pTaco\b|pTorta\b|p100g\b|precio_kg/;

  test("src/nlu/core.js no contiene precios de taquería (pTaco, pTorta, p100g)", () => {
    const lineas = leerLineasCodigo("src/nlu/core.js");
    const violaciones = lineas.filter(l => VOCABUALARIO_TAQUERIA.test(l));
    assert.deepEqual(violaciones, [],
      `src/nlu/core.js debe ser genérico — eliminar: ${violaciones.join(" | ")}`
    );
  });

  test("src/pedido/modelo.js no contiene precios de taquería", () => {
    const lineas = leerLineasCodigo("src/pedido/modelo.js");
    const violaciones = lineas.filter(l => VOCABUALARIO_TAQUERIA.test(l));
    assert.deepEqual(violaciones, [],
      `src/pedido/modelo.js debe ser neutral — eliminar: ${violaciones.join(" | ")}`
    );
  });

  test("src/estado/ no contiene vocabulario de taquería", () => {
    const archivos = [
      "src/estado/maps.js",
      "src/estado/campos.js",
      "src/estado/sesiones.js",
      "src/estado/index.js",
    ];
    for (const archivo of archivos) {
      const lineas = leerLineasCodigo(archivo);
      const violaciones = lineas.filter(l => VOCABUALARIO_TAQUERIA.test(l));
      assert.deepEqual(violaciones, [],
        `${archivo} debe ser genérico — eliminar: ${violaciones.join(" | ")}`
      );
    }
  });

  test("src/giros/contrato.js no contiene precios de taquería", () => {
    const lineas = leerLineasCodigo("src/giros/contrato.js");
    const violaciones = lineas.filter(l => VOCABUALARIO_TAQUERIA.test(l));
    assert.deepEqual(violaciones, [],
      `El contrato de Giro debe ser genérico — eliminar: ${violaciones.join(" | ")}`
    );
  });

  test("src/giros/modificaciones.js no contiene precios de taquería", () => {
    const lineas = leerLineasCodigo("src/giros/modificaciones.js");
    const violaciones = lineas.filter(l => VOCABUALARIO_TAQUERIA.test(l));
    assert.deepEqual(violaciones, []);
  });

  test("src/giros/precios.js no contiene precios de taquería (motor neutral)", () => {
    const lineas = leerLineasCodigo("src/giros/precios.js");
    const violaciones = lineas.filter(l => VOCABUALARIO_TAQUERIA.test(l));
    assert.deepEqual(violaciones, []);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECCIÓN 2 — Ratchet de deuda técnica en handlers genéricos
//   Los contadores sólo pueden bajar. Si suben, el test falla.
// ═══════════════════════════════════════════════════════════════════════════════

describe("Ratchet — deuda técnica no debe crecer", () => {
  // Archivos genéricos (handlers) donde el vocabulario de taquería es legacy
  const HANDLERS_GENERICOS = [
    "src/handlers/flujos/orden.js",
    "src/handlers/flujos/resumen.js",
    "src/handlers/flujos/formulario.js",
    "src/handlers/flujos/utils.js",
    "src/handlers/mensajes.js",
  ];

  // ─── Baseline documentado hoy (2026-08-17) ───────────────────────────────
  // Estos números representan el estado ACTUAL (con deuda). Solo pueden bajar.
  // Al migrar cada handler a la capa de Giro, el número debe decrementarse.

  test("llamadas a getPrecios() en handlers genéricos no crecen (baseline: 14)", () => {
    const actual = contarEnArchivos(HANDLERS_GENERICOS, /\bgetPrecios\s*\(\s*\)/);
    assert.ok(actual <= 14,
      `getPrecios() aparece ${actual} veces en handlers genéricos; baseline es 14. ¿Se añadió un nuevo uso?`
    );
  });

  test("referencias a pTaco/pTorta/p100g en handlers genéricos no crecen (baseline: 11)", () => {
    const actual = contarEnArchivos(HANDLERS_GENERICOS, /\bpTaco\b|\bpTorta\b|\bp100g\b/);
    assert.ok(actual <= 11,
      `pTaco/pTorta/p100g aparece ${actual} veces en handlers; baseline es 11. Migrar a giro.precios`
    );
  });

  test("llamadas a calcularPrecioItem() en handlers genéricos no crecen (baseline: 7)", () => {
    const actual = contarEnArchivos(HANDLERS_GENERICOS, /\bcalcularPrecioItem\s*\(/);
    assert.ok(actual <= 7,
      `calcularPrecioItem() aparece ${actual} veces en handlers; baseline es 7. Migrar a contrato.calcularPrecioPartida`
    );
  });

  test("referencias a pTaco/pTorta/p100g en respuestas.js no crecen (baseline: 8)", () => {
    const actual = contarPatron(
      leerLineasCodigo("src/handlers/respuestas.js"),
      /\bpTaco\b|\bpTorta\b|\bp100g\b/
    );
    assert.ok(actual <= 8,
      `respuestas.js tiene ${actual} usos de precios legacy; baseline es 8. Migrar a giro.precios`
    );
  });

  test("referencias directas a nombres de corte como literal en src/handlers/ no crecen (baseline: 1)", () => {
    // Solo cuenta string literals, no variables ni comentarios
    const CORTES_LITERALES = /'surtido'|'buche'|'carne'|'cuero'|'lengua'|'maciza'|'costilla'/;
    const actual = contarEnArchivos(HANDLERS_GENERICOS, CORTES_LITERALES);
    assert.ok(actual <= 1,
      `Literales de corte en handlers: ${actual} (baseline: 1). Migrar al módulo de Giro`
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECCIÓN 3 — Verificar que la tabla "productos" no tiene nuevos consumidores
// ═══════════════════════════════════════════════════════════════════════════════

describe("Tabla productos — no debe ganar nuevos consumidores en handlers", () => {
  // La tabla productos es legacy. Los únicos usos legítimos son:
  // - src/db/seed.js: migración única al crear la BD
  // - src/db/cortes.js: usa menu_items (no productos directamente)
  // Cualquier handler que consulte productos directamente es una violación.

  const HANDLERS = [
    "src/handlers/flujos/orden.js",
    "src/handlers/flujos/resumen.js",
    "src/handlers/flujos/formulario.js",
    "src/handlers/mensajes.js",
    "src/handlers/respuestas.js",
    "src/handlers/comandos.js",
  ];

  test("handlers de flujos y mensajes no consultan la tabla 'productos' directamente", () => {
    const PATRON_SQL_PRODUCTOS = /FROM\s+productos\b|INTO\s+productos\b|UPDATE\s+productos\b/i;
    const violaciones = [];
    for (const archivo of HANDLERS) {
      const lineas = leerLineasCodigo(archivo);
      const hits = lineas.filter(l => PATRON_SQL_PRODUCTOS.test(l));
      if (hits.length > 0) violaciones.push(`${archivo}: ${hits.length} consultas directas`);
    }
    assert.deepEqual(violaciones, [],
      `Handlers consultando productos directamente: ${violaciones.join(", ")}`
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECCIÓN 4 — Verificar que los módulos del Giro sí tienen el vocabulario correcto
// ═══════════════════════════════════════════════════════════════════════════════

describe("Giros — el vocabulario de taquería sí existe donde debe estar", () => {
  test("src/giros/taqueria/index.js menciona los cortes canónicos", () => {
    const contenido = fs.readFileSync(
      path.join(ROOT, "src/giros/taqueria/index.js"), "utf8"
    );
    // Los cortes canónicos deben estar definidos en el módulo de taquería
    assert.ok(/surtido/.test(contenido), "taqueria/index.js debe definir 'surtido'");
    assert.ok(/buche/.test(contenido),   "taqueria/index.js debe definir 'buche'");
    assert.ok(/cuero/.test(contenido),   "taqueria/index.js debe definir 'cuero'");
  });

  test("src/giros/taqueria/precios.js define crearResolver", () => {
    const contenido = fs.readFileSync(
      path.join(ROOT, "src/giros/taqueria/precios.js"), "utf8"
    );
    assert.ok(/crearResolver/.test(contenido));
  });

  test("src/giros/precios.js define calcularPartida y calcularPedido (motor neutral)", () => {
    const contenido = fs.readFileSync(
      path.join(ROOT, "src/giros/precios.js"), "utf8"
    );
    assert.ok(/calcularPartida/.test(contenido));
    assert.ok(/calcularPedido/.test(contenido));
  });

  test("src/giros/modificaciones.js define TIPOS_OPERACION y aplicarOperacion", () => {
    const contenido = fs.readFileSync(
      path.join(ROOT, "src/giros/modificaciones.js"), "utf8"
    );
    assert.ok(/TIPOS_OPERACION/.test(contenido));
    assert.ok(/aplicarOperacion/.test(contenido));
  });

  test("src/pedido/modelo.js define crearPartida y crearPedido (modelo neutral)", () => {
    const contenido = fs.readFileSync(
      path.join(ROOT, "src/pedido/modelo.js"), "utf8"
    );
    assert.ok(/crearPartida/.test(contenido) || /partida/.test(contenido));
    assert.ok(/crearPedido/.test(contenido)  || /pedido/.test(contenido));
  });
});
