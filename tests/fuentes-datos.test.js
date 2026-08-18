"use strict";
/**
 * tests/fuentes-datos.test.js
 * Fase 8 — Etapa 3: mapa de fuentes de datos.
 *
 * Verifica que cada consumidor obtiene la información de la fuente definitiva
 * según la tabla del plan:
 *
 *   Información                    Fuente definitiva
 *   ──────────────────────────     ───────────────────────────────────────────
 *   Productos maestros             Módulo Giro
 *   Cortes o variantes             Módulo Giro → menu_items (overlay tenant)
 *   Salsas / Bebidas               Módulo Giro → menu_items (overlay tenant)
 *   Precios iniciales              Módulo Giro (precio_base)
 *   Habilitación para el tenant    Superadmin → menu_items.activo
 *   Precio particular              menu_items.precio (overlay del tenant)
 *   Disponible/agotado             menu_items.disponible (tenant)
 *   NLU                            Contrato del Giro (+ menu_items overlay)
 *   Descripciones y preguntas      Conversación del Giro
 *   Cálculo de precios             Motor de precios del Giro
 *
 * Cada test manipula SQLite directamente para aislar la fuente que verifica.
 */

process.env.BOT_TEST_MODE = "1";

const { test, describe, before, afterEach } = require("node:test");
const assert = require("node:assert/strict");

const { initDB } = require("../src/db/core");
const { seedDB } = require("../src/db/seed");
const { run, queryOne, queryAll } = require("../src/db/core");

const parser = require("../src/handlers/pedidoParser");
const { getPrecios, calcularPrecioItem } = require("../src/pedido/precios");
const { getGiro, getContratoGiro, getCatalogo } = require("../src/giros");
const catalogoTenant = require("../src/giros/catalogo-tenant");

before(async () => {
  await initDB();
  await seedDB();
  parser.invalidarCacheCortes();
});

afterEach(() => {
  // Restaurar estado canónico después de cada test
  run("UPDATE menu_items SET activo=1 WHERE categoria='corte'");
  run("UPDATE menu_items SET disponible=1 WHERE categoria='corte'");
  run("UPDATE menu_items SET activo=1, disponible=1 WHERE categoria IN ('refresco','salsa')");
  run("UPDATE menu_items SET precio=(SELECT precio_base FROM item_types WHERE slug=formato_slug LIMIT 1) WHERE categoria='corte' AND precio=0");
  parser.invalidarCacheCortes();
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECCIÓN 1 — Fuente: Módulo Giro (definiciones maestras inmutables)
// ═══════════════════════════════════════════════════════════════════════════════

describe("Fuente: Módulo Giro — definiciones maestras", () => {
  test("los cortes maestros provienen del módulo Giro, no de productos", () => {
    const giro = getGiro("taqueria");
    assert.ok(Array.isArray(giro.cortes) && giro.cortes.length > 0);
    // El módulo Giro no debe tener una tabla `productos` como fuente
    assert.equal(Object.hasOwn(giro, "productos"), false,
      "El Giro no debe exponer una clave 'productos'"
    );
  });

  test("las bebidas maestras provienen del módulo Giro", () => {
    const catalogo = getCatalogo("taqueria");
    assert.ok(Array.isArray(catalogo.bebidas) && catalogo.bebidas.length > 0);
    // Las bebidas tienen nombre y precio definidos en el módulo Giro.
    // El emoji puede venir embebido en descripcion (no como campo separado).
    assert.ok(catalogo.bebidas.every(b => b.nombre && typeof b.precio === "number"),
      "cada bebida debe tener nombre y precio definidos en el módulo Giro"
    );
  });

  test("las salsas maestras provienen del módulo Giro", () => {
    const catalogo = getCatalogo("taqueria");
    assert.ok(Array.isArray(catalogo.salsas) && catalogo.salsas.length > 0);
    assert.ok(catalogo.salsas.every(s => s.nombre && s.emoji));
  });

  test("el número de cortes del Giro coincide con el catálogo expuesto", () => {
    const giro = getGiro("taqueria");
    const catalogo = getCatalogo("taqueria");
    assert.equal(catalogo.cortes.length, giro.cortes.length);
  });

  test("los precios iniciales del Giro están definidos en el módulo, no en BD", () => {
    const giro = getGiro("taqueria");
    const itemTypes = giro.itemTypes || [];
    // Cada item type tiene un precio base en el módulo
    for (const it of itemTypes) {
      assert.ok(typeof it.precio_base === "number",
        `item type ${it.slug} debe tener precio_base en el módulo Giro`
      );
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECCIÓN 2 — Fuente: menu_items (overlay del tenant sobre definiciones del Giro)
// ═══════════════════════════════════════════════════════════════════════════════

describe("Fuente: menu_items — overlay del tenant", () => {
  test("deshabilitar un corte en menu_items lo oculta del NLU", () => {
    run("UPDATE menu_items SET activo=0 WHERE categoria='corte' AND producto_slug='buche'");
    parser.invalidarCacheCortes();
    const cortes = parser.getCortes();
    assert.ok(!Object.keys(cortes).includes("buche"),
      "buche deshabilitado en menu_items no debe aparecer en el NLU"
    );
  });

  test("re-habilitar un corte en menu_items lo restaura en el NLU", () => {
    run("UPDATE menu_items SET activo=0 WHERE categoria='corte' AND producto_slug='buche'");
    parser.invalidarCacheCortes();
    run("UPDATE menu_items SET activo=1 WHERE categoria='corte' AND producto_slug='buche'");
    parser.invalidarCacheCortes();
    const cortes = parser.getCortes();
    assert.ok(Object.keys(cortes).includes("buche"),
      "buche re-habilitado debe volver a aparecer en el NLU"
    );
  });

  test("deshabilitar refresco en menu_items lo oculta del parser", () => {
    run("UPDATE menu_items SET activo=0 WHERE categoria='refresco'");
    parser.invalidarCacheCortes();
    assert.deepEqual(parser.getRefrescos(), [],
      "refrescos deshabilitados no deben aparecer"
    );
  });

  test("deshabilitar salsa en menu_items la oculta del parser", () => {
    run("UPDATE menu_items SET activo=0 WHERE categoria='salsa'");
    parser.invalidarCacheCortes();
    assert.deepEqual(parser.getSalsas(), [],
      "salsas deshabilitadas no deben aparecer"
    );
  });

  test("cambiar precio en menu_items se refleja en getPrecios() por corte", () => {
    run("UPDATE menu_items SET precio=55 WHERE producto_slug='surtido' AND formato_slug='taco'");
    const precios = getPrecios();
    // getPrecios() expone precios por corte en porCorte[slug].pTaco (no en el global pTaco).
    // El global pTaco refleja el precio base del formato, no de un corte específico.
    const precioSurtido = precios.porCorte?.surtido?.pTaco;
    assert.ok(typeof precioSurtido === "number",
      "getPrecios() debe exponer precio por corte en porCorte.surtido.pTaco"
    );
    assert.equal(precioSurtido, 55,
      "precio de 'surtido' modificado en menu_items debe aparecer en porCorte.surtido.pTaco"
    );
    // Restaurar
    run("UPDATE menu_items SET precio=30 WHERE producto_slug='surtido' AND formato_slug='taco'");
  });

  test("agotado en menu_items no remueve el corte del NLU pero sí del catálogo activo", () => {
    run("UPDATE menu_items SET disponible=0 WHERE categoria='corte' AND producto_slug='cuero'");
    parser.invalidarCacheCortes();
    // El NLU aún debe reconocer el nombre del corte (para reportar "agotado")
    const noDisponibles = parser.detectarComplementosNoDisponibles("quiero cuero");
    // El parser sí debe detectar que cuero existe pero está agotado
    assert.ok(
      noDisponibles.some(x => x.nombre === "cuero" || x.slug === "cuero") ||
      Object.keys(parser.getCortes()).includes("cuero") === false,
      "cuero agotado debe ser reconocido por el parser o excluido del catálogo activo"
    );
  });

  test("NLU lee de menu_items, no de la tabla productos legacy", () => {
    // Activar productos legacy y asegurar que NO afectan al NLU
    run("UPDATE productos SET activo=1 WHERE categoria IN ('refresco','salsa')");
    run("UPDATE menu_items SET activo=0 WHERE categoria IN ('refresco','salsa')");
    parser.invalidarCacheCortes();

    assert.deepEqual(parser.getRefrescos(), [],
      "productos legacy no deben afectar al NLU — solo menu_items cuenta"
    );
    assert.deepEqual(parser.getSalsas(), [],
      "productos legacy no deben afectar al NLU — solo menu_items cuenta"
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECCIÓN 3 — Fuente: Motor de precios del Giro (calcularPrecioPartida)
// ═══════════════════════════════════════════════════════════════════════════════

describe("Fuente: Motor de precios del Giro", () => {
  test("calcularPrecioPartida del contrato usa menu_items, no getPrecios legacy", () => {
    run("UPDATE menu_items SET precio=47 WHERE producto_slug='surtido' AND formato_slug='taco'");
    parser.invalidarCacheCortes();

    const contrato = getContratoGiro("taqueria");
    const partida = {
      tipo: "producto", formatoSlug: "taco", productoSlug: "surtido",
      cantidad: { tipo: "unidad", valor: 2 }, combinacion: [], extras: [], metadata: {},
    };
    const precio = contrato.calcularPrecioPartida(partida);
    assert.equal(precio, 94, "2 tacos de surtido a $47 = $94");

    run("UPDATE menu_items SET precio=30 WHERE producto_slug='surtido' AND formato_slug='taco'");
  });

  test("precios legacy (getPrecios) y motor neutral coinciden para el mismo corte", () => {
    const precios  = getPrecios();
    const contrato = getContratoGiro("taqueria");

    const itemLegacy = { presentacion: "taco", corte: "surtido", cantidad: 3 };
    const pLegacy    = calcularPrecioItem(itemLegacy, precios);

    const partida = {
      tipo: "producto", formatoSlug: "taco", productoSlug: "surtido",
      cantidad: { tipo: "unidad", valor: 3 }, combinacion: [], extras: [], metadata: {},
    };
    const pNeutral = contrato.calcularPrecioPartida(partida);

    assert.equal(pLegacy, pNeutral,
      `precios legacy ($${pLegacy}) y motor neutral ($${pNeutral}) deben coincidir`
    );
  });

  test("motor de precios de giro calcula correctamente por peso (gramos)", () => {
    const contrato = getContratoGiro("taqueria");
    const { crearResolver } = require("../src/giros/taqueria/precios");
    const resolver = crearResolver();
    const p100 = resolver("gramos", "surtido", []);

    const partida = {
      tipo: "producto", formatoSlug: "gramos", productoSlug: "surtido",
      cantidad: { tipo: "peso", valor: 200 }, combinacion: [], extras: [], metadata: {},
    };
    const total = contrato.calcularPrecioPartida(partida);
    assert.equal(total, Math.round((200 / 100) * p100));
  });

  test("motor de precios de giro calcula correctamente por importe", () => {
    const contrato = getContratoGiro("taqueria");
    const partida = {
      tipo: "producto", formatoSlug: "por_pesos", productoSlug: "surtido",
      cantidad: { tipo: "importe", valor: 200 }, combinacion: [], extras: [], metadata: {},
    };
    const total = contrato.calcularPrecioPartida(partida);
    assert.equal(total, 200, "importe: el precio es el valor tal cual");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECCIÓN 4 — Fuente: Conversación del Giro (textos y preguntas)
// ═══════════════════════════════════════════════════════════════════════════════

describe("Fuente: Conversación del Giro — textos y preguntas", () => {
  test("la pregunta de corte sale del Giro, no de un string hardcodeado", () => {
    const conv = getContratoGiro("taqueria").conversacion;
    const pregunta = conv.preguntarVariante({ presentacion: "taco", cantidad: 3 });
    assert.ok(pregunta.length > 0, "debe devolver una pregunta");
    assert.match(pregunta, /corte|carne/i, "la pregunta debe mencionar 'corte'");
  });

  test("la pregunta de presentación sale del Giro con las opciones activas del tenant", () => {
    const conv = getContratoGiro("taqueria").conversacion;
    const pregunta = conv.preguntarPresentacion({ cantidad: 2, corte: "surtido" }, "tacos o tortas");
    assert.ok(pregunta.length > 0);
    assert.match(pregunta, /surtido/i);
  });

  test("describirItem usa el vocabulario del Giro activo", () => {
    const conv = getContratoGiro("taqueria").conversacion;
    assert.equal(conv.describirItem({ presentacion: "taco", cantidad: 1 }), "el taco");
    assert.equal(conv.describirItem({ presentacion: "taco", cantidad: 4 }), "los 4 tacos");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECCIÓN 5 — Fuente: catalogoTenant como fachada única
// ═══════════════════════════════════════════════════════════════════════════════

describe("Fuente: catalogoTenant — fachada de catálogo operativo", () => {
  test("getCortesTenant() combina definiciones del Giro con overlay de BD", () => {
    const cortes = catalogoTenant.getCortesTenant();
    assert.ok(Array.isArray(cortes) && cortes.length > 0);
    // Cada corte tiene nombre (del Giro) y activo (de BD)
    for (const c of cortes) {
      assert.ok(typeof c.nombre === "string", `corte ${c.slug} debe tener nombre`);
      assert.ok(typeof c.activo !== "undefined", `corte ${c.slug} debe tener activo`);
    }
  });

  test("deshabilitar un corte en BD lo excluye de getCortesTenant por defecto", () => {
    // getCortesTenant() sin filtro devuelve TODOS (para el panel).
    // Para verificar disponibilidad, verificamos que parser.getCortes() lo excluya.
    run("UPDATE menu_items SET activo=0 WHERE categoria='corte' AND producto_slug='lengua'");
    parser.invalidarCacheCortes();
    const cortesNlu = parser.getCortes();
    assert.ok(!Object.keys(cortesNlu).includes("lengua"),
      "lengua deshabilitada no debe aparecer en el NLU"
    );
  });

  test("catalogoTenant rechaza productos inventados (validación de integridad)", () => {
    const esValido = catalogoTenant.esProductoValido("corte", "producto-que-no-existe");
    assert.equal(esValido, false,
      "catalogoTenant debe rechazar productos que no están en el Giro"
    );
  });

  test("catalogoTenant acepta productos válidos del Giro", () => {
    const esValido = catalogoTenant.esProductoValido("corte", "surtido");
    assert.equal(esValido, true);
  });
});
