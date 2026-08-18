'use strict';

const { CONTEXTO, PERMISO } = require('../tipos');
const {
  actualizarEstadoPedido, actualizarEstadoConfirmado, actualizarEstadoPorId,
  getPedidosHoy, getPedidosPorCliente, getCliente, getConfig, getJIDReal,
  guardarDespachoProgramado, marcarDespachoEjecutado,
} = require('../../../db');
const { pendientesConfirmacion, persistirEstado } = require('../../../estado');
const { enviarDespachoMandaditos, despacharConDelay } = require('../../mandaditos');
const { calcularTarifaDomicilio } = require('../../../geo');

// ── Helpers ───────────────────────────────────────────────────────────────────

function _construirJID(telefono) {
  const tel = telefono.replace(/\D/g, '').slice(-10);
  return getJIDReal(tel) || `521${tel}@c.us`;
}

function _buscarCliente(numBuscar) {
  if (!numBuscar) {
    const primero = pendientesConfirmacion.keys().next();
    return primero.done ? null : primero.value;
  }
  for (const [key] of pendientesConfirmacion) {
    if (key.includes(numBuscar)) return key;
  }
  return null;
}

function _parsearHoraEntrega(horaStr) {
  if (!horaStr) return null;
  const m = horaStr.match(/(\d{1,2}):(\d{2})\s*(a\.m\.|p\.m\.)/i);
  if (!m) return null;
  let h = parseInt(m[1]);
  const min = parseInt(m[2]);
  if (/p\.m\./i.test(m[3]) && h < 12) h += 12;
  if (/a\.m\./i.test(m[3]) && h === 12) h = 0;
  const hoy   = new Date();
  const fecha = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate(), h, min, 0, 0);
  if (fecha.getTime() < Date.now()) fecha.setDate(fecha.getDate() + 1);
  return fecha;
}

async function _despacharSiDomicilio(client, datos) {
  const tel10     = (datos.telefono || '').replace(/\D/g, '').slice(-10);
  const clienteBD = getCliente(tel10);
  const pedidoBD  = getPedidosPorCliente(tel10).find(p => p.estado === 'confirmado');
  if (!clienteBD || !pedidoBD) return '';

  const tarifaInfo = calcularTarifaDomicilio(clienteBD.colonia);
  const tarifa     = tarifaInfo ? tarifaInfo.tarifa : 50;
  const despachoData = {
    pedidoId:          pedidoBD.id,
    clienteNombre:     datos.nombre,
    clienteTelefono:   tel10,
    clienteCalle:      clienteBD.calle_numero,
    clienteColonia:    clienteBD.colonia,
    clienteReferencia: clienteBD.referencia,
    totalOrden:        pedidoBD.total != null ? `$${pedidoBD.total}` : '$—',
    tarifaDomicilio:   tarifa,
    esProgramada:      !!pedidoBD.hora_entrega,
    metodoPago:        pedidoBD.metodo_pago || 'efectivo',
  };

  if (pedidoBD.hora_entrega) {
    const horaEntrega  = _parsearHoraEntrega(pedidoBD.hora_entrega);
    const horaDespacho = horaEntrega ? new Date(horaEntrega.getTime() - 60 * 60 * 1000) : null;
    const msRestantes  = horaDespacho ? horaDespacho.getTime() - Date.now() : 0;

    if (horaDespacho && msRestantes > 0) {
      const horaStr    = horaDespacho.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: true });
      const despachoId = guardarDespachoProgramado({ ...despachoData, horaDespacho: horaDespacho.toISOString() });
      setTimeout(() => {
        enviarDespachoMandaditos(client, despachoData)
          .then(() => marcarDespachoEjecutado(despachoId))
          .catch(e => console.error('[Mandaditos] Error en despacho programado:', e.message));
      }, msRestantes);
      return `\n🕐 Despacho a mandaditos programado para las *${horaStr}*`;
    }
    enviarDespachoMandaditos(client, despachoData)
      .catch(e => console.error('[Mandaditos] Error al despachar:', e.message));
    return '';
  }

  despacharConDelay(client, despachoData)
    .catch(e => console.error('[Mandaditos] Error al programar despacho:', e.message));
  return '';
}

// ── Comandos ──────────────────────────────────────────────────────────────────

/** @type {import('../registro').DefinicionComando[]} */
module.exports = [
  {
    patron:   /^!confirmar/i,
    nombre:   'confirmar',
    contexto: CONTEXTO.GRUPO,
    permisos: PERMISO.ADMIN,
    giro:     null,
    ayuda:    '!confirmar [tel] — confirma un pedido y notifica al cliente',
    async ejecutar({ msg, client, args }) {
      const numBuscar     = args[0] ? args[0].replace(/\D/g, '') : null;
      let numeroCliente   = _buscarCliente(numBuscar);
      let datos           = numeroCliente ? pendientesConfirmacion.get(numeroCliente) : null;

      if (!datos && numBuscar) {
        const tel     = numBuscar.slice(-10);
        const cliente = getCliente(tel);
        if (cliente) {
          const pedidoPend = getPedidosPorCliente(tel).find(p => p.estado === 'pendiente');
          if (pedidoPend) {
            datos         = { nombre: [cliente.nombre, cliente.apellido].filter(Boolean).join(' ') || 'Cliente', tipo: pedidoPend.tipo || 'mostrador', telefono: tel };
            numeroCliente = _construirJID(tel);
          }
        }
      }

      if (!datos) { await msg.reply('⚠️ No encontré ese pedido. Usa *!pendientes* para ver la lista.'); return; }

      let mensajeCliente;
      if (datos.tipo === 'mostrador') {
        mensajeCliente = `✅ ¡Hola ${datos.nombre}! Tu pedido fue confirmado y está siendo preparado 🌮🔥\nTe esperamos en el mostrador. ¡Gracias por tu preferencia! 😊`;
      } else if (datos.tipo === 'domicilio') {
        mensajeCliente = `✅ ¡Hola ${datos.nombre}! Tu pedido fue confirmado y ya está en proceso 🛵🌮\nNuestro repartidor saldrá pronto. ¡Gracias por tu preferencia! 😊`;
      } else {
        mensajeCliente = `✅ ¡Hola ${datos.nombre}! Tu pago fue validado y tu pedido está en proceso 🌮✅\nEn breve lo tenemos listo. ¡Gracias por tu preferencia! 😊`;
      }

      try {
        await client.sendMessage(numeroCliente, mensajeCliente);
        try { actualizarEstadoPedido(datos.telefono, 'confirmado'); } catch (e) { console.error('BD Error:', e.message); }
        pendientesConfirmacion.delete(numeroCliente);
        persistirEstado(numeroCliente);

        let replyAdmin = `✅ Confirmación enviada a *${datos.nombre}* (${datos.telefono})`;

        if (datos.tipo === 'domicilio') {
          try {
            const nota = await _despacharSiDomicilio(client, datos);
            replyAdmin += nota;
          } catch (e) { console.error('[Mandaditos] Error preparando despacho:', e.message); }
        }

        await msg.reply(replyAdmin);
      } catch (e) {
        await msg.reply(`❌ Error al enviar confirmación: ${e.message}`);
      }
    },
  },

  {
    patron:   /^!listo\b/i,
    nombre:   'listo',
    contexto: CONTEXTO.GRUPO,
    permisos: PERMISO.ADMIN,
    giro:     null,
    ayuda:    '!listo [tel] — avisa al cliente que su pedido está listo o en camino',
    async ejecutar({ msg, client, args }) {
      const telRaw = args[0] ? args[0].replace(/\D/g, '') : null;
      if (!telRaw) { await msg.reply('⚠️ Especifica el teléfono: *!listo 3312345678*'); return; }

      const cliente   = getCliente(telRaw);
      if (!cliente) { await msg.reply(`⚠️ No encontré ningún cliente con teléfono *${telRaw}*.`); return; }

      const pedidoHoy = getPedidosHoy().find(p => p.telefono === telRaw && p.estado === 'confirmado');
      if (!pedidoHoy) { await msg.reply(`⚠️ No encontré un pedido *confirmado* para *${telRaw}*.\nAsegúrate de haber usado *!confirmar* primero.`); return; }

      const nombre = [cliente.nombre, cliente.apellido].filter(Boolean).join(' ') || 'Cliente';
      const jid    = _construirJID(telRaw);
      let mensajeCliente, nuevoEstado;

      if (pedidoHoy.tipo === 'domicilio') {
        mensajeCliente = `🛵 ¡Hola ${nombre}! Tu pedido ya va en camino, pronto llegará. ¡Gracias por tu preferencia! 😊`;
        nuevoEstado    = 'en_camino';
      } else {
        mensajeCliente = `🏪 ¡Hola ${nombre}! Tu pedido ya está listo para recoger en el mostrador. ¡Te esperamos! 😊`;
        nuevoEstado    = 'listo';
      }

      try {
        await client.sendMessage(jid, mensajeCliente);
        try { actualizarEstadoConfirmado(telRaw, nuevoEstado); } catch (e) { console.error('BD Error:', e.message); }
        await msg.reply(`✅ Aviso enviado a *${nombre}* (${telRaw}) — pedido marcado como *${nuevoEstado}*`);
      } catch (e) {
        await msg.reply(`❌ Error al notificar: ${e.message}`);
      }
    },
  },

  {
    patron:   /^!en_camino\b/i,
    nombre:   'en_camino',
    contexto: CONTEXTO.GRUPO,
    permisos: PERMISO.ADMIN,
    giro:     null,
    ayuda:    '!en_camino [id] — avisa que el pedido va en camino (por ID de pedido)',
    async ejecutar({ msg, client, args }) {
      const idNum = args[0] ? parseInt(args[0]) : NaN;
      if (isNaN(idNum)) { await msg.reply('⚠️ Especifica el ID del pedido: *!en_camino 42*\nEl ID aparece en el resumen del grupo y en el panel.'); return; }

      const pedidoHoy = getPedidosHoy().find(p => p.id === idNum);
      if (!pedidoHoy) { await msg.reply(`⚠️ No encontré el pedido *#${idNum}* en los pedidos de hoy.`); return; }
      if (!pedidoHoy.telefono) { await msg.reply(`⚠️ El pedido *#${idNum}* no tiene teléfono registrado. Usa *!listo [tel]* directamente.`); return; }

      const cliente = getCliente(pedidoHoy.telefono);
      const nombre  = [cliente?.nombre, cliente?.apellido].filter(Boolean).join(' ') || 'Cliente';
      const jid     = _construirJID(pedidoHoy.telefono);

      try {
        await client.sendMessage(jid, `🛵 ¡Hola ${nombre}! Tu pedido ya va en camino, pronto llegará. ¡Gracias por tu preferencia! 😊`);
        try { actualizarEstadoPorId(idNum, 'en_camino'); } catch (e) { console.error('BD Error:', e.message); }
        await msg.reply(`✅ Aviso enviado a *${nombre}* (${pedidoHoy.telefono}) — pedido *#${idNum}* marcado como en camino`);
      } catch (e) {
        await msg.reply(`❌ Error al notificar: ${e.message}`);
      }
    },
  },

  {
    patron:   /^!cancelar\b/i,
    nombre:   'cancelar',
    contexto: CONTEXTO.GRUPO,
    permisos: PERMISO.ADMIN,
    giro:     null,
    ayuda:    '!cancelar [tel] — cancela un pedido y notifica al cliente',
    async ejecutar({ msg, client, args }) {
      const numBuscar     = args[0] ? args[0].replace(/\D/g, '') : null;
      const numeroCliente = _buscarCliente(numBuscar);

      if (numeroCliente) {
        const datos = pendientesConfirmacion.get(numeroCliente);
        try {
          await client.sendMessage(numeroCliente, `❌ Hola *${datos.nombre}*, lamentablemente tuvimos que cancelar tu pedido.\nSi tienes alguna duda, con gusto te atendemos. ¡Disculpa los inconvenientes! 🙏`);
          try { actualizarEstadoPedido(datos.telefono, 'cancelado'); } catch (e) { console.error('BD Error:', e.message); }
          pendientesConfirmacion.delete(numeroCliente);
          persistirEstado(numeroCliente);
          await msg.reply(`❌ Cancelación enviada a *${datos.nombre}* (${datos.telefono})`);
        } catch (e) { await msg.reply(`❌ Error al enviar cancelación: ${e.message}`); }
        return;
      }

      if (!numBuscar) { await msg.reply('⚠️ Especifica el teléfono: *!cancelar 3312345678*'); return; }

      const cliente = getCliente(numBuscar);
      if (!cliente) { await msg.reply(`⚠️ No encontré ningún cliente con teléfono *${numBuscar}*.`); return; }

      const nombre = [cliente.nombre, cliente.apellido].filter(Boolean).join(' ') || 'Cliente';
      const jid    = _construirJID(numBuscar);
      try {
        await client.sendMessage(jid, `❌ Hola *${nombre}*, lamentablemente tuvimos que cancelar tu pedido.\nSi tienes alguna duda, con gusto te atendemos. ¡Disculpa los inconvenientes! 🙏`);
        try { actualizarEstadoConfirmado(numBuscar, 'cancelado'); } catch (e) { console.error('BD Error:', e.message); }
        persistirEstado(jid);
        await msg.reply(`❌ Cancelación enviada a *${nombre}* (${numBuscar})`);
      } catch (e) { await msg.reply(`❌ Error al enviar cancelación: ${e.message}`); }
    },
  },

  {
    patron:   /^!rechazar\b/i,
    nombre:   'rechazar',
    contexto: CONTEXTO.GRUPO,
    permisos: PERMISO.ADMIN,
    giro:     null,
    ayuda:    '!rechazar [tel] — rechaza un pedido pendiente y notifica al cliente',
    async ejecutar({ msg, client, args }) {
      const numBuscar     = args[0] ? args[0].replace(/\D/g, '') : null;
      const numeroCliente = _buscarCliente(numBuscar);
      if (!numeroCliente) { await msg.reply('⚠️ No encontré ese pedido. Usa *!pendientes* para ver la lista.'); return; }

      const datos = pendientesConfirmacion.get(numeroCliente);
      try {
        await client.sendMessage(numeroCliente,
          `⚠️ Estimado/a *${datos.nombre}*, nuestro equipo de trabajo revisó tu pedido y detectó un asunto importante con tu orden.\n` +
          `Enseguida se comunicarán contigo para resolverlo. ¡Disculpa los inconvenientes! 🙏`);
        try { actualizarEstadoPedido(datos.telefono, 'rechazado'); } catch (e) { console.error('BD Error:', e.message); }
        pendientesConfirmacion.delete(numeroCliente);
        persistirEstado(numeroCliente);
        await msg.reply(`⚠️ Rechazo enviado a *${datos.nombre}* (${datos.telefono})`);
      } catch (e) { await msg.reply(`❌ Error al enviar rechazo: ${e.message}`); }
    },
  },
];
