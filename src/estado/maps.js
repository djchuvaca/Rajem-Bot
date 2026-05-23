/**
 * estado/maps.js
 * Todas las estructuras en memoria del bot.
 * Es el único lugar donde viven los Maps y Sets — no duplicar en ningún otro archivo.
 */

const fs   = require("fs");
const path = require("path");

const conversaciones             = new Map();
const resumenPendiente           = new Map();
const clientesNuevos             = new Set();
const esperandoCaptura           = new Map();
const datosRecibidos             = new Set();
const datosAcumulados            = new Map();
const datosCampos                = new Map();
const pendientesConfirmacion     = new Map();
const clientesPreventa           = new Set();
const horaEntregaPreventa        = new Map();
const esperandoMotivoCancelacion = new Map();
const pedidosConfirmados         = new Map();
const esperandoConfirmacionItem  = new Map();
const esperandoAgregarMas        = new Map();
const pedidoJSONActual           = new Map();
const correoPreguntas            = new Set();
const referenciaPreguntas        = new Set();
const esperandoConfirmacionDatos = new Map();
const tipoEntregaCliente         = new Map();
const esperandoCorte    = new Map();
const esperandoEdicion  = new Map();
const esperandoTipoItem = new Map();

const CARPETA_CAPTURAS = path.join(__dirname, "../../capturas");
if (!fs.existsSync(CARPETA_CAPTURAS)) fs.mkdirSync(CARPETA_CAPTURAS);

module.exports = {
  conversaciones, resumenPendiente, clientesNuevos, esperandoCaptura,
  datosRecibidos, datosAcumulados, datosCampos, pendientesConfirmacion,
  clientesPreventa, horaEntregaPreventa, esperandoMotivoCancelacion,
  pedidosConfirmados, esperandoConfirmacionItem, esperandoAgregarMas,
  pedidoJSONActual, correoPreguntas, referenciaPreguntas,
  esperandoConfirmacionDatos, tipoEntregaCliente, esperandoCorte, esperandoEdicion, esperandoTipoItem, CARPETA_CAPTURAS,
};
