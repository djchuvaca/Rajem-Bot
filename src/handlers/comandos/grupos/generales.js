'use strict';

const { CONTEXTO, PERMISO } = require('../tipos');
const botPausado             = require('../../../estado/bot-pausado');
const {
  datosCampos, resumenPendiente, esperandoConfirmacionItem,
  esperandoAgregarMas, esperandoCorte, esperandoTipoItem,
  esperandoCaptura, clientesNuevos,
} = require('../../../estado');
const { getConfig } = require('../../../db');

// ── Helpers locales ───────────────────────────────────────────────────────────

function _sesionesActivas() {
  return [datosCampos, resumenPendiente, esperandoConfirmacionItem,
    esperandoAgregarMas, esperandoCorte, esperandoTipoItem, esperandoCaptura]
    .reduce((acc, m) => acc + m.size, 0) + clientesNuevos.size;
}

// ── Comandos ──────────────────────────────────────────────────────────────────

/** @type {import('../registro').DefinicionComando[]} */
module.exports = [
  {
    patron:   /^!ayuda$/i,
    nombre:   'ayuda',
    contexto: CONTEXTO.GRUPO,
    permisos: PERMISO.CUALQUIERA,
    giro:     null,
    ayuda:    '!ayuda — lista todos los comandos disponibles',
    async ejecutar({ msg }) {
      const out =
        `🤖 *COMANDOS DISPONIBLES*\n━━━━━━━━━━━━━━━━━━\n` +
        `*Ver pedidos:*\n` +
        `!pedidos — todos los pedidos del día\n` +
        `!pendientes — esperando confirmación\n` +
        `!confirmados — pedidos confirmados\n` +
        `!domicilios — solo pedidos a domicilio\n` +
        `!mostradores — solo pedidos de mostrador\n` +
        `!cancelados / !rechazados\n\n` +
        `*Gestionar pedidos:*\n` +
        `!confirmar [tel] — confirmar pedido\n` +
        `!listo [tel] — avisar listo/en camino\n` +
        `!en_camino [id] — avisar en camino por ID de pedido\n` +
        `!cancelar [tel] — cancelar con aviso\n` +
        `!rechazar [tel] — rechazar pedido\n\n` +
        `*Clientes:*\n` +
        `!cliente [tel] — datos del cliente\n` +
        `!buscar [nombre] — buscar por nombre\n` +
        `!historial [tel] — historial de pedidos\n` +
        `!mensaje [tel] [texto] — mensaje directo\n\n` +
        `*Reportes:*\n` +
        `!stats — resumen del día\n` +
        `!ingresos — resumen financiero\n` +
        `!reporte ayer — resumen de ayer\n` +
        `!reporte semana — últimos 7 días\n\n` +
        `*Negocio:*\n` +
        `!cerrar — cerrar el negocio manualmente hoy\n` +
        `!abrir — reabrir el negocio\n` +
        `!top — top clientes por número de pedidos\n\n` +
        `*Bot:*\n` +
        `!jid — mostrar el identificador de este grupo\n` +
        `!pausar — pausar respuestas automáticas\n` +
        `!reanudar — reactivar el bot\n` +
        `!sesiones — ver sesiones activas de clientes\n` +
        `!resetear [tel] — limpiar sesión de un cliente\n` +
        `!limpiar — eliminar TODAS las sesiones activas\n` +
        `!estado — estado del bot (uptime, sesiones, etc.)\n` +
        `━━━━━━━━━━━━━━━━━━`;
      await msg.reply(out);
    },
  },

  {
    patron:   /^!pausar$/i,
    nombre:   'pausar',
    contexto: CONTEXTO.GRUPO,
    permisos: PERMISO.ADMIN,
    giro:     null,
    ayuda:    '!pausar — pausa las respuestas automáticas del bot',
    async ejecutar({ msg }) {
      botPausado.pausado = true;
      await msg.reply('⏸️ Bot en pausa. Los clientes no recibirán respuestas automáticas.\nUsa *!reanudar* para activarlo de nuevo.');
    },
  },

  {
    patron:   /^!reanudar$/i,
    nombre:   'reanudar',
    contexto: CONTEXTO.GRUPO,
    permisos: PERMISO.ADMIN,
    giro:     null,
    ayuda:    '!reanudar — reactiva el bot después de una pausa',
    async ejecutar({ msg }) {
      botPausado.pausado = false;
      await msg.reply('▶️ Bot reactivado. Volviendo a responder mensajes normalmente.');
    },
  },

  {
    patron:   /^!estado$/i,
    nombre:   'estado',
    contexto: CONTEXTO.GRUPO,
    permisos: PERMISO.CUALQUIERA,
    giro:     null,
    ayuda:    '!estado — estado del bot (uptime, sesiones, modo)',
    async ejecutar({ msg }) {
      const uptime    = process.uptime();
      const horas     = Math.floor(uptime / 3600);
      const minutos   = Math.floor((uptime % 3600) / 60);
      const uptimeStr = horas > 0 ? `${horas}h ${minutos}m` : `${minutos}m`;

      const cerradoManual = getConfig('cierre_manual') === '1';
      const negocio       = getConfig('nombre_negocio') || 'el negocio';

      let out = `🤖 *ESTADO — ${negocio}*\n━━━━━━━━━━━━━━━━━━\n`;
      out += `⏱️ Uptime:    *${uptimeStr}*\n`;
      out += `📡 Sesiones:  *${_sesionesActivas()} activa(s)*\n`;
      out += `🔘 Bot:       *${botPausado.pausado ? '⏸️ Pausado' : '▶️ Activo'}*\n`;
      out += `🏪 Negocio:   *${cerradoManual ? '🔒 Cerrado manual' : '🔓 Abierto'}*\n`;
      out += `📦 Versión:   *${require('../../../../package.json').version}*\n`;
      out += `━━━━━━━━━━━━━━━━━━`;
      await msg.reply(out);
    },
  },
];
