require("dotenv").config();
const { Client, LocalAuth } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");

const { handleComandos } = require("./src/handlers/comandos");
const { handleImagen }   = require("./src/handlers/imagenes");
const { handleMensaje }  = require("./src/handlers/mensajes");
const { initDB }         = require("./src/db");
const { startPanel }     = require("./src/panel/server");
const { restaurarTodasLasSesiones } = require("./src/estado");

const client = new Client({
  authStrategy: new LocalAuth({ clientId: "carnitas-bot" }),
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
  console.log("─────────────────────────────────────────────");
});

client.on("auth_failure", () => {
  console.error("❌ Error de autenticación. Borra .wwebjs_auth y reintenta.");
});

client.on("disconnected", (reason) => {
  console.log("⚠️  Bot desconectado:", reason);
});

client.on("message", async (msg) => {
  if (msg.from === "status@broadcast") return;
  if (msg.from.endsWith("@broadcast")) return;

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