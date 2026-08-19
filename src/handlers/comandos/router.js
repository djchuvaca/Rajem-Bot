'use strict';

/**
 * Router central de comandos — Fase 7.
 *
 * Pipeline de evaluación para cada mensaje:
 *   normalización → contexto → grupo admin → permisos → giro → ejecución
 *
 * Convive con src/handlers/comandos.js (legacy). Los handlers siguen
 * usando handleComandos hasta la Fase 8.
 */

const { CONTEXTO, PERMISO } = require('./tipos');
const { obtenerComandos }   = require('./registro');

// ── Helpers de JID ────────────────────────────────────────────────────────────

function _jid(valor) {
  if (!valor) return '';
  if (typeof valor === 'string') return valor;
  return valor._serialized || valor.$1
    || valor.id?._serialized || valor.id?.$1
    || (valor.user && valor.server ? `${valor.user}@${valor.server}` : '')
    || (valor.id?.user && valor.id?.server ? `${valor.id.user}@${valor.id.server}` : '');
}

// WhatsApp envía @lid con sufijo de dispositivo ("user:15@lid"); la lista de
// participantes los almacena sin él ("user@lid"). Hay que normalizar ambos lados.
function _normalizeLid(jid) {
  if (!jid || !jid.endsWith('@lid')) return jid;
  return jid.replace(/:\d+@lid$/, '@lid');
}

// ── Resolución de permisos de administrador ───────────────────────────────────

/**
 * Determina si el autor del mensaje es administrador del grupo.
 *
 * Estrategia en cascada:
 *   1. Obtener participantes vía msg.getChat() / getChatById() / getChats()
 *   2. Si el Store de WA está roto (error "r"), caer en whitelist de BD:
 *      configuracion.operadores_jids = JIDs o teléfonos separados por coma
 *
 * @param {object} msg    — mensaje de WhatsApp
 * @param {object} client — cliente de WhatsApp
 * @returns {Promise<boolean>}
 */
async function resolverEsAdmin(msg, client) {
  const autorOriginal = _jid(msg.author) || (msg.fromMe ? _jid(client?.info?.wid) : '');
  if (!autorOriginal) return false;

  const candidatos = new Set([autorOriginal, _normalizeLid(autorOriginal)]);

  // Resolver @lid → JID canónico (@c.us)
  if (autorOriginal.endsWith('@lid')) {
    if (typeof client?.getContactLidAndPhone === 'function') {
      try {
        const resultados = await client.getContactLidAndPhone([autorOriginal]);
        const tel = _jid(resultados?.[0]?.pn);
        if (tel) candidatos.add(tel);
      } catch (_) {}
    }
    try {
      const contacto = await msg.getContact();
      const canonico = _jid(contacto?.id);
      if (canonico) { candidatos.add(canonico); candidatos.add(_normalizeLid(canonico)); }
    } catch (_) {}
  }

  // ── Intento 1-3: obtener participantes desde WhatsApp ────────────────────────
  let participantes = null;

  try {
    const chat = await msg.getChat();
    participantes = chat?.participants || [];
  } catch (_) {}

  if (!participantes) {
    try {
      const chat = await client.getChatById(msg.from);
      participantes = chat?.participants || [];
    } catch (_) {}
  }

  if (!participantes) {
    try {
      const todos = await client.getChats();
      const chat  = todos.find(c => (_jid(c.id) === msg.from) || c.id?._serialized === msg.from);
      participantes = chat?.participants || [];
    } catch (_) {}
  }

  if (participantes) {
    const admins = participantes
      .filter(p => p.isAdmin || p.isSuperAdmin)
      .map(p => _jid(p.id || p));
    return admins.some(id => candidatos.has(id) || candidatos.has(_normalizeLid(id)));
  }

  // ── Fallback: whitelist de operadores en BD ──────────────────────────────────
  // Úsalo cuando el Store de WA está roto (error "r" en todos los métodos anteriores).
  // Configura: setConfig('operadores_jids', '5213113676885@c.us,521XXXXXXXXXX@c.us')
  try {
    const { getConfig } = require('../../db');
    const raw = getConfig('operadores_jids') || '';
    const whitelist = raw.split(',').map(j => j.trim()).filter(Boolean);
    if (whitelist.length > 0) {
      return whitelist.some(j => candidatos.has(j) || candidatos.has(_normalizeLid(j)));
    }
  } catch (_) {}

  return false;
}

// ── Router principal ──────────────────────────────────────────────────────────

/**
 * Enruta un comando al módulo responsable.
 *
 * @param {string} texto — texto del mensaje (msg.body)
 * @param {object} opciones
 *   @param {object}   opciones.msg        — objeto mensaje de WhatsApp
 *   @param {object}   opciones.client     — cliente de WhatsApp
 *   @param {function} [opciones.esAdminFn] — inyectable en tests; default: resolverEsAdmin
 * @returns {Promise<boolean>} true si el mensaje fue atendido
 */
async function enrutarComando(texto, { msg, client, esAdminFn } = {}) {
  if (!texto || !texto.startsWith('!')) return false;

  const esGrupo = String(msg.from || '').endsWith('@g.us');

  // Caso especial: !jid funciona en cualquier grupo sin restricción de grupo admin.
  if (/^!(?:jid|idgrupo)$/i.test(texto) && esGrupo) {
    await msg.reply(
      `🆔 *JID de este grupo:*\n${msg.from}\n\nPuedes copiarlo completo en la configuración del tenant.`
    );
    return true;
  }

  // Todos los demás comandos solo funcionan en el grupo admin configurado.
  if (esGrupo) {
    const { getConfig } = require('../../db');
    const grupoConfigurado = getConfig('grupo_id') || process.env.GRUPO_ID || '';
    if (!grupoConfigurado || msg.from !== grupoConfigurado) {
      if (texto.startsWith('!')) {
        await msg.reply(
          '⛔ Los comandos administrativos solo funcionan en el grupo configurado para este negocio.' +
          ' Usa *!jid* para verificar este grupo.'
        );
      }
      return false;
    }
  }

  // Buscar comando en el registro.
  const comandos = obtenerComandos();
  const cmd       = comandos.find(c => c.patron.test(texto));
  if (!cmd) return false;

  // Validar contexto.
  if (cmd.contexto === CONTEXTO.GRUPO && !esGrupo) {
    await msg.reply('⚠️ Este comando solo funciona en grupos.');
    return true;
  }
  if (cmd.contexto === CONTEXTO.PRIVADO && esGrupo) {
    return false;
  }

  // Validar permisos.
  if (cmd.permisos === PERMISO.ADMIN) {
    const fn     = esAdminFn || resolverEsAdmin;
    const esAdmin = await fn(msg, client);
    if (!esAdmin) {
      await msg.reply('⛔ Solo los administradores del grupo pueden usar este comando.');
      return true;
    }
  }

  // Validar giro.
  if (cmd.giro) {
    try {
      const { getGiroActivo } = require('../../giros');
      if (getGiroActivo().slug !== cmd.giro) return false;
    } catch (_) {
      return false;
    }
  }

  // Ejecutar.
  const args = texto.trim().split(/\s+/).slice(1);
  await cmd.ejecutar({ msg, client, texto, args });
  return true;
}

module.exports = { enrutarComando, resolverEsAdmin };
