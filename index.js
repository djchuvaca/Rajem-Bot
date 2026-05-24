require("dotenv").config();

// ── VALIDACIÓN DE VARIABLES DE ENTORNO ───────────────────────────────────────
(function validarEnv() {
  const requeridas = ["GROQ_API_KEY", "GRUPO_ID"];
  const faltantes  = requeridas.filter(k => !process.env[k]);
  if (faltantes.length) {
    console.error("❌ Faltan variables de entorno requeridas:", faltantes.join(", "));
    console.error("   Copia .env.example como .env y completa los valores.");
    process.exit(1);
  }
  if (!process.env.PANEL_SECRET) {
    console.warn("⚠️  PANEL_SECRET no está definido. Se usará un secreto por defecto (inseguro en producción).");
  }
})();

const { Client, LocalAuth } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");

const { handleComandos } = require("./src/handlers/comandos");
const { handleImagen }   = require("./src/handlers/imagenes");
const { handleMensaje }  = require("./src/handlers/mensajes");
const { initDB }         = require("./src/db");
const { startPanel }     = require("./src/panel/server");
const { setWhatsappClient, setWaEstado } = require("./src/panel/whatsapp-bridge");
const { restaurarTodasLasSesiones } = require("./src/estado");

const client = new Client({
  authStrategy: new LocalAuth({ clientId: process.env.TENANT_ID || "carnitas-bot" }),
  puppeteer: {
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
  },
  webVersionCache: {
    type: "remote",
    remotePath: "https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html",
  },
});

client.on("qr", (qr) => {
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  📱 Escanea este QR con tu WhatsApp:");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
  qrcode.generate(qr, { small: true });
  console.log("\n  WhatsApp > Dispositivos vinculados > Vincular dispositivo");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
});

client.on("ready", () => {
  setWhatsappClient(client);
  console.log("✅ Bot de Tacos Javier conectado y listo!");
  console.log("─────────────────────────────────────────────");
  console.log("Comandos disponibles en el grupo:");
  console.log("  !pedidos          — todos los pedidos del día");
  console.log("  !pendientes       — pedidos esperando confirmación");
  console.log("  !confirmados      — pedidos confirmados hoy");
  console.log("  !cancelados       — pedidos cancelados hoy");
  console.log("  !rechazados       — pedidos rechazados hoy");
  console.log("  !confirmar [tel]  — confirmar pedido de un cliente");
  console.log("  !rechazar [tel]   — rechazar pedido de un cliente");
  console.log("  !stats            — resumen del día (ventas, tickets, top cortes)");
  console.log("  !cliente [tel]    — ver datos completos de un cliente");
  console.log("─────────────────────────────────────────────");
});

client.on("auth_failure", () => {
  setWaEstado("desconectado");
  console.error("❌ Error de autenticación. Borra .wwebjs_auth y reintenta.");
});

client.on("disconnected", (reason) => {
  setWaEstado("desconectado");
  console.log("⚠️  Bot desconectado:", reason);
});

const _msgProcesados = new Set();

client.on("message", async (msg) => {
  if (msg.from === "status@broadcast") return;
  if (msg.from.endsWith("@broadcast")) return;

  // Deduplicación: ignorar si ya procesamos este mensaje (reentregas de WA)
  const _msgId = msg.id?._serialized;
  if (_msgId) {
    if (_msgProcesados.has(_msgId)) return;
    _msgProcesados.add(_msgId);
    if (_msgProcesados.size > 200) _msgProcesados.delete(_msgProcesados.values().next().value);
  }

  if (msg.from.endsWith("@g.us")) {
    await handleComandos(msg, client);
    return;
  }

  if (msg.fromMe) return;
  if (msg.isGroupMsg) return;

  try {
    const chat = await msg.getChat();
    if (chat.isGroup) return;
  } catch (_) {}

  if (msg.hasMedia) {
    const procesado = await handleImagen(msg, client);
    if (procesado) return;
  }

  await handleMensaje(msg, client);
});

// Inicializar BD, restaurar sesiones, panel y bot
initDB().then(() => {
  console.log("🌮 Iniciando Bot de Tacos Javier...");
  console.log("─────────────────────────────────────────────");

  // Restaurar sesiones activas antes de arrancar el bot
  restaurarTodasLasSesiones();

  startPanel(process.env.PANEL_PORT || 3000);
  client.initialize();
}).catch(err => {
  console.error("❌ Error al inicializar la base de datos:", err);
  process.exit(1);
});