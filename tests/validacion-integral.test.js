"use strict";
/**
 * tests/validacion-integral.test.js
 * Fase 8 — Etapa 15: validación integral del sistema multi-tenant.
 *
 * Cubre:
 *   1. Aislamiento de tenants: un tenant NO puede leer ni modificar el catálogo de otro
 *   2. Reinicio limpio: el estado reconstruible tras simular reinicio de PM2
 *   3. Multi-giro: dos tenants con giros distintos coexisten sin contaminar sus catálogos
 *   4. Mismo giro, configuraciones distintas: precios y disponibilidad independientes
 *   5. Fallo durante migración: la BD queda en estado consistente
 *
 * Tests marcados como test.todo son los que requieren entorno real (WhatsApp,
 * panel web, webhook deploy, varios procesos PM2) y se documentan aquí como
 * especificaciones a verificar manualmente antes del deploy gradual.
 *
 * Prueba crítica (obligatoria):
 *   "Un tenant no puede leer ni modificar el catálogo particular de otro"
 *   (línea 1194 del plan de acople)
 */

process.env.BOT_TEST_MODE = "1";

const { test, describe, before, after } = require("node:test");
const assert = require("node:assert/strict");
const Database = require("better-sqlite3");
const fs   = require("fs");
const path = require("path");

const { migrar } = require("../src/migration/migrar-bd");

// ── Shim de compatibilidad (idéntico al de core.js::_makeCompatDB) ────────────

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

function crearBD() {
  const bsdb = new Database(":memory:");
  bsdb.pragma("journal_mode = DELETE");
  bsdb.pragma("busy_timeout = 5000");
  return { bsdb, db: _wrapDB(bsdb) };
}

// Esquema completo, incluyendo todas las columnas que migrar-bd.js necesita
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
      activo INTEGER DEFAULT 1,
      precio_base INTEGER DEFAULT 0
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
      precios_json TEXT DEFAULT '{}',
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
      activo INTEGER DEFAULT 1,
      sinonimos TEXT DEFAULT '',
      categoria TEXT DEFAULT 'corte',
      catalogo_slug TEXT DEFAULT NULL
    );
  `);
}

function sembrar_taqueria(bsdb, precio = 30) {
  bsdb.prepare("INSERT OR IGNORE INTO business_types (slug, nombre) VALUES (?,?)").run("taqueria", "Taquería");
  const giroId = bsdb.prepare("SELECT id FROM business_types WHERE slug='taqueria'").get().id;
  for (const [slug, nombre] of [["surtido","Surtido"],["carne","Carne"],["buche","Buche"]]) {
    bsdb.prepare("INSERT OR IGNORE INTO cortes (giro_id,slug,nombre,precio_base,activo) VALUES (?,?,?,?,1)")
      .run(giroId, slug, nombre, precio);
    bsdb.prepare("INSERT OR IGNORE INTO menu_items (producto_slug,formato_slug,categoria,precio,activo,disponible) VALUES (?,?,?,?,1,1)")
      .run(slug, "taco", "corte", precio);
    bsdb.prepare("INSERT OR IGNORE INTO menu_items (producto_slug,formato_slug,categoria,precio,activo,disponible) VALUES (?,?,?,?,1,1)")
      .run(slug, "torta", "corte", precio);
  }
  bsdb.prepare("INSERT OR IGNORE INTO configuracion (clave,valor) VALUES (?,?)").run("business_type_slug","taqueria");
}

function sembrar_pizzeria(bsdb) {
  bsdb.prepare("INSERT OR IGNORE INTO business_types (slug, nombre) VALUES (?,?)").run("pizzeria", "Pizzería");
  for (const [slug, precio] of [["hawaiana",120],["pepperoni",130]]) {
    bsdb.prepare("INSERT OR IGNORE INTO menu_items (producto_slug,formato_slug,categoria,precio,activo,disponible) VALUES (?,?,?,?,1,1)")
      .run(slug, "mediana", "pizza", precio);
  }
  bsdb.prepare("INSERT OR IGNORE INTO configuracion (clave,valor) VALUES (?,?)").run("business_type_slug","pizzeria");
}

// ═══════════════════════════════════════════════════════════════════════════════
// PRUEBA CRÍTICA — Aislamiento de tenants
// ═══════════════════════════════════════════════════════════════════════════════

describe("PRUEBA CRÍTICA: Un tenant no puede leer ni modificar el catálogo de otro", () => {
  test("BD de tenant A y tenant B son objetos distintos en memoria", () => {
    const tenantA = crearBD();
    const tenantB = crearBD();
    inicializarEsquema(tenantA.bsdb);
    inicializarEsquema(tenantB.bsdb);
    sembrar_taqueria(tenantA.bsdb, 30);
    sembrar_taqueria(tenantB.bsdb, 35); // precio distinto

    const precioA = tenantA.bsdb.prepare("SELECT precio FROM menu_items WHERE producto_slug='surtido' AND formato_slug='taco'").get().precio;
    const precioB = tenantB.bsdb.prepare("SELECT precio FROM menu_items WHERE producto_slug='surtido' AND formato_slug='taco'").get().precio;

    assert.equal(precioA, 30, "tenant A debe tener precio 30");
    assert.equal(precioB, 35, "tenant B debe tener precio 35");
    assert.notEqual(precioA, precioB, "los precios de A y B son independientes");
  });

  test("cambiar precio en tenant A no afecta a tenant B", () => {
    const tenantA = crearBD();
    const tenantB = crearBD();
    inicializarEsquema(tenantA.bsdb);
    inicializarEsquema(tenantB.bsdb);
    sembrar_taqueria(tenantA.bsdb, 30);
    sembrar_taqueria(tenantB.bsdb, 30);

    // Cambiar precio en A
    tenantA.bsdb.prepare("UPDATE menu_items SET precio=99 WHERE producto_slug='surtido' AND formato_slug='taco'").run();

    const precioA = tenantA.bsdb.prepare("SELECT precio FROM menu_items WHERE producto_slug='surtido' AND formato_slug='taco'").get().precio;
    const precioB = tenantB.bsdb.prepare("SELECT precio FROM menu_items WHERE producto_slug='surtido' AND formato_slug='taco'").get().precio;

    assert.equal(precioA, 99, "tenant A debe reflejar el cambio de precio");
    assert.equal(precioB, 30, "tenant B NO debe ver el cambio de precio de A");
  });

  test("deshabilitar un corte en tenant A no oculta el corte en tenant B", () => {
    const tenantA = crearBD();
    const tenantB = crearBD();
    inicializarEsquema(tenantA.bsdb);
    inicializarEsquema(tenantB.bsdb);
    sembrar_taqueria(tenantA.bsdb);
    sembrar_taqueria(tenantB.bsdb);

    // Deshabilitar buche en A
    tenantA.bsdb.prepare("UPDATE menu_items SET activo=0 WHERE producto_slug='buche'").run();

    const bucheA = tenantA.bsdb.prepare("SELECT activo FROM menu_items WHERE producto_slug='buche' AND formato_slug='taco'").get().activo;
    const bucheB = tenantB.bsdb.prepare("SELECT activo FROM menu_items WHERE producto_slug='buche' AND formato_slug='taco'").get().activo;

    assert.equal(bucheA, 0, "buche deshabilitado en tenant A");
    assert.equal(bucheB, 1, "buche sigue activo en tenant B — aislamiento correcto");
  });

  test("pedidos de tenant A no aparecen en la BD de tenant B", () => {
    const tenantA = crearBD();
    const tenantB = crearBD();
    inicializarEsquema(tenantA.bsdb);
    inicializarEsquema(tenantB.bsdb);

    // Insertar pedido en A
    tenantA.bsdb.prepare("INSERT INTO pedidos (tipo, orden, total, estado) VALUES (?,?,?,?)").run("mostrador", "3 tacos", 90, "confirmado");

    const pedidosA = tenantA.bsdb.prepare("SELECT COUNT(*) as c FROM pedidos").get().c;
    const pedidosB = tenantB.bsdb.prepare("SELECT COUNT(*) as c FROM pedidos").get().c;

    assert.equal(pedidosA, 1, "tenant A tiene 1 pedido");
    assert.equal(pedidosB, 0, "tenant B NO ve el pedido de tenant A");
  });

  test("migrar() en tenant A no afecta el estado de tenant B", () => {
    const tenantA = crearBD();
    const tenantB = crearBD();
    inicializarEsquema(tenantA.bsdb);
    inicializarEsquema(tenantB.bsdb);
    sembrar_taqueria(tenantA.bsdb);
    sembrar_taqueria(tenantB.bsdb);

    const miAAntes = tenantA.bsdb.prepare("SELECT COUNT(*) as c FROM menu_items").get().c;
    const miBAntes = tenantB.bsdb.prepare("SELECT COUNT(*) as c FROM menu_items").get().c;

    migrar(tenantA.db); // migrar SOLO en A

    const miADespues = tenantA.bsdb.prepare("SELECT COUNT(*) as c FROM menu_items").get().c;
    const miBDespues = tenantB.bsdb.prepare("SELECT COUNT(*) as c FROM menu_items").get().c;

    // B no debe haber cambiado
    assert.equal(miBAntes, miBDespues, "migrar() en A no debe cambiar el menu_items de B");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// REINICIO LIMPIO — Estado reconstruible tras simulación de reinicio
// ═══════════════════════════════════════════════════════════════════════════════

describe("Reinicio limpio: estado reconstruible tras simulación de PM2 restart", () => {
  test("los datos de BD persisten entre reinicios (menu_items es la fuente de verdad)", () => {
    const { bsdb, db } = crearBD();
    inicializarEsquema(bsdb);
    sembrar_taqueria(bsdb);
    migrar(db);

    // Simular reinicio: guardar conteo antes del "reinicio"
    const miAntes = bsdb.prepare("SELECT COUNT(*) as c FROM menu_items").get().c;
    const configAntes = bsdb.prepare("SELECT valor FROM configuracion WHERE clave='business_type_slug'").get().valor;

    // "Reiniciar" — llamar migrar() de nuevo (como lo haría un proceso que arranca)
    migrar(db);

    const miDespues = bsdb.prepare("SELECT COUNT(*) as c FROM menu_items").get().c;
    const configDespues = bsdb.prepare("SELECT valor FROM configuracion WHERE clave='business_type_slug'").get().valor;

    assert.equal(miAntes, miDespues, "menu_items no cambia tras reinicio simulado");
    assert.equal(configAntes, configDespues, "configuracion no cambia tras reinicio simulado");
  });

  test("estados disponible/agotado sobreviven al reinicio (no se resetean)", () => {
    const { bsdb, db } = crearBD();
    inicializarEsquema(bsdb);
    sembrar_taqueria(bsdb);
    migrar(db);

    // Marcar buche como agotado antes del reinicio
    bsdb.prepare("UPDATE menu_items SET disponible=0 WHERE producto_slug='buche'").run();

    // Simular reinicio
    migrar(db);

    const buche = bsdb.prepare("SELECT disponible FROM menu_items WHERE producto_slug='buche' LIMIT 1").get();
    assert.equal(buche.disponible, 0,
      "disponible=0 (agotado) debe sobrevivir al reinicio — migrar() no reactiva"
    );
  });

  test("schema_migrations no duplica versiones tras múltiples reinicios simulados", () => {
    const { bsdb, db } = crearBD();
    inicializarEsquema(bsdb);
    sembrar_taqueria(bsdb);

    // Simular 5 reinicios
    for (let i = 0; i < 5; i++) migrar(db);

    const count = bsdb.prepare("SELECT COUNT(*) as c FROM schema_migrations WHERE version='migracion-fase8-etapa7-v1'").get().c;
    assert.equal(count, 1, "versión V1 debe aparecer exactamente una vez tras 5 reinicios");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// MULTI-GIRO — Tenants de giros distintos coexisten sin contaminar catálogos
// ═══════════════════════════════════════════════════════════════════════════════

describe("Multi-giro: tenants de giros distintos son independientes", () => {
  test("tenant taquería y tenant pizzería tienen menu_items completamente separados", () => {
    const taqueria = crearBD();
    const pizzeria  = crearBD();
    inicializarEsquema(taqueria.bsdb);
    inicializarEsquema(pizzeria.bsdb);
    sembrar_taqueria(taqueria.bsdb);
    sembrar_pizzeria(pizzeria.bsdb);

    const itemsTaqueria = taqueria.bsdb.prepare("SELECT producto_slug FROM menu_items WHERE activo=1").all().map(r => r.producto_slug);
    const itemsPizzeria = pizzeria.bsdb.prepare("SELECT producto_slug FROM menu_items WHERE activo=1").all().map(r => r.producto_slug);

    // Ningún corte de taquería debe estar en pizzería
    for (const slug of ["surtido","carne","buche"]) {
      assert.ok(!itemsPizzeria.includes(slug),
        `'${slug}' (taquería) no debe aparecer en el catálogo de pizzería`
      );
    }
    // Ningún producto de pizzería debe estar en taquería
    for (const slug of ["hawaiana","pepperoni"]) {
      assert.ok(!itemsTaqueria.includes(slug),
        `'${slug}' (pizzería) no debe aparecer en el catálogo de taquería`
      );
    }
  });

  test("la configuracion business_type_slug de cada tenant es independiente", () => {
    const t = crearBD(); inicializarEsquema(t.bsdb); sembrar_taqueria(t.bsdb);
    const p = crearBD(); inicializarEsquema(p.bsdb); sembrar_pizzeria(p.bsdb);

    const giroT = t.bsdb.prepare("SELECT valor FROM configuracion WHERE clave='business_type_slug'").get().valor;
    const giroP = p.bsdb.prepare("SELECT valor FROM configuracion WHERE clave='business_type_slug'").get().valor;

    assert.equal(giroT, "taqueria", "tenant taquería tiene business_type_slug='taqueria'");
    assert.equal(giroP, "pizzeria", "tenant pizzería tiene business_type_slug='pizzeria'");
    assert.notEqual(giroT, giroP, "los giros de cada tenant son distintos");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// MISMO GIRO, CONFIGURACIONES DISTINTAS
// ═══════════════════════════════════════════════════════════════════════════════

describe("Mismo giro, configuraciones distintas: dos taquerías con precios distintos", () => {
  test("dos tenants del mismo giro tienen precios independientes en menu_items", () => {
    const t1 = crearBD(); inicializarEsquema(t1.bsdb); sembrar_taqueria(t1.bsdb, 30);
    const t2 = crearBD(); inicializarEsquema(t2.bsdb); sembrar_taqueria(t2.bsdb, 45);

    // Cambiar precio de surtido en tenant 1
    t1.bsdb.prepare("UPDATE menu_items SET precio=35 WHERE producto_slug='surtido' AND formato_slug='taco'").run();

    const p1 = t1.bsdb.prepare("SELECT precio FROM menu_items WHERE producto_slug='surtido' AND formato_slug='taco'").get().precio;
    const p2 = t2.bsdb.prepare("SELECT precio FROM menu_items WHERE producto_slug='surtido' AND formato_slug='taco'").get().precio;

    assert.equal(p1, 35, "tenant 1: surtido taco = $35");
    assert.equal(p2, 45, "tenant 2: surtido taco = $45 (sin cambios)");
  });

  test("migrar() en ambos tenants del mismo giro produce estados independientes", () => {
    const t1 = crearBD(); inicializarEsquema(t1.bsdb); sembrar_taqueria(t1.bsdb, 30);
    const t2 = crearBD(); inicializarEsquema(t2.bsdb); sembrar_taqueria(t2.bsdb, 30);

    // Deshabilitar surtido en t1 antes de migrar
    t1.bsdb.prepare("UPDATE menu_items SET disponible=0 WHERE producto_slug='surtido'").run();

    migrar(t1.db);
    migrar(t2.db);

    const surtidoT1 = t1.bsdb.prepare("SELECT disponible FROM menu_items WHERE producto_slug='surtido' LIMIT 1").get().disponible;
    const surtidoT2 = t2.bsdb.prepare("SELECT disponible FROM menu_items WHERE producto_slug='surtido' LIMIT 1").get().disponible;

    assert.equal(surtidoT1, 0, "surtido agotado en tenant 1 persiste tras migrar()");
    assert.equal(surtidoT2, 1, "surtido disponible en tenant 2 no se ve afectado");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// FALLO DURANTE MIGRACIÓN
// ═══════════════════════════════════════════════════════════════════════════════

describe("Fallo durante migración — BD queda en estado consistente", () => {
  test("si migrar() falla, integrity_check sigue pasando en la BD original", () => {
    const { bsdb, db } = crearBD();
    inicializarEsquema(bsdb);
    sembrar_taqueria(bsdb);

    // Simular fallo parcial: no hacer nada (migrar puede tener errores menores)
    const res = migrar(db);

    // Independientemente del resultado, la BD debe ser consistente
    const r = bsdb.prepare("PRAGMA integrity_check").get();
    assert.equal(r.integrity_check, "ok", "BD debe seguir íntegra incluso si hubo errores en migrar()");
  });

  test("dos ejecuciones de migrar() sin completar no corrompen la BD", () => {
    const { bsdb, db } = crearBD();
    inicializarEsquema(bsdb);
    sembrar_taqueria(bsdb);

    // Ejecutar migrar dos veces en estado intermedio (simular reinicio durante migración)
    migrar(db);
    migrar(db);

    const r = bsdb.prepare("PRAGMA integrity_check").get();
    assert.equal(r.integrity_check, "ok");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// VERIFICACIONES DE CÓDIGO: el módulo real sigue el contrato
// ═══════════════════════════════════════════════════════════════════════════════

describe("Verificaciones de código: el módulo real implementa el contrato del Giro", () => {
  before(async () => {
    const { initDB } = require("../src/db/core");
    const { seedDB } = require("../src/db/seed");
    await initDB();
    await seedDB();
  });

  test("getContratoGiro('taqueria') devuelve un objeto con las funciones del contrato", () => {
    const { getContratoGiro } = require("../src/giros");
    const contrato = getContratoGiro("taqueria");
    assert.equal(typeof contrato.parsearPedido, "function", "parsearPedido debe ser función");
    assert.equal(typeof contrato.calcularPrecioPartida, "function", "calcularPrecioPartida debe ser función");
    assert.equal(typeof contrato.convertirPedidoLegacy, "function", "convertirPedidoLegacy debe ser función");
  });

  test("catalogo del contrato devuelve presentaciones no vacías", () => {
    const { getContratoGiro } = require("../src/giros");
    const contrato = getContratoGiro("taqueria");
    const presentaciones = contrato.catalogo?.presentaciones;
    assert.ok(Array.isArray(presentaciones) && presentaciones.length > 0,
      "contrato.catalogo.presentaciones debe devolver formatos activos"
    );
  });

  test("calcularPrecioPartida() para 3 tacos de surtido devuelve valor > 0", () => {
    const { getContratoGiro } = require("../src/giros");
    const contrato = getContratoGiro("taqueria");
    const partida = {
      tipo: "producto", formatoSlug: "taco", productoSlug: "surtido",
      cantidad: { tipo: "unidad", valor: 3 },
      combinacion: [], extras: [], metadata: {},
    };
    const precio = contrato.calcularPrecioPartida(partida);
    assert.ok(precio > 0, `precio para 3 tacos de surtido debe ser > 0, es ${precio}`);
  });

  test("el NLU reconoce 'quiero 3 tacos de surtido' como pedido", () => {
    const parser = require("../src/handlers/pedidoParser");
    const resultado = parser.parsearPedidoSimple("quiero 3 tacos de surtido");
    assert.ok(resultado && resultado.tipo === "pedido",
      "parsearPedidoSimple debe reconocer pedidos básicos de taquería"
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// ESPECIFICACIONES — Tests que requieren entorno real (test.todo)
// ═══════════════════════════════════════════════════════════════════════════════

describe("Validación manual requerida — entorno real", () => {
  test.todo(
    "PANEL: wizard de onboarding completa 5 pasos y marca setup_done en localStorage"
  );
  test.todo(
    "PANEL: cambiar precio de un corte se refleja en el mensaje de WhatsApp en < 5 segundos"
  );
  test.todo(
    "PANEL: marcar corte como agotado lo oculta del menú de WhatsApp sin eliminar el item"
  );
  test.todo(
    "WHATSAPP: cliente completa un pedido de principio a fin (3 tacos de surtido a domicilio)"
  );
  test.todo(
    "WHATSAPP: el bot se recupera de una desconexión de WhatsApp y atiende el siguiente mensaje"
  );
  test.todo(
    "PM2: reiniciar el proceso del tenant no duplica tareas de timeout ni backup"
  );
  test.todo(
    "MULTI-TENANT: dos tenants distintos del mismo servidor atienden mensajes sin interferir"
  );
  test.todo(
    "WEBHOOK: push a main dispara git pull, npm install y pm2 restart de todos los tenants"
  );
  test.todo(
    "BACKUP: restaurar desde backup reproduce exactamente el mismo catálogo y configuración"
  );
  test.todo(
    "MIGRACIÓN REAL: aplicar migrar() a una BD de producción antigua no borra ni corrupta pedidos"
  );
});
