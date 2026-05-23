// src/panel/whatsapp-bridge.js
// Singleton que expone el cliente de WhatsApp al panel admin
// sin crear dependencias circulares.

let _client = null;

function setWhatsappClient(client) {
  _client = client;
}

function getWhatsappClient() {
  return _client;
}

module.exports = { setWhatsappClient, getWhatsappClient };
