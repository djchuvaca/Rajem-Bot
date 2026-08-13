'use strict';

/**
 * src/giros/taqueria.js — Re-export del ecosistema de taquería
 *
 * El catálogo completo vive en src/giros/taqueria/index.js.
 * Este archivo mantiene compatibilidad con imports existentes:
 *   require('../giros/taqueria')  → catálogo
 *   require('../giros/taqueria/nlu')  → NLU específico
 */
module.exports = require('./taqueria/index');
