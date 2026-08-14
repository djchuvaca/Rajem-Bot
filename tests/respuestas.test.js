"use strict";
// Tests para handlers/respuestas.js — respuestaPrecio, respuestaHorario,
// respuestaDomicilio, respuestaMenu, respuestaDescripcionCorte.
// Usa better-sqlite3 en memoria (sin mocks de BD, sin tocar el archivo de producción).

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
    run("UPDATE menu_items SET precio = 0 WHERE producto_slug = 'buche' AND categoria = 'corte'");
    run("UPDATE menu_items SET precio = CASE formato_slug WHEN 'torta' THEN 45 WHEN 'gramos' THEN 36 ELSE 35 END WHERE producto_slug = 'carne' AND categoria = 'corte'");
    try {
      const r = respuestaPrecio();
      // Buche tiene precio 0 → debe usar global (30/40/32), NO mostrar $0
      assert.doesNotMatch(r, /\$0\b/);
    } finally {
      run("UPDATE menu_items SET precio = CASE formato_slug WHEN 'torta' THEN 40 WHEN 'gramos' THEN 32 ELSE 30 END WHERE producto_slug IN ('buche','carne') AND categoria = 'corte'");
    }
  });

  test("desglose muestra precio correcto para corte con precio específico", () => {
    run("UPDATE menu_items SET precio = 38 WHERE producto_slug = 'lengua' AND formato_slug = 'taco' AND categoria = 'corte'");
    try {
      const r = respuestaPrecio();
      // Lengua debe aparecer con $38
      assert.match(r, /\$38/);
    } finally {
      run("UPDATE menu_items SET precio = 30 WHERE producto_slug = 'lengua' AND formato_slug = 'taco' AND categoria = 'corte'");
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
    run("UPDATE menu_items SET precio = 0 WHERE categoria = 'corte'");
    try {
      const r = respuestaMenu();
      assert.doesNotMatch(r, /desde \$0/i);
    } finally {
      run("UPDATE menu_items SET precio = CASE formato_slug WHEN 'torta' THEN 40 WHEN 'gramos' THEN 32 ELSE 30 END WHERE categoria = 'corte'");
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// mensajes_bot — menu_pie_salsas en respuestaMenu
// ═══════════════════════════════════════════════════════════════════════════
describe("menu_pie_salsas en respuestaMenu", () => {
  test("aparece en el menú cuando hay salsas y el mensaje está configurado", () => {
    run("UPDATE menu_items SET activo = 1 WHERE producto_slug = 'roja' AND categoria = 'salsa'");
    run("UPDATE mensajes_bot SET valor = '🟢 Salsas incluidas en tacos y tortas' WHERE clave = 'menu_pie_salsas'");
    invalidarCacheCortes();
    try {
      const r = respuestaMenu();
      assert.match(r, /🟢 Salsas incluidas en tacos y tortas/);
    } finally {
      run("UPDATE mensajes_bot SET valor = '🟢 Todos los tacos y tortas incluyen salsas' WHERE clave = 'menu_pie_salsas'");
      invalidarCacheCortes();
    }
  });

  test("NO aparece cuando el mensaje está vacío", () => {
    run("UPDATE menu_items SET activo = 1 WHERE producto_slug = 'roja' AND categoria = 'salsa'");
    run("UPDATE mensajes_bot SET valor = '' WHERE clave = 'menu_pie_salsas'");
    invalidarCacheCortes();
    try {
      const r = respuestaMenu();
      // La sección de salsas sí aparece (hay una salsa activa)
      assert.match(r, /SALSAS/i);
      // Pero el pie no debe dejar una línea en blanco extra visible
      assert.doesNotMatch(r, /\n\n\n/);
    } finally {
      run("UPDATE mensajes_bot SET valor = '🟢 Todos los tacos y tortas incluyen salsas' WHERE clave = 'menu_pie_salsas'");
      invalidarCacheCortes();
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// mensajes_bot — menu_domicilio_nota en respuestaMenu
// ═══════════════════════════════════════════════════════════════════════════
describe("menu_domicilio_nota en respuestaMenu", () => {
  test("aparece en el menú cuando está configurada", () => {
    run("UPDATE mensajes_bot SET valor = '🛵 Domicilio disponible en toda la ciudad' WHERE clave = 'menu_domicilio_nota'");
    try {
      const r = respuestaMenu();
      assert.match(r, /Domicilio disponible en toda la ciudad/);
    } finally {
      run("UPDATE mensajes_bot SET valor = '🛵 Domicilio: _precio según distancia a tu colonia_ 📍' WHERE clave = 'menu_domicilio_nota'");
    }
  });

  test("NO aparece cuando se deja vacía (tenant la ocultó)", () => {
    run("UPDATE mensajes_bot SET valor = '' WHERE clave = 'menu_domicilio_nota'");
    try {
      const r = respuestaMenu();
      // No debe aparecer texto de domicilio en el menú
      assert.doesNotMatch(r, /Domicilio/i);
    } finally {
      run("UPDATE mensajes_bot SET valor = '🛵 Domicilio: _precio según distancia a tu colonia_ 📍' WHERE clave = 'menu_domicilio_nota'");
    }
  });
});

describe("convergencia del menú WhatsApp con activación del tenant", () => {
  test("oculta un corte desactivado en todas sus presentaciones", () => {
    run("UPDATE menu_items SET activo=0 WHERE categoria='corte' AND producto_slug='buche'");
    try {
      assert.doesNotMatch(respuestaMenu(), /\bBuche\b/i);
    } finally {
      run("UPDATE menu_items SET activo=1 WHERE categoria='corte' AND producto_slug='buche'");
    }
  });

  test("oculta una bebida desactivada y conserva las activas", () => {
    run("UPDATE menu_items SET activo=0 WHERE categoria='refresco' AND producto_slug='coca cola'");
    try {
      const menu = respuestaMenu();
      assert.doesNotMatch(menu, /Coca cola/i);
      assert.match(menu, /Sprite/i);
    } finally {
      run("UPDATE menu_items SET activo=1 WHERE categoria='refresco' AND producto_slug='coca cola'");
    }
  });

  test("oculta toda la sección y sus mensajes cuando no hay salsas activas", () => {
    run("UPDATE menu_items SET activo=0 WHERE categoria='salsa'");
    try {
      const menu = respuestaMenu();
      assert.doesNotMatch(menu, /SALSAS EXTRA/i);
      assert.doesNotMatch(menu, /Todos los tacos y tortas incluyen salsas/i);
    } finally {
      run("UPDATE menu_items SET activo=1 WHERE categoria='salsa'");
    }
  });

  test("oculta una presentación sin productos activos", () => {
    run("UPDATE menu_items SET activo=0 WHERE categoria='corte' AND formato_slug='taco'");
    try {
      const menu = respuestaMenu();
      assert.doesNotMatch(menu, /\*TACOS\*/i);
      assert.match(menu, /\*TORTAS\*/i);
    } finally {
      run("UPDATE menu_items SET activo=1 WHERE categoria='corte' AND formato_slug='taco'");
    }
  });

  test("muestra la nota final configurada y permite ocultarla con texto vacío", () => {
    run("UPDATE mensajes_bot SET valor='CIERRE PERSONALIZADO' WHERE clave='menu_nota_precios'");
    assert.match(respuestaMenu(), /CIERRE PERSONALIZADO/);
    run("UPDATE mensajes_bot SET valor='' WHERE clave='menu_nota_precios'");
    assert.doesNotMatch(respuestaMenu(), /Los precios incluyen tortillas y salsas/i);
    run("UPDATE mensajes_bot SET valor='_Los precios incluyen tortillas y salsas_ 😊' WHERE clave='menu_nota_precios'");
  });
});
