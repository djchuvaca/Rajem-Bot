// BD aislada para tests — no usa la BD de producción (que tiene precios del negocio real)
process.env.TENANT_ID = '_test';
"use strict";
// Tests para pedido/resumen.js — procesarItemJSON, jsonALineas, extraerOrdenDeResumen, formatearHora

const { test, describe, before } = require("node:test");
const assert = require("node:assert/strict");

const { initDB, run } = require("../src/db/core");
const { seedDB } = require("../src/db/seed");
const {
  formatearHora,
  procesarItemJSON,
  jsonALineas,
  extraerOrdenDeResumen,
  calcularSubtotal,
} = require("../src/pedido/resumen");
const { getPrecios } = require("../src/pedido/precios");

before(async () => {
  await initDB();
  await seedDB();
});

// ═══════════════════════════════════════════════════════════════════════════
// formatearHora()
// ═══════════════════════════════════════════════════════════════════════════
describe("formatearHora", () => {
  test("null retorna null", () => {
    assert.strictEqual(formatearHora(null), null);
  });

  test("undefined retorna undefined", () => {
    assert.strictEqual(formatearHora(undefined), undefined);
  });

  test("hora < 12 sin meridiano → a.m.", () => {
    assert.match(formatearHora("9"), /a\.m\./);
  });

  test("hora 12 sin meridiano → p.m.", () => {
    assert.match(formatearHora("12"), /p\.m\./);
  });

  test("hora con 'pm' → p.m.", () => {
    assert.match(formatearHora("8pm"), /p\.m\./);
  });

  test("hora con 'am' → a.m.", () => {
    assert.match(formatearHora("7am"), /a\.m\./);
  });

  test("hora con minutos incluye :MM", () => {
    assert.match(formatearHora("8:30"), /8:30/);
  });

  test("hora y minutos compuestos (7:00)", () => {
    const r = formatearHora("7:00");
    assert.match(r, /7:00/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// procesarItemJSON()
// ═══════════════════════════════════════════════════════════════════════════
describe("procesarItemJSON", () => {
  let precios;
  before(() => { precios = getPrecios(); });

  test("taco — plural y precio correcto", () => {
    const r = procesarItemJSON({ presentacion: "taco", cantidad: 3, corte: "surtido" }, precios);
    assert.match(r, /3 tacos/);
    assert.match(r, /surtido/);
    assert.match(r, /\$90/);
  });

  test("taco singular", () => {
    const r = procesarItemJSON({ presentacion: "taco", cantidad: 1, corte: "carne" }, precios);
    assert.match(r, /1 taco[^s]/);
    assert.match(r, /\$30/);
  });

  test("torta — plural y precio correcto", () => {
    const r = procesarItemJSON({ presentacion: "torta", cantidad: 2, corte: "buche" }, precios);
    assert.match(r, /2 tortas/);
    assert.match(r, /buche/);
    assert.match(r, /\$80/);
  });

  test("torta singular", () => {
    const r = procesarItemJSON({ presentacion: "torta", cantidad: 1, corte: "cuero" }, precios);
    assert.match(r, /1 torta[^s]/);
  });

  test("gramos — muestra cantidad y precio", () => {
    const r = procesarItemJSON({ presentacion: "gramos", gramos: 200, corte: "cuero" }, precios);
    assert.match(r, /200g/);
    assert.match(r, /cuero/);
    assert.match(r, /\$64/); // (200/100)*32 = 64
  });

  test("pesos — muestra monto y estimado en gramos", () => {
    const r = procesarItemJSON({ presentacion: "pesos", monto: 96, corte: "lengua" }, precios);
    assert.match(r, /\$96/);
    assert.match(r, /lengua/);
    assert.match(r, /g/); // estimado en gramos
  });

  test("surtido especial con combinacion — incluye paréntesis", () => {
    const item = {
      presentacion: "taco",
      cantidad: 3,
      corte: "surtido especial",
      combinacion: "carne con buche"
    };
    const r = procesarItemJSON(item, precios);
    assert.match(r, /surtido especial/);
    assert.match(r, /\(carne con buche\)/);
    assert.match(r, /\$90/);
  });

  test("corte null — no muestra 'de null' ni lanza error", () => {
    const r = procesarItemJSON({ presentacion: "taco", cantidad: 2, corte: null }, precios);
    assert.doesNotMatch(r, /null/);
    assert.match(r, /2 tacos/);
    assert.match(r, /\$60/);
  });

  test("item sin corte — usa precios globales", () => {
    const r = procesarItemJSON({ presentacion: "torta", cantidad: 1 }, precios);
    assert.match(r, /\$40/);
  });

  test("precio por corte específico cuando difiere del global", () => {
    run("UPDATE productos SET precio_taco = 35 WHERE nombre = 'carne'");
    try {
      const p2 = getPrecios();
      const r = procesarItemJSON({ presentacion: "taco", cantidad: 2, corte: "carne" }, p2);
      assert.match(r, /\$70/); // 2 × 35
    } finally {
      run("UPDATE productos SET precio_taco = 30 WHERE nombre = 'carne'");
    }
  });

  test("surtido especial con precio_taco = 0 usa precio global (no muestra $0)", () => {
    run("UPDATE productos SET precio_taco = 0 WHERE nombre = 'surtido especial'");
    try {
      const p2 = getPrecios();
      const r = procesarItemJSON(
        { presentacion: "taco", cantidad: 2, corte: "surtido especial", combinacion: "carne con cuero" },
        p2
      );
      assert.doesNotMatch(r, /\$0/);
      assert.match(r, /\$60/); // 2 × 30 (precio global)
    } finally {
      run("UPDATE productos SET precio_taco = 30 WHERE nombre = 'surtido especial'");
    }
  });

  test("grupo_repetido — formato con 'platos'", () => {
    const item = {
      presentacion: "grupo_repetido",
      grupos: 2,
      items_por_grupo: [
        { presentacion: "taco",  cantidad: 3, corte: "surtido" },
        { presentacion: "torta", cantidad: 1, corte: "carne"   }
      ]
    };
    const r = procesarItemJSON(item, precios);
    assert.match(r, /platos/);
    assert.match(r, /\$260/); // 2 × (90 + 40) = 260
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// jsonALineas()
// ═══════════════════════════════════════════════════════════════════════════
describe("jsonALineas", () => {
  test("ítem único — texto, precio y subtotal correctos", () => {
    const json = { items: [{ presentacion: "taco", cantidad: 3, corte: "surtido" }] };
    const { texto, subtotal } = jsonALineas(json);
    assert.match(texto, /3 tacos/);
    assert.strictEqual(subtotal, 90);
    assert.match(texto, /Subtotal: \$90/);
  });

  test("múltiples ítems — subtotal es la suma", () => {
    const json = {
      items: [
        { presentacion: "taco",  cantidad: 3, corte: "surtido" },
        { presentacion: "torta", cantidad: 1, corte: "carne"   }
      ]
    };
    const { subtotal } = jsonALineas(json);
    assert.strictEqual(subtotal, 130); // 90 + 40
  });

  test("surtido especial con combinacion en jsonALineas", () => {
    const json = {
      items: [
        { presentacion: "taco", cantidad: 2, corte: "surtido especial", combinacion: "buche con cuero" }
      ]
    };
    const { texto } = jsonALineas(json);
    assert.match(texto, /surtido especial/);
    assert.match(texto, /\(buche con cuero\)/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// extraerOrdenDeResumen()
// ═══════════════════════════════════════════════════════════════════════════
describe("extraerOrdenDeResumen", () => {
  const resumenMostrador = [
    "━━━━━━━━━━━━━━━━━━",
    "🏪 *PEDIDO EN MOSTRADOR — Tacos Javier*",
    "👤 *Cliente:* Juan Pérez",
    "📱 *Teléfono:* 3311234567",
    "📋 *Orden:*",
    "🌮 3 tacos de surtido — $90",
    "🥖 1 torta de carne — $40",
    "",
    "💰 *TOTAL: $130*",
    "💳 *Pago:* efectivo",
    "━━━━━━━━━━━━━━━━━━",
    "*¿Confirmas tu pedido?*"
  ].join("\n");

  const resumenDomicilio = [
    "━━━━━━━━━━━━━━━━━━",
    "🛵 *PEDIDO A DOMICILIO — Tacos Javier*",
    "👤 *Cliente:* María López",
    "📱 *Teléfono:* 3319876543",
    "📋 *Orden:*",
    "🌮 2 tacos de buche — $60",
    "",
    "📍 *Dirección:* Calle Principal 123, Col. Centro",
    "📌 *Referencia:* sin referencia",
    "💵 *Subtotal:* $60",
    "🛵 *Tarifa domicilio (Zona 1 — Cerca):* $30",
    "💰 *TOTAL: $90*",
    "💳 *Pago:* efectivo",
    "━━━━━━━━━━━━━━━━━━",
    "*¿Confirmas tu pedido?*"
  ].join("\n");

  test("mostrador — extrae todas las líneas de la orden", () => {
    const r = extraerOrdenDeResumen(resumenMostrador);
    assert.match(r, /3 tacos de surtido/);
    assert.match(r, /1 torta de carne/);
  });

  test("mostrador — no incluye líneas de TOTAL ni pago", () => {
    const r = extraerOrdenDeResumen(resumenMostrador);
    assert.doesNotMatch(r, /TOTAL/);
    assert.doesNotMatch(r, /Pago/);
  });

  test("mostrador — no incluye datos del cliente", () => {
    const r = extraerOrdenDeResumen(resumenMostrador);
    assert.doesNotMatch(r, /Juan Pérez/);
    assert.doesNotMatch(r, /Teléfono/);
  });

  test("domicilio — extrae solo la orden sin dirección ni tarifa", () => {
    const r = extraerOrdenDeResumen(resumenDomicilio);
    assert.match(r, /2 tacos de buche/);
    assert.doesNotMatch(r, /Dirección/);
    assert.doesNotMatch(r, /Tarifa/);
    assert.doesNotMatch(r, /Subtotal/);
  });

  test("orden extraída de mostrador permite calcular subtotal correctamente", () => {
    const orden = extraerOrdenDeResumen(resumenMostrador);
    assert.strictEqual(calcularSubtotal(orden), 130);
  });

  test("orden extraída de domicilio — calcularSubtotal solo incluye alimentos", () => {
    const orden = extraerOrdenDeResumen(resumenDomicilio);
    assert.strictEqual(calcularSubtotal(orden), 60);
  });

  test("surtido especial con paréntesis se extrae correctamente", () => {
    const resumen = [
      "━━━━━━━━━━━━━━━━━━",
      "🏪 *PEDIDO EN MOSTRADOR — Tacos Javier*",
      "👤 *Cliente:* Test",
      "📱 *Teléfono:* 3310000000",
      "📋 *Orden:*",
      "🌮 3 tacos de surtido especial (carne con buche) — $90",
      "",
      "💰 *TOTAL: $90*",
      "💳 *Pago:* efectivo",
      "━━━━━━━━━━━━━━━━━━",
      "*¿Confirmas tu pedido?*"
    ].join("\n");
    const r = extraerOrdenDeResumen(resumen);
    assert.match(r, /surtido especial \(carne con buche\)/);
    assert.strictEqual(calcularSubtotal(r), 90);
  });

  test("retorna string vacío si no hay sección de orden", () => {
    const r = extraerOrdenDeResumen("Texto sin sección de orden.");
    assert.strictEqual(r, "");
  });

  test("múltiples ítems — todos extraídos", () => {
    const resumen = [
      "📋 *Orden:*",
      "🌮 2 tacos de surtido — $60",
      "🥖 1 torta de buche — $40",
      "⚖️ 150g de cuero — $48",
      "",
      "💰 *TOTAL: $148*",
    ].join("\n");
    const r = extraerOrdenDeResumen(resumen);
    assert.match(r, /2 tacos de surtido/);
    assert.match(r, /1 torta de buche/);
    assert.match(r, /150g de cuero/);
    assert.strictEqual(calcularSubtotal(r), 148);
  });
});
