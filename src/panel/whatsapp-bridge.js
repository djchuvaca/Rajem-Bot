// src/panel/whatsapp-bridge.js
// Singleton que expone el cliente de WhatsApp al panel admin
// sin crear dependencias circulares.

let _client    = null;
let _waEstado  = "iniciando";  // "iniciando" | "conectado" | "desconectado"
const _inicio  = Date.now();

function setWhatsappClient(client) {
  _client   = client;
  _waEstado = "conectado";
}

function setWaEstado(estado) {
  _waEstado = estado;
}

function getWhatsappClient() {
  return _client;
}

function getStatusInfo() {
  return {
    tenant:           process.env.TENANT_ID || "carnitas-bot",
    uptime_segundos:  Math.floor((Date.now() - _inicio) / 1000),
    wa_estado:        _waEstado,
    ok:               _waEstado === "conectado",
  };
}

module.exports = { setWhatsappClient, getWhatsappClient, setWaEstado, getStatusInfo };
