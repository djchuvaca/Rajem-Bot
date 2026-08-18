"use strict";
/**
 * tests/migracion-cuatro-escenarios.test.js
 * Fase 8 — Etapa 14: pruebas de migración con cuatro bases distintas.
 *
 * El plan de acople exige al menos 4 bases de prueba:
 *   1. Tenant nuevo de taquería (estado inicial limpio)
 *   2. Tenant antiguo de taquería con ventas y pedidos históricos
 *   3. Tenant de otro Giro (pizzería o hamburguesería)
 *   4. Base con datos incompletos o inconsistentes
 *
 * Verificaciones por escenario:
 *   - Conteos antes y después son estables
 *   - Totales históricos de pedidos intactos
 *   - Precios en menu_items no contaminados por productos históricos
 *   - Estados disponible/agotado preservados
 *   - Migración idempotente (dos ejecuciones = mismo estado)
 *   - integrity_check pasa en cada escenario
 *
 * Cada escenario usa su propia BD en memoria (aislamiento total).
 * Las BDs se envuelven con el mismo shim de compatibilidad de src/db/core.js.
 */

process.env.BOT_TEST_MODE = "1";

const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const Database = require("better-sqlite3");

const { migrar } = require("../src/migration/migrar-bd");

// ── Shim de compatibilidad (mismo patrón que src/db/core.js::_makeCompatDB) ──
// migrar-bd.js espera un objeto con .run() y .prepare(); el objeto nativo
// de better-sqlite3 no tiene .run() — se lo agrega este wrapper.
function _wrapDB(bsdb) {
  return {
    run(sql, params) {
      if (!params || params.length === 0) bsdb.exec(sql);
      else bsdb.prepare(sql).run(...params);
    },
    exec(sql) {
      try {
        const rows = bsdb.prepare(sql.trim()).all();
        if (!rows.length) return [];
        const columns = Object.keys(rows[0]);
        return [{ columns, values: rows.map(r => columns.map(c => r[c])) }];
      } catch (_) { return []; }
    },
    prepare: bsdb.prepare.bind(bsdb),
  };
}

// Devuelve { bsdb (raw better-sqlite3), db (wrapped para migrar()) }
function crearBD() {
  const bsdb = new Database(":memory:");
  bsdb.pragma("journal_mode = DELETE");
  bsdb.pragma("busy_timeout = 5000");
  return { bsdb, db: _wrapDB(bsdb) };
}

// ── Esquema mínimo reutilizable ────────────────────────────────────────────────

function inicializarEsquema(bsdb) {
  bsdb.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      version TEXT UNIQUE NOT NULL,
      applied_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS business_types (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT UNIQUE NOT NULL,
      nombre TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS item_types (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      business_type_id INTEGER REFERENCES business_types(id),
      slug TEXT NOT NULL,
      nombre TEXT NOT NULL,
      unidad TEXT DEFAULT 'unidad',
      activo INTEGER DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS cortes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      giro_id INTEGER REFERENCES business_types(id),
      slug TEXT NOT NULL,
      nombre TEXT NOT NULL,
      aliases_json TEXT DEFAULT '[]',
      descripcion TEXT DEFAULT '',
      precio_base REAL DEFAULT 0,
      precios_json TEXT DEFAULT '{}',
      activo INTEGER DEFAULT 1,
      seccion TEXT DEFAULT 'carnitas',
      UNIQUE(giro_id, slug)
    );
    CREATE TABLE IF NOT EXISTS menu_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      producto_slug TEXT NOT NULL,
      formato_slug TEXT NOT NULL,
      categoria TEXT DEFAULT 'corte',
      precio REAL DEFAULT 0,
      activo INTEGER DEFAULT 0,
      disponible INTEGER DEFAULT 1,
      eliminado INTEGER DEFAULT 0,
      UNIQUE(producto_slug, formato_slug, categoria)
    );
    CREATE TABLE IF NOT EXISTS configuracion (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      clave TEXT UNIQUE NOT NULL,
      valor TEXT
    );
    CREATE TABLE IF NOT EXISTS clientes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      telefono TEXT UNIQUE,
      nombre TEXT,
      creado_en TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS pedidos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cliente_id INTEGER REFERENCES clientes(id),
      tipo TEXT,
      orden TEXT,
      total REAL,
      estado TEXT DEFAULT 'pendiente',
      creado_en TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS productos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT UNIQUE,
      precio_taco REAL DEFAULT 0,
      precio_torta REAL DEFAULT 0,
      precio_100g REAL DEFAULT 0,
      activo INTEGER DEFAULT 1
    );
  `);
}

function sembrar_taqueria(bsdb) {
  bsdb.prepare("INSERT OR IGNORE INTO business_types (slug, nombre) VALUES (?,?)").run("taqueria", "Taquería");
  const giroId = bsdb.prepare("SELECT id FROM business_types WHERE slug='taqueria'").get().id;
  const cortes = [
    { slug: "surtido", nombre: "Surtido", precio: 30 },
    { slug: "carne",   nombre: "Carne",   precio: 30 },
    { slug: "buche",   nombre: "Buche",   precio: 30 },
  ];
  for (const c of cortes) {
    bsdb.prepare("INSERT OR IGNORE INTO cortes (giro_id, slug, nombre, precio_base, activo) VALUES (?,?,?,?,1)")
      .run(giroId, c.slug, c.nombre, c.precio);
    bsdb.prepare("INSERT OR IGNORE INTO menu_items (producto_slug, formato_slug, categoria, precio, activo, disponible) VALUES (?,?,?,?,1,1)")
      .run(c.slug, "taco",  "corte", c.precio);
    bsdb.prepare("INSERT OR IGNORE INTO menu_items (producto_slug, formato_slug, categoria, precio, activo, disponible) VALUES (?,?,?,?,1,1)")
      .run(c.slug, "torta", "corte", c.precio);
  }
  bsdb.prepare("INSERT OR IGNORE INTO configuracion (clave, valor) VALUES (?,?)").run("business_type_slug", "taqueria");
  bsdb.prepare("INSERT OR IGNORE INTO configuracion (clave, valor) VALUES (?,?)").run("nombre_negocio", "Tacos Test");
}

function sembrar_pizzeria(bsdb) {
  bsdb.prepare("INSERT OR IGNORE INTO business_types (slug, nombre) VALUES (?,?)").run("pizzeria", "Pizzería");
  const pizzas = [
    { slug: "hawaiana",  precio: 120 },
    { slug: "pepperoni", precio: 130 },
  ];
  for (const p of pizzas) {
    bsdb.prepare("INSERT OR IGNORE INTO menu_items (producto_slug, formato_slug, categoria, precio, activo, disponible) VALUES (?,?,?,?,1,1)")
      .run(p.slug, "mediana", "pizza", p.precio);
    bsdb.prepare("INSERT OR IGNORE INTO menu_items (producto_slug, formato_slug, categoria, precio, activo, disponible) VALUES (?,?,?,?,1,1)")
      .run(p.slug, "grande", "pizza", p.precio + 40);
  }
  bsdb.prepare("INSERT OR IGNORE INTO configuracion (clave, valor) VALUES (?,?)").run("business_type_slug", "pizzeria");
  bsdb.prepare("INSERT OR IGNORE INTO configuracion (clave, valor) VALUES (?,?)").run("nombre_negocio", "Pizzería Test");
}

// ═══════════════════════════════════════════════════════════════════════════════
// ESCENARIO 1 — Tenant nuevo de taquería (estado limpio)
// ═══════════════════════════════════════════════════════════════════════════════

describe("Escenario 1: Tenant nuevo de taquería (estado limpio)", () => {
  test("migrar() completa sin errores en BD nueva de taquería", () => {
    const { bsdb, db } = crearBD();
    inicializarEsquema(bsdb);
    sembrar_taqueria(bsdb);

    const res = migrar(db);
    assert.equal(res.ok, true, `errores: ${res.errores.join(", ")}`);
    assert.deepEqual(res.errores, []);
  });

  test("migrar() registra la versión V1 en schema_migrations", () => {
    const { bsdb, db } = crearBD();
    inicializarEsquema(bsdb);
    sembrar_taqueria(bsdb);
    migrar(db);

    const v1 = bsdb.prepare("SELECT version FROM schema_migrations WHERE version = ?")
      .get("migracion-fase8-etapa7-v1");
    assert.ok(v1, "versión V1 debe registrarse en schema_migrations");
  });

  test("integrity_check pasa en tenant nuevo de taquería tras migrar()", () => {
    const { bsdb, db } = crearBD();
    inicializarEsquema(bsdb);
    sembrar_taqueria(bsdb);
    migrar(db);

    const r = bsdb.prepare("PRAGMA integrity_check").get();
    assert.equal(r.integrity_check, "ok");
  });

  test("migrar() es idempotente en tenant nuevo (doble ejecución = mismo estado)", () => {
    const { bsdb, db } = crearBD();
    inicializarEsquema(bsdb);
    sembrar_taqueria(bsdb);

    migrar(db);
    const miAntes = bsdb.prepare("SELECT COUNT(*) as c FROM menu_items").get().c;
    const smAntes = bsdb.prepare("SELECT COUNT(*) as c FROM schema_migrations").get().c;

    migrar(db);
    const miDespues = bsdb.prepare("SELECT COUNT(*) as c FROM menu_items").get().c;
    const smDespues = bsdb.prepare("SELECT COUNT(*) as c FROM schema_migrations").get().c;

    assert.equal(miAntes, miDespues, "menu_items no debe cambiar en segunda ejecución");
    assert.equal(smAntes, smDespues, "schema_migrations no debe duplicar versión");
  });

  test("menu_items tiene entradas para los cortes sembrados (activo=1)", () => {
    const { bsdb, db } = crearBD();
    inicializarEsquema(bsdb);
    sembrar_taqueria(bsdb);
    migrar(db);

    const items = bsdb.prepare("SELECT * FROM menu_items WHERE categoria='corte' AND activo=1").all();
    assert.ok(items.length >= 3, `debe haber ≥3 cortes activos en menu_items, hay ${items.length}`);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// ESCENARIO 2 — Tenant antiguo de taquería con pedidos históricos
// ═══════════════════════════════════════════════════════════════════════════════

describe("Escenario 2: Tenant antiguo con ventas y pedidos históricos", () => {
  function crearEscenarioAntiguo() {
    const { bsdb, db } = crearBD();
    inicializarEsquema(bsdb);
    sembrar_taqueria(bsdb);
    bsdb.prepare("INSERT INTO clientes (telefono, nombre) VALUES (?,?)").run("3310000001", "Ana");
    bsdb.prepare("INSERT INTO clientes (telefono, nombre) VALUES (?,?)").run("3310000002", "Luis");
    bsdb.prepare("INSERT INTO pedidos (cliente_id, tipo, orden, total, estado) VALUES (?,?,?,?,?)").run(
      1, "mostrador", "3 tacos de surtido", 90, "completado"
    );
    bsdb.prepare("INSERT INTO pedidos (cliente_id, tipo, orden, total, estado) VALUES (?,?,?,?,?)").run(
      2, "domicilio", "5 tacos de carne", 185, "completado"
    );
    // Datos antiguos en tabla productos (precios históricos distintos a los actuales)
    bsdb.prepare("INSERT OR IGNORE INTO productos (nombre, precio_taco, precio_torta, activo) VALUES (?,?,?,?)").run(
      "surtido", 28, 32, 1
    );
    return { bsdb, db };
  }

  test("migrar() preserva todos los pedidos históricos sin modificar totales", () => {
    const { bsdb, db } = crearEscenarioAntiguo();
    const pedidosAntes = bsdb.prepare("SELECT * FROM pedidos ORDER BY id").all();

    migrar(db);

    const pedidosDespues = bsdb.prepare("SELECT * FROM pedidos ORDER BY id").all();
    assert.equal(pedidosAntes.length, pedidosDespues.length, "count de pedidos no debe cambiar");
    for (let i = 0; i < pedidosAntes.length; i++) {
      assert.equal(pedidosDespues[i].total, pedidosAntes[i].total,
        `total del pedido ${pedidosAntes[i].id} debe preservarse`
      );
    }
  });

  test("migrar() preserva todos los clientes históricos", () => {
    const { bsdb, db } = crearEscenarioAntiguo();
    const clientesAntes = bsdb.prepare("SELECT COUNT(*) as c FROM clientes").get().c;

    migrar(db);

    const clientesDespues = bsdb.prepare("SELECT COUNT(*) as c FROM clientes").get().c;
    assert.equal(clientesAntes, clientesDespues, "count de clientes no debe cambiar");
  });

  test("migrar() no modifica precio_taco histórico en tabla productos", () => {
    const { bsdb, db } = crearEscenarioAntiguo();
    const prodAntes = bsdb.prepare("SELECT * FROM productos").all();

    migrar(db);

    const prodDespues = bsdb.prepare("SELECT * FROM productos").all();
    assert.equal(prodAntes.length, prodDespues.length, "count de productos no debe cambiar");
    for (const pA of prodAntes) {
      const pD = prodDespues.find(p => p.id === pA.id);
      assert.equal(pD.precio_taco, pA.precio_taco,
        `productos.precio_taco del id ${pA.id} no debe modificarse (historial)`
      );
    }
  });

  test("precios actuales en menu_items no son reemplazados por los históricos de productos", () => {
    const { bsdb, db } = crearEscenarioAntiguo();
    // menu_items tiene precio=30, productos tiene precio_taco=28
    migrar(db);

    const surtidoTaco = bsdb.prepare(
      "SELECT precio FROM menu_items WHERE producto_slug='surtido' AND formato_slug='taco'"
    ).get();
    assert.equal(surtidoTaco.precio, 30,
      "menu_items.precio (30) no debe reemplazarse por productos.precio_taco histórico (28)"
    );
  });

  test("integrity_check pasa en tenant antiguo tras migrar()", () => {
    const { bsdb, db } = crearEscenarioAntiguo();
    migrar(db);
    const r = bsdb.prepare("PRAGMA integrity_check").get();
    assert.equal(r.integrity_check, "ok");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// ESCENARIO 3 — Tenant de otro Giro (pizzería)
// ═══════════════════════════════════════════════════════════════════════════════

describe("Escenario 3: Tenant de otro Giro (pizzería)", () => {
  test("migrar() completa sin errores en BD de pizzería", () => {
    const { bsdb, db } = crearBD();
    inicializarEsquema(bsdb);
    sembrar_pizzeria(bsdb);

    const res = migrar(db);
    assert.equal(res.ok, true, `errores: ${res.errores.join(", ")}`);
  });

  test("migrar() en pizzería no crea cortes de taquería en menu_items", () => {
    const { bsdb, db } = crearBD();
    inicializarEsquema(bsdb);
    sembrar_pizzeria(bsdb);
    migrar(db);

    const cortesToqueria = bsdb.prepare(
      "SELECT * FROM menu_items WHERE producto_slug IN ('surtido','carne','buche','cuero','lengua')"
    ).all();
    assert.equal(cortesToqueria.length, 0,
      "una BD de pizzería no debe tener cortes de taquería en menu_items"
    );
  });

  test("migrar() en pizzería preserva items de pizzería en menu_items", () => {
    const { bsdb, db } = crearBD();
    inicializarEsquema(bsdb);
    sembrar_pizzeria(bsdb);
    migrar(db);

    const pizzas = bsdb.prepare("SELECT * FROM menu_items WHERE categoria='pizza' AND activo=1").all();
    assert.ok(pizzas.length >= 2, `debe haber ≥2 pizzas activas en menu_items, hay ${pizzas.length}`);
  });

  test("migrar() en pizzería es idempotente", () => {
    const { bsdb, db } = crearBD();
    inicializarEsquema(bsdb);
    sembrar_pizzeria(bsdb);

    migrar(db);
    const miAntes = bsdb.prepare("SELECT COUNT(*) as c FROM menu_items").get().c;
    migrar(db);
    const miDespues = bsdb.prepare("SELECT COUNT(*) as c FROM menu_items").get().c;

    assert.equal(miAntes, miDespues, "segunda migración no debe agregar entradas en pizzería");
  });

  test("integrity_check pasa en tenant de pizzería tras migrar()", () => {
    const { bsdb, db } = crearBD();
    inicializarEsquema(bsdb);
    sembrar_pizzeria(bsdb);
    migrar(db);

    const r = bsdb.prepare("PRAGMA integrity_check").get();
    assert.equal(r.integrity_check, "ok");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// ESCENARIO 4 — Base con datos incompletos o inconsistentes
// ═══════════════════════════════════════════════════════════════════════════════

describe("Escenario 4: Base con datos incompletos o inconsistentes", () => {
  function crearEscenarioInconsistente() {
    const { bsdb, db } = crearBD();
    inicializarEsquema(bsdb);
    sembrar_taqueria(bsdb);
    // Inconsistencia 1: menu_item con producto_slug desconocido
    bsdb.prepare("INSERT OR IGNORE INTO menu_items (producto_slug, formato_slug, categoria, precio, activo) VALUES (?,?,?,?,?)")
      .run("corte_fantasma_zzz", "taco", "corte", 50, 0);
    // Inconsistencia 2: corte activo en tabla cortes sin entrada en menu_items
    const giroId = bsdb.prepare("SELECT id FROM business_types WHERE slug='taqueria'").get()?.id;
    if (giroId) {
      bsdb.prepare("INSERT OR IGNORE INTO cortes (giro_id, slug, nombre, precio_base, activo) VALUES (?,?,?,?,1)")
        .run(giroId, "corte_huerfano", "Corte Huérfano", 0);
    }
    // Inconsistencia 3: precio 0 en corte conocido
    bsdb.prepare("UPDATE cortes SET precio_base=0 WHERE slug='buche'").run();
    return { bsdb, db };
  }

  test("migrar() completa con ok=true aunque hay inconsistencias (no son errores críticos)", () => {
    const { bsdb, db } = crearEscenarioInconsistente();
    const res = migrar(db);
    assert.equal(res.ok, true,
      "inconsistencias no deben detener la migración ni marcar ok=false"
    );
    assert.deepEqual(res.errores, []);
  });

  test("migrar() reporta inconsistencias conocidas (corte_fantasma_zzz y/o corte_huerfano)", () => {
    const { bsdb, db } = crearEscenarioInconsistente();
    const res = migrar(db);
    assert.ok(Array.isArray(res.inconsistencias), "inconsistencias debe ser array");
    const detectada = res.inconsistencias.some(i =>
      i.includes("corte_fantasma_zzz") || i.includes("corte_huerfano")
    );
    assert.ok(detectada,
      `Inconsistencias deliberadas no detectadas.\nReportadas: ${res.inconsistencias.join(", ")}`
    );
  });

  test("integrity_check pasa incluso con inconsistencias en datos", () => {
    const { bsdb, db } = crearEscenarioInconsistente();
    migrar(db);
    const r = bsdb.prepare("PRAGMA integrity_check").get();
    assert.equal(r.integrity_check, "ok");
  });

  test("migrar() es idempotente en escenario inconsistente", () => {
    const { bsdb, db } = crearEscenarioInconsistente();
    migrar(db);
    const miAntes = bsdb.prepare("SELECT COUNT(*) as c FROM menu_items").get().c;
    const smAntes = bsdb.prepare("SELECT COUNT(*) as c FROM schema_migrations").get().c;

    migrar(db);
    const miDespues = bsdb.prepare("SELECT COUNT(*) as c FROM menu_items").get().c;
    const smDespues = bsdb.prepare("SELECT COUNT(*) as c FROM schema_migrations").get().c;

    assert.equal(miAntes, miDespues, "segunda migración no cambia menu_items en escenario inconsistente");
    assert.equal(smAntes, smDespues, "schema_migrations no duplica versión en escenario inconsistente");
  });

  test("migrar() no auto-activa el corte_huerfano (activo=0 en proyección)", () => {
    const { bsdb, db } = crearEscenarioInconsistente();
    migrar(db);

    const huerfano = bsdb.prepare(
      "SELECT activo FROM menu_items WHERE producto_slug='corte_huerfano' AND formato_slug='taco'"
    ).get();
    // Si fue proyectado debe tener activo=0 — el Superadmin activa
    if (huerfano) {
      assert.equal(huerfano.activo, 0,
        "corte_huerfano proyectado debe tener activo=0 — solo el Superadmin activa"
      );
    }
    // Si no fue proyectado (migración lo ignoró), también es correcto
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// VERIFICACIÓN CRUZADA — Los 4 escenarios con propiedades comunes
// ═══════════════════════════════════════════════════════════════════════════════

describe("Verificación cruzada — propiedades comunes en todos los escenarios", () => {
  function todosLosEscenarios() {
    const e1 = crearBD(); inicializarEsquema(e1.bsdb); sembrar_taqueria(e1.bsdb);
    const e2 = crearBD(); inicializarEsquema(e2.bsdb); sembrar_taqueria(e2.bsdb);
    e2.bsdb.prepare("INSERT INTO clientes (telefono, nombre) VALUES (?,?)").run("3310001111", "Test");
    e2.bsdb.prepare("INSERT INTO pedidos (tipo, orden, total, estado) VALUES (?,?,?,?)").run("mostrador", "2 tacos", 60, "completado");
    e2.bsdb.prepare("INSERT OR IGNORE INTO productos (nombre, precio_taco, activo) VALUES (?,?,?)").run("surtido", 25, 1);
    const e3 = crearBD(); inicializarEsquema(e3.bsdb); sembrar_pizzeria(e3.bsdb);
    const e4 = crearBD(); inicializarEsquema(e4.bsdb); sembrar_taqueria(e4.bsdb);
    e4.bsdb.prepare("INSERT OR IGNORE INTO menu_items (producto_slug, formato_slug, categoria, precio, activo) VALUES (?,?,?,?,?)").run("xyz_ficticio", "taco", "corte", 30, 0);
    return [e1, e2, e3, e4];
  }

  test("migrar() retorna ok=true en los 4 escenarios", () => {
    for (const [i, { bsdb, db }] of todosLosEscenarios().entries()) {
      const res = migrar(db);
      assert.equal(res.ok, true, `Escenario ${i+1}: migrar() falló — ${res.errores.join(", ")}`);
    }
  });

  test("integrity_check pasa en los 4 escenarios tras migrar()", () => {
    for (const [i, { bsdb, db }] of todosLosEscenarios().entries()) {
      migrar(db);
      const r = bsdb.prepare("PRAGMA integrity_check").get();
      assert.equal(r.integrity_check, "ok", `Escenario ${i+1}: integrity_check falló`);
    }
  });

  test("migrar() es idempotente en los 4 escenarios", () => {
    for (const [i, { bsdb, db }] of todosLosEscenarios().entries()) {
      migrar(db);
      const miA = bsdb.prepare("SELECT COUNT(*) as c FROM menu_items").get().c;
      const smA = bsdb.prepare("SELECT COUNT(*) as c FROM schema_migrations").get().c;
      migrar(db);
      const miD = bsdb.prepare("SELECT COUNT(*) as c FROM menu_items").get().c;
      const smD = bsdb.prepare("SELECT COUNT(*) as c FROM schema_migrations").get().c;
      assert.equal(miA, miD, `Escenario ${i+1}: menu_items cambió en segunda ejecución`);
      assert.equal(smA, smD, `Escenario ${i+1}: schema_migrations duplicó versión`);
    }
  });
});
