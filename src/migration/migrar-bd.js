"use strict";
/**
 * src/migration/migrar-bd.js
 * Fase 8 — Etapa 7: migración no destructiva de la base de datos del tenant.
 *
 * Proceso (ver acople.txt Etapa 7):
 *  1. Abrir la BD.
 *  2. Verificar su versión (schema_migrations).
 *  3. Crear estructuras nuevas que falten.
 *  4. Resolver el Giro del tenant.
 *  5. Sincronizar el catálogo maestro del Giro.
 *  6. Aplicar habilitaciones del superadmin.
 *  7. Incorporar precios particulares del tenant.
 *  8. Preservar estados disponible/agotado.
 *  9. Convertir configuraciones antiguas.
 * 10. Registrar inconsistencias.
 * 11. Verificar integridad.
 * 12. Marcar la migración como aplicada.
 *
 * PRINCIPIOS:
 * - Nunca borra columnas ni tablas.
 * - Nunca modifica pedidos o totales históricos.
 * - Nunca recalcula precios de pedidos pasados.
 * - Es idempotente: correrla dos veces produce el mismo resultado.
 * - Registra cada paso y cada inconsistencia detectada.
 * - Opera dentro de una transacción SQLite donde sea posible.
 *
 * Si un registro antiguo no puede mapearse con seguridad, queda registrado
 * en el resultado y se conserva; no se descarta automáticamente.
 */

const VERSIONES = {
  "migracion-fase8-etapa7-v1": migrarV1,
};

/**
 * Punto de entrada principal.
 *
 * @param {object} db  — instancia better-sqlite3 (read-write)
 * @param {object} [opts]
 * @param {boolean} [opts.dryRun=false]  — si true, no escribe nada a la BD
 * @param {boolean} [opts.verbose=false] — si true, loggea cada paso
 * @returns {{ ok: boolean, aplicadas: string[], inconsistencias: string[], errores: string[] }}
 */
function migrar(db, opts = {}) {
  const { dryRun = false, verbose = false } = opts;

  const resultado = {
    ok:             true,
    aplicadas:      [],
    inconsistencias:[],
    errores:        [],
  };

  const log = verbose ? (msg) => console.log(`[MIGRA] ${msg}`) : () => {};

  // Crear schema_migrations si no existe (BD muy antigua)
  db.run(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version    TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  )`);

  for (const [version, fn] of Object.entries(VERSIONES)) {
    const yaAplicada = db.prepare(
      "SELECT version FROM schema_migrations WHERE version = ?"
    ).get(version);

    if (yaAplicada) {
      log(`ya aplicada: ${version}`);
      continue;
    }

    log(`aplicando: ${version}`);

    try {
      const info = fn(db, { dryRun, log, resultado });
      if (info?.inconsistencias) {
        resultado.inconsistencias.push(...info.inconsistencias);
      }
      if (!dryRun) {
        db.prepare("INSERT INTO schema_migrations (version) VALUES (?)").run(version);
      }
      resultado.aplicadas.push(version);
      log(`ok: ${version}`);
    } catch (err) {
      resultado.ok = false;
      resultado.errores.push(`${version}: ${err.message}`);
      log(`error en ${version}: ${err.message}`);
      break; // detener en el primer error para no propagar estado inconsistente
    }
  }

  return resultado;
}

// ── MIGRACIÓN V1 ─────────────────────────────────────────────────────────────

function migrarV1(db, { dryRun, log, resultado }) {
  const inconsistencias = [];

  // ── Paso 3: crear estructuras nuevas que falten ─────────────────────────
  // (La mayoría ya existen por seedDB; solo aseguramos columnas nuevas)
  log("paso 3: verificar columnas nuevas en tablas existentes");

  const columnasNuevas = [
    ["cortes",     "aliases_json", "TEXT DEFAULT '[]'"],
    ["cortes",     "seccion",      "TEXT DEFAULT 'carnitas'"],
    ["menu_items", "disponible",   "INTEGER DEFAULT 1"],
    ["menu_items", "precios_json", "TEXT DEFAULT '{}'"],
    ["clientes",   "ultimo_pedido_json", "TEXT"],
    ["productos",  "sinonimos",    "TEXT DEFAULT ''"],
    ["productos",  "categoria",    "TEXT DEFAULT 'corte'"],
    ["productos",  "catalogo_slug","TEXT DEFAULT NULL"],
    ["item_types", "precio_base",  "INTEGER DEFAULT 0"],
  ];

  for (const [tabla, columna, definicion] of columnasNuevas) {
    try {
      if (!dryRun) {
        db.run(`ALTER TABLE ${tabla} ADD COLUMN ${columna} ${definicion}`);
        log(`  columna agregada: ${tabla}.${columna}`);
      }
    } catch (_) {
      // La columna ya existe — comportamiento esperado en ejecuciones posteriores
    }
  }

  // ── Paso 4: resolver el Giro del tenant ─────────────────────────────────
  log("paso 4: resolver Giro del tenant");
  const btSlug = _leerConfig(db, "business_type_slug") || "taqueria";
  let giro;
  try {
    const { getGiro } = require("../giros");
    giro = getGiro(btSlug);
    log(`  giro: ${giro.nombre} (${giro.slug})`);
  } catch (err) {
    log(`  advertencia: no se pudo cargar el Giro '${btSlug}': ${err.message}`);
  }

  if (!giro) {
    inconsistencias.push(`Giro '${btSlug}' no encontrado — catálogo no sincronizado`);
    return { inconsistencias };
  }

  // ── Paso 5: sincronizar catálogo maestro del Giro ───────────────────────
  log("paso 5: sincronizar catálogo maestro del Giro en tabla cortes");

  const bt = db.prepare("SELECT id FROM business_types WHERE slug = ?").get(giro.slug);
  if (!bt) {
    inconsistencias.push(`business_type '${giro.slug}' no existe en la BD — ejecutar seedDB primero`);
    return { inconsistencias };
  }

  if (Array.isArray(giro.cortes)) {
    const stmtUpsertCorte = db.prepare(
      `INSERT OR IGNORE INTO cortes (giro_id, slug, nombre, aliases_json, descripcion, precio_base, precios_json, activo, seccion)
       VALUES (?, ?, ?, ?, ?, ?, '{}', 1, ?)`
    );
    const stmtSyncAlias = db.prepare(
      "UPDATE cortes SET aliases_json = ? WHERE giro_id = ? AND slug = ?"
    );
    for (const c of giro.cortes) {
      if (!dryRun) {
        stmtUpsertCorte.run(
          bt.id, c.slug, c.nombre,
          JSON.stringify(c.aliases || []),
          c.descripcion || "", c.precio_base || 0,
          c.seccion || "carnitas"
        );
        // aliases_json es config del sistema (NLU) — siempre sobrescribir
        stmtSyncAlias.run(JSON.stringify(c.aliases || []), bt.id, c.slug);
      }
      log(`  corte sincronizado: ${c.slug}`);
    }
  }

  // ── Paso 6: aplicar habilitaciones del superadmin (proyección en menu_items) ─
  log("paso 6: proyectar catálogo en menu_items si faltan entradas");

  const formatos = db.prepare(
    `SELECT it.slug, it.precio_base FROM item_types it
     JOIN business_types b ON b.id = it.business_type_id
     WHERE b.slug = ?`
  ).all(giro.slug);

  const stmtInsertMI = db.prepare(
    `INSERT OR IGNORE INTO menu_items
       (producto_slug, formato_slug, categoria, precio, activo, disponible, eliminado)
     VALUES (?, ?, ?, ?, 0, 1, 0)`
    // activo = 0: el Superadmin habilita; el seed no activa automáticamente
  );

  let cortesProyectados = 0;
  for (const c of giro.cortes || []) {
    for (const f of formatos) {
      if (!dryRun) {
        stmtInsertMI.run(c.slug, f.slug, "corte", Number(f.precio_base || c.precio_base || 0));
      }
      cortesProyectados++;
    }
  }
  log(`  proyectados (sin activar): ${cortesProyectados} entradas corte×formato`);

  for (const r of giro.refrescos || []) {
    if (!dryRun) stmtInsertMI.run(r.nombre, null, "refresco", Number(r.precio || 0));
  }
  for (const s of giro.salsas || []) {
    if (!dryRun) stmtInsertMI.run(s.nombre, null, "salsa", Number(s.precio || 0));
  }

  // ── Paso 7: incorporar precios particulares del tenant ──────────────────
  // Los precios de menu_items ya son los precios del tenant.
  // Si vienen de productos (legacy), los precios ya se copiaron en _migrarCatalogoLegacyAMenu.
  log("paso 7: precios del tenant ya en menu_items — no se modifica");

  // ── Paso 8: preservar estados disponible/agotado ─────────────────────────
  // menu_items.disponible ya refleja el estado actual.
  // No se resetea disponibilidad en ninguna migración.
  log("paso 8: estados disponible/agotado preservados (no se modifican)");

  // ── Paso 9: convertir configuraciones antiguas ───────────────────────────
  log("paso 9: migrar configuraciones antiguas");

  // business_type_slug: si falta, poblar desde BUSINESS_TYPE env o default taqueria
  const btConfig = _leerConfig(db, "business_type_slug");
  if (!btConfig) {
    const btDefault = (process.env.BUSINESS_TYPE || "taqueria").trim().toLowerCase();
    if (!dryRun) {
      db.prepare("INSERT OR IGNORE INTO configuracion (clave, valor) VALUES (?, ?)").run(
        "business_type_slug", btDefault
      );
    }
    inconsistencias.push(`configuracion.business_type_slug faltaba — se estableció '${btDefault}'`);
    log(`  configuracion.business_type_slug establecido: ${btDefault}`);
  }

  // precio_taco / precio_torta / precio_100g: si faltan, poblar con defaults del Giro
  const preciosCampo = [
    ["precio_taco",  giro.itemTypes?.find(i => i.slug === "taco")?.precio_base  || 30],
    ["precio_torta", giro.itemTypes?.find(i => i.slug === "torta")?.precio_base || 40],
    ["precio_100g",  giro.itemTypes?.find(i => i.slug === "gramos")?.precio_base || 32],
  ];
  for (const [clave, valorDefault] of preciosCampo) {
    if (!_leerConfig(db, clave)) {
      if (!dryRun) {
        db.prepare("INSERT OR IGNORE INTO configuracion (clave, valor) VALUES (?, ?)").run(
          clave, String(valorDefault)
        );
      }
      inconsistencias.push(`configuracion.${clave} faltaba — establecido en ${valorDefault}`);
    }
  }

  // ── Paso 10: registrar inconsistencias ───────────────────────────────────
  // Cortes en cortes pero no en menu_items (huérfanos NLU)
  log("paso 10: detectar inconsistencias");

  const cortesHuerfanos = db.prepare(
    `SELECT c.slug FROM cortes c
     LEFT JOIN menu_items mi ON mi.producto_slug = c.slug AND mi.categoria = 'corte'
     WHERE c.giro_id = ? AND c.activo = 1 AND mi.id IS NULL`
  ).all(bt.id);

  for (const { slug } of cortesHuerfanos) {
    inconsistencias.push(`corte '${slug}' existe en cortes pero no tiene entradas en menu_items`);
  }

  // menu_items con producto_slug desconocido en el Giro
  const slugsGiro = new Set([
    ...(giro.cortes || []).map(c => c.slug),
    ...(giro.refrescos || []).map(r => r.nombre),
    ...(giro.salsas || []).map(s => s.nombre),
  ]);

  const miDesconocidos = db.prepare(
    "SELECT DISTINCT producto_slug, categoria FROM menu_items WHERE eliminado = 0"
  ).all().filter(row => !slugsGiro.has(row.producto_slug));

  for (const { producto_slug, categoria } of miDesconocidos) {
    inconsistencias.push(
      `menu_items tiene producto_slug='${producto_slug}' (${categoria}) desconocido en el Giro`
    );
  }

  // ── Paso 11: integrity check ─────────────────────────────────────────────
  log("paso 11: PRAGMA integrity_check");
  const integridad = db.prepare("PRAGMA integrity_check").get()?.integrity_check;
  if (integridad !== "ok") {
    resultado.errores.push(`integrity_check falló: ${integridad}`);
    resultado.ok = false;
  }

  return { inconsistencias };
}

// ── HELPERS ──────────────────────────────────────────────────────────────────

function _leerConfig(db, clave) {
  try {
    return db.prepare("SELECT valor FROM configuracion WHERE clave = ?").get(clave)?.valor ?? null;
  } catch (_) { return null; }
}

module.exports = { migrar };
