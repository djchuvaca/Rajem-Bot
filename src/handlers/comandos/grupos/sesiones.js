'use strict';

const { CONTEXTO, PERMISO } = require('../tipos');
const {
  datosCampos, resumenPendiente, esperandoConfirmacionItem,
  esperandoAgregarMas, esperandoCorte, esperandoTipoItem, esperandoCaptura,
  clientesNuevos, limpiarTodo, extraerTelefonoDeJID, persistirEstado,
} = require('../../../estado');
const { limpiarTodasLasSesionesDB, getJIDReal } = require('../../../db');
const { ordenPendientePreventa } = require('../../flujos/utils');

// ── Helpers ───────────────────────────────────────────────────────────────────

const MAPAS_SESION = () => [
  datosCampos, resumenPendiente, esperandoConfirmacionItem,
  esperandoAgregarMas, esperandoCorte, esperandoTipoItem, esperandoCaptura,
];

function _descripcionEstado(jid) {
  if (esperandoCaptura.has(jid))           return 'esperando captura de pago 📸';
  if (resumenPendiente.has(jid))           return 'confirmando resumen del pedido';
  if (esperandoConfirmacionItem.has(jid))  return 'confirmando ítem del pedido';
  if (esperandoAgregarMas.has(jid))        return 'decidiendo si agrega más';
  if (esperandoCorte.has(jid))             return 'eligiendo corte de carne';
  if (esperandoTipoItem.has(jid))          return 'eligiendo presentación';
  if (datosCampos.has(jid))               return 'llenando formulario';
  if (clientesNuevos.has(jid))            return 'inicio del flujo';
  return 'activo';
}

function _buscarJIDActivo(telRaw) {
  for (const mapa of MAPAS_SESION()) {
    for (const jid of mapa.keys()) {
      if (jid.includes(telRaw)) return jid;
    }
  }
  for (const jid of clientesNuevos) {
    if (jid.includes(telRaw)) return jid;
  }
  return null;
}

function _recopilarJIDsActivos() {
  const jids = new Set();
  for (const jid of clientesNuevos) jids.add(jid);
  for (const mapa of MAPAS_SESION()) {
    for (const [jid] of mapa) jids.add(jid);
  }
  return jids;
}

// ── Comandos ──────────────────────────────────────────────────────────────────

/** @type {import('../registro').DefinicionComando[]} */
module.exports = [
  {
    patron:   /^!sesiones$/i,
    nombre:   'sesiones',
    contexto: CONTEXTO.GRUPO,
    permisos: PERMISO.ADMIN,
    giro:     null,
    ayuda:    '!sesiones — lista las sesiones activas de clientes',
    async ejecutar({ msg }) {
      const activos = new Map();
      const registrar = jid => { if (!activos.has(jid)) activos.set(jid, _descripcionEstado(jid)); };

      for (const jid of clientesNuevos) registrar(jid);
      for (const [jid] of datosCampos)  registrar(jid);
      for (const mapa of MAPAS_SESION()) for (const [jid] of mapa) registrar(jid);

      if (!activos.size) { await msg.reply('📭 No hay sesiones de clientes activas en este momento.'); return; }

      let out = `📡 *Sesiones activas (${activos.size}):*\n━━━━━━━━━━━━━━━━━━\n`;
      let i = 1;
      for (const [jid, estado] of activos) {
        const tel = extraerTelefonoDeJID(jid) || jid;
        out += `${i}. 📱 *${tel}*\n   ${estado}\n\n`;
        i++;
      }
      out += '_Usa !resetear [tel] para limpiar una sesión._';
      await msg.reply(out.trim());
    },
  },

  {
    patron:   /^!resetear\b/i,
    nombre:   'resetear',
    contexto: CONTEXTO.GRUPO,
    permisos: PERMISO.ADMIN,
    giro:     null,
    ayuda:    '!resetear [tel] — limpia la sesión activa de un cliente',
    async ejecutar({ msg, args }) {
      const telRaw = args[0] ? args[0].replace(/\D/g, '') : null;
      if (!telRaw) { await msg.reply('⚠️ Uso: *!resetear [teléfono]*\nEjemplo: !resetear 3312345678\nUsa *!sesiones* para ver las activas.'); return; }

      const jid = _buscarJIDActivo(telRaw) || getJIDReal(telRaw);
      if (!jid) { await msg.reply(`⚠️ No encontré sesión activa para *${telRaw}*.\nUsa *!sesiones* para ver las sesiones activas.`); return; }

      limpiarTodo(jid);
      ordenPendientePreventa.delete(jid);
      clientesNuevos.delete(jid);
      await msg.reply(`🗑️ Sesión de *${telRaw}* eliminada. El cliente puede iniciar de nuevo cuando escriba.`);
    },
  },

  {
    patron:   /^!limpiar\b/i,
    nombre:   'limpiar',
    contexto: CONTEXTO.GRUPO,
    permisos: PERMISO.ADMIN,
    giro:     null,
    ayuda:    '!limpiar — elimina TODAS las sesiones activas (requiere !limpiar confirmar)',
    async ejecutar({ msg, texto }) {
      const jidsActivos = _recopilarJIDsActivos();

      if (!/^!limpiar\s+confirmar$/i.test(texto)) {
        if (!jidsActivos.size) { await msg.reply('📭 No hay sesiones activas en este momento.'); return; }
        await msg.reply(
          `⚠️ *¿Eliminar TODAS las sesiones?*\n\n` +
          `Esto borrará *${jidsActivos.size} sesión(es) activa(s)*.\n` +
          `Los clientes en medio de un pedido perderán su progreso y tendrán que empezar de nuevo.\n\n` +
          `Si estás seguro, escribe:\n*!limpiar confirmar*`
        );
        return;
      }

      for (const jid of jidsActivos) {
        limpiarTodo(jid);
        ordenPendientePreventa.delete(jid);
        clientesNuevos.delete(jid);
      }
      limpiarTodasLasSesionesDB();
      await msg.reply(`🗑️ Listo. Se eliminaron *${jidsActivos.size} sesión(es)* activa(s) y se limpió la BD de sesiones.`);
    },
  },
];
