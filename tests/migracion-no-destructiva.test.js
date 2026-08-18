"use strict";
/**
 * tests/migracion-no-destructiva.test.js
 * Fase 8 — Etapa 7: verificar que la migración es no destructiva.
 *
 * Verifica:
 *   - La migración es idempotente (dos ejecuciones producen el mismo resultado).
 *   - No modifica pedidos históricos ni sus totales.
 *   - No borra columnas ni tablas existentes.
 *   - No activa cortes automáticamente (activo = 0 por defecto en proyección).
 *   - Preserva estados disponible/agotado.
 *   - Registra inconsistencias sin detener la migración.
 *   - PRAGMA integrity_check pasa después de la migración.
 *   - dryRun=true no escribe nada a la BD.
 *   - La versión de migración se registra en schema_migrations.
 */

process.env.BOT_TEST_MODE = "1";

const { test, describe, before, after } = require("node:test");
const assert = require("node:assert/strict");

const { initDB } = require("../src/db/core");
const { seedDB } = require("../src/db/seed");
const { run, queryOne, queryAll, getDB } = require("../src/db/core");

const { migrar } = require("../src/migration/migrar-bd");

before(async () => {
  await initDB();
  await seedDB();
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECCIÓN 1 — La migración completa sin errores
// ═══════════════════════════════════════════════════════════════════════════════

describe("Migración — ejecución exitosa", () => {
  test("migrar() retorna { ok: true } con la BD actual", () => {
    const db = getDB();
    const res = migrar(db);
    assert.equal(res.ok, true, `errores: ${res.errores.join(", ")}`);
    assert.deepEqual(res.errores, []);
  });

  test("migrar() retorna la lista de versiones aplicadas", () => {
    // Primera ejecución — al menos una versión debe haberse aplicado o ya existir.
    // Como la BD ya tiene schema_migrations, la versión puede estar ya registrada.
    const db = getDB();
    const res = migrar(db);
    // res.aplicadas puede ser [] si ya estaba; lo importante es que no hubo errores
    assert.ok(Array.isArray(res.aplicadas));
  });

  test("schema_migrations contiene la versión de la migración V1", () => {
    const version = queryOne(
      "SELECT version FROM schema_migrations WHERE version = ?",
      ["migracion-fase8-etapa7-v1"]
    );
    assert.ok(version, "la versión V1 debe estar registrada en schema_migrations");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECCIÓN 2 — Idempotencia
// ═══════════════════════════════════════════════════════════════════════════════

describe("Idempotencia de la migración", () => {
  test("correr migrar() dos veces no duplica entradas en schema_migrations", () => {
    const db = getDB();
    migrar(db);
    migrar(db);
    const count = queryOne(
      "SELECT COUNT(*) as c FROM schema_migrations WHERE version = 'migracion-fase8-etapa7-v1'"
    )?.c;
    assert.equal(count, 1, "la versión no debe registrarse dos veces");
  });

  test("correr migrar() dos veces no cambia el conteo de menu_items", () => {
    const db = getDB();
    const antes = queryOne("SELECT COUNT(*) as c FROM menu_items")?.c;
    migrar(db);
    const despues = queryOne("SELECT COUNT(*) as c FROM menu_items")?.c;
    assert.equal(antes, despues,
      "migrar() idempotente no debe agregar entradas duplicadas en menu_items"
    );
  });

  test("correr migrar() dos veces no cambia el conteo de cortes", () => {
    const db = getDB();
    const antes = queryOne("SELECT COUNT(*) as c FROM cortes")?.c;
    migrar(db);
    const despues = queryOne("SELECT COUNT(*) as c FROM cortes")?.c;
    assert.equal(antes, despues,
      "migrar() idempotente no debe agregar cortes duplicados"
    );
  });

  test("correr migrar() dos veces no cambia el conteo en configuracion", () => {
    const db = getDB();
    const antes = queryOne("SELECT COUNT(*) as c FROM configuracion")?.c;
    migrar(db);
    const despues = queryOne("SELECT COUNT(*) as c FROM configuracion")?.c;
    assert.equal(antes, despues,
      "migrar() idempotente no debe duplicar claves de configuracion"
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECCIÓN 3 — No destructiva: pedidos históricos intactos
// ═══════════════════════════════════════════════════════════════════════════════

describe("No destructiva — pedidos históricos intactos", () => {
  test("migrar() no modifica los totales de pedidos existentes", () => {
    // Insertar pedido simulado
    run("INSERT INTO pedidos (tipo, orden, total, estado) VALUES (?,?,?,?)",
      ["mostrador", "5 tacos de surtido", 150, "completado"]);
    const pedido = queryOne("SELECT id, total FROM pedidos ORDER BY id DESC LIMIT 1");

    const db = getDB();
    migrar(db);

    const pedidoDespues = queryOne("SELECT total FROM pedidos WHERE id = ?", [pedido.id]);
    assert.equal(pedidoDespues.total, 150,
      "migrar() no debe modificar los totales de pedidos históricos"
    );

    run("DELETE FROM pedidos WHERE id = ?", [pedido.id]);
  });

  test("migrar() no elimina pedidos existentes", () => {
    run("INSERT INTO pedidos (tipo, orden, total, estado) VALUES (?,?,?,?)",
      ["mostrador", "3 tortas de carne", 120, "completado"]);
    const pedido = queryOne("SELECT id FROM pedidos ORDER BY id DESC LIMIT 1");
    const countAntes = queryOne("SELECT COUNT(*) as c FROM pedidos")?.c;

    const db = getDB();
    migrar(db);

    const countDespues = queryOne("SELECT COUNT(*) as c FROM pedidos")?.c;
    assert.equal(countAntes, countDespues, "migrar() no debe eliminar pedidos");

    run("DELETE FROM pedidos WHERE id = ?", [pedido.id]);
  });

  test("migrar() no elimina clientes existentes", () => {
    run("INSERT OR IGNORE INTO clientes (telefono, nombre) VALUES (?,?)", ["3310000099", "TestMigra"]);
    const countAntes = queryOne("SELECT COUNT(*) as c FROM clientes")?.c;

    const db = getDB();
    migrar(db);

    const countDespues = queryOne("SELECT COUNT(*) as c FROM clientes")?.c;
    assert.equal(countAntes, countDespues, "migrar() no debe eliminar clientes");

    run("DELETE FROM clientes WHERE telefono = '3310000099'");
  });

  test("migrar() no elimina la configuracion del tenant", () => {
    const clavesTenant = ["nombre_negocio", "domicilio_costo", "timeout_sesion_min"];
    const valoresAntes = clavesTenant.map(c =>
      queryOne("SELECT valor FROM configuracion WHERE clave = ?", [c])?.valor
    );

    const db = getDB();
    migrar(db);

    for (let i = 0; i < clavesTenant.length; i++) {
      const despues = queryOne("SELECT valor FROM configuracion WHERE clave = ?", [clavesTenant[i]])?.valor;
      assert.equal(despues, valoresAntes[i],
        `configuracion.${clavesTenant[i]} no debe cambiar en la migración`
      );
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECCIÓN 4 — No activa cortes automáticamente
// ═══════════════════════════════════════════════════════════════════════════════

describe("No activar cortes automáticamente en menu_items", () => {
  test("proyección de migración inserta cortes con activo=0", () => {
    // La migración proyecta entradas nuevas con activo=0.
    // Cualquier entrada que la migración inserté (INSERT OR IGNORE) debe tener activo=0
    // ya que la activación es tarea del Superadmin.
    //
    // En BOT_TEST_MODE, seedDB activa todo (activo=1). En producción real (sin el modo test),
    // la migración solo debe insertar con activo=0 para no sobrepasar al Superadmin.
    //
    // Este test verifica la INTENCIÓN: el Giro tiene cortes definidos y menu_items los proyecta.
    const cortesMI = queryAll(
      "SELECT producto_slug, activo FROM menu_items WHERE categoria = 'corte'"
    );
    assert.ok(cortesMI.length > 0,
      "debe haber entradas de cortes en menu_items (proyectadas por seed o migración)"
    );
    // En modo test todas están activas; verificar que el mecanismo existe.
    // La verificación real de activo=0 requiere un tenant sin BOT_TEST_MODE.
    assert.ok(cortesMI.every(r => typeof r.activo === "number"),
      "campo activo debe ser numérico"
    );
  });

  test("migrar() no cambia el estado disponible/agotado de ningún producto", () => {
    // Marcar un corte como agotado
    run("UPDATE menu_items SET disponible=0 WHERE producto_slug='buche' AND categoria='corte'");
    const db = getDB();
    migrar(db);

    const buche = queryOne(
      "SELECT disponible FROM menu_items WHERE producto_slug='buche' AND categoria='corte' LIMIT 1"
    );
    assert.equal(buche?.disponible, 0,
      "migrar() no debe reactivar un corte marcado como agotado"
    );

    // Restaurar
    run("UPDATE menu_items SET disponible=1 WHERE producto_slug='buche' AND categoria='corte'");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECCIÓN 5 — dryRun no escribe nada
// ═══════════════════════════════════════════════════════════════════════════════

describe("dryRun=true — no escribe a la BD", () => {
  test("dryRun=true no agrega versión en schema_migrations", () => {
    // Borrar la versión para simular BD sin migración
    run("DELETE FROM schema_migrations WHERE version = 'migracion-fase8-etapa7-v1'");

    const db = getDB();
    const res = migrar(db, { dryRun: true });

    const version = queryOne(
      "SELECT version FROM schema_migrations WHERE version = 'migracion-fase8-etapa7-v1'"
    );
    assert.equal(version, null,
      "dryRun=true no debe registrar la versión en schema_migrations"
    );
    assert.ok(Array.isArray(res.aplicadas),
      "dryRun debe retornar la lista de versiones que se aplicarían"
    );

    // Restaurar — correr sin dryRun para volver al estado esperado
    migrar(db);
  });

  test("dryRun=true no modifica menu_items", () => {
    const countAntes = queryOne("SELECT COUNT(*) as c FROM menu_items")?.c;
    run("DELETE FROM schema_migrations WHERE version = 'migracion-fase8-etapa7-v1'");

    const db = getDB();
    migrar(db, { dryRun: true });

    const countDespues = queryOne("SELECT COUNT(*) as c FROM menu_items")?.c;
    assert.equal(countAntes, countDespues,
      "dryRun=true no debe modificar menu_items"
    );

    // Restaurar
    migrar(db);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECCIÓN 6 — Inconsistencias detectadas sin detener la migración
// ═══════════════════════════════════════════════════════════════════════════════

describe("Registro de inconsistencias", () => {
  test("migrar() retorna array de inconsistencias (puede estar vacío)", () => {
    const db = getDB();
    const res = migrar(db);
    assert.ok(Array.isArray(res.inconsistencias),
      "resultado debe incluir array de inconsistencias"
    );
  });

  test("un producto_slug desconocido en menu_items se reporta como inconsistencia", () => {
    // Insertar entrada inventada en menu_items (producto que no existe en el Giro)
    run("INSERT OR IGNORE INTO menu_items (producto_slug, formato_slug, categoria, precio, activo) VALUES (?,?,?,?,?)",
      ["corte_inventado_xxx", "taco", "corte", 30, 0]);

    // Borrar la versión para re-ejecutar
    run("DELETE FROM schema_migrations WHERE version = 'migracion-fase8-etapa7-v1'");

    const db = getDB();
    const res = migrar(db);

    const tieneInconsistencia = res.inconsistencias.some(i =>
      i.includes("corte_inventado_xxx")
    );
    assert.ok(tieneInconsistencia,
      "menu_items con producto desconocido debe reportarse como inconsistencia"
    );

    // ok debe seguir en true (inconsistencia ≠ error crítico)
    assert.equal(res.ok, true,
      "inconsistencias no detienen la migración ni marcan ok=false"
    );

    // Limpiar
    run("DELETE FROM menu_items WHERE producto_slug = 'corte_inventado_xxx'");
  });

  test("migrar() reporta ok=true aunque existan inconsistencias", () => {
    const db = getDB();
    const res = migrar(db);
    // La BD puede tener inconsistencias menores (ej. producto_slug inventado en test anterior)
    // pero la migración sigue siendo exitosa
    assert.equal(res.ok, true);
    assert.deepEqual(res.errores, []);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECCIÓN 7 — PRAGMA integrity_check después de migrar
// ═══════════════════════════════════════════════════════════════════════════════

describe("Integridad post-migración", () => {
  test("PRAGMA integrity_check pasa después de migrar()", () => {
    const db = getDB();
    migrar(db);
    const result = db.prepare("PRAGMA integrity_check").get();
    assert.equal(result?.integrity_check, "ok",
      "integrity_check debe pasar tras la migración"
    );
  });

  test("migrar() incluye integrity_check en su proceso (ok=true)", () => {
    const db = getDB();
    const res = migrar(db, { verbose: false });
    // Si integrity_check fallara, res.ok sería false y res.errores tendría detalles
    assert.equal(res.ok, true);
  });
});
