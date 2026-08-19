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
  if (!autorOriginal) return false;

  const candidatos = new Set([autorOriginal]);

  if (autorOriginal.endsWith('@lid')) {
    if (typeof client?.getContactLidAndPhone === 'function') {
      try {
        const resultados = await client.getContactLidAndPhone([autorOriginal]);
        const telefono   = _jid(resultados?.[0]?.pn);
        if (telefono) candidatos.add(telefono);
      } catch (_) {}
    }
    // Fallback: getContact() devuelve el JID canónico (@c.us) cuando getContactLidAndPhone falla
    try {
      const contacto = await msg.getContact();
      const canonico = _jid(contacto?.id);
      if (canonico && !canonico.endsWith('@lid')) candidatos.add(canonico);
    } catch (_) {}
  }

  let chat;
  try {
    chat = await msg.getChat();
  } catch (_) {
    // WhatsApp Web puede lanzar el error interno 'r' — tratamos como no admin.
    return false;
  }

  return (chat?.participants || []).some(p => {
    const id = _jid(p.id || p);
    return candidatos.has(id) && (p.isAdmin || p.isSuperAdmin);
  });
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
