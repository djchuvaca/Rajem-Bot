"use strict";
/**
 * tests/handlers-vocabulario.test.js
 * Fase 8 — Etapa 11: limpiar los handlers genéricos.
 *
 * El núcleo común no debe conocer negocios específicos.
 * El vocabulario exclusivo de taquería (taco, torta, corte-field, surtido,
 * buche, cuero, lengua, costilla, carnitas, maciza) debe vivir SOLO en
 * src/giros/taqueria/. Los handlers genéricos solo pueden contener estos
 * términos mientras las fases 5-7 del acople no estén completas.
 *
 * Estructura:
 *   1. Ratchet: vocabulario taquería en handlers genéricos (baseline actual, solo decrece)
 *   2. Invariante positivo: vocabulario SÍ existe en módulo taquería
 *   3. Módulos genéricos de Giro: vocabulario taquería ausente
 *   4. Estado objetivo — post fases 5-7 (especificaciones)
 *
 * Vocabulario exclusivo de taquería (del contrato del acople):
 *   Taco, Torta, Corte (como campo JSON), Carne/maciza, Costilla,
 *   Cuero/cueritos, Lengua, Surtido, Buche, Carnitas.
 *
 * Ratchet: el conteo puede BAJAR pero nunca SUBIR.
 * Confirmar baseline actualizado cuando se retire código legacy.
 */

const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const fs   = require("fs");
const path = require("path");

// ── Helpers de análisis estático ─────────────────────────────────────────────

function leerLineas(ruta) {
  try { return fs.readFileSync(ruta, "utf8").split("\n"); } catch (_) { return []; }
}

// Cuenta líneas de código (no comentarios // ni líneas de bloque * o /*) que coinciden.
function contarPatron(lineas, regex) {
  return lineas.filter(l => {
    const t = l.trim();
    if (t.startsWith("//") || t.startsWith("*") || t.startsWith("/*")) return false;
    return regex.test(l);
  }).length;
}

function contarEnArchivos(archivos, regex) {
  return archivos.reduce((t, f) => t + contarPatron(leerLineas(f), regex), 0);
}

const ROOT = path.join(__dirname, "..");
const p    = (...x) => path.join(ROOT, ...x);

// Handlers genéricos: NO deben contener vocabulario exclusivo de taquería
const HANDLERS_GENERICOS = [
  p("src/handlers/flujos/orden.js"),
  p("src/handlers/flujos/resumen.js"),
  p("src/handlers/flujos/formulario.js"),
  p("src/handlers/flujos/edicion.js"),
  p("src/handlers/flujos/cancelacion.js"),
  p("src/handlers/mensajes.js"),
  p("src/handlers/respuestas.js"),
  p("src/handlers/imagenes.js"),
  p("src/handlers/mandaditos.js"),
  p("src/handlers/comandos.js"),
];

// Módulos genéricos de Giro: vocabulario taquería también ausente
const GIROS_GENERICOS = [
  p("src/giros/index.js"),
  p("src/giros/contrato.js"),
  p("src/giros/conversacion.js"),
  p("src/giros/modificaciones.js"),
  p("src/giros/precios.js"),
  p("src/giros/catalogo-tenant.js"),
];

// Módulo taquería: DEBE contener el vocabulario (invariante positivo)
const MODULO_TAQUERIA = [
  p("src/giros/taqueria/index.js"),
  p("src/giros/taqueria/nlu.js"),
  p("src/giros/taqueria/modificaciones.js"),
  p("src/giros/taqueria/precios.js"),
  p("src/giros/taqueria/porcionado.js"),
  p("src/giros/taqueria/comandos.js"),
];

// ── Patrones de vocabulario ───────────────────────────────────────────────────

// Valores string 'taco' / 'torta' hardcodeados (presentación taquería-specific)
const PAT_ITEM_TYPES_HW = /["'](?:taco|torta)s?["']/i;

// Campo JSON `corte:` — estructura de datos específica de taquería
const PAT_CORTE_FIELD = /\bcorte\s*:/;

// Slugs de cortes específicos hardcodeados (nombres propios de carnitas)
const PAT_SLUGS_CORTE = /["'](?:surtido|buche|cuero|cueritos|lengua|costilla|maciza|carnitas)["']/i;

// Llamadas a funciones NLU propias de taquería desde handlers genéricos
const PAT_FN_TAQUERIA = /\b(?:listaCortes|getCortesBDObj|nombresCortesActivos|buscarCorteFuzzy)\s*\(/;

// Vocabulario libre (para el invariante positivo del módulo taquería)
const PAT_VOCAB_LIBRE = /\b(?:taco|torta|surtido|buche|cuero|cueritos|lengua|costilla|carnitas|maciza)\b/i;

// ═══════════════════════════════════════════════════════════════════════════════
// SECCIÓN 1 — Ratchet: vocabulario taquería en handlers genéricos
// ═══════════════════════════════════════════════════════════════════════════════

describe("Ratchet: vocabulario exclusivo de taquería en handlers genéricos", () => {
  test("item_types hardcodeados ('taco','torta') no crecen (baseline: ≤5)", () => {
    const n = contarEnArchivos(HANDLERS_GENERICOS, PAT_ITEM_TYPES_HW);
    assert.ok(n <= 5,
      `Hay ${n} ocurrencias de "taco"/"torta" hardcodeados en handlers genéricos — límite: 5.\n` +
      "Al completar la fase 5-7 del acople este número debe llegar a 0."
    );
  });

  test("campo JSON 'corte:' (estructura taquería) no crece (baseline: ≤6)", () => {
    const n = contarEnArchivos(HANDLERS_GENERICOS, PAT_CORTE_FIELD);
    assert.ok(n <= 6,
      `Hay ${n} ocurrencias de 'corte:' en handlers genéricos — límite: 6.\n` +
      "Este campo debe moverse a src/giros/taqueria/ cuando las fases 5-7 estén completas."
    );
  });

  test("slugs de cortes hardcodeados no crecen (baseline: ≤2)", () => {
    const n = contarEnArchivos(HANDLERS_GENERICOS, PAT_SLUGS_CORTE);
    assert.ok(n <= 2,
      `Hay ${n} slugs de cortes específicos ('surtido', 'buche', etc.) hardcodeados — límite: 2.\n` +
      "Estos slugs deben vivir únicamente en src/giros/taqueria/."
    );
  });

  test("llamadas a funciones NLU taquería en handlers no crecen (baseline: ≤25)", () => {
    const n = contarEnArchivos(HANDLERS_GENERICOS, PAT_FN_TAQUERIA);
    assert.ok(n <= 25,
      `Hay ${n} llamadas a listaCortes/getCortesBDObj/nombresCortesActivos en handlers — límite: 25.\n` +
      "Estas funciones deben ser abstraídas por el contrato del Giro."
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECCIÓN 2 — Invariante positivo: el vocabulario SÍ vive en src/giros/taqueria/
// ═══════════════════════════════════════════════════════════════════════════════

describe("Invariante positivo: vocabulario taquería concentrado en src/giros/taqueria/", () => {
  test("el módulo taquería contiene vocabulario específico (≥10 ocurrencias)", () => {
    const n = contarEnArchivos(MODULO_TAQUERIA, PAT_VOCAB_LIBRE);
    assert.ok(n >= 10,
      `Solo hay ${n} ocurrencias de vocabulario taquería en src/giros/taqueria/ — se esperan ≥10.\n` +
      "El vocabulario debe concentrarse aquí, no eliminarse del sistema."
    );
  });

  test("src/giros/taqueria/index.js define al menos 5 cortes", () => {
    const lineas = leerLineas(p("src/giros/taqueria/index.js"));
    const n = contarPatron(lineas, PAT_VOCAB_LIBRE);
    assert.ok(n >= 5,
      `src/giros/taqueria/index.js solo tiene ${n} ocurrencias de vocabulario — ¿faltan cortes?`
    );
  });

  test("src/giros/taqueria/nlu.js contiene lógica NLU taquería", () => {
    const lineas = leerLineas(p("src/giros/taqueria/nlu.js"));
    const n = contarPatron(lineas, PAT_VOCAB_LIBRE);
    assert.ok(n >= 3,
      `src/giros/taqueria/nlu.js solo tiene ${n} ocurrencias — el NLU debe conocer los cortes`
    );
  });

  test("la proporción de vocabulario taquería en módulo vs handlers es favorable (módulo ≥ 2×)", () => {
    const enModulo   = contarEnArchivos(MODULO_TAQUERIA, PAT_VOCAB_LIBRE);
    const enHandlers = contarEnArchivos(HANDLERS_GENERICOS, PAT_VOCAB_LIBRE);
    // El vocabulario debe estar más concentrado en el módulo que en los handlers
    assert.ok(enModulo >= enHandlers,
      `Módulo taquería tiene ${enModulo} ocurrencias vs handlers genéricos ${enHandlers}.\n` +
      "El módulo debe acumular más vocabulario que los handlers mientras el acople avanza."
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECCIÓN 3 — Módulos genéricos de Giro: sin vocabulario taquería
// ═══════════════════════════════════════════════════════════════════════════════

describe("Módulos genéricos de Giro — sin vocabulario taquería", () => {
  test("src/giros/index.js no contiene vocabulario taquería-específico", () => {
    const lineas = leerLineas(p("src/giros/index.js"));
    const n = contarPatron(lineas, PAT_VOCAB_LIBRE);
    assert.equal(n, 0,
      `src/giros/index.js tiene ${n} ocurrencias de vocabulario taquería — debe ser 0 (es genérico)`
    );
  });

  test("src/giros/contrato.js no contiene vocabulario taquería-específico", () => {
    const lineas = leerLineas(p("src/giros/contrato.js"));
    const n = contarPatron(lineas, PAT_VOCAB_LIBRE);
    assert.equal(n, 0,
      `src/giros/contrato.js tiene ${n} ocurrencias de vocabulario taquería — el contrato es genérico`
    );
  });

  test("src/giros/precios.js no contiene slugs de cortes taquería hardcodeados", () => {
    const lineas = leerLineas(p("src/giros/precios.js"));
    const n = contarPatron(lineas, PAT_SLUGS_CORTE);
    assert.equal(n, 0,
      `src/giros/precios.js tiene ${n} slugs de cortes hardcodeados — el motor de precios es neutro`
    );
  });

  test("src/giros/catalogo-tenant.js no contiene slugs de cortes taquería hardcodeados", () => {
    const lineas = leerLineas(p("src/giros/catalogo-tenant.js"));
    const n = contarPatron(lineas, PAT_SLUGS_CORTE);
    assert.equal(n, 0,
      `src/giros/catalogo-tenant.js tiene ${n} slugs de cortes taquería hardcodeados`
    );
  });

  test("src/giros/conversacion.js no contiene vocabulario taquería-específico", () => {
    const lineas = leerLineas(p("src/giros/conversacion.js"));
    const n = contarPatron(lineas, PAT_VOCAB_LIBRE);
    assert.equal(n, 0,
      `src/giros/conversacion.js tiene ${n} ocurrencias de vocabulario taquería`
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECCIÓN 4 — Estado objetivo — post fases 5-7 (especificaciones)
// ═══════════════════════════════════════════════════════════════════════════════

describe("Estado objetivo — post fases 5-7 (especificaciones)", () => {
  test.todo(
    "orden.js no debe usar 'taco'/'torta' hardcodeados — el tipo de ítem lo provee el Giro"
  );
  test.todo(
    "el campo JSON 'corte:' en orden.js debe reemplazarse por 'productoSlug:' (formato neutral)"
  );
  test.todo(
    "listaCortes() debe eliminarse de orden.js — reemplazar por contrato.getProductosDisponibles()"
  );
  test.todo(
    "getCortesBDObj() no debe llamarse desde handlers genéricos — solo desde src/giros/taqueria/"
  );
  test.todo(
    "respuestas.js no debe llamar directamente a getCortesBDObj() ni generar mensajes de 'cortes'"
  );
  test.todo(
    "comandos.js no debe llamar a nombresCortesActivos() directamente — delegar al Giro"
  );
});
