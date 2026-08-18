'use strict';

const { CONTEXTO, PERMISO } = require('../tipos');
const { getPedidosHoy, getConfig } = require('../../../db');
const { pendientesConfirmacion }   = require('../../../estado');

// ── Helpers compartidos de formato ────────────────────────────────────────────

function _formatearPedido(p, i) {
  const tipoIcon = p.tipo === 'domicilio' ? '🛵' : '🏪';
  const nombre   = [p.nombre, p.apellido].filter(Boolean).join(' ') || 'Sin nombre';
  const total    = p.total ? `$${Math.round(p.total)}` : '—';
  const hora     = p.fecha ? p.fecha.split(' ')[1]?.substring(0, 5) : '—';
  return `${i}. *${nombre}* — ${p.telefono || '—'}\n   ${tipoIcon} ${p.tipo || '—'} | 💰 ${total} | 🕐 ${hora}\n`;
}

function _filtrarPedidos(estado) {
  return getPedidosHoy().filter(p => p.estado === estado);
}

const ICON_ESTADO = Object.freeze({
  pendiente:  '🟡', confirmado: '✅', cancelado: '❌',
  rechazado:  '⛔', listo: '🏪', en_camino: '🛵',
});

// ── Comandos ──────────────────────────────────────────────────────────────────

/** @type {import('../registro').DefinicionComando[]} */
module.exports = [
  {
    patron:   /^!pedidos$/i,
    nombre:   'pedidos',
    contexto: CONTEXTO.GRUPO,
    permisos: PERMISO.CUALQUIERA,
    giro:     null,
    ayuda:    '!pedidos — todos los pedidos del día con su estado',
    async ejecutar({ msg }) {
      const todos = getPedidosHoy();
      if (!todos.length) { await msg.reply('📋 No hay pedidos registrados hoy.'); return; }

      const porEstado = {
        pendiente:  todos.filter(p => p.estado === 'pendiente'),
        confirmado: todos.filter(p => p.estado === 'confirmado'),
        cancelado:  todos.filter(p => p.estado === 'cancelado'),
        rechazado:  todos.filter(p => p.estado === 'rechazado'),
      };
      const negocio = getConfig('nombre_negocio') || 'el negocio';
      let out = `📊 *PEDIDOS DEL DÍA — ${negocio.toUpperCase()}*\n━━━━━━━━━━━━━━━━━━\n`;
      out += `🟡 Pendientes: ${porEstado.pendiente.length}   `;
      out += `✅ Confirmados: ${porEstado.confirmado.length}\n`;
      out += `❌ Cancelados: ${porEstado.cancelado.length}   `;
      out += `⛔ Rechazados: ${porEstado.rechazado.length}\n`;
      out += `━━━━━━━━━━━━━━━━━━\n`;
      out += `📦 *Total: ${todos.length} pedido${todos.length !== 1 ? 's' : ''}*\n\n`;

      let i = 1;
      for (const p of todos) {
        const nombre   = [p.nombre, p.apellido].filter(Boolean).join(' ') || 'Sin nombre';
        const tipoIcon = p.tipo === 'domicilio' ? '🛵' : '🏪';
        const total    = p.total ? `$${Math.round(p.total)}` : '—';
        const hora     = p.fecha ? p.fecha.split(' ')[1]?.substring(0, 5) : '—';
        out += `${ICON_ESTADO[p.estado] || '⚪'} ${i}. *${nombre}*\n`;
        out += `   📱 ${p.telefono || '—'} | ${tipoIcon} ${p.tipo || '—'}\n`;
        out += `   💰 ${total} | 🕐 ${hora}\n\n`;
        i++;
      }
      await msg.reply(out.trim());
    },
  },

  {
    patron:   /^!confirmados$/i,
    nombre:   'confirmados',
    contexto: CONTEXTO.GRUPO,
    permisos: PERMISO.CUALQUIERA,
    giro:     null,
    ayuda:    '!confirmados — pedidos confirmados hoy',
    async ejecutar({ msg }) {
      const lista = _filtrarPedidos('confirmado');
      if (!lista.length) { await msg.reply('✅ No hay pedidos confirmados hoy.'); return; }
      let out = `✅ *Pedidos confirmados hoy (${lista.length}):*\n━━━━━━━━━━━━━━━━━━\n`;
      lista.forEach((p, i) => { out += _formatearPedido(p, i + 1); });
      await msg.reply(out.trim());
    },
  },

  {
    patron:   /^!pendientes$/i,
    nombre:   'pendientes',
    contexto: CONTEXTO.GRUPO,
    permisos: PERMISO.CUALQUIERA,
    giro:     null,
    ayuda:    '!pendientes — pedidos esperando confirmación',
    async ejecutar({ msg }) {
      const enBD      = _filtrarPedidos('pendiente');
      const enMemoria = [...pendientesConfirmacion.values()];

      if (!enBD.length && !enMemoria.length) {
        await msg.reply('🟡 No hay pedidos pendientes de confirmación.'); return;
      }

      let out = `🟡 *Pedidos pendientes de confirmación (${enBD.length + enMemoria.length}):*\n━━━━━━━━━━━━━━━━━━\n`;
      enBD.forEach((p, i) => { out += _formatearPedido(p, i + 1); });
      enMemoria.forEach((datos, i) => {
        const tipoIcon = datos.tipo === 'domicilio' ? '🛵' : '🏪';
        out += `${enBD.length + i + 1}. *${datos.nombre || '—'}* — ${datos.telefono || '—'}\n`;
        out += `   ${tipoIcon} ${datos.tipo || '—'} | 💰 ${datos.total || '—'}\n`;
        out += `   Usa: !confirmar ${datos.telefono}\n\n`;
      });
      await msg.reply(out.trim());
    },
  },

  {
    patron:   /^!cancelados$/i,
    nombre:   'cancelados',
    contexto: CONTEXTO.GRUPO,
    permisos: PERMISO.CUALQUIERA,
    giro:     null,
    ayuda:    '!cancelados — pedidos cancelados hoy',
    async ejecutar({ msg }) {
      const lista = _filtrarPedidos('cancelado');
      if (!lista.length) { await msg.reply('❌ No hay pedidos cancelados hoy.'); return; }
      let out = `❌ *Pedidos cancelados hoy (${lista.length}):*\n━━━━━━━━━━━━━━━━━━\n`;
      lista.forEach((p, i) => { out += _formatearPedido(p, i + 1); });
      await msg.reply(out.trim());
    },
  },

  {
    patron:   /^!rechazados$/i,
    nombre:   'rechazados',
    contexto: CONTEXTO.GRUPO,
    permisos: PERMISO.CUALQUIERA,
    giro:     null,
    ayuda:    '!rechazados — pedidos rechazados hoy',
    async ejecutar({ msg }) {
      const lista = _filtrarPedidos('rechazado');
      if (!lista.length) { await msg.reply('⛔ No hay pedidos rechazados hoy.'); return; }
      let out = `⛔ *Pedidos rechazados hoy (${lista.length}):*\n━━━━━━━━━━━━━━━━━━\n`;
      lista.forEach((p, i) => { out += _formatearPedido(p, i + 1); });
      await msg.reply(out.trim());
    },
  },

  {
    patron:   /^!domicilios$/i,
    nombre:   'domicilios',
    contexto: CONTEXTO.GRUPO,
    permisos: PERMISO.CUALQUIERA,
    giro:     null,
    ayuda:    '!domicilios — solo pedidos a domicilio del día',
    async ejecutar({ msg }) {
      const lista = getPedidosHoy().filter(p => p.tipo === 'domicilio');
      if (!lista.length) { await msg.reply('🛵 No hay pedidos a domicilio hoy.'); return; }
      let out = `🛵 *Domicilios hoy (${lista.length}):*\n━━━━━━━━━━━━━━━━━━\n`;
      lista.forEach((p, i) => {
        const nombre = [p.nombre, p.apellido].filter(Boolean).join(' ') || 'Sin nombre';
        const total  = p.total ? `$${Math.round(p.total)}` : '—';
        const hora   = p.fecha ? p.fecha.split(' ')[1]?.substring(0, 5) : '—';
        out += `${ICON_ESTADO[p.estado] || '⚪'} ${i + 1}. *${nombre}* — ${p.telefono || '—'}\n`;
        out += `   💰 ${total} | 🕐 ${hora}\n\n`;
      });
      await msg.reply(out.trim());
    },
  },

  {
    patron:   /^!mostradores$/i,
    nombre:   'mostradores',
    contexto: CONTEXTO.GRUPO,
    permisos: PERMISO.CUALQUIERA,
    giro:     null,
    ayuda:    '!mostradores — solo pedidos de mostrador del día',
    async ejecutar({ msg }) {
      const lista = getPedidosHoy().filter(p => p.tipo === 'mostrador');
      if (!lista.length) { await msg.reply('🏪 No hay pedidos de mostrador hoy.'); return; }
      let out = `🏪 *Mostradores hoy (${lista.length}):*\n━━━━━━━━━━━━━━━━━━\n`;
      lista.forEach((p, i) => {
        const nombre = [p.nombre, p.apellido].filter(Boolean).join(' ') || 'Sin nombre';
        const total  = p.total ? `$${Math.round(p.total)}` : '—';
        const hora   = p.fecha ? p.fecha.split(' ')[1]?.substring(0, 5) : '—';
        out += `${ICON_ESTADO[p.estado] || '⚪'} ${i + 1}. *${nombre}* — ${p.telefono || '—'}\n`;
        out += `   💰 ${total} | 🕐 ${hora}\n\n`;
      });
      await msg.reply(out.trim());
    },
  },

  {
    patron:   /^!pedido\b/i,
    nombre:   'pedido',
    contexto: CONTEXTO.GRUPO,
    permisos: PERMISO.CUALQUIERA,
    giro:     null,
    ayuda:    '!pedido [tel] — detalle completo de un pedido del día',
    async ejecutar({ msg, args }) {
      const { getCliente } = require('../../../db');
      const telRaw = args[0] ? args[0].replace(/\D/g, '') : null;
      if (!telRaw) { await msg.reply('⚠️ Uso: *!pedido [teléfono]*\nEjemplo: !pedido 3312345678'); return; }

      const cliente   = getCliente(telRaw);
      const pedidoHoy = getPedidosHoy().find(p => p.telefono === telRaw);
      if (!pedidoHoy) { await msg.reply(`⚠️ No encontré ningún pedido hoy para *${telRaw}*.`); return; }

      const nombre = [pedidoHoy.nombre, pedidoHoy.apellido].filter(Boolean).join(' ') || 'Sin nombre';
      const hora   = pedidoHoy.fecha ? pedidoHoy.fecha.split(' ')[1]?.substring(0, 5) : '—';
      const total  = pedidoHoy.total ? `$${Math.round(pedidoHoy.total)}` : '—';

      let out = `📋 *Pedido de ${nombre}*\n━━━━━━━━━━━━━━━━━━\n`;
      out += `${pedidoHoy.tipo === 'domicilio' ? '🛵 Domicilio' : '🏪 Mostrador'} | 🕐 ${hora}\n`;
      if (pedidoHoy.tipo === 'domicilio' && cliente) {
        if (cliente.calle_numero) out += `📍 ${cliente.calle_numero}${cliente.colonia ? ', ' + cliente.colonia : ''}\n`;
        if (cliente.referencia)   out += `   Ref: ${cliente.referencia}\n`;
      }
      if (pedidoHoy.hora_entrega) out += `⏰ Entrega: ${pedidoHoy.hora_entrega}\n`;
      if (pedidoHoy.metodo_pago)  out += `💳 ${pedidoHoy.metodo_pago} | `;
      out += `💰 ${total}\n`;
      if (pedidoHoy.orden) out += `\n🥩 *Orden:*\n${pedidoHoy.orden}\n`;
      out += `\nEstado: ${ICON_ESTADO[pedidoHoy.estado] || '⚪'} ${pedidoHoy.estado}`;
      await msg.reply(out);
    },
  },
];
