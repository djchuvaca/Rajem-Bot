'use strict';

/**
 * Comandos específicos del giro Taquería.
 *
 * Incluidos en el registro global por src/handlers/comandos/registro.js
 * solo cuando el giro activo es taquería.
 *
 * Comandos: !cortes, !precios, !precio, !agotado, !disponible
 */

const { CONTEXTO, PERMISO } = require('../../handlers/comandos/tipos');
const { getConfig, getPedidosHoy } = require('../../db');
const catalogoTenant = require('../catalogo-tenant');
const { invalidarCacheCortes } = require('../../handlers/pedidoParser');

// ── Helpers ───────────────────────────────────────────────────────────────────

function _cortesActivos() {
  const slugs = new Set(catalogoTenant.getMenuItemsActivos('corte').map(i => i.producto_slug));
  return catalogoTenant.getCortesTenant().filter(c => slugs.has(c.slug));
}

/** @type {import('../../handlers/comandos/registro').DefinicionComando[]} */
module.exports = [
  {
    patron:   /^!cortes$/i,
    nombre:   'cortes',
    contexto: CONTEXTO.GRUPO,
    permisos: PERMISO.CUALQUIERA,
    giro:     'taqueria',
    ayuda:    '!cortes — desglose de pedidos por corte hoy',
    async ejecutar({ msg }) {
      const pedidos  = getPedidosHoy();
      const productos = _cortesActivos();
      const negocio  = getConfig('nombre_negocio') || 'el negocio';
      const fecha    = new Date().toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });

      if (!pedidos.length) { await msg.reply('📋 No hay pedidos registrados hoy todavía.'); return; }

      const conteo = {};
      for (const p of pedidos) {
        const orden = (p.orden || '').toLowerCase();
        for (const prod of productos)
          if (orden.includes(prod.nombre.toLowerCase()))
            conteo[prod.nombre] = (conteo[prod.nombre] || 0) + 1;
      }

      const ranking = Object.entries(conteo).sort((a, b) => b[1] - a[1]);
      if (!ranking.length) { await msg.reply('🥩 No se encontraron cortes identificables en los pedidos de hoy.'); return; }

      const total = ranking.reduce((s, [, n]) => s + n, 0);
      let out = `🥩 *Cortes del día — ${negocio}*\n_${fecha}_\n━━━━━━━━━━━━━━━━━━\n`;
      for (const [corte, n] of ranking) {
        const pct = Math.round(n / total * 100);
        const bar = '█'.repeat(Math.round(pct / 10)) + '░'.repeat(10 - Math.round(pct / 10));
        const cap = corte.charAt(0).toUpperCase() + corte.slice(1);
        out += `*${cap}*: ${n} pedido${n !== 1 ? 's' : ''} (${pct}%)\n${bar}\n\n`;
      }
      out += `📦 Total identificados: *${total}* en ${pedidos.length} pedido${pedidos.length !== 1 ? 's' : ''}`;
      await msg.reply(out);
    },
  },

  {
    patron:   /^!precios$/i,
    nombre:   'precios',
    contexto: CONTEXTO.GRUPO,
    permisos: PERMISO.CUALQUIERA,
    giro:     'taqueria',
    ayuda:    '!precios — muestra los precios actuales del menú',
    async ejecutar({ msg }) {
      const items = catalogoTenant.getMenuItemsActivos();
      if (!items.length) { await msg.reply('⚠️ No hay productos registrados.'); return; }

      const negocio = getConfig('nombre_negocio') || 'el negocio';
      let out = `🥩 *Menú — ${negocio}*\n━━━━━━━━━━━━━━━━━━\n`;
      for (const p of items) {
        const def    = catalogoTenant.getDefinicionProducto(p.categoria, p.producto_slug);
        const nombre = def?.nombre || p.producto_slug;
        const formato = p.formato_slug ? ` · ${p.formato_slug}` : '';
        out += `• *${nombre}${formato}* — $${Number(p.precio || 0)}\n`;
      }
      await msg.reply(out.trim());
    },
  },

  {
    patron:   /^!precio\s/i,
    nombre:   'precio',
    contexto: CONTEXTO.GRUPO,
    permisos: PERMISO.ADMIN,
    giro:     'taqueria',
    ayuda:    '!precio [corte] [taco] [torta] — actualiza el precio de un corte',
    async ejecutar({ msg, args }) {
      if (args.length < 3) {
        await msg.reply('⚠️ Uso: *!precio [corte] [precio taco] [precio torta]*\nEjemplo: !precio buche 30 60');
        return;
      }
      const corte       = args[0].toLowerCase();
      const precioTaco  = parseFloat(args[1]);
      const precioTorta = parseFloat(args[2]);

      if (isNaN(precioTaco) || isNaN(precioTorta) || precioTaco <= 0 || precioTorta <= 0) {
        await msg.reply('⚠️ Los precios deben ser números válidos mayores a 0.');
        return;
      }

      const def = catalogoTenant.getDefinicionProducto('corte', corte);
      if (!def) { await msg.reply(`⚠️ No encontré el corte *${corte}*. Usa *!precios* para ver los disponibles.`); return; }

      const cambios = catalogoTenant.setPreciosCorte(def.slug, { taco: precioTaco, torta: precioTorta });
      if (!cambios) { await msg.reply(`⚠️ El corte *${corte}* no está agregado al menú con taco o torta.`); return; }

      invalidarCacheCortes();
      await msg.reply(`✅ Precio de *${corte}* actualizado:\n🌮 Taco: $${precioTaco}  🥪 Torta: $${precioTorta}`);
    },
  },

  {
    patron:   /^!agotado\b/i,
    nombre:   'agotado',
    contexto: CONTEXTO.GRUPO,
    permisos: PERMISO.ADMIN,
    giro:     'taqueria',
    ayuda:    '!agotado [corte] — oculta temporalmente un corte de WhatsApp',
    async ejecutar({ msg, args }) {
      const corte = args.join(' ').toLowerCase().trim();
      if (!corte) { await msg.reply('⚠️ Uso: *!agotado [corte]*'); return; }

      const def = catalogoTenant.getDefinicionProducto('corte', corte);
      if (!def) { await msg.reply(`⚠️ No encontré el corte *${corte}* en el Giro activo.`); return; }

      const cambios = catalogoTenant.setMenuItemDisponibilidad(def.slug, 'corte', false);
      if (!cambios) { await msg.reply(`⚠️ *${def.nombre || corte}* no está habilitado por el Superadmin para este negocio.`); return; }

      invalidarCacheCortes();
      await msg.reply(`⛔ *${def.nombre || corte}* quedó agotado y se ocultó temporalmente de WhatsApp.`);
    },
  },

  {
    patron:   /^!disponible\b/i,
    nombre:   'disponible',
    contexto: CONTEXTO.GRUPO,
    permisos: PERMISO.ADMIN,
    giro:     'taqueria',
    ayuda:    '!disponible [corte] — vuelve a mostrar un corte en WhatsApp',
    async ejecutar({ msg, args }) {
      const corte = args.join(' ').toLowerCase().trim();
      if (!corte) { await msg.reply('⚠️ Uso: *!disponible [corte]*'); return; }

      const def = catalogoTenant.getDefinicionProducto('corte', corte);
      if (!def) { await msg.reply(`⚠️ No encontré el corte *${corte}* en el Giro activo.`); return; }

      const cambios = catalogoTenant.setMenuItemDisponibilidad(def.slug, 'corte', true);
      if (!cambios) { await msg.reply(`⚠️ *${def.nombre || corte}* no está habilitado por el Superadmin para este negocio.`); return; }

      invalidarCacheCortes();
      await msg.reply(`✅ *${def.nombre || corte}* está disponible y vuelve a mostrarse en WhatsApp.`);
    },
  },
];
