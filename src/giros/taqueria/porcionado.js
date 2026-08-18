'use strict';

/** Lógica exclusiva de Taquería para dividir productos en platos. */

const RE_IGUAL = /\bde\s+(\d+|un[ao]?)\s+en\s+(\d+|un[ao]?)\b|\bde\s+a\s+(\d+|un[ao]?)\b|\ben\s+platos?\s+de\s+(\d+|un[ao]?)\b/i;
const NUMEROS = Object.freeze({ un: 1, una: 1, uno: 1 });

function _numero(valor) {
  if (valor == null) return null;
  return Number.parseInt(valor, 10) || NUMEROS[String(valor).toLowerCase()] || null;
}

function detectarPlanPorcionado(texto) {
  const match = String(texto || '').match(RE_IGUAL);
  if (!match) return null;
  const primero = _numero(match[1]);
  const segundo = _numero(match[2]);
  const porGrupo = primero || _numero(match[3]) || _numero(match[4]);
  if (!porGrupo || (primero && segundo && primero !== segundo)) return null;
  return { tipo: 'grupos_iguales', porGrupo, expresion: match[0], indice: match.index };
}

function _plural(item) {
  const mapa = { taco: 'tacos', torta: 'tortas', quesadilla: 'quesadillas', burrito: 'burritos' };
  return mapa[item.presentacion] || `${item.presentacion}s`;
}

function _crearPlatos(item, porGrupo, aplicarSurtidoEspecial) {
  const total = Number(item.cantidad);
  if (!total || total % porGrupo !== 0) {
    return {
      tipo: 'error_porcionado',
      mensaje: `Pediste *${total} ${_plural(item)}* pero ${total} no se divide en grupos exactos de ${porGrupo}. ¿Cómo los divido?`,
    };
  }
  const { _porcionado, ...itemLimpio } = item;
  return Array.from({ length: total / porGrupo }, (_, indice) => ({
    presentacion: 'plato_separado',
    numero: indice + 1,
    items: [aplicarSurtidoEspecial({ ...itemLimpio, cantidad: porGrupo })],
  }));
}

/**
 * Parsea la familia "de N en N". Se elimina la expresión ANTES de dividir
 * ítems para que el separador genérico no interprete "1 en 1" como producto.
 */
function parsearPorcionadoIgual(texto, deps) {
  const plan = detectarPlanPorcionado(texto);
  if (!plan) return null;
  const textoBase = String(texto).replace(plan.expresion, '').replace(/[\s,;:]+$/, '').trim();
  // Reutilizar el parser completo del Giro una vez retirada la instrucción de
  // porcionado. La recursión termina aquí porque textoBase ya no contiene el
  // patrón; además conserva correctamente pedidos mixtos y formatos dinámicos.
  if (typeof deps.parsearPedidoBase === 'function') {
    const pedidoBase = deps.parsearPedidoBase(textoBase);
    if (!pedidoBase || pedidoBase.tipo !== 'pedido' || !pedidoBase.items?.length) return null;
    const itemsBase = pedidoBase.items.map(item => ({ ...item }));
    const objetivo = itemsBase.pop();
    if (!objetivo.cantidad || !objetivo.corte) return null;
    const platos = _crearPlatos(objetivo, plan.porGrupo, deps.aplicarSurtidoEspecial);
    if (!Array.isArray(platos)) return platos;
    return { tipo: 'pedido', items: [...itemsBase, ...platos] };
  }
  const partes = deps.dividirEnItems(textoBase);
  const items = [];
  for (const parte of partes) {
    if (deps.esRelleno(parte)) continue;
    for (const sub of deps.subDividir(parte)) {
      const item = deps.parsearItem(sub.trim());
      if (!item || item._sinCorte) return null;
      items.push(deps.aplicarSurtidoEspecial({ ...item }));
    }
  }
  if (!items.length) return null;
  const objetivo = items.pop();
  if (!objetivo.cantidad) return null;
  const platos = _crearPlatos(objetivo, plan.porGrupo, deps.aplicarSurtidoEspecial);
  if (!Array.isArray(platos)) return platos;
  return { tipo: 'pedido', items: [...items, ...platos] };
}

/** Resuelve una respuesta mientras el flujo espera el corte/variante. */
function resolverPorcionadoPendiente(item, texto, deps) {
  if (!item || !item.cantidad) return null;
  const planTexto = detectarPlanPorcionado(texto);
  const plan = planTexto || item._porcionado || null;

  if (plan) {
    const corte = deps.extraerCorte(String(texto).replace(planTexto?.expresion || '', '').trim());
    if (!corte) return null;
    const platos = _crearPlatos({ ...item, corte }, plan.porGrupo, deps.aplicarSurtidoEspecial);
    return Array.isArray(platos) ? { items: platos } : { error: platos.mensaje };
  }

  const matchPlatos = String(texto).match(/\b(\d+|dos|tres|cuatro)\s+platos?\s*(?:iguales?|igual)?\b/i);
  if (matchPlatos) {
    const numeros = { dos: 2, tres: 3, cuatro: 4 };
    const grupos = _numero(matchPlatos[1]) || numeros[matchPlatos[1].toLowerCase()];
    const distribucion = deps.parsearDistribucion(String(texto).replace(matchPlatos[0], '').trim());
    if (grupos >= 2 && distribucion) {
      const totalGrupo = distribucion.reduce((suma, actual) => suma + actual.cantidad, 0);
      if (grupos * totalGrupo !== item.cantidad) {
        return { error: `Pediste *${item.cantidad} ${_plural(item)}* pero la distribución indicada suma *${grupos * totalGrupo}*. ¿Cómo los divido?` };
      }
      return { items: [{
        presentacion: 'grupo_repetido',
        grupos,
        items_por_grupo: distribucion.map(d => ({ presentacion: item.presentacion, cantidad: d.cantidad, corte: d.corte })),
      }] };
    }
  }

  const distribucion = deps.parsearDistribucion(texto);
  if (!distribucion) return null;
  const total = distribucion.reduce((suma, actual) => suma + actual.cantidad, 0);
  if (total !== item.cantidad) {
    return { error: `Quieres *${item.cantidad} ${_plural(item)}* pero lo que escribiste suma *${total}*. ¿Cómo los distribuyes?` };
  }
  const { _porcionado, ...itemLimpio } = item;
  return { items: distribucion.map(d => ({ ...itemLimpio, cantidad: d.cantidad, corte: d.corte })) };
}

module.exports = { RE_IGUAL, detectarPlanPorcionado, parsearPorcionadoIgual, resolverPorcionadoPendiente };
