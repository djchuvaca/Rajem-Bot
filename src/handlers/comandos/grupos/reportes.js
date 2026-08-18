'use strict';

const { CONTEXTO, PERMISO } = require('../tipos');
const { getPedidosHoy, getPedidosPorFecha, getConfig } = require('../../../db');
const catalogoTenant = require('../../../giros/catalogo-tenant');

function _cortesActivos() {
  const slugs = new Set(catalogoTenant.getMenuItemsActivos('corte').map(i => i.producto_slug));
  return catalogoTenant.getCortesTenant()
    .filter(c => slugs.has(c.slug))
    .map(c => c.nombre.toLowerCase());
}

function _contarCortes(pedidos, cortes) {
  const conteo = {};
  for (const p of pedidos) {
    const orden = (p.orden || '').toLowerCase();
    for (const c of cortes) if (orden.includes(c)) conteo[c] = (conteo[c] || 0) + 1;
  }
  return Object.entries(conteo).sort((a, b) => b[1] - a[1]);
}

/** @type {import('../registro').DefinicionComando[]} */
module.exports = [
  {
    patron:   /^!stats$/i,
    nombre:   'stats',
    contexto: CONTEXTO.GRUPO,
    permisos: PERMISO.CUALQUIERA,
    giro:     null,
    ayuda:    '!stats — resumen del día: pedidos, ventas, top cortes',
    async ejecutar({ msg }) {
      const pedidos     = getPedidosHoy();
      const confirmados = pedidos.filter(p => ['confirmado', 'listo', 'en_camino'].includes(p.estado));
      const pendientes  = pedidos.filter(p => p.estado === 'pendiente');
      const cancelados  = pedidos.filter(p => p.estado === 'cancelado');
      const rechazados  = pedidos.filter(p => p.estado === 'rechazado');

      const totalVentas = confirmados.reduce((s, p) => s + (p.total || 0), 0);
      const ticket      = confirmados.length ? Math.round(totalVentas / confirmados.length) : 0;
      const negocio     = getConfig('nombre_negocio') || 'el negocio';
      const ranking     = _contarCortes(pedidos, _cortesActivos());
      const fecha       = new Date().toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });

      let out = `📊 *RESUMEN DEL DÍA — ${negocio}*\n_${fecha}_\n━━━━━━━━━━━━━━━━━━\n`;
      out += `📦 Total pedidos:  *${pedidos.length}*\n`;
      out += `✅ Confirmados:    *${confirmados.length}*\n`;
      out += `🟡 Pendientes:     *${pendientes.length}*\n`;
      if (cancelados.length) out += `❌ Cancelados:    *${cancelados.length}*\n`;
      if (rechazados.length) out += `⛔ Rechazados:    *${rechazados.length}*\n`;
      out += `\n💰 Ventas:        *$${Math.round(totalVentas)}*\n`;
      if (ticket) out += `🎫 Ticket prom:   *$${ticket}*\n`;
      if (ranking.length) {
        out += `\n🥩 *Top cortes:*\n`;
        for (const [corte, n] of ranking)
          out += `   ${corte} — ${n} pedido${n !== 1 ? 's' : ''}\n`;
      }
      out += '━━━━━━━━━━━━━━━━━━';
      await msg.reply(out);
    },
  },

  {
    patron:   /^!reporte\b/i,
    nombre:   'reporte',
    contexto: CONTEXTO.GRUPO,
    permisos: PERMISO.CUALQUIERA,
    giro:     null,
    ayuda:    '!reporte [ayer|semana|mes] — resumen de un periodo anterior',
    async ejecutar({ msg, args }) {
      const periodo = (args[0] || 'ayer').toLowerCase();
      const hoy = new Date();
      let fechaInicio, fechaFin, label;

      if (periodo === 'semana') {
        const hace7 = new Date(hoy); hace7.setDate(hoy.getDate() - 7);
        fechaInicio = hace7.toISOString().split('T')[0];
        fechaFin    = hoy.toISOString().split('T')[0];
        label       = 'últimos 7 días';
      } else if (periodo === 'mes') {
        const primero = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
        fechaInicio = primero.toISOString().split('T')[0];
        fechaFin    = hoy.toISOString().split('T')[0];
        label       = `${hoy.toLocaleString('es-MX', { month: 'long' })} ${hoy.getFullYear()}`;
      } else {
        const ayer = new Date(hoy); ayer.setDate(hoy.getDate() - 1);
        fechaInicio = ayer.toISOString().split('T')[0];
        fechaFin    = ayer.toISOString().split('T')[0];
        label       = 'ayer';
      }

      const pedidos = getPedidosPorFecha(fechaInicio, fechaFin);
      if (!pedidos.length) { await msg.reply(`📊 No hay pedidos registrados para *${label}*.`); return; }

      const confirmados = pedidos.filter(p => ['confirmado', 'listo', 'en_camino'].includes(p.estado));
      const cancelados  = pedidos.filter(p => ['cancelado', 'rechazado'].includes(p.estado));
      const totalVentas = confirmados.reduce((s, p) => s + (p.total || 0), 0);
      const ticket      = confirmados.length ? Math.round(totalVentas / confirmados.length) : 0;
      const ranking     = _contarCortes(pedidos, _cortesActivos());

      let out = `📊 *REPORTE — ${label.toUpperCase()}*\n━━━━━━━━━━━━━━━━━━\n`;
      out += `📦 Total pedidos:  *${pedidos.length}*\n`;
      out += `✅ Confirmados:    *${confirmados.length}*\n`;
      if (cancelados.length) out += `❌ Cancelados:    *${cancelados.length}*\n`;
      out += `\n💰 Ventas:        *$${Math.round(totalVentas)}*\n`;
      if (ticket) out += `🎫 Ticket prom:   *$${ticket}*\n`;
      if (ranking.length) {
        out += `\n🥩 *Top cortes:*\n`;
        for (const [corte, n] of ranking)
          out += `   ${corte} — ${n} pedido${n !== 1 ? 's' : ''}\n`;
      }
      out += '━━━━━━━━━━━━━━━━━━';
      await msg.reply(out);
    },
  },

  {
    patron:   /^!ingresos$/i,
    nombre:   'ingresos',
    contexto: CONTEXTO.GRUPO,
    permisos: PERMISO.CUALQUIERA,
    giro:     null,
    ayuda:    '!ingresos — resumen financiero del día (ventas, ticket, método de pago)',
    async ejecutar({ msg }) {
      const pedidos    = getPedidosHoy();
      const negocio    = getConfig('nombre_negocio') || 'el negocio';
      const fecha      = new Date().toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });
      const confirmados = pedidos.filter(p => ['confirmado', 'listo', 'en_camino'].includes(p.estado));
      const pendientes  = pedidos.filter(p => p.estado === 'pendiente');
      const domicilios  = confirmados.filter(p => p.tipo === 'domicilio');
      const mostradores = confirmados.filter(p => p.tipo === 'mostrador');

      const ventas     = confirmados.reduce((s, p) => s + (p.total || 0), 0);
      const ventasDom  = domicilios.reduce((s, p) => s + (p.total || 0), 0);
      const ventasMos  = mostradores.reduce((s, p) => s + (p.total || 0), 0);
      const ticket     = confirmados.length ? Math.round(ventas / confirmados.length) : 0;
      const ventasPend = pendientes.reduce((s, p) => s + (p.total || 0), 0);

      const metodos = {};
      for (const p of confirmados) {
        const m = (p.metodo_pago || 'otro').toLowerCase();
        metodos[m] = (metodos[m] || 0) + (p.total || 0);
      }

      let out = `💰 *INGRESOS DEL DÍA — ${negocio}*\n_${fecha}_\n━━━━━━━━━━━━━━━━━━\n`;
      out += `💵 Total cobrado:   *$${Math.round(ventas)}*\n`;
      if (ticket) out += `🎫 Ticket promedio:  *$${ticket}*\n`;
      out += `\n🛵 Domicilio:  *${domicilios.length} pedidos — $${Math.round(ventasDom)}*\n`;
      out += `🏪 Mostrador:  *${mostradores.length} pedidos — $${Math.round(ventasMos)}*\n`;
      if (Object.keys(metodos).length) {
        out += `\n💳 *Por método de pago:*\n`;
        for (const [m, monto] of Object.entries(metodos).sort((a, b) => b[1] - a[1]))
          out += `   ${m}: $${Math.round(monto)}\n`;
      }
      if (ventasPend > 0)
        out += `\n⏳ En espera (${pendientes.length} pendiente${pendientes.length !== 1 ? 's' : ''}): *$${Math.round(ventasPend)}*\n`;
      out += '━━━━━━━━━━━━━━━━━━';
      await msg.reply(out);
    },
  },
];
