"use strict";
/**
 * src/migration/doble-lectura.js
 * Fase 8 — Etapa 8: comparación paralela de fuentes (nueva vs. antigua).
 *
 * Ejecuta la lectura oficial (Giro + menu_items) y la lectura de comparación
 * (fuentes antiguas: productos, cortes con precios_json, getPrecios legacy)
 * en paralelo. NO muestra la fuente antigua al usuario; solo compara y clasifica.
 *
 * Dimensiones comparadas:
 *   - Productos/cortes visibles
 *   - Presentaciones (item_types activos)
 *   - Precios (por corte × formato)
 *   - Disponibilidad (disponible/agotado)
 *   - Totales calculados para un pedido de referencia
 *
 * Clasificación de diferencias:
 *   ESPERADA      — diferencia conocida y documentada (ej. campo eliminado del Giro)
 *   DATO_INVALIDO — el dato antiguo es incorrecto (precio 0, slug vacío)
 *   ERROR_MIGRACION — el dato nuevo debería coincidir pero no lo hace
 *   ERROR_GIRO    — el módulo Giro devuelve un valor inesperado
 *   CONFIG_FALTANTE — configuración del tenant ausente en la fuente nueva
 *
 * El sistema nuevo NO avanza a producción mientras existan diferencias
 * ERROR_MIGRACION con importes inexplicables.
 */

const TIPOS_DIFERENCIA = {
  ESPERADA:        "ESPERADA",
  DATO_INVALIDO:   "DATO_INVALIDO",
  ERROR_MIGRACION: "ERROR_MIGRACION",
  ERROR_GIRO:      "ERROR_GIRO",
  CONFIG_FALTANTE: "CONFIG_FALTANTE",
};

/**
 * Ejecuta la comparación completa.
 *
 * @param {object} db       — better-sqlite3 (solo lectura es suficiente)
 * @param {object} [opts]
 * @param {string} [opts.giroSlug]  — forzar giro (por defecto lee de configuracion)
 * @returns {{ diferencias: Diferencia[], bloqueante: boolean }}
 */
function comparar(db, opts = {}) {
  const diferencias = [];

  const giroSlug = opts.giroSlug
    || _leerConfig(db, "business_type_slug")
    || "taqueria";

  let giro;
  try {
    const { getGiro, listGiros } = require("../giros");
    const slugsRegistrados = listGiros().map(g => g.slug);
    if (!slugsRegistrados.includes(giroSlug)) {
      diferencias.push(_dif("ERROR_GIRO", "giro", null, null,
        `Giro '${giroSlug}' no registrado (disponibles: ${slugsRegistrados.join(", ")})`));
      return { diferencias, bloqueante: true };
    }
    giro = getGiro(giroSlug);
  } catch (err) {
    diferencias.push(_dif("ERROR_GIRO", "giro", null, null,
      `No se pudo cargar el Giro '${giroSlug}': ${err.message}`));
    return { diferencias, bloqueante: true };
  }

  // 1. Cortes/productos visibles
  _compararProductosVisibles(db, giro, diferencias);

  // 2. Presentaciones activas
  _compararPresentaciones(db, giro, diferencias);

  // 3. Precios por corte × formato
  _compararPrecios(db, giro, diferencias);

  // 4. Disponibilidad
  _compararDisponibilidad(db, giro, diferencias);

  // 5. Total calculado para pedido de referencia
  _compararTotalPedidoRef(db, giro, diferencias);

  const bloqueante = diferencias.some(d => d.tipo === "ERROR_MIGRACION");
  return { diferencias, bloqueante };
}

// ── Comparadores ─────────────────────────────────────────────────────────────

function _compararProductosVisibles(db, giro, difs) {
  // Fuente nueva: menu_items activos del Giro
  const slugsNuevos = new Set(
    db.prepare(
      "SELECT DISTINCT producto_slug FROM menu_items WHERE activo=1 AND disponible=1 AND eliminado=0 AND categoria='corte'"
    ).all().map(r => r.producto_slug)
  );

  // Fuente antigua: cortes activos de la tabla cortes
  const slugsAntiguos = new Set(
    db.prepare(
      `SELECT c.slug FROM cortes c
       WHERE c.activo = 1
         AND c.giro_id = (SELECT id FROM business_types WHERE slug = ?)`
    ).all(giro.slug).map(r => r.slug)
  );

  for (const slug of slugsNuevos) {
    if (!slugsAntiguos.has(slug)) {
      difs.push(_dif("ESPERADA", "productos_visibles", null, slug,
        `'${slug}' en menu_items pero no en cortes (esperado: corte nuevo o migrado)`));
    }
  }

  for (const slug of slugsAntiguos) {
    if (!slugsNuevos.has(slug)) {
      difs.push(_dif("CONFIG_FALTANTE", "productos_visibles", slug, null,
        `'${slug}' en cortes pero sin entrada activa en menu_items — falta habilitación`));
    }
  }
}

function _compararPresentaciones(db, giro, difs) {
  // Fuente nueva: item_types activos del Giro en BD
  const itNuevos = db.prepare(
    `SELECT it.slug FROM item_types it
     JOIN business_types bt ON bt.id = it.business_type_id
     WHERE bt.slug = ? AND it.activo = 1`
  ).all(giro.slug).map(r => r.slug);

  // Fuente "maestra": item_types declarados en el módulo Giro
  const itGiro = (giro.itemTypes || []).map(it => it.slug);

  for (const slug of itGiro) {
    if (!itNuevos.includes(slug)) {
      difs.push(_dif("CONFIG_FALTANTE", "presentaciones", null, slug,
        `item_type '${slug}' definido en el Giro pero no activo en BD`));
    }
  }

  for (const slug of itNuevos) {
    if (!itGiro.includes(slug)) {
      difs.push(_dif("DATO_INVALIDO", "presentaciones", slug, null,
        `item_type '${slug}' activo en BD pero no definido en el módulo Giro`));
    }
  }
}

function _compararPrecios(db, giro, difs) {
  // Compara el motor legacy (calcularPrecioItem) vs el motor neutral (calcularPrecioPartida)
  // para todos los cortes activos × formatos de unidad.
  // Ambos deben calcular el mismo importe para 1 unidad; si divergen es ERROR_MIGRACION.
  try {
    const { getPrecios, calcularPrecioItem } = require("../pedido/precios");
    const { getContratoGiro } = require("../giros");
    const precios = getPrecios();
    const contrato = getContratoGiro(giro.slug);

    const formatos = db.prepare(
      `SELECT it.slug FROM item_types it
       JOIN business_types bt ON bt.id = it.business_type_id
       WHERE bt.slug = ? AND it.activo = 1 AND it.slug NOT IN ('gramos','por_pesos')`
    ).all(giro.slug).map(r => r.slug);

    const cortesActivos = db.prepare(
      `SELECT DISTINCT mi.producto_slug FROM menu_items mi
       WHERE mi.activo=1 AND mi.disponible=1 AND mi.eliminado=0 AND mi.categoria='corte'`
    ).all().map(r => r.producto_slug);

    for (const corteSlug of cortesActivos) {
      for (const formatoSlug of formatos) {
        const pLegacy = calcularPrecioItem(
          { presentacion: formatoSlug, corte: corteSlug, cantidad: 1 },
          precios
        );
        const partida = {
          tipo: "producto", formatoSlug, productoSlug: corteSlug,
          cantidad: { tipo: "unidad", valor: 1 }, combinacion: [], extras: [], metadata: {},
        };
        const pNeutral = contrato.calcularPrecioPartida(partida);

        if (pLegacy !== pNeutral) {
          if (pLegacy === 0) {
            difs.push(_dif("DATO_INVALIDO", "precios",
              `${corteSlug}×${formatoSlug}=$${pLegacy}`,
              `${corteSlug}×${formatoSlug}=$${pNeutral}`,
              `motor legacy devuelve $0 para ${corteSlug}×${formatoSlug}`));
          } else {
            difs.push(_dif("ERROR_MIGRACION", "precios",
              `${corteSlug}×${formatoSlug}=$${pLegacy}`,
              `${corteSlug}×${formatoSlug}=$${pNeutral}`,
              `precios divergen: legacy=$${pLegacy} neutral=$${pNeutral} — revisar migración`));
          }
        }
      }
    }
  } catch (err) {
    difs.push(_dif("ERROR_GIRO", "precios", null, null,
      `Error al comparar precios: ${err.message}`));
  }
}

function _compararDisponibilidad(db, giro, difs) {
  // Comparar disponible/agotado entre menu_items y cortes.activo
  const miDisp = db.prepare(
    `SELECT producto_slug, disponible FROM menu_items WHERE categoria='corte' AND eliminado=0`
  ).all();

  const cortesActivos = new Set(
    db.prepare(
      `SELECT c.slug FROM cortes c
       WHERE c.activo = 1
         AND c.giro_id = (SELECT id FROM business_types WHERE slug = ?)`
    ).all(giro.slug).map(r => r.slug)
  );

  for (const { producto_slug, disponible } of miDisp) {
    const activoAntiguo = cortesActivos.has(producto_slug);
    const activoNuevo = disponible === 1;
    if (activoAntiguo !== activoNuevo) {
      // Esta diferencia es esperada: menu_items puede tener disponibilidad más granular
      difs.push(_dif("ESPERADA", "disponibilidad",
        `${producto_slug}:${activoAntiguo ? "activo" : "inactivo"}`,
        `${producto_slug}:${activoNuevo ? "disponible" : "agotado"}`,
        `diferencia granular esperada entre cortes.activo y menu_items.disponible`));
    }
  }
}

function _compararTotalPedidoRef(db, giro, difs) {
  // Pedido de referencia: 3 tacos de surtido
  // Compara el total calculado por la ruta legacy vs. la ruta neutral
  try {
    const { getPrecios, calcularPrecioItem } = require("../pedido/precios");
    const { getContratoGiro } = require("../giros");

    const precios = getPrecios();
    const pLegacy = calcularPrecioItem({ presentacion: "taco", corte: "surtido", cantidad: 3 }, precios);

    const contrato = getContratoGiro(giro.slug);
    const partida = {
      tipo: "producto", formatoSlug: "taco", productoSlug: "surtido",
      cantidad: { tipo: "unidad", valor: 3 }, combinacion: [], extras: [], metadata: {},
    };
    const pNeutral = contrato.calcularPrecioPartida(partida);

    if (pLegacy !== pNeutral) {
      difs.push(_dif("ERROR_MIGRACION", "total_pedido_referencia",
        `legacy=$${pLegacy}`, `neutral=$${pNeutral}`,
        `total para '3 tacos de surtido' no coincide — diferencia monetaria bloqueante`));
    }
  } catch (err) {
    difs.push(_dif("ERROR_GIRO", "total_pedido_referencia", null, null,
      `Error al calcular total de referencia: ${err.message}`));
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function _dif(tipo, dimension, valorAntiguo, valorNuevo, descripcion) {
  return { tipo, dimension, valorAntiguo, valorNuevo, descripcion };
}

function _leerConfig(db, clave) {
  try {
    return db.prepare("SELECT valor FROM configuracion WHERE clave = ?").get(clave)?.valor ?? null;
  } catch (_) { return null; }
}

/** Filtra diferencias por tipo. */
function filtrarPor(diferencias, tipo) {
  return diferencias.filter(d => d.tipo === tipo);
}

/** Retorna true si existen diferencias monetarias bloqueantes. */
function esBloqueante(diferencias) {
  return diferencias.some(d => d.tipo === "ERROR_MIGRACION");
}

module.exports = { comparar, filtrarPor, esBloqueante, TIPOS_DIFERENCIA };
