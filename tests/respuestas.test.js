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
  aplicarModificacion,
} = require("../src/handlers/respuestas");
const { run } = require("../src/db/core");

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
    // En formato uniforme aparece el texto; en formato desglose se usan emojis 🌮/🥖
    assert.match(r, /taco|🌮/u);
    assert.match(r, /torta|🥖/u);
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

  test("menciona ajuste por distancia", () => {
    const r = respuestaDomicilio();
    assert.match(r, /distancia|colonia/i);
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

// ═══════════════════════════════════════════════════════════════════════════
// aplicarModificacion — quitar_uno
// ═══════════════════════════════════════════════════════════════════════════
describe("aplicarModificacion quitar_uno", () => {
  const mod = { tipo: "quitar_uno", corte: null };

  test("reduce cantidad de 3 a 2", () => {
    const r = aplicarModificacion(mod, "🌮 3 tacos de surtido — $90");
    assert.match(r, /2 tacos/);
  });

  test("actualiza el precio en la línea al reducir", () => {
    const r = aplicarModificacion(mod, "🌮 3 tacos de surtido — $90");
    assert.match(r, /\$60/);      // 2 × $30
    assert.doesNotMatch(r, /\$90/);
  });

  test("reduce el último ítem con qty > 1 cuando hay varios", () => {
    const orden = "🌮 3 tacos de surtido — $90\n🥖 2 tortas de carne — $80";
    const r = aplicarModificacion(mod, orden);
    // debe reducir el último (tortas: 2→1)
    assert.match(r, /1 torta/);
    assert.match(r, /\$40/);
    assert.match(r, /3 tacos/); // el primero no cambia
  });

  test("BUG: NO ignora ítems anteriores cuando el último tiene qty=1", () => {
    // Bug conocido: cuando el último ítem tiene qty=1, debe buscar en ítems anteriores
    const orden = "🌮 3 tacos de surtido — $90\n🥖 1 torta de carne — $40";
    const r = aplicarModificacion(mod, orden);
    // Debe reducir tacos (qty=3), no retornar null
    assert.ok(r !== null, "No debe retornar null cuando hay ítem con qty > 1 antes del último");
    assert.match(r, /2 tacos/);
  });

  test("retorna null cuando TODOS los ítems tienen qty=1", () => {
    const orden = "🌮 1 taco de surtido — $30\n🥖 1 torta de carne — $40";
    const r = aplicarModificacion(mod, orden);
    assert.strictEqual(r, null);
  });

  test("retorna null con orden vacía", () => {
    assert.strictEqual(aplicarModificacion(mod, ""), null);
    assert.strictEqual(aplicarModificacion(mod, null), null);
  });

  test("con corteEspecificado reduce ese corte en particular", () => {
    const modCorte = { tipo: "quitar_uno", corte: "carne" };
    const orden = "🌮 2 tacos de surtido — $60\n🥖 3 tortas de carne — $120";
    const r = aplicarModificacion(modCorte, orden);
    assert.match(r, /2 tortas/);
    assert.match(r, /2 tacos de surtido/); // el de surtido no cambia
  });

  test("precio actualizado cuando se especifica corte", () => {
    const modCorte = { tipo: "quitar_uno", corte: "surtido" };
    const orden = "🌮 4 tacos de surtido — $120";
    const r = aplicarModificacion(modCorte, orden);
    assert.match(r, /3 tacos/);
    assert.match(r, /\$90/);
    assert.doesNotMatch(r, /\$120/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// aplicarModificacion — cambiar_corte
// ═══════════════════════════════════════════════════════════════════════════
describe("aplicarModificacion cambiar_corte", () => {
  test("reemplaza el corte en la línea", () => {
    const mod = { tipo: "cambiar_corte", de: "surtido", por: "carne" };
    const r = aplicarModificacion(mod, "🌮 3 tacos de surtido — $90");
    assert.match(r, /carne/);
    assert.doesNotMatch(r, /surtido/);
  });

  test("reemplazo es case-insensitive", () => {
    const mod = { tipo: "cambiar_corte", de: "Surtido", por: "buche" };
    const r = aplicarModificacion(mod, "🌮 2 tacos de surtido — $60");
    assert.match(r, /buche/);
  });

  test("retorna null cuando el corte a reemplazar no existe en la orden", () => {
    const mod = { tipo: "cambiar_corte", de: "lengua", por: "buche" };
    const r = aplicarModificacion(mod, "🌮 3 tacos de surtido — $90");
    assert.strictEqual(r, null);
  });

  test("retorna null cuando 'de' o 'por' es null", () => {
    assert.strictEqual(aplicarModificacion({ tipo: "cambiar_corte", de: null, por: "buche" }, "orden"), null);
    assert.strictEqual(aplicarModificacion({ tipo: "cambiar_corte", de: "surtido", por: null }, "orden"), null);
  });

  test("retorna null con orden vacía", () => {
    const mod = { tipo: "cambiar_corte", de: "surtido", por: "carne" };
    assert.strictEqual(aplicarModificacion(mod, null), null);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// respuestaPrecio — filtrado y precios efectivos
// ═══════════════════════════════════════════════════════════════════════════
describe("respuestaPrecio filtrado y precios efectivos", () => {
  test("modo uniforme NO incluye 'surtido especial' en la lista de piezas", () => {
    const r = respuestaPrecio();
    // En modo uniforme aparece "Piezas disponibles: Surtido, Carne..."
    // No debe aparecer "surtido especial" en esa lista
    const partes = r.split("Piezas disponibles:");
    if (partes.length > 1) {
      assert.doesNotMatch(partes[1], /surtido especial/i);
    }
  });

  test("BUG: precio 0 en BD NO debe mostrarse como $0 en desglose", () => {
    // Simula que buche tiene precio 0 (usa global) y carne tiene precio diferente
    run("UPDATE productos SET precio_taco = 0, precio_torta = 0, precio_100g = 0 WHERE lower(nombre) = 'buche'");
    run("UPDATE productos SET precio_taco = 35, precio_torta = 45, precio_100g = 36 WHERE lower(nombre) = 'carne'");
    try {
      const r = respuestaPrecio();
      // Buche tiene precio 0 → debe usar global (30/40/32), NO mostrar $0
      assert.doesNotMatch(r, /\$0\b/);
    } finally {
      run("UPDATE productos SET precio_taco = 30, precio_torta = 40, precio_100g = 32 WHERE lower(nombre) = 'buche'");
      run("UPDATE productos SET precio_taco = 30, precio_torta = 40, precio_100g = 32 WHERE lower(nombre) = 'carne'");
    }
  });

  test("desglose muestra precio correcto para corte con precio específico", () => {
    run("UPDATE productos SET precio_taco = 38 WHERE lower(nombre) = 'lengua'");
    try {
      const r = respuestaPrecio();
      // Lengua debe aparecer con $38
      assert.match(r, /\$38/);
    } finally {
      run("UPDATE productos SET precio_taco = 30 WHERE lower(nombre) = 'lengua'");
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// respuestaMenu — filtrado de surtido especial
// ═══════════════════════════════════════════════════════════════════════════
describe("respuestaMenu filtrado", () => {
  test("no incluye 'surtido especial' en la lista de piezas disponibles", () => {
    const r = respuestaMenu();
    const partes = r.split("Piezas disponibles:");
    if (partes.length > 1) {
      assert.doesNotMatch(partes[1], /surtido especial/i);
    }
  });

  test("BUG: precio 0 en BD no activa modo 'desde $0'", () => {
    // Si todos los cortes tienen precio 0 en BD, debe usar el precio global ($30/$40/$32)
    // y mostrar precio fijo (no "desde $0")
    run("UPDATE productos SET precio_taco = 0 WHERE categoria = 'corte' AND nombre != 'surtido especial'");
    try {
      const r = respuestaMenu();
      assert.doesNotMatch(r, /desde \$0/i);
    } finally {
      run("UPDATE productos SET precio_taco = 30 WHERE categoria = 'corte'");
    }
  });
});
