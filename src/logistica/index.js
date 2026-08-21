'use strict';

const repositorio = require('./repositorio');
const { cotizarEntrega } = require('./cotizador');

module.exports = { ...repositorio, cotizarEntrega };
