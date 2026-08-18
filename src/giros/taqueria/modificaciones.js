'use strict';

/**
 * Detección de modificaciones específica del giro Taquería.
 *
 * Recibe texto libre del cliente y devuelve una operación neutral
 * (src/giros/modificaciones.js) lista para aplicarse sobre el modelo neutral
 * de pedido, sin que los handlers tengan que re-interpretar palabras.
 *
 * Usa inyección de dependencias para evitar ciclos con nlu.js.
 * El caller (nlu.js) pasa: normalizar, textoANumero, getCortes,
 * buscarCorteFuzzy, detectarTipoItemDesdeTexto.
 */

const { crearOperacion } = require('../modificaciones');

// ── Patrones (mismos que nlu.js, duplicados para evitar dependencia circular) ─

const PATRON_ELIMINAR_PARTIDA = /\bquita(?:me|le)?\s+(?:(?:los?|las?)\s+)?(\d+)\s+(\w+)(?:\s+de\s+(\w+))?\b/i;

const PATRON_QUITAR_UNO = /quita(?:me|le)?\s+(?:uno|un[ao]?\s+(?:taco|torta))(?:\s+(?:de(?:\s+(?:los?|las?))?\s+)?(\w+))?|quita(?:me|le)?\s+(?:el|la|los|las)(?:\s+de)?\s+(\w+)|b[aá]ja(?:le|me)?\s+uno|saca\s+uno|uno\s+menos(?:\s+(?:de\s+)?(\w+))?|menos\s+uno(?:\s+(?:de\s+)?(\w+))?|un\s+(?:taco|torta)\s+menos(?:\s+(?:de\s+)?(\w+))?|reduce\s+uno/i;

const PATRON_AGREGAR_MAS = /agrega(?:le|me)?\s+(?:otros?|m[aá]s)\s+(\d+)(?:\s+(?:de\s+)?(\w+))?|(\d+)\s+m[aá]s(?:\s+(?:de\s+)?(\w+))?|(?:ponme|s[úu]mame|a[ñn]ade(?:me)?)\s+(?:(?:otros?|m[aá]s)\s+)?(\d+)(?:\s+(?:de\s+)?(\w+))?|tambi[eé]n\s+(?:quiero|quieres?|pide|agrega|manda)\s+(\d+)(?:\s+(?:de\s+)?(\w+))?/i;

const PATRON_CAMBIAR_CORTE = /cambia(?:me|le)?\s+(?:el|la|los|las)?\s*(\w+)\s+(?:por|a)\s+(\w+)|(?:sin|quita)\s+(\w+)\s+(?:y\s+)?(?:pon|agrega)\s+(\w+)|en\s+(?:lugar|vez)\s+de\s+(?:(?:el|la|los|las)\s+)?(\w+)\s+(?:ponme|quiero|dame|pon)\s+(\w+)|mejor\s+(\w+)\s+(?:que|en\s+lugar\s+de)\s+(?:(?:el|la|los|las)\s+)?(\w+)/i;

// ── Detección ─────────────────────────────────────────────────────────────────

/**
 * Convierte texto del cliente en una operación neutral de modificación.
 *
 * @param {string} texto
 * @param {{ normalizar, textoANumero, getCortes, buscarCorteFuzzy, detectarTipoItemDesdeTexto }} deps
 * @returns {object|null}
 */
function detectarModificacionNeutral(texto, deps) {
  const { normalizar, textoANumero, getCortes, buscarCorteFuzzy, detectarTipoItemDesdeTexto } = deps;
  const t    = normalizar(texto);
  const tNum = normalizar(textoANumero(t));
  const cortes = getCortes();

  // 1. eliminar_partida — "quita los 3 tacos de surtido" (más específico, va primero)
  const mElim = tNum.match(PATRON_ELIMINAR_PARTIDA);
  if (mElim) {
    const cantidad   = parseInt(mElim[1]);
    const rawFmt     = normalizar(mElim[2] || '');
    const rawProd    = normalizar(mElim[3] || '');
    const tipoItem   = detectarTipoItemDesdeTexto(rawFmt);
    if (tipoItem) {
      const productoSlug = rawProd ? (cortes[rawProd] || buscarCorteFuzzy(rawProd) || null) : null;
      return crearOperacion('eliminar_partida', {
        selector: { formatoSlug: tipoItem.slug, productoSlug, cantidad },
      });
    }
  }

  // 2. reducir_cantidad — "quítame uno" / "bájale uno" / "un taco menos de surtido"
  if (PATRON_QUITAR_UNO.test(t)) {
    const mQ      = t.match(PATRON_QUITAR_UNO);
    const corteRaw = (mQ[1] || mQ[2] || mQ[3] || mQ[4] || mQ[5] || '').toLowerCase().trim();
    const productoSlug = corteRaw ? (cortes[corteRaw] || buscarCorteFuzzy(corteRaw) || null) : null;
    return crearOperacion('reducir_cantidad', {
      cantidad: 1,
      selector: { formatoSlug: null, productoSlug },
    });
  }

  // 3. agregar_item — "agrega 2 más de buche"
  if (PATRON_AGREGAR_MAS.test(tNum)) {
    const m        = tNum.match(PATRON_AGREGAR_MAS);
    const cantidad = parseInt(m[1] || m[3] || m[5] || m[7] || '1');
    const corteRaw = (m[2] || m[4] || m[6] || m[8] || '').toLowerCase();
    const productoSlug = corteRaw ? (cortes[corteRaw] || buscarCorteFuzzy(corteRaw) || null) : null;
    return crearOperacion('agregar_item', {
      item: { productoSlug, cantidad: { tipo: 'unidad', valor: cantidad } },
    });
  }

  // 4. cambiar_variante / cambiar_formato — mismos patrones, distinguidos por qué son rawDe/rawA
  if (PATRON_CAMBIAR_CORTE.test(t)) {
    const m      = t.match(PATRON_CAMBIAR_CORTE);
    const rawDe  = normalizar(m[1] || m[3] || m[5] || m[8] || '');
    const rawA   = normalizar(m[2] || m[4] || m[6] || m[7] || '');
    if (!rawDe || !rawA) return null;

    // Ambos son variantes (cortes) → cambiar_variante
    const deCorte = cortes[rawDe] || buscarCorteFuzzy(rawDe);
    const aCorte  = cortes[rawA]  || buscarCorteFuzzy(rawA);
    if (deCorte && aCorte) {
      return crearOperacion('cambiar_variante', { de: deCorte, a: aCorte });
    }

    // Ambos son presentaciones (item types) → cambiar_formato
    const deFmt = detectarTipoItemDesdeTexto(rawDe);
    const aFmt  = detectarTipoItemDesdeTexto(rawA);
    if (deFmt && aFmt && deFmt.slug !== aFmt.slug) {
      return crearOperacion('cambiar_formato', { de: deFmt.slug, a: aFmt.slug });
    }
  }

  return null;
}

module.exports = { detectarModificacionNeutral };
