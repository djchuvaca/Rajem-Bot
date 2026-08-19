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
 * Maneja los JIDs @lid que WhatsApp Web puede enviar en lugar del teléfono real.
 * Si msg.getChat() lanza el error interno 'r', retorna false.
 *
 * @param {object} msg    — mensaje de WhatsApp
 * @param {object} client — cliente de WhatsApp
 * @returns {Promise<boolean>}
 */
async function resolverEsAdmin(msg, client) {
  const autorOriginal = _jid(msg.author) || (msg.fromMe ? _jid(client?.info?.wid) : '');
  console.log('[DEBUG admin] autorOriginal:', autorOriginal, '| fromMe:', msg.fromMe);
  if (!autorOriginal) return false;

  const candidatos = new Set([autorOriginal, _normalizeLid(autorOriginal)]);

  if (autorOriginal.endsWith('@lid')) {
    if (typeof client?.getContactLidAndPhone === 'function') {
      try {
        const resultados = await client.getContactLidAndPhone([autorOriginal]);
        const telefono   = _jid(resultados?.[0]?.pn);
        console.log('[DEBUG admin] getContactLidAndPhone resultado:', telefono);
        if (telefono) candidatos.add(telefono);
      } catch (e) { console.log('[DEBUG admin] getContactLidAndPhone error:', e.message); }
    }
    // Fallback: getContact() devuelve el JID canónico (@c.us) cuando getContactLidAndPhone falla
    try {
      const contacto = await msg.getContact();
      const canonico = _jid(contacto?.id);
      console.log('[DEBUG admin] getContact canonico:', canonico);
      if (canonico) { candidatos.add(canonico); candidatos.add(_normalizeLid(canonico)); }
    } catch (e) { console.log('[DEBUG admin] getContact error:', e.message); }
  }

  let participantes = null;

  // Intento 1: msg.getChat()
  try {
    const chat = await msg.getChat();
    participantes = chat?.participants || [];
    console.log('[DEBUG admin] msg.getChat() OK, participantes:', participantes.length);
  } catch (e1) {
    console.log('[DEBUG admin] msg.getChat() falló:', e1.message);
  }

  // Intento 2: client.getChatById()
  if (!participantes) {
    try {
      const chat = await client.getChatById(msg.from);
      participantes = chat?.participants || [];
      console.log('[DEBUG admin] getChatById OK, participantes:', participantes.length);
    } catch (e2) {
      console.log('[DEBUG admin] getChatById falló:', e2.message);
    }
  }

  // Intento 3: client.getChats() (ruta interna diferente)
  if (!participantes) {
    try {
      const todos = await client.getChats();
      const chat  = todos.find(c => (_jid(c.id) === msg.from) || c.id?._serialized === msg.from);
      participantes = chat?.participants || [];
      console.log('[DEBUG admin] getChats() encontró chat:', !!chat, 'participantes:', participantes.length);
    } catch (e3) {
      console.log('[DEBUG admin] getChats() falló:', e3.message);
    }
  }

  // Intento 4: diagnóstico y búsqueda exhaustiva en el store de WhatsApp Web
  console.log('[DEBUG admin] msg.from:', msg.from);
  if (client?.pupPage) {
    try {
      const diag = await client.pupPage.evaluate((groupId) => {
        try {
          const col = window.Store?.Chat;
          if (!col) return { error: 'no window.Store.Chat' };
          const todos = col.getModelsArray?.() || [];
          const ids = todos.map(c => c.id?._serialized || '');
          const chat = todos.find(c => (c.id?._serialized || '') === groupId);
          if (!chat) return { totalChats: ids.length, primerosIds: ids.slice(0, 5), buscado: groupId };
          const pts = chat.groupMetadata?.participants?.getModelsArray?.() || [];
          return {
            found: true,
            participants: pts.map(p => ({ id: p.id?._serialized || '', isAdmin: !!p.isAdmin, isSuperAdmin: !!p.isSuperAdmin })),
          };
        } catch (e) { return { error: e.message }; }
      }, msg.from);
      console.log('[DEBUG admin] pupPage diag:', JSON.stringify(diag));
      if (diag?.found && diag.participants) {
        participantes = diag.participants;
      }
    } catch (e4) {
      console.log('[DEBUG admin] pupPage.evaluate falló:', e4.message);
    }
  }

  if (!participantes) return false;

  const admins = participantes.filter(p => p.isAdmin || p.isSuperAdmin).map(p => _jid(p.id || p));
  console.log('[DEBUG admin] candidatos:', [...candidatos], '| admins en grupo:', admins);

  return admins.some(id => candidatos.has(id) || candidatos.has(_normalizeLid(id)));
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
