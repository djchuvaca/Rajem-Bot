// BD aislada para tests — no usa la BD de producción (que tiene precios del negocio real)
process.env.TENANT_ID = '_test';
"use strict";
// Tests para pedido/precios.js — getPrecios, calcularPrecioItem, calcularSubtotal

const { test, describe, before } = require("node:test");
const assert = require("node:assert/strict");

const { initDB, run } = require("../src/db/core");
const { seedDB } = require("../src/db/seed");
const { getPrecios, calcularPrecioItem, calcularSubtotal } = require("../src/pedido/precios");

before(async () => {
  await initDB();
  await seedDB();
});

// ═══════════════════════════════════════════════════════════════════════════
// getPrecios()
// ═══════════════════════════════════════════════════════════════════════════
describe("getPrecios", () => {
  test("retorna estructura con todos los campos esperados", () => {
    const p = getPrecios();
    assert.ok(typeof p.pTaco  === "number", "pTaco debe ser número");
    assert.ok(typeof p.pTorta === "number", "pTorta debe ser número");
    assert.ok(typeof p.p100g  === "number", "p100g debe ser número");
    assert.ok(typeof p.pSalsa === "number", "pSalsa debe ser número");
    assert.ok(typeof p.porCorte === "object", "porCorte debe ser objeto");
  });

  test("precios globales coinciden con seed (30/40/32)", () => {
    const p = getPrecios();
    assert.strictEqual(p.pTaco,  30);
    assert.strictEqual(p.pTorta, 40);
    assert.strictEqual(p.p100g,  32);
  });

  test("porCorte incluye los cortes estándar", () => {
    const p = getPrecios();
    for (const corte of ["surtido", "carne", "buche", "cuero", "lengua"]) {
      assert.ok(corte in p.porCorte, `porCorte debe incluir '${corte}'`);
    }
  });

  test("porCorte incluye surtido especial", () => {
    const p = getPrecios();
    assert.ok("surtido especial" in p.porCorte);
  });

  test("porCorte NO incluye refrescos ni salsas", () => {
    const p = getPrecios();
    assert.ok(!("coca cola" in p.porCorte), "refrescos no deben estar en porCorte");
    assert.ok(!("picada"   in p.porCorte), "salsas no deben estar en porCorte");
  });

  test("cada entrada de porCorte tiene pTaco, pTorta y p100g numéricos", () => {
    const p = getPrecios();
    for (const [nombre, pc] of Object.entries(p.porCorte)) {
      assert.ok(typeof pc.pTaco  === "number", `${nombre}.pTaco debe ser número`);
      assert.ok(typeof pc.pTorta === "number", `${nombre}.pTorta debe ser número`);
      assert.ok(typeof pc.p100g  === "number", `${nombre}.p100g debe ser número`);
    }
  });

  test("menu_items conserva un precio explícito de cero", () => {
    run("UPDATE menu_items SET precio = 0 WHERE producto_slug = 'buche' AND formato_slug = 'taco'");
    try {
      const p = getPrecios();
      assert.strictEqual(p.porCorte["buche"].pTaco, 0);
    } finally {
      run("UPDATE menu_items SET precio = 30 WHERE producto_slug = 'buche' AND formato_slug = 'taco'");
    }
  });

  test("cuando precio diferente del global, porCorte lo refleja correctamente", () => {
    run("UPDATE menu_items SET precio = 35 WHERE producto_slug = 'carne' AND formato_slug = 'taco'");
    try {
      const p = getPrecios();
      assert.strictEqual(p.porCorte["carne"].pTaco, 35);
    } finally {
      run("UPDATE menu_items SET precio = 30 WHERE producto_slug = 'carne' AND formato_slug = 'taco'");
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// calcularPrecioItem()
// ═══════════════════════════════════════════════════════════════════════════
describe("calcularPrecioItem", () => {
  let precios;
  before(() => { precios = getPrecios(); });

  test("taco — N tacos × pTaco", () => {
    const item = { presentacion: "taco", cantidad: 3, corte: "surtido" };
    assert.strictEqual(calcularPrecioItem(item, precios), 90);
  });

  test("taco — 1 taco", () => {
    const item = { presentacion: "taco", cantidad: 1, corte: "carne" };
    assert.strictEqual(calcularPrecioItem(item, precios), 30);
  });

  test("torta — N tortas × pTorta", () => {
    const item = { presentacion: "torta", cantidad: 2, corte: "buche" };
    assert.strictEqual(calcularPrecioItem(item, precios), 90);
  });

  test("gramos — redondeado a entero", () => {
    const item = { presentacion: "gramos", gramos: 200, corte: "cuero" };
    assert.strictEqual(calcularPrecioItem(item, precios), 64); // (200/100)*32 = 64
  });

  test("gramos — fracción redondea correctamente", () => {
    const item = { presentacion: "gramos", gramos: 150, corte: "surtido" };
    assert.strictEqual(calcularPrecioItem(item, precios), 48); // (150/100)*32 = 48
  });

  test("pesos — retorna monto directamente", () => {
    const item = { presentacion: "pesos", monto: 100 };
    assert.strictEqual(calcularPrecioItem(item, precios), 100);
  });

  test("quesadilla — usa el precio de su presentación activa", () => {
    const item = { presentacion: "quesadilla", cantidad: 1, corte: "carne" };
    assert.strictEqual(calcularPrecioItem(item, precios), 50);
  });

  test("corte null — usa precio global sin lanzar error", () => {
    const item = { presentacion: "taco", cantidad: 2, corte: null };
    assert.strictEqual(calcularPrecioItem(item, precios), 60);
  });

  test("corte undefined — usa precio global", () => {
    const item = { presentacion: "taco", cantidad: 1 };
    assert.strictEqual(calcularPrecioItem(item, precios), 30);
  });

  test("corte desconocido — usa precio global (no lanza)", () => {
    const item = { presentacion: "taco", cantidad: 1, corte: "chimichanga" };
    assert.strictEqual(calcularPrecioItem(item, precios), 30);
  });

  test("presentacion desconocida — retorna 0", () => {
    const item = { presentacion: "ensalada", cantidad: 1, corte: "surtido" };
    assert.strictEqual(calcularPrecioItem(item, precios), 0);
  });

  test("precio por corte específico cuando difiere del global", () => {
    run("UPDATE menu_items SET precio = 35 WHERE producto_slug = 'carne' AND formato_slug = 'taco'");
    try {
      const p2 = getPrecios();
      const item = { presentacion: "taco", cantidad: 2, corte: "carne" };
      assert.strictEqual(calcularPrecioItem(item, p2), 70); // 2 × 35
    } finally {
      run("UPDATE menu_items SET precio = 30 WHERE producto_slug = 'carne' AND formato_slug = 'taco'");
    }
  });

  test("surtido especial con precio propio", () => {
    run("UPDATE menu_items SET precio = 33 WHERE producto_slug = 'surtido especial' AND formato_slug = 'taco'");
    try {
      const p2 = getPrecios();
      const item = { presentacion: "taco", cantidad: 3, corte: "surtido especial", combinacion: "carne con buche" };
      assert.strictEqual(calcularPrecioItem(item, p2), 99); // 3 × 33
    } finally {
      run("UPDATE menu_items SET precio = 30 WHERE producto_slug = 'surtido especial' AND formato_slug = 'taco'");
    }
  });

  test("grupo_repetido — multiplica grupos por suma de ítems", () => {
    const item = {
      presentacion: "grupo_repetido",
      grupos: 2,
      items_por_grupo: [
        { presentacion: "taco",  cantidad: 3, corte: "surtido" },
        { presentacion: "torta", cantidad: 1, corte: "carne"   }
      ]
    };
    // 2 × (3×30 + 1×45) = 270
    assert.strictEqual(calcularPrecioItem(item, precios), 270);
  });

  test("plato_separado — suma sus ítems", () => {
    const item = {
      presentacion: "plato_separado",
      numero: 1,
      items: [
        { presentacion: "taco",  cantidad: 2, corte: "surtido" },
        { presentacion: "torta", cantidad: 1, corte: "carne"   }
      ]
    };
    // 2×30 + 1×45 = 105
    assert.strictEqual(calcularPrecioItem(item, precios), 105);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// calcularSubtotal()
// ═══════════════════════════════════════════════════════════════════════════
describe("calcularSubtotal", () => {
  test("línea simple de tacos", () => {
    assert.strictEqual(calcularSubtotal("🌮 3 tacos de surtido — $90"), 90);
  });

  test("varias líneas — suma todas", () => {
    const texto = "🌮 3 tacos de surtido — $90\n🥖 1 torta de carne — $40";
    assert.strictEqual(calcularSubtotal(texto), 130);
  });

  test("tres líneas", () => {
    const texto = [
      "🌮 2 tacos de surtido — $60",
      "🥖 1 torta de buche — $40",
      "⚖️ 100g de cuero — $32",
    ].join("\n");
    assert.strictEqual(calcularSubtotal(texto), 132);
  });

  test("omite líneas que contienen 'subtotal'", () => {
    const texto = "🌮 2 tacos — $60\n💰 Subtotal: $60";
    assert.strictEqual(calcularSubtotal(texto), 60);
  });

  test("omite líneas con emoji 💰 (TOTAL)", () => {
    const texto = "🌮 1 taco — $30\n💰 *TOTAL: $30*";
    assert.strictEqual(calcularSubtotal(texto), 30);
  });

  test("omite líneas con emoji 🛵", () => {
    const texto = "🌮 2 tacos — $60\n🛵 Tarifa domicilio: $50";
    assert.strictEqual(calcularSubtotal(texto), 60);
  });

  test("omite líneas con emoji 📍 (dirección)", () => {
    const texto = "🌮 1 taco — $30\n📍 Dirección: Calle Principal 123";
    assert.strictEqual(calcularSubtotal(texto), 30);
  });

  test("omite líneas con emoji 📌 (referencia)", () => {
    const texto = "🌮 1 taco — $30\n📌 Referencia: sin referencia";
    assert.strictEqual(calcularSubtotal(texto), 30);
  });

  test("línea de surtido especial con paréntesis se procesa correctamente", () => {
    const texto = "🌮 3 tacos de surtido especial (carne con buche) — $90";
    assert.strictEqual(calcularSubtotal(texto), 90);
  });

  test("string vacío retorna 0", () => {
    assert.strictEqual(calcularSubtotal(""), 0);
  });

  test("línea sin precio retorna 0", () => {
    assert.strictEqual(calcularSubtotal("🌮 tacos de surtido"), 0);
  });

  test("múltiples ítems incluyendo surtido especial", () => {
    const texto = [
      "🌮 2 tacos de surtido especial (carne con lengua) — $60",
      "🥖 1 torta de buche — $40",
      "⚖️ 150g de cuero — $48",
    ].join("\n");
    assert.strictEqual(calcularSubtotal(texto), 148);
  });

  test("acepta guión normal además de em-dash", () => {
    assert.strictEqual(calcularSubtotal("🌮 2 tacos - $60"), 60);
  });

  test("con domicilio:\\ excluye la línea de tarifa", () => {
    const texto = "🌮 3 tacos — $90\ndomicilio: $50";
    assert.strictEqual(calcularSubtotal(texto), 90);
  });
});
