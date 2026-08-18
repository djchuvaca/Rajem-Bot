'use strict';

const {
  getPedidosPorCliente, getDespachosPendientes, marcarDespachoEjecutado, setConfig,
} = require('../db');
const { enviarDespachoMandaditos } = require('./mandaditos');
const { enrutarComando, resolverEsAdmin } = require('./comandos/router');

// ── CONFIRMACIÓN DE GRUPO ADMIN ───────────────────────────────────────────────
// Cuando el bot detecta automáticamente un posible grupo admin, guarda el ID
// aquí y espera una respuesta afirmativa del administrador para confirmarlo.
let _grupoPendiente = null;

function setPendienteConfirmacionGrupo(grupoId) {
  if (_grupoPendiente?.timeout) clearTimeout(_grupoPendiente.timeout);
  _grupoPendiente = {
    id:      grupoId,
    timeout: setTimeout(() => { _grupoPendiente = null; }, 5 * 60 * 1000),
  };
}

// ── HANDLER PRINCIPAL ─────────────────────────────────────────────────────────
async function handleComandos(msg, client) {
  const texto = msg.body && msg.body.trim();
  if (!texto) return;

  // Respuesta a la pregunta de auto-detección de grupo admin (no es un !comando).
  if (_grupoPendiente?.id === msg.from) {
    if (/^(s[íi]|si|yes|ok|dale|claro|correcto|afirmativo)$/i.test(texto)) {
      clearTimeout(_grupoPendiente.timeout);
      _grupoPendiente = null;
      setConfig('grupo_id', msg.from);
      await msg.reply(
        '✅ ¡Listo! Este grupo queda configurado como grupo de administración.\n' +
        'Ya recibirás pedidos y notificaciones aquí.\n\n' +
        'Escribe *!ayuda* para ver los comandos disponibles.'
      );
      return;
    }
  }

  // Todos los comandos (!) se despachan al router modular.
  return enrutarComando(texto, { msg, client });
}

// ── REANUDAR DESPACHOS TRAS REINICIO ─────────────────────────────────────────
// Llamado desde index.js al arrancar. Reprograma los despachos a mandaditos
// que quedaron pendientes cuando el bot se apagó.
async function reanudarDespachosPendientes(client) {
  const pendientes = getDespachosPendientes();
  if (!pendientes.length) return;

  console.log(`[Mandaditos] Reanudando ${pendientes.length} despacho(s) programado(s) tras reinicio...`);

  for (const d of pendientes) {
    const horaDespacho   = new Date(d.hora_despacho);
    const msRestantes    = horaDespacho.getTime() - Date.now();
    const pedidosCliente = getPedidosPorCliente(d.cliente_tel);
    const pedidoBD       = pedidosCliente.find(p => p.id === Number(d.pedido_id));
    const despachoData   = {
      pedidoId:          d.pedido_id,
      clienteNombre:     d.cliente_nombre,
      clienteTelefono:   d.cliente_tel,
      clienteCalle:      d.cliente_calle,
      clienteColonia:    d.cliente_colonia,
      clienteReferencia: d.cliente_ref,
      totalOrden:        d.total_orden,
      tarifaDomicilio:   d.tarifa,
      metodoPago:        pedidoBD?.metodo_pago || 'efectivo',
    };

    if (msRestantes > 0) {
      const horaStr = horaDespacho.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: true });
      console.log(`[Mandaditos] Despacho db #${d.id} (pedido #${d.pedido_id}) reprogramado para las ${horaStr}`);
      const timer = setTimeout(() => {
        enviarDespachoMandaditos(client, despachoData)
          .then(() => marcarDespachoEjecutado(d.id))
          .catch(e => console.error(`[Mandaditos] Error en despacho db #${d.id}:`, e.message));
      }, msRestantes);
      timer.unref?.();
    } else {
      console.log(`[Mandaditos] Despacho db #${d.id} atrasado, enviando ahora...`);
      try {
        await enviarDespachoMandaditos(client, despachoData);
        marcarDespachoEjecutado(d.id);
      } catch (e) {
        console.error(`[Mandaditos] Error en despacho db #${d.id}:`, e.message);
      }
    }
  }
}

// Compatibilidad: firma antigua era (msg, client, chat) con chat ya resuelto.
// El router usa resolverEsAdmin(msg, client) que llama msg.getChat() internamente.
// Este wrapper soporta ambas formas para no romper tests ni código externo.
function _jid(valor) {
  if (!valor) return '';
  if (typeof valor === 'string') return valor;
  return valor._serialized || valor.$1 || valor.id?._serialized || valor.id?.$1
    || (valor.user && valor.server ? `${valor.user}@${valor.server}` : '')
    || (valor.id?.user && valor.id?.server ? `${valor.id.user}@${valor.id.server}` : '');
}

async function _esAdministradorGrupo(msg, client, chat) {
  if (chat) {
    const autorOriginal = _jid(msg.author) || (msg.fromMe ? _jid(client?.info?.wid) : '');
    if (!autorOriginal) return false;
    const candidatos = new Set([autorOriginal]);
    if (autorOriginal.endsWith('@lid') && typeof client?.getContactLidAndPhone === 'function') {
      try {
        const res = await client.getContactLidAndPhone([autorOriginal]);
        const tel = _jid(res?.[0]?.pn);
        if (tel) candidatos.add(tel);
      } catch (_) {}
    }
    return (chat.participants || []).some(p => {
      const id = _jid(p.id || p);
      return candidatos.has(id) && (p.isAdmin || p.isSuperAdmin);
    });
  }
  return resolverEsAdmin(msg, client);
}

module.exports = { handleComandos, setPendienteConfirmacionGrupo, reanudarDespachosPendientes, _esAdministradorGrupo };
