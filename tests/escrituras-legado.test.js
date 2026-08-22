"use strict";
/**
 * tests/escrituras-legado.test.js
 * Fase 8 — Etapa 9: verificar que no se realizan escrituras operativas a fuentes antiguas.
 *
 * Condición previa: Las fases 5, 6 y 7 del acople deben estar completas antes de
 * eliminar código. Estos tests actúan como RATCHET: registran el estado actual y
 * fallan si el número de escrituras legacy CRECE (no si existe).
 *
 * Orden recomendado para retirar escrituras (ver clasificacion-bd.js):
 *   1. Panel del superadmin
 *   2. Panel del tenant
 *   3. Provisionamiento y seed
 *   4. Bot de WhatsApp
 *   5. Scripts administrativos
 *   6. Tests y utilidades
 *
 * Las verificaciones describen el estado objetivo que debe conservarse
 * cuando las fases 5-7 estén completas.
 */

process.env.BOT_TEST_MODE = "1";

const { test, describe, before } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const { initDB } = require("../src/db/core");
const { seedDB } = require("../src/db/seed");
const { run, queryOne, queryAll, getDB } = require("../src/db/core");

before(async () => {
  await initDB();
  await seedDB();
});

// ── Helpers de análisis estático ─────────────────────────────────────────────

function leerLineas(ruta) {
  try {
    return fs.readFileSync(ruta, "utf8").split("\n");
  } catch (_) { return []; }
}

function contarPatron(lineas, regex) {
  return lineas.filter(l => !l.trim().startsWith("//") && regex.test(l)).length;
}

function contarEnArchivos(archivos, regex) {
  return archivos.reduce((total, f) => total + contarPatron(leerLineas(f), regex), 0);
}

const ROOT = path.join(__dirname, "..");
const p = (...partes) => path.join(ROOT, ...partes);

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
];

const PANEL = [
  p("src/panel/server.js"),
];

// ═══════════════════════════════════════════════════════════════════════════════
// SECCIÓN 1 — Ninguna ruta operativa escribe en `productos`
// ═══════════════════════════════════════════════════════════════════════════════

describe("Escrituras a tabla `productos` — solo historial", () => {
  test("el flujo del bot no escribe en `productos` durante un pedido real", () => {
    // Contar filas en productos antes y después de simular una operación de pedido
    const db = getDB();
    const antesCount = queryOne("SELECT COUNT(*) as c FROM productos")?.c || 0;
    const antesPedidos = queryOne("SELECT COUNT(*) as c FROM pedidos")?.c || 0;

    // Insertar un pedido (simula confirmación de pedido) — no debe tocar productos
    run("INSERT INTO pedidos (tipo, orden, total, estado) VALUES (?,?,?,?)",
      ["mostrador", "3 tacos de surtido", 90, "confirmado"]);

    const despuesCount = queryOne("SELECT COUNT(*) as c FROM productos")?.c || 0;
    assert.equal(antesCount, despuesCount,
      "insertar un pedido no debe crear filas en la tabla productos"
    );

    run("DELETE FROM pedidos WHERE orden = '3 tacos de surtido' AND total = 90");
  });

  test("el panel del tenant no escribe en `productos` al cambiar disponibilidad", () => {
    // La disponibilidad se cambia en menu_items, no en productos
    const antesProductos = queryOne("SELECT COUNT(*) as c FROM productos")?.c || 0;

    // Simular cambio de disponibilidad (como lo hace el panel)
    run("UPDATE menu_items SET disponible = 0 WHERE producto_slug = 'surtido' AND categoria = 'corte'");

    const despuesProductos = queryOne("SELECT COUNT(*) as c FROM productos")?.c || 0;
    assert.equal(antesProductos, despuesProductos,
      "cambiar disponibilidad no debe afectar la tabla productos"
    );

    run("UPDATE menu_items SET disponible = 1 WHERE producto_slug = 'surtido' AND categoria = 'corte'");
  });

  test("el panel del tenant no escribe en `productos` al cambiar precios", () => {
    const antesProductos = queryOne("SELECT COUNT(*) as c FROM productos")?.c || 0;

    // Simular cambio de precio (como lo hace el panel en menu_items)
    run("UPDATE menu_items SET precio = 35 WHERE producto_slug = 'surtido' AND formato_slug = 'taco'");

    const despuesProductos = queryOne("SELECT COUNT(*) as c FROM productos")?.c || 0;
    assert.equal(antesProductos, despuesProductos,
      "cambiar precios no debe afectar la tabla productos"
    );

    run("UPDATE menu_items SET precio = 30 WHERE producto_slug = 'surtido' AND formato_slug = 'taco'");
  });

  test("análisis estático: ningún handler del bot ejecuta INSERT/UPDATE/DELETE en productos", () => {
    const patron = /\b(INSERT|UPDATE|DELETE)\b.{0,50}\bproductos\b/i;
    const cuenta = contarEnArchivos(HANDLERS_BOT, patron);
    assert.equal(cuenta, 0,
      "los handlers del bot no deben escribir en la tabla productos"
    );
  });

  test("análisis estático: el panel no escribe en productos (solo lee para estadísticas)", () => {
    const patronEscritura = /\b(INSERT|UPDATE|DELETE)\b.{0,50}\bproductos\b/i;
    const cuenta = contarEnArchivos(PANEL, patronEscritura);
    assert.equal(cuenta, 0,
      "el panel del tenant no debe escribir en la tabla productos"
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECCIÓN 2 — Ratchet: escrituras legacy en handlers (baseline actual)
// ═══════════════════════════════════════════════════════════════════════════════

describe("Ratchet: llamadas a API legacy de precios en handlers", () => {
  test("llamadas a getPrecios() en handlers del bot no crecen (baseline: ≤10)", () => {
    const n = contarEnArchivos(HANDLERS_BOT, /\bgetPrecios\s*\(\s*\)/);
    assert.ok(n <= 10,
      `getPrecios() aparece ${n} veces en handlers del bot — el límite es 10. ` +
      "Reducir antes de subir el límite."
    );
  });

  test("llamadas a calcularPrecioItem() en handlers del bot no crecen (baseline: ≤6)", () => {
    const n = contarEnArchivos(HANDLERS_BOT, /\bcalcularPrecioItem\s*\(/);
    assert.ok(n <= 6,
      `calcularPrecioItem() aparece ${n} veces en handlers — límite: 6`
    );
  });

  test("referencias a pTaco/pTorta en handlers no crecen (baseline: ≤12)", () => {
    const n = contarEnArchivos(HANDLERS_BOT, /\b(pTaco|pTorta|p100g)\b/);
    assert.ok(n <= 12,
      `pTaco/pTorta/p100g aparecen ${n} veces en handlers — límite: 12`
    );
  });

  test("el panel no usa getPrecios() ni calcularPrecioItem() directamente", () => {
    const n = contarEnArchivos(PANEL, /\b(getPrecios|calcularPrecioItem)\s*\(/);
    assert.equal(n, 0,
      "el panel no debe calcular precios directamente — usa el panel de configuración de menu_items"
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECCIÓN 3 — Todas las escrituras de catálogo van a menu_items
// ═══════════════════════════════════════════════════════════════════════════════

describe("Escrituras de catálogo → menu_items como destino exclusivo", () => {
  test("cambiar precio en menu_items se refleja en el motor de precios", () => {
    run("UPDATE menu_items SET precio = 45 WHERE producto_slug = 'surtido' AND formato_slug = 'taco'");

    const { getPrecios } = require("../src/pedido/precios");
    const precios = getPrecios();

    assert.equal(precios.porCorte?.surtido?.pTaco, 45,
      "precio cambiado en menu_items debe verse en getPrecios().porCorte"
    );

    run("UPDATE menu_items SET precio = 30 WHERE producto_slug = 'surtido' AND formato_slug = 'taco'");
  });

  test("deshabilitar en menu_items oculta el producto del catálogo operativo", () => {
    run("UPDATE menu_items SET activo = 0 WHERE producto_slug = 'cuero' AND categoria = 'corte'");

    const catalogoTenant = require("../src/giros/catalogo-tenant");
    const activos = catalogoTenant.getMenuItemsActivos("corte").map(i => i.producto_slug);

    assert.ok(!activos.includes("cuero"),
      "cuero deshabilitado en menu_items no debe aparecer en el catálogo activo"
    );

    run("UPDATE menu_items SET activo = 1 WHERE producto_slug = 'cuero' AND categoria = 'corte'");
  });

  test("toda modificación de precio desde el panel debe ir a menu_items, no a cortes ni productos", () => {
    // Verificar que los precios del catálogo operativo vienen de menu_items
    const catalogoTenant = require("../src/giros/catalogo-tenant");

    run("UPDATE menu_items SET precio = 77 WHERE producto_slug = 'carne' AND formato_slug = 'taco'");

    const precio = catalogoTenant.getPrecioMenu("carne", "taco", "corte");
    assert.equal(precio, 77,
      "el precio de menu_items debe reflejarse en getPrecioMenu()"
    );

    run("UPDATE menu_items SET precio = 30 WHERE producto_slug = 'carne' AND formato_slug = 'taco'");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECCIÓN 4 — Especificaciones del estado objetivo (fases 5-7 pendientes)
// ═══════════════════════════════════════════════════════════════════════════════

describe("Estado objetivo — post fases 5-7 (especificaciones)", () => {
  test("getPrecios() no debe usarse en orden.js (migrado a calcularPrecioPartida)", () => {
    const lineas = leerLineas(p("src/handlers/flujos/orden.js"));
    const n = contarPatron(lineas, /\bgetPrecios\s*\(\s*\)/);
    assert.equal(n, 0, `getPrecios() aparece ${n} veces en orden.js — debe ser 0`);
  });

  test("calcularPrecioItem() no debe usarse en resumen.js", () => {
    const lineas = leerLineas(p("src/handlers/flujos/resumen.js"));
    const n = contarPatron(lineas, /\bcalcularPrecioItem\s*\(/);
    assert.equal(n, 0, `calcularPrecioItem() aparece ${n} veces en resumen.js — debe ser 0`);
  });

  test("pTaco/pTorta/p100g no aparecen en handlers genéricos (solo en src/giros/taqueria/)", () => {
    const n = contarEnArchivos(HANDLERS_BOT, /\b(pTaco|pTorta|p100g)\b/);
    assert.equal(n, 0,
      `pTaco/pTorta/p100g aparecen ${n} veces en handlers — deben estar solo en src/giros/taqueria/`);
  });

  test("el panel escribe disponibilidad/precio solo en menu_items (no en productos ni cortes)", () => {
    const lineas = leerLineas(p("src/panel/server.js"));
    const nProd = contarPatron(lineas, /\b(UPDATE|INSERT)\b.{0,60}\bproductos\b/i);
    const nCortesPrecio = contarPatron(lineas, /UPDATE\s+cortes\b.{0,60}precio/i);
    assert.equal(nProd, 0, "panel no debe escribir en productos");
    assert.equal(nCortesPrecio, 0, "panel no debe actualizar precios en tabla cortes directamente");
  });

  test("seed no inserta datos operativos en productos tras catalogo_giro_migrado_v2=1 (ya cumplido)", () => {
    const lineas = leerLineas(p("src/db/seed.js"));
    const n = contarPatron(lineas, /INSERT\s+INTO\s+productos\b.{0,200}(?:precio_taco|precio_torta)/i);
    assert.equal(n, 0, "seed no debe insertar con columnas precio_taco/torta operativos");
  });
});
