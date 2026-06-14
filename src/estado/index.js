/**
 * estado/index.js
 * Punto de entrada único — re-exporta todo para que el resto del proyecto
 * siga usando require("../estado") sin cambiar ningún import existente.
 */

const maps    = require("./maps");
const sesiones = require("./sesiones");
const campos  = require("./campos");

module.exports = {
  // ── Maps y Sets ────────────────────────────────────────────────────────────
  conversaciones:             maps.conversaciones,
  resumenPendiente:           maps.resumenPendiente,
  clientesNuevos:             maps.clientesNuevos,
  esperandoCaptura:           maps.esperandoCaptura,
  datosRecibidos:             maps.datosRecibidos,
  datosAcumulados:            maps.datosAcumulados,
  datosCampos:                maps.datosCampos,
  pendientesConfirmacion:     maps.pendientesConfirmacion,
  clientesPreventa:           maps.clientesPreventa,
  horaEntregaPreventa:        maps.horaEntregaPreventa,
  esperandoMotivoCancelacion: maps.esperandoMotivoCancelacion,
  pedidosConfirmados:         maps.pedidosConfirmados,
  esperandoConfirmacionItem:  maps.esperandoConfirmacionItem,
  esperandoAgregarMas:        maps.esperandoAgregarMas,
  pedidoJSONActual:           maps.pedidoJSONActual,
  referenciaPreguntas:        maps.referenciaPreguntas,
  esperandoConfirmacionDatos: maps.esperandoConfirmacionDatos,
  tipoEntregaCliente:         maps.tipoEntregaCliente,
  esperandoCorte:             maps.esperandoCorte,
  esperandoEdicion:           maps.esperandoEdicion,
  esperandoTipoItem:          maps.esperandoTipoItem,
  esperandoExtras:            maps.esperandoExtras,
  ordenPreResumen:            maps.ordenPreResumen,
  CARPETA_CAPTURAS:           maps.CARPETA_CAPTURAS,

  // ── Sesiones ───────────────────────────────────────────────────────────────
  persistirEstado:          sesiones.persistirEstado,
  restaurarTodasLasSesiones: sesiones.restaurarTodasLasSesiones,

  // ── Campos y utilidades ────────────────────────────────────────────────────
  getHistorial:               campos.getHistorial,
  limpiarTodo:                campos.limpiarTodo,
  acumularDatos:              campos.acumularDatos,
  interpretarCampos:          campos.interpretarCampos,
  mostrarFormularioProgresivo: campos.mostrarFormularioProgresivo,
  siguienteCampoFaltante:     campos.siguienteCampoFaltante,
  manejarOpcional:            campos.manejarOpcional,
  camposCompletos:            campos.camposCompletos,
  camposATexto:               campos.camposATexto,
  datosCompletos:             campos.datosCompletos,
  pareceFragmentoDatos:       campos.pareceFragmentoDatos,
  extraerDatosPedido:         campos.extraerDatosPedido,
  detectarEdicion:            campos.detectarEdicion,
  aplicarEdicion:             campos.aplicarEdicion,
  sanitizarColonia:           campos.sanitizarColonia,
  extraerTelefono:            campos.extraerTelefono,
  extraerTelefonoDeJID:       campos.extraerTelefonoDeJID,
};
