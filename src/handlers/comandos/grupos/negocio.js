'use strict';

const { CONTEXTO, PERMISO } = require('../tipos');
const { getConfig, setConfig } = require('../../../db');

/** @type {import('../registro').DefinicionComando[]} */
module.exports = [
  {
    patron:   /^!cerrar$/i,
    nombre:   'cerrar',
    contexto: CONTEXTO.GRUPO,
    permisos: PERMISO.ADMIN,
    giro:     null,
    ayuda:    '!cerrar — cierra el negocio manualmente (responde como fuera de horario)',
    async ejecutar({ msg }) {
      setConfig('cierre_manual', '1');
      await msg.reply('🔒 Negocio cerrado manualmente. Los clientes recibirán el mensaje de fuera de horario.\nUsa *!abrir* para reabrir.');
    },
  },

  {
    patron:   /^!abrir$/i,
    nombre:   'abrir',
    contexto: CONTEXTO.GRUPO,
    permisos: PERMISO.ADMIN,
    giro:     null,
    ayuda:    '!abrir — reabre el negocio después de un cierre manual',
    async ejecutar({ msg }) {
      setConfig('cierre_manual', '0');
      await msg.reply('🔓 Negocio abierto. El bot vuelve a atender en horario normal.');
    },
  },
];
