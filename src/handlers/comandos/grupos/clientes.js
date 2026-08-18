'use strict';

const { CONTEXTO, PERMISO } = require('../tipos');
const {
  getCliente, getAllClientes, getPedidosPorCliente, getTopClientes,
  upsertCliente, getJIDReal, getConfig,
} = require('../../../db');

function _construirJID(telefono) {
  const tel = telefono.replace(/\D/g, '').slice(-10);
  return getJIDReal(tel) || `521${tel}@c.us`;
}

const ICON_ESTADO = Object.freeze({
  pendiente: '🟡', confirmado: '✅', cancelado: '❌',
  rechazado: '⛔', listo: '🏪', en_camino: '🛵',
});

/** @type {import('../registro').DefinicionComando[]} */
module.exports = [
  {
    patron:   /^!cliente\b/i,
    nombre:   'cliente',
    contexto: CONTEXTO.GRUPO,
    permisos: PERMISO.CUALQUIERA,
    giro:     null,
    ayuda:    '!cliente [tel] — datos de un cliente registrado',
    async ejecutar({ msg, args }) {
      const { pendientesConfirmacion } = require('../../../estado');
      const telRaw = args[0] ? args[0].replace(/\D/g, '') : null;

      const tel = telRaw || (() => {
        const jid = [...pendientesConfirmacion.keys()][0];
        return jid ? jid.replace(/\D/g, '').slice(-10) : null;
      })();

      if (!tel) { await msg.reply('⚠️ Uso: *!cliente [teléfono]*\nEjemplo: !cliente 3312345678'); return; }

      const cliente = getCliente(tel)
        || (tel.length < 10 ? (() => {
          const todos = getAllClientes();
          return todos.find(c => c.telefono?.endsWith(tel)) || null;
        })() : null);

      if (!cliente) { await msg.reply(`⚠️ No encontré ningún cliente con teléfono *${tel}*.`); return; }

      const nombre   = [cliente.nombre, cliente.apellido].filter(Boolean).join(' ') || 'Sin nombre';
      const fechaReg = cliente.fecha_registro?.split(' ')[0] || '—';

      let out = `👤 *CLIENTE — ${nombre}*\n━━━━━━━━━━━━━━━━━━\n`;
      out    += `📱 Teléfono:  ${cliente.telefono}\n`;
      if (cliente.calle_numero) {
        out += `🏠 Dirección: ${cliente.calle_numero}`;
        if (cliente.colonia) out += `, ${cliente.colonia}`;
        out += '\n';
      }
      if (cliente.referencia)   out += `📍 Ref:       ${cliente.referencia}\n`;
      out    += `📦 Pedidos:   ${cliente.total_pedidos || 0} en total\n`;
      out    += `🗓️  Registro:  ${fechaReg}\n`;

      if (cliente.ultimo_pedido_json) {
        try {
          const ultimo = JSON.parse(cliente.ultimo_pedido_json);
          const desc   = Array.isArray(ultimo) ? ultimo.map(i => i.linea || i).join(', ') : JSON.stringify(ultimo);
          out += `\n_Último pedido:_ ${desc}`;
        } catch (_) {}
      }
      await msg.reply(out);
    },
  },

  {
    patron:   /^!buscar\b/i,
    nombre:   'buscar',
    contexto: CONTEXTO.GRUPO,
    permisos: PERMISO.CUALQUIERA,
    giro:     null,
    ayuda:    '!buscar [nombre] — busca clientes por nombre o teléfono',
    async ejecutar({ msg, args }) {
      const query = args.join(' ').toLowerCase().trim();
      if (!query) { await msg.reply('⚠️ Uso: *!buscar [nombre]*\nEjemplo: !buscar Juan García'); return; }

      const resultados = getAllClientes().filter(c => {
        const nombre = `${c.nombre || ''} ${c.apellido || ''}`.toLowerCase();
        return nombre.includes(query) || (c.telefono || '').includes(query);
      }).slice(0, 5);

      if (!resultados.length) { await msg.reply(`⚠️ No encontré clientes con *"${query}"*.`); return; }

      let out = `🔍 *Resultados para "${query}" (${resultados.length}):*\n━━━━━━━━━━━━━━━━━━\n`;
      for (const c of resultados) {
        const nombre = [c.nombre, c.apellido].filter(Boolean).join(' ') || 'Sin nombre';
        out += `👤 *${nombre}*\n`;
        out += `   📱 ${c.telefono} | 📦 ${c.total_pedidos || 0} pedidos\n`;
        if (c.calle_numero) out += `   🏠 ${c.calle_numero}${c.colonia ? ', ' + c.colonia : ''}\n`;
        out += '\n';
      }
      await msg.reply(out.trim());
    },
  },

  {
    patron:   /^!historial\b/i,
    nombre:   'historial',
    contexto: CONTEXTO.GRUPO,
    permisos: PERMISO.CUALQUIERA,
    giro:     null,
    ayuda:    '!historial [tel] — historial de pedidos de un cliente',
    async ejecutar({ msg, args }) {
      const telRaw = args[0] ? args[0].replace(/\D/g, '') : null;
      if (!telRaw) { await msg.reply('⚠️ Uso: *!historial [teléfono]*\nEjemplo: !historial 3312345678'); return; }

      const cliente = getCliente(telRaw);
      const pedidos = getPedidosPorCliente(telRaw);

      if (!cliente || !pedidos.length) { await msg.reply(`⚠️ No encontré historial para *${telRaw}*.`); return; }

      const nombre = [cliente.nombre, cliente.apellido].filter(Boolean).join(' ') || 'Sin nombre';
      let out = `📋 *Historial de ${nombre}* (${pedidos.length} pedidos)\n━━━━━━━━━━━━━━━━━━\n`;
      for (const p of pedidos) {
        const fecha = p.fecha ? p.fecha.split(' ')[0] : '—';
        const hora  = p.fecha ? p.fecha.split(' ')[1]?.substring(0, 5) : '—';
        const total = p.total ? `$${Math.round(p.total)}` : '—';
        const tipo  = p.tipo === 'domicilio' ? '🛵' : '🏪';
        out += `${ICON_ESTADO[p.estado] || '⚪'} ${fecha} ${hora} — ${tipo} ${total}\n`;
        if (p.orden) out += `   _${p.orden.substring(0, 60)}${p.orden.length > 60 ? '...' : ''}_\n`;
        out += '\n';
      }
      await msg.reply(out.trim());
    },
  },

  {
    patron:   /^!editar\b/i,
    nombre:   'editar',
    contexto: CONTEXTO.GRUPO,
    permisos: PERMISO.ADMIN,
    giro:     null,
    ayuda:    '!editar [tel] [campo] [valor] — edita datos de un cliente',
    async ejecutar({ msg, args }) {
      if (args.length < 3) {
        await msg.reply(
          '⚠️ Uso: *!editar [teléfono] [campo] [valor]*\n' +
          'Campos: nombre, apellido, direccion, colonia, referencia\n' +
          'Ejemplo: !editar 3312345678 direccion Calle Morelos 123'
        );
        return;
      }

      const telRaw = args[0].replace(/\D/g, '');
      const campo  = args[1].toLowerCase();
      const valor  = args.slice(2).join(' ').trim();

      const camposValidos = {
        nombre: 'nombre', apellido: 'apellido',
        direccion: 'calle_numero', dirección: 'calle_numero',
        colonia: 'colonia', referencia: 'referencia', ref: 'referencia',
      };
      const campoDb = camposValidos[campo];

      if (!campoDb) { await msg.reply('⚠️ Campo inválido. Usa: nombre, apellido, direccion, colonia, referencia'); return; }

      const cliente = getCliente(telRaw);
      if (!cliente) { await msg.reply(`⚠️ No encontré ningún cliente con teléfono *${telRaw}*.`); return; }

      upsertCliente({ telefono: telRaw, [campoDb]: valor });
      const nombre = [cliente.nombre, cliente.apellido].filter(Boolean).join(' ') || telRaw;
      await msg.reply(`✅ *${campo}* de *${nombre}* actualizado a: ${valor}`);
    },
  },

  {
    patron:   /^!mensaje\b/i,
    nombre:   'mensaje',
    contexto: CONTEXTO.GRUPO,
    permisos: PERMISO.ADMIN,
    giro:     null,
    ayuda:    '!mensaje [tel] [texto] — envía un mensaje directo a un cliente',
    async ejecutar({ msg, client, args }) {
      if (args.length < 2) {
        await msg.reply('⚠️ Uso: *!mensaje [teléfono] [texto]*\nEjemplo: !mensaje 3312345678 Tu pedido sale en 10 min');
        return;
      }
      const telRaw   = args[0].replace(/\D/g, '');
      const contenido = args.slice(1).join(' ');
      const jid       = _construirJID(telRaw);
      try {
        await client.sendMessage(jid, contenido);
        await msg.reply(`✅ Mensaje enviado a *${telRaw}*`);
      } catch (e) {
        await msg.reply(`❌ Error al enviar: ${e.message}`);
      }
    },
  },

  {
    patron:   /^!top$/i,
    nombre:   'top',
    contexto: CONTEXTO.GRUPO,
    permisos: PERMISO.CUALQUIERA,
    giro:     null,
    ayuda:    '!top — top 10 clientes por número de pedidos',
    async ejecutar({ msg }) {
      const lista = getTopClientes(10);
      if (!lista.length) { await msg.reply('📭 No hay clientes con pedidos registrados aún.'); return; }

      const negocio = getConfig('nombre_negocio') || 'el negocio';
      let out = `🏆 *Top clientes — ${negocio}*\n━━━━━━━━━━━━━━━━━━\n`;
      lista.forEach((c, i) => {
        const nombre = [c.nombre, c.apellido].filter(Boolean).join(' ') || 'Sin nombre';
        const gasto  = c.gasto_total ? ` | 💰 $${Math.round(c.gasto_total)}` : '';
        out += `${i + 1}. *${nombre}*\n   📱 ${c.telefono} | 📦 ${c.total_pedidos} pedidos${gasto}\n\n`;
      });
      await msg.reply(out.trim());
    },
  },
];
