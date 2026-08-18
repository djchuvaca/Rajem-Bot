"use strict";
/**
 * tests/adaptadores-temporales.test.js
 * Fase 8 — Etapa 12: inventariar y raquetar adaptadores temporales.
 *
 * Los adaptadores de compatibilidad son puentes entre el formato histórico
 * (JSON con campos corte/presentacion) y el formato neutral (partidas con
 * productoSlug/formatoSlug). Se retiran uno por uno, siempre con respaldo.
 *
 * Adaptadores identificados:
 *   A1. convertirPedidoLegacy / normalizarPedido — expuestos en contrato.js
 *   A2. pedidoALegacy / pedidoDesdeLegacy / partida* — en src/pedido/modelo.js
 *   A3. Respuestas rígidas: msg.reply + listaCortes() en handlers genéricos
 *   A4. (Pendiente fases 5-7) funciones proxy de NLU en pedidoParser.js
 *
 * Orden de retiro (del plan de acople):
 *   1. Quitar exports del contrato que sirven solo de puente
 *   2. Mover adaptadores de pedido a src/compatibilidad/pedidos-v1.js
 *   3. Reemplazar msg.reply rígidos por contrato.getTextoError() / Giro.vocabulario
 *   4. Verificar cero referencias a pedidoALegacy en el flujo activo
 *
 * Ratchet: el conteo puede BAJAR pero nunca SUBIR.
 * Confirmar baseline actualizado cuando se retire cada adaptador.
 */

const { test, describe, before } = require("node:test");
const assert = require("node:assert/strict");
const fs   = require("fs");
const path = require("path");

const { initDB } = require("../src/db/core");
const { seedDB } = require("../src/db/seed");

before(async () => {
  await initDB();
  await seedDB();
});

// ── Helpers de análisis estático ─────────────────────────────────────────────

function leerLineas(ruta) {
  try { return fs.readFileSync(ruta, "utf8").split("\n"); } catch (_) { return []; }
}

// Cuenta líneas de código (excluye //, * y /* de comentarios)
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

const CODIGO_OPERATIVO = [
  ...HANDLERS_GENERICOS,
  p("src/giros/contrato.js"),
  p("src/giros/conversacion.js"),
  p("src/giros/modificaciones.js"),
  p("src/giros/precios.js"),
  p("src/giros/catalogo-tenant.js"),
];

// ── Patrones de adaptadores ───────────────────────────────────────────────────

// A1+A2: funciones del puente legacy↔neutral
const PAT_FN_ADAPT = /\b(?:convertirPedidoLegacy|normalizarPedido|pedidoALegacy|pedidoDesdeLegacy|partidaALegacy|partidaDesdeLegacy)\b/;

// A3: respuestas rígidas — msg.reply que llama listaCortes() directamente
const PAT_REPLY_LISTA_CORTES = /msg\.reply.*listaCortes\(\)|listaCortes\(\).*\.reply/;

// A4: proxy / compat en pedidoParser
const PAT_PROXY_PARSER = /\bproxy\b|\bcompat\b/i;

// ═══════════════════════════════════════════════════════════════════════════════
// SECCIÓN 1 — A1+A2: Adaptadores pedido legacy↔neutral
// ═══════════════════════════════════════════════════════════════════════════════

describe("A1+A2: Adaptadores legacy↔neutral del modelo de pedido", () => {
  test("contrato.js expone como máximo 3 funciones de adaptación legacy (baseline: ≤3)", () => {
    const lineas = leerLineas(p("src/giros/contrato.js"));
    const n = contarPatron(lineas, PAT_FN_ADAPT);
    assert.ok(n <= 3,
      `contrato.js tiene ${n} referencias a adaptadores legacy — límite: 3.\n` +
      "Reducir a 0 cuando los handlers usen solo el formato neutral."
    );
  });

  test("los handlers genéricos NO llaman a pedidoALegacy ni pedidoDesdeLegacy directamente", () => {
    const n = contarEnArchivos(HANDLERS_GENERICOS, PAT_FN_ADAPT);
    assert.equal(n, 0,
      `${n} handlers genéricos llaman a funciones del adaptador legacy.\n` +
      "Solo contrato.js debe exponer el adaptador; los handlers no deben llamarlo directamente."
    );
  });

  test("src/pedido/modelo.js exporta los adaptadores (necesarios aún)", () => {
    const lineas = leerLineas(p("src/pedido/modelo.js"));
    const nExport = contarPatron(lineas, /module\.exports\s*=.*pedidoALegacy|pedidoALegacy\s*,/);
    const nFn = contarPatron(lineas, PAT_FN_ADAPT);
    assert.ok(nFn >= 4,
      `src/pedido/modelo.js tiene ${nFn} ocurrencias de adaptadores — se esperan ≥4 (implementaciones)`
    );
  });

  test("el total de referencias a adaptadores en código operativo no crece (baseline: ≤3)", () => {
    const n = contarEnArchivos(CODIGO_OPERATIVO, PAT_FN_ADAPT);
    assert.ok(n <= 3,
      `Hay ${n} referencias a adaptadores legacy en código operativo — límite: 3.\n` +
      "Meta: mover a src/compatibilidad/pedidos-v1.js antes de eliminar."
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECCIÓN 2 — A3: Respuestas rígidas con listaCortes()
// ═══════════════════════════════════════════════════════════════════════════════

describe("A3: Respuestas rígidas con texto taquería-específico", () => {
  test("msg.reply + listaCortes() en handlers no crece (baseline: ≤12)", () => {
    const n = contarEnArchivos(HANDLERS_GENERICOS, PAT_REPLY_LISTA_CORTES);
    assert.ok(n <= 12,
      `Hay ${n} respuestas rígidas con listaCortes() en handlers — límite: 12.\n` +
      "Estas respuestas deben obtenerse del Giro activo (contrato.getTextoError o vocabulario)."
    );
  });

  test("src/handlers/respuestas.js tiene respuestas rígidas (ratchet: ≤3 con listaCortes)", () => {
    const lineas = leerLineas(p("src/handlers/respuestas.js"));
    const n = contarPatron(lineas, PAT_REPLY_LISTA_CORTES);
    assert.ok(n <= 3,
      `respuestas.js tiene ${n} respuestas rígidas con listaCortes() — límite: 3`
    );
  });

  test("los mensajes de error de corte en orden.js usan listaCortes() (ratchet: ≤10)", () => {
    const lineas = leerLineas(p("src/handlers/flujos/orden.js"));
    const n = contarPatron(lineas, PAT_REPLY_LISTA_CORTES);
    assert.ok(n <= 10,
      `orden.js tiene ${n} mensajes rígidos con listaCortes() — límite: 10.\n` +
      "Estos mensajes deben generarse desde el módulo de conversación del Giro."
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECCIÓN 3 — A4: Estado del parser (sin proxy aún)
// ═══════════════════════════════════════════════════════════════════════════════

describe("A4: Funciones proxy en pedidoParser.js", () => {
  test("pedidoParser.js no tiene funciones proxy o compat activas (ya limpio)", () => {
    const lineas = leerLineas(p("src/handlers/pedidoParser.js"));
    const n = contarPatron(lineas, PAT_PROXY_PARSER);
    assert.equal(n, 0,
      `pedidoParser.js tiene ${n} referencias a proxy/compat — deben ser 0`
    );
  });

  test("pedidoParser.js no re-exporta funciones de otros módulos como proxy", () => {
    const lineas = leerLineas(p("src/handlers/pedidoParser.js"));
    // Un proxy típico es: module.exports.X = require('./Y').X (re-export directo)
    const nReexport = contarPatron(lineas, /module\.exports\.\w+\s*=\s*require\(/);
    assert.equal(nReexport, 0,
      `pedidoParser.js tiene ${nReexport} re-exports que podrían ser proxies`
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECCIÓN 4 — Verificación funcional: adaptadores son correctos
// ═══════════════════════════════════════════════════════════════════════════════

describe("Verificación funcional: adaptadores legacy↔neutral bidireccionales", () => {
  test("pedidoDesdeLegacy convierte correctamente un ítem legacy a formato neutral", () => {
    const { pedidoDesdeLegacy } = require("../src/pedido/modelo");
    const legacy = {
      tipo: "pedido",
      items: [{ presentacion: "taco", corte: "surtido", cantidad: 2 }],
    };
    const neutral = pedidoDesdeLegacy(legacy);
    // El formato neutral usa `partidas` (no `items`) y tiene versionModelo
    assert.ok(Array.isArray(neutral.partidas),
      "pedidoDesdeLegacy debe producir objeto con `partidas` (formato neutral)"
    );
    assert.equal(neutral.versionModelo, 1,
      "el formato neutral debe tener versionModelo: 1"
    );
    assert.equal(neutral.partidas.length, 1,
      "debe tener 1 partida"
    );
    assert.equal(neutral.partidas[0].cantidad.valor, 2,
      "la cantidad debe preservarse"
    );
  });

  test("pedidoALegacy convierte correctamente un pedido neutral a formato legacy", () => {
    const { pedidoDesdeLegacy, pedidoALegacy } = require("../src/pedido/modelo");
    const legacy = {
      tipo: "pedido",
      items: [{ presentacion: "taco", corte: "surtido", cantidad: 2 }],
    };
    const neutral = pedidoDesdeLegacy(legacy);
    const vuelta = pedidoALegacy(neutral);

    assert.equal(vuelta.tipo, "pedido",
      "vuelta a legacy debe tener tipo 'pedido'"
    );
    assert.ok(Array.isArray(vuelta.items) && vuelta.items.length === 1,
      "debe tener 1 ítem"
    );
  });

  test("round-trip legacy → neutral → legacy preserva cantidad e ítem tipo", () => {
    const { pedidoDesdeLegacy, pedidoALegacy } = require("../src/pedido/modelo");
    const original = {
      tipo: "pedido",
      items: [
        { presentacion: "taco", corte: "surtido", cantidad: 3 },
        { presentacion: "torta", corte: "carne",   cantidad: 1 },
      ],
    };
    const neutral = pedidoDesdeLegacy(original);
    const vuelta  = pedidoALegacy(neutral);

    assert.equal(vuelta.items.length, 2, "debe preservar 2 ítems");
    assert.equal(vuelta.items[0].cantidad, 3, "primer ítem: cantidad 3");
    assert.equal(vuelta.items[1].cantidad, 1, "segundo ítem: cantidad 1");
  });

  test("contrato expone convertirPedidoLegacy como alias de pedidoALegacy", () => {
    const { getContratoGiro } = require("../src/giros");
    const contrato = getContratoGiro("taqueria");
    assert.equal(typeof contrato.convertirPedidoLegacy, "function",
      "contrato.convertirPedidoLegacy debe ser una función (adaptador de salida)"
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECCIÓN 5 — Estado objetivo (especificaciones)
// ═══════════════════════════════════════════════════════════════════════════════

describe("Estado objetivo — post fases 5-7 (especificaciones)", () => {
  test.todo(
    "contrato.js no debe exponer convertirPedidoLegacy — los handlers usan solo el formato neutral"
  );
  test.todo(
    "pedidoALegacy / pedidoDesdeLegacy deben moverse a src/compatibilidad/pedidos-v1.js si se conservan para pedidos históricos"
  );
  test.todo(
    "msg.reply + listaCortes() deben reemplazarse por contrato.getTextoProductosDisponibles() o similar"
  );
  test.todo(
    "orden.js no debe importar directamente getCortesBDObj ni listaCortes (obtenerlos vía Giro)"
  );
  test.todo(
    "no debe existir ningún ref a pedidoALegacy en el flujo operativo activo (solo en compatibilidad/)"
  );
});
