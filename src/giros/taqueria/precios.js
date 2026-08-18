'use strict';

/**
 * Resolver de precios específico del giro Taquería.
 *
 * Encapsula las reglas de negocio propias de la taquería:
 *   - pTaco / pTorta / p100g como base configurable por tenant
 *   - Precios específicos por corte y formato (menu_items)
 *   - Precios dinámicos para quesadilla, vampiro, burrito, etc.
 *   - Combinaciones ("surtido especial") al precio del corte más caro
 *
 * Convive con calcularPrecioItem() de src/pedido/precios.js — ese módulo
 * sigue siendo el que usan los handlers hasta la Fase 8.
 */

const catalogoTenant = require('../catalogo-tenant');
const legacyPrecios  = require('../../pedido/precios');

/**
 * Crea el resolver de precios para el giro Taquería.
 * Se llama de forma diferida (tras la inicialización de la BD).
 *
 * @returns {function} resolver(formatoSlug, productoSlug, combinacion?) → precio unitario
 */
function crearResolver() {
  return function resolver(formatoSlug, productoSlug, combinacion = []) {
    // Combinación (varios cortes) → precio del componente más caro
    if (Array.isArray(combinacion) && combinacion.length > 0) {
      const preciosComb = combinacion.map(slug => _precioUnitario(formatoSlug, slug));
      return Math.max(0, ...preciosComb);
    }
    return _precioUnitario(formatoSlug, productoSlug);
  };
}

/**
 * Precio unitario de un formato+producto específico, con cadena de fallbacks:
 * 1. menu_items del tenant (precio exacto configurado en el panel)
 * 2. porCorte del getPrecios() heredado (por slug o nombre)
 * 3. Precio global del formato (pTaco / pTorta / p100g)
 * 4. precio_base del item_type en BD
 */
function _precioUnitario(formatoSlug, productoSlug) {
  // 1. Precio exacto desde menu_items (más específico — lo que el tenant configuró)
  if (productoSlug) {
    const precioMenu = catalogoTenant.getPrecioMenu(productoSlug, formatoSlug, 'corte');
    if (precioMenu != null && precioMenu > 0) return precioMenu;
  }

  // 2. Precios globales del tenant (legacy getPrecios)
  const { pTaco, pTorta, p100g, porCorte } = legacyPrecios.getPrecios();
  const pc = (productoSlug && porCorte && porCorte[productoSlug]) || {};

  switch (formatoSlug) {
    case 'taco':      return pc.pTaco  || pTaco;
    case 'torta':     return pc.pTorta || pTorta;
    case 'gramos':    return pc.p100g  || p100g;
    default: {
      // Formato dinámico (quesadilla, vampiro, burrito, etc.)
      if (pc.precios && pc.precios[formatoSlug] !== undefined) return pc.precios[formatoSlug];
      // Desde item_type: precio_base o precio_campo equivalente
      try {
        const { getItemTypeBySlug } = require('../../db');
        const it = getItemTypeBySlug(formatoSlug);
        if (it) {
          if (it.precio_base) return it.precio_base;
          return it.precio_campo === 'precio_torta' ? pTorta : pTaco;
        }
      } catch (_) {}
      return pTaco;
    }
  }
}

module.exports = { crearResolver };
