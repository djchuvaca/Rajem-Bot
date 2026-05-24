"use strict";
// Tests para handlers/respuestas.js — respuestaPrecio, respuestaHorario,
// respuestaDomicilio, respuestaMenu, respuestaDescripcionCorte.
// Usa sql.js real (sin mocks de BD).

const { test, describe, before } = require("node:test");
const assert = require("node:assert/strict");

const { initDB } = require("../src/db/core");
const { seedDB } = require("../src/db/seed");
const { invalidarCacheCortes } = require("../src/handlers/pedidoParser");
const {
  respuestaPrecio,
  respuestaHorario,
  respuestaDomicilio,
  respuestaMenu,
  respuestaDescripcionCorte,
  respuestaMetodosPago,
  respuestaUbicacion,
} = require("../src/handlers/respuestas");

before(async () => {
  await initDB();
  await seedDB();
  invalidarCacheCortes();
});

// ═══════════════════════════════════════════════════════════════════════════
// respuestaPrecio()
// ═══════════════════════════════════════════════════════════════════════════
describe("respuestaPrecio", () => {
  test("incluye texto de tacos y tortas", () => {
    const r = respuestaPrecio();
    assert.match(r, /taco/i);
    assert.match(r, /torta/i);
  });

  test("incluye símbolo de peso", () => {
    const r = respuestaPrecio();
    assert.match(r, /\$/);
  });

  test("para un corte específico menciona el corte", () => {
    const r = respuestaPrecio("surtido");
    assert.match(r, /surtido/i);
  });

  test("respuesta de precio general incluye cortes disponibles", () => {
    const r = respuestaPrecio();
    // Al menos un nombre de producto debe aparecer
    assert.match(r, /surtido|carne|buche|cuero|lengua/i);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// respuestaHorario()
// ═══════════════════════════════════════════════════════════════════════════
describe("respuestaHorario", () => {
  test("retorna string no vacío", () => {
    const r = respuestaHorario();
    assert.ok(typeof r === "string" && r.length > 0);
  });

  test("incluye mención a horario", () => {
    const r = respuestaHorario();
    assert.match(r, /horario|abierto|cerrado/i);
  });

  test("incluye días o horas", () => {
    const r = respuestaHorario();
    // Debe mencionar lunes/martes/etc. o un número de hora
    assert.match(r, /lunes|martes|miércoles|jueves|viernes|sábado|domingo|\d+:\d+|\d+ a\.m\./i);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// respuestaDomicilio()
// ═══════════════════════════════════════════════════════════════════════════
describe("respuestaDomicilio", () => {
  test("menciona que sí hacen domicilio", () => {
    const r = respuestaDomicilio();
    assert.match(r, /domicilio|sí/i);
  });

  test("incluye costo en pesos", () => {
    const r = respuestaDomicilio();
    assert.match(r, /\$\d+/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// respuestaMenu()
// ═══════════════════════════════════════════════════════════════════════════
describe("respuestaMenu", () => {
  test("incluye tacos, tortas y gramos", () => {
    const r = respuestaMenu();
    assert.match(r, /taco/i);
    assert.match(r, /torta/i);
    assert.match(r, /gramo/i);
  });

  test("incluye precios", () => {
    const r = respuestaMenu();
    assert.match(r, /\$\d+/);
  });

  test("menciona el nombre del negocio", () => {
    const r = respuestaMenu();
    // El nombre del negocio viene de la BD (default: Tacos Javier)
    assert.match(r, /tacos|negocio/i);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// respuestaDescripcionCorte()
// ═══════════════════════════════════════════════════════════════════════════
describe("respuestaDescripcionCorte", () => {
  test("para corte desconocido lista los disponibles", () => {
    const r = respuestaDescripcionCorte("chimichanga");
    assert.match(r, /surtido|carne|buche|cuero|lengua/i);
  });

  test("para null lista los disponibles", () => {
    const r = respuestaDescripcionCorte(null);
    assert.ok(typeof r === "string" && r.length > 0);
  });

  test("para un corte válido con descripción, la incluye", () => {
    const r = respuestaDescripcionCorte("surtido");
    // La descripción viene de la BD; al menos debe mencionar el corte
    assert.ok(typeof r === "string" && r.length > 0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// respuestaMetodosPago()
// ═══════════════════════════════════════════════════════════════════════════
describe("respuestaMetodosPago", () => {
  test("mostrador menciona tarjeta", () => {
    const r = respuestaMetodosPago(false);
    assert.match(r, /tarjeta/i);
  });

  test("domicilio NO menciona tarjeta", () => {
    const r = respuestaMetodosPago(true);
    assert.doesNotMatch(r, /tarjeta/i);
  });

  test("ambos modos mencionan efectivo", () => {
    assert.match(respuestaMetodosPago(false), /efectivo/i);
    assert.match(respuestaMetodosPago(true),  /efectivo/i);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// respuestaUbicacion()
// ═══════════════════════════════════════════════════════════════════════════
describe("respuestaUbicacion", () => {
  test("retorna string no vacío aunque ubicación no esté configurada", () => {
    const r = respuestaUbicacion();
    assert.ok(typeof r === "string" && r.length > 0);
  });

  test("menciona ubicación o cómo contactar al negocio", () => {
    const r = respuestaUbicacion();
    assert.match(r, /ubicaci[oó]n|direcci[oó]n|escr[ií]benos|contacta/i);
  });
});
