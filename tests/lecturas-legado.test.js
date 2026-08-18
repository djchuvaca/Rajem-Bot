"use strict";
/**
 * tests/lecturas-legado.test.js
 * Fase 8 — Etapa 10: verificar que no se realizan lecturas de fuentes antiguas
 * en rutas operativas (NLU, panel, bot, resúmenes, reportes).
 *
 * Estado actual:
 *   - La tabla `productos` YA no tiene lecturas SQL directas en código operativo.
 *   - El NLU lee de cortes + menu_items (via pedidoParser / db/cortes.js).
 *   - Los precios operativos vienen de menu_items (via getPrecios() → porCorte).
 *   - Las referencias al nombre "productos" en handlers son VARIABLES LOCALES,
 *     no consultas a la tabla SQL.
 *
 * Ratchet: la cantidad de lecturas legacy puede disminuir pero no crecer.
 * Especificaciones: describen el estado final (test.todo).
 */

process.env.BOT_TEST_MODE = "1";

const { test, describe, before } = require("node:test");
const assert = require("node:assert/strict");
const fs   = require("fs");
const path = require("path");

const { initDB } = require("../src/db/core");
const { seedDB } = require("../src/db/seed");
const { run, queryOne } = require("../src/db/core");

before(async () => {
  await initDB();
  await seedDB();
});

// ── Helpers ──────────────────────────────────────────────────────────────────

function leerLineas(ruta) {
  try { return fs.readFileSync(ruta, "utf8").split("\n"); } catch (_) { return []; }
}
function contarPatron(lineas, regex) {
  return lineas.filter(l => !l.trim().startsWith("//") && regex.test(l)).length;
}
function contarEnArchivos(archivos, regex) {
  return archivos.reduce((t, f) => t + contarPatron(leerLineas(f), regex), 0);
}

const ROOT = path.join(__dirname, "..");
const p    = (...x) => path.join(ROOT, ...x);

const HANDLERS_BOT = [
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

const PANEL = [p("src/panel/server.js")];

const GIROS_GENERICOS = [
  p("src/giros/index.js"),
  p("src/giros/contrato.js"),
  p("src/giros/conversacion.js"),
  p("src/giros/modificaciones.js"),
  p("src/giros/precios.js"),
  p("src/giros/catalogo-tenant.js"),
];

// ═══════════════════════════════════════════════════════════════════════════════
// SECCIÓN 1 — La tabla `productos` no recibe lecturas SQL directas en código operativo
// ═══════════════════════════════════════════════════════════════════════════════

describe("Lecturas SQL directas a `productos` — ya eliminadas del código operativo", () => {
  test("handlers del bot no ejecutan SELECT FROM productos", () => {
    const patron = /\bFROM\s+productos\b/i;
    const n = contarEnArchivos(HANDLERS_BOT, patron);
    assert.equal(n, 0,
      `handlers del bot tienen ${n} lecturas SQL directas a productos — deben ser 0`
    );
  });

  test("panel del tenant no ejecuta SELECT FROM productos", () => {
    const patron = /\bFROM\s+productos\b/i;
    const n = contarEnArchivos(PANEL, patron);
    assert.equal(n, 0,
      `panel del tenant tiene ${n} lecturas SQL directas a productos — deben ser 0`
    );
  });

  test("módulos genéricos de Giro no leen de la tabla productos", () => {
    const patron = /\bFROM\s+productos\b/i;
    const n = contarEnArchivos(GIROS_GENERICOS, patron);
    assert.equal(n, 0,
      `módulos genéricos de Giro tienen ${n} lecturas a productos — deben ser 0`
    );
  });

  test("db/modelos.js no consulta la tabla productos directamente", () => {
    const lineas = leerLineas(p("src/db/modelos.js"));
    const n = contarPatron(lineas, /\bFROM\s+productos\b/i);
    assert.equal(n, 0,
      "db/modelos.js no debe leer de productos — usa menu_items a través de catalogoTenant"
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECCIÓN 2 — El NLU lee de las fuentes correctas (no de `productos`)
// ═══════════════════════════════════════════════════════════════════════════════

describe("NLU lee de la fuente correcta (cortes + menu_items)", () => {
  test("deshabilitar en menu_items oculta del NLU (no de productos)", () => {
    const parser = require("../src/handlers/pedidoParser");
    run("UPDATE menu_items SET activo=0 WHERE producto_slug='cuero' AND categoria='corte'");
    parser.invalidarCacheCortes();

    const cortes = parser.getCortes();
    assert.ok(!Object.keys(cortes).includes("cuero"),
      "cuero deshabilitado en menu_items no debe aparecer en el NLU"
    );

    run("UPDATE menu_items SET activo=1 WHERE producto_slug='cuero' AND categoria='corte'");
    parser.invalidarCacheCortes();
  });

  test("activar en productos NO afecta al NLU (menu_items es la fuente)", () => {
    // Asegurar que productos no influye en el NLU
    run("INSERT OR IGNORE INTO productos (nombre, precio_taco, activo) VALUES ('corte_solo_prod', 30, 1)");
    const parser = require("../src/handlers/pedidoParser");
    parser.invalidarCacheCortes();

    const cortes = parser.getCortes();
    assert.ok(!Object.keys(cortes).includes("corte_solo_prod"),
      "producto insertado solo en la tabla `productos` no debe aparecer en el NLU"
    );

    run("DELETE FROM productos WHERE nombre = 'corte_solo_prod'");
    parser.invalidarCacheCortes();
  });

  test("pedidoParser.js no importa directamente desde db/modelos.js ni tabla productos", () => {
    const lineas = leerLineas(p("src/handlers/pedidoParser.js"));
    const importaModelos = lineas.some(l =>
      !l.trim().startsWith("//") && /require.*db\/modelos/.test(l)
    );
    assert.equal(importaModelos, false,
      "pedidoParser no debe importar db/modelos — usa cortes.js o catalogo-tenant"
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECCIÓN 3 — Los precios operativos vienen de menu_items (no de cortes.precio_base en runtime)
// ═══════════════════════════════════════════════════════════════════════════════

describe("Precios operativos — fuente definitiva: menu_items", () => {
  test("getPrecios() devuelve precios de menu_items, no de cortes.precio_base", () => {
    // Cambiar precio en menu_items y verificar que se refleja en getPrecios()
    run("UPDATE menu_items SET precio=88 WHERE producto_slug='surtido' AND formato_slug='taco'");

    const { getPrecios } = require("../src/pedido/precios");
    const precios = getPrecios();

    assert.equal(precios.porCorte?.surtido?.pTaco, 88,
      "getPrecios() debe reflejar el precio actual de menu_items, no cortes.precio_base"
    );

    run("UPDATE menu_items SET precio=30 WHERE producto_slug='surtido' AND formato_slug='taco'");
  });

  test("motor neutral calcularPrecioPartida también usa menu_items como fuente", () => {
    run("UPDATE menu_items SET precio=66 WHERE producto_slug='buche' AND formato_slug='taco'");

    const { getContratoGiro } = require("../src/giros");
    const contrato = getContratoGiro("taqueria");
    const partida = {
      tipo: "producto", formatoSlug: "taco", productoSlug: "buche",
      cantidad: { tipo: "unidad", valor: 1 }, combinacion: [], extras: [], metadata: {},
    };
    const precio = contrato.calcularPrecioPartida(partida);
    assert.equal(precio, 66,
      "motor neutral debe usar menu_items para el precio de buche"
    );

    run("UPDATE menu_items SET precio=30 WHERE producto_slug='buche' AND formato_slug='taco'");
  });

  test("db/cortes.js cruza cortes con menu_items (no usa precio de cortes directamente)", () => {
    // getPrecioCorteFormato debe delegar a menu_items primero
    const { getPrecioCorteFormato } = require("../src/db/cortes");
    run("UPDATE menu_items SET precio=72 WHERE producto_slug='carne' AND formato_slug='taco'");

    const precio = getPrecioCorteFormato("carne", "taco");
    assert.equal(precio, 72,
      "getPrecioCorteFormato debe usar el precio de menu_items, no cortes.precio_base"
    );

    run("UPDATE menu_items SET precio=30 WHERE producto_slug='carne' AND formato_slug='taco'");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECCIÓN 4 — Ratchet: lecturas legacy aún activas en handlers (baseline)
// ═══════════════════════════════════════════════════════════════════════════════

describe("Ratchet: lecturas legacy en código operativo (baseline actual)", () => {
  test("imports de pedido/precios en handlers no crecen (baseline: ≤3 archivos)", () => {
    const archivosConImport = HANDLERS_BOT.filter(f => {
      const lineas = leerLineas(f);
      return lineas.some(l => !l.startsWith("//") && /require.*pedido\/precios/.test(l));
    });
    assert.ok(archivosConImport.length <= 3,
      `${archivosConImport.length} handlers importan pedido/precios — límite: 3\n` +
      archivosConImport.map(f => path.relative(ROOT, f)).join(", ")
    );
  });

  test("db/cortes.js no hace fallback a cortes.precio_base si menu_items tiene precio", () => {
    // Verificar que el precio de menu_items siempre gana sobre precio_base del corte
    // Insertar precio alto en cortes pero precio bajo en menu_items
    run("UPDATE cortes SET precio_base=999 WHERE slug='surtido'");
    run("UPDATE menu_items SET precio=30 WHERE producto_slug='surtido' AND formato_slug='taco'");

    const { getPrecioCorteFormato } = require("../src/db/cortes");
    const precio = getPrecioCorteFormato("surtido", "taco");

    assert.equal(precio, 30,
      "menu_items.precio debe ganar sobre cortes.precio_base — menu_items es la fuente definitiva"
    );

    // Restaurar
    run("UPDATE cortes SET precio_base=30 WHERE slug='surtido'");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECCIÓN 5 — Especificaciones del estado objetivo
// ═══════════════════════════════════════════════════════════════════════════════

describe("Estado objetivo — post fases 5-7 (especificaciones)", () => {
  test.todo("getPrecios() debe fallar explícitamente en producción cuando PRECIOS_GIRO_UNICO=true");
  test.todo("calcularPrecioItem() debe fallar explícitamente cuando PRECIOS_GIRO_UNICO=true");
  test.todo("LEGACY_READ_FALLBACK=false debe hacer que toda lectura antigua lance error explícito");
  test.todo("db/cortes.js debe ser reemplazado por catalogo-tenant.js como única fuente de aliases");
  test.todo("el panel del tenant no debe leer cortes.precio_base directamente en ninguna ruta");
});
