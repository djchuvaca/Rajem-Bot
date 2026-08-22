"use strict";
/**
 * tests/tablas-endpoints-obsoletos.test.js
 * Fase 8 — Etapa 13: inventariar tablas y endpoints obsoletos.
 *
 * No se borran tablas aún. La estrategia es en dos versiones:
 *   Versión A — detener lecturas/escrituras, marcar como obsoletas
 *   Versión B — confirmar cero accesos, exportar respaldo, eliminar
 *
 * Tablas bajo vigilancia:
 *   HISTORIAL  — productos: no recibe escrituras operativas (✅ ya verificado en Etapa 9+10)
 *   TRANSFORMAR — cortes: NLU aún la usa para aliases; precio_base debe reemplazarse
 *   ELIMINAR (futuro) — columnas productos.precio_taco/torta/100g
 *
 * Endpoints bajo vigilancia:
 *   /api/cortes (GET/POST/PUT) — duplica funcionalidad con /api/menu-items
 *   Scripts de depuración que no deberían existir en producción
 *
 * Ratchet: los accesos a fuentes legacy no deben crecer.
 */

process.env.BOT_TEST_MODE = "1";

const { test, describe, before } = require("node:test");
const assert = require("node:assert/strict");
const fs   = require("fs");
const path = require("path");

const { initDB } = require("../src/db/core");
const { seedDB } = require("../src/db/seed");
const { run, queryOne, queryAll, getDB } = require("../src/db/core");
const { migrar } = require("../src/migration/migrar-bd");

before(async () => {
  await initDB();
  await seedDB();
  migrar(getDB()); // registra schema_migrations V1 si no está
});

// ── Helpers de análisis estático ─────────────────────────────────────────────

function leerLineas(ruta) {
  try { return fs.readFileSync(ruta, "utf8").split("\n"); } catch (_) { return []; }
}

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

// Archivos operativos donde NO deben aparecer accesos a tablas legacy
const CODIGO_OPERATIVO = [
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
  p("src/panel/server.js"),
];

// ═══════════════════════════════════════════════════════════════════════════════
// SECCIÓN 1 — Tabla `productos` (HISTORIAL): cero accesos operativos
// ═══════════════════════════════════════════════════════════════════════════════

describe("Tabla `productos` (HISTORIAL) — cero accesos operativos", () => {
  test("ningún archivo operativo ejecuta SELECT FROM productos", () => {
    const n = contarEnArchivos(CODIGO_OPERATIVO, /\bFROM\s+productos\b/i);
    assert.equal(n, 0,
      `Hay ${n} lecturas SQL directas a la tabla productos en código operativo — deben ser 0`
    );
  });

  test("ningún archivo operativo ejecuta INSERT/UPDATE/DELETE en productos", () => {
    const n = contarEnArchivos(CODIGO_OPERATIVO, /\b(?:INSERT|UPDATE|DELETE)\b.{0,60}\bproductos\b/i);
    assert.equal(n, 0,
      `Hay ${n} escrituras a la tabla productos en código operativo — deben ser 0`
    );
  });

  test("la tabla productos existe en BD (no se borra aún — Versión B pendiente)", () => {
    const tabla = queryOne(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='productos'"
    );
    assert.ok(tabla, "tabla `productos` debe existir (conservada para Versión B de retiro)");
  });

  test("productos.precio_taco/torta/100g son columnas que existen (Versión A las conserva)", () => {
    const col = queryAll("PRAGMA table_info(productos)");
    const slugsCols = col.map(c => c.name);
    assert.ok(slugsCols.includes("precio_taco"),
      "productos.precio_taco debe existir — no eliminar hasta Versión B"
    );
    assert.ok(slugsCols.includes("precio_torta"),
      "productos.precio_torta debe existir — no eliminar hasta Versión B"
    );
  });

  test("db/seed.js no inserta datos operativos en productos (solo migración histórica)", () => {
    const lineas = leerLineas(p("src/db/seed.js"));
    // Seed puede migrar desde productos pero no debe insertarlos de nuevo con lógica operativa
    const nInsertOperativo = contarPatron(lineas,
      /INSERT\s+INTO\s+productos\b.{0,200}(?:precio_taco|precio_torta)/i
    );
    assert.equal(nInsertOperativo, 0,
      "seed.js no debe insertar con columnas precio_taco/torta operativos — son HISTORIAL"
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECCIÓN 2 — Tabla `cortes` (TRANSFORMAR): ratchet de lectura de precio_base
// ═══════════════════════════════════════════════════════════════════════════════

describe("Tabla `cortes` (TRANSFORMAR) — ratchet de precio_base", () => {
  test("cortes.precio_base en código operativo no crece (baseline: ≤4 archivos)", () => {
    const TODOS_SRC = [...CODIGO_OPERATIVO, p("src/db/cortes.js"), p("src/pedido/precios.js")];
    const archivosConPrecioBase = TODOS_SRC.filter(f => {
      const lineas = leerLineas(f);
      return contarPatron(lineas, /\.precio_base\b|precio_base\s*=/) > 0;
    });
    assert.ok(archivosConPrecioBase.length <= 4,
      `${archivosConPrecioBase.length} archivos referencian cortes.precio_base — límite: 4.\n` +
      "Meta: consolidar en menu_items.precio como única fuente de precios."
    );
  });

  test("aliases_json es leído por catalogo-tenant.js (fuente única de aliases tras migración)", () => {
    // aliases_json es la fuente del NLU — ahora centralizado en catalogo-tenant.getAliasMapCortes()
    const lineas = leerLineas(p("src/giros/catalogo-tenant.js"));
    const n = contarPatron(lineas, /aliases_json/);
    assert.ok(n > 0,
      "catalogo-tenant.js debe leer aliases_json — es la nueva fuente única de aliases para el NLU"
    );
  });

  test("la tabla cortes existe con columnas giro_id, slug, aliases_json, activo", () => {
    const cols = queryAll("PRAGMA table_info(cortes)").map(c => c.name);
    assert.ok(cols.includes("giro_id"), "cortes.giro_id existe");
    assert.ok(cols.includes("slug"), "cortes.slug existe");
    assert.ok(cols.includes("aliases_json"), "cortes.aliases_json existe");
    assert.ok(cols.includes("activo"), "cortes.activo existe");
  });

  test("precio definitivo viene de menu_items, no de cortes.precio_base", () => {
    // Cambiar precio_base a 999 pero menu_items a 30 — getPrecios debe devolver 30
    run("UPDATE cortes SET precio_base=999 WHERE slug='surtido'");
    run("UPDATE menu_items SET precio=30 WHERE producto_slug='surtido' AND formato_slug='taco'");

    const { getPrecios } = require("../src/pedido/precios");
    const precios = getPrecios();

    assert.equal(precios.porCorte?.surtido?.pTaco, 30,
      "getPrecios() debe usar menu_items.precio (30), no cortes.precio_base (999)"
    );
    // Restaurar
    run("UPDATE cortes SET precio_base=30 WHERE slug='surtido'");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECCIÓN 3 — Endpoints bajo vigilancia (no obsoletos aún, pero candidatos)
// ═══════════════════════════════════════════════════════════════════════════════

describe("Endpoints bajo vigilancia", () => {
  test("/api/cortes eliminado del panel — el frontend usa exclusivamente /api/menu-items", () => {
    const lineas = leerLineas(p("src/panel/server.js"));
    const nCortes = contarPatron(lineas, /app\.\w+\s*\(\s*["']\/api\/cortes/);
    const nMenuItems = contarPatron(lineas, /app\.\w+\s*\(\s*["']\/api\/menu-items/);
    assert.strictEqual(nCortes, 0,
      `Hay ${nCortes} endpoints /api/cortes en panel — deben ser 0 (Versión B completada)`
    );
    assert.ok(nMenuItems > 0,
      `/api/menu-items debe seguir presente en panel`
    );
  });

  test("no existen endpoints /api/productos en panel (tabla HISTORIAL)", () => {
    const lineas = leerLineas(p("src/panel/server.js"));
    const n = contarPatron(lineas, /app\.\w+\s*\(\s*["']\/api\/productos/);
    assert.equal(n, 0,
      `Hay ${n} endpoints /api/productos en el panel — la tabla productos es HISTORIAL`
    );
  });

  test("panel/server.js no tiene endpoint de migración directa sin autenticación", () => {
    const lineas = leerLineas(p("src/panel/server.js"));
    // Endpoints de migración deben requerir auth o no existir
    const migEndpoints = lineas.filter(l => {
      const t = l.trim();
      return !t.startsWith("//") && !t.startsWith("*") &&
        /app\.\w+\s*\(\s*["']\/api\/migr/.test(l) &&
        !/requireAuth/.test(l);
    });
    assert.equal(migEndpoints.length, 0,
      `Hay ${migEndpoints.length} endpoints /api/migr* sin requireAuth — riesgo de acceso no autorizado`
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECCIÓN 4 — Scripts de depuración y funciones sin referencia
// ═══════════════════════════════════════════════════════════════════════════════

describe("Scripts de depuración y funciones huérfanas", () => {
  test("scripts de debug conocidos no están en src/ (solo en scripts/)", () => {
    // Verificar que check-nuevos-tipos.js (script manual) no está en src/
    const tieneDebugEnSrc = fs.existsSync(p("src/check-nuevos-tipos.js")) ||
      fs.existsSync(p("src/debug.js")) ||
      fs.existsSync(p("src/test-manual.js"));
    assert.ok(!tieneDebugEnSrc,
      "scripts de depuración no deben estar en src/ — pertenecen a scripts/"
    );
  });

  test("scripts/check-nuevos-tipos.js existe como script manual (fuera de npm test)", () => {
    const existe = fs.existsSync(p("scripts/check-nuevos-tipos.js"));
    assert.ok(existe,
      "scripts/check-nuevos-tipos.js debe existir como herramienta manual de NLU"
    );
  });

  test("no existen archivos *.backup.js ni *.old.js en src/", () => {
    function buscarBackups(dir) {
      const encontrados = [];
      try {
        for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
          if (ent.name === "node_modules" || ent.name === ".git") continue;
          const full = path.join(dir, ent.name);
          if (ent.isDirectory()) encontrados.push(...buscarBackups(full));
          else if (/\.(backup|old|bak|copy)\.(js|ts)$/.test(ent.name)) {
            encontrados.push(path.relative(ROOT, full));
          }
        }
      } catch (_) {}
      return encontrados;
    }
    const backups = buscarBackups(p("src"));
    assert.equal(backups.length, 0,
      `Encontrados archivos de backup en src/:\n${backups.join("\n")}`
    );
  });

  test("db/seed.js no contiene seeds duplicados de la misma tabla (idempotencia básica)", () => {
    // Ejecutar seed dos veces — el conteo de configuracion no debe cambiar
    const antesConfig = queryOne("SELECT COUNT(*) as c FROM configuracion")?.c;
    const antesMenuItems = queryOne("SELECT COUNT(*) as c FROM menu_items")?.c;

    const { seedDB } = require("../src/db/seed");
    seedDB();

    const despuesConfig = queryOne("SELECT COUNT(*) as c FROM configuracion")?.c;
    const despuesMenuItems = queryOne("SELECT COUNT(*) as c FROM menu_items")?.c;

    assert.equal(antesConfig, despuesConfig,
      "seed doble no debe duplicar entradas en configuracion"
    );
    assert.equal(antesMenuItems, despuesMenuItems,
      "seed doble no debe duplicar entradas en menu_items"
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECCIÓN 5 — schema_migrations registra el historial de migraciones
// ═══════════════════════════════════════════════════════════════════════════════

describe("schema_migrations — historial de retiro", () => {
  test("schema_migrations existe y tiene la versión V1 registrada", () => {
    const v1 = queryOne(
      "SELECT version FROM schema_migrations WHERE version = 'migracion-fase8-etapa7-v1'"
    );
    assert.ok(v1, "la versión V1 debe estar registrada en schema_migrations");
  });

  test("schema_migrations no tiene versiones duplicadas", () => {
    const duplicados = queryAll(
      "SELECT version, COUNT(*) as c FROM schema_migrations GROUP BY version HAVING c > 1"
    );
    assert.equal(duplicados.length, 0,
      `Hay versiones duplicadas en schema_migrations:\n${duplicados.map(d => d.version).join(", ")}`
    );
  });

  test("schema_migrations tiene columna applied_at", () => {
    const cols = queryAll("PRAGMA table_info(schema_migrations)").map(c => c.name);
    assert.ok(cols.includes("applied_at"),
      "schema_migrations debe tener columna applied_at para trazabilidad"
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECCIÓN 6 — Especificaciones (Versión A y Versión B del retiro)
// ═══════════════════════════════════════════════════════════════════════════════

describe("Estado objetivo — Versión A y Versión B del retiro", () => {
  test("Versión B: /api/cortes eliminado — frontend usa solo /api/menu-items", () => {
    const lineas = leerLineas(p("src/panel/server.js"));
    const n = contarPatron(lineas, /app\.\w+\s*\(\s*["']\/api\/cortes/);
    assert.strictEqual(n, 0, `/api/cortes debe ser 0 en server.js — encontrados: ${n}`);
  });
});
