require("dotenv").config();

// ── SENTRY ────────────────────────────────────────────────────────────────────
if (process.env.SENTRY_DSN) {
  Sentry.init({ dsn: process.env.SENTRY_DSN, tracesSampleRate: 0 });
}

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

const path               = require("path");
const { fork }           = require("child_process");
const Sentry             = require("@sentry/node");
const { Client, LocalAuth } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");

const logger             = require("./src/logger");
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
  _reintentos = 0;
  setWhatsappClient(client);
  logger.info("Bot de Tacos Javier conectado y listo.")
  console.log("✅ Bot de Tacos Javier conectado y listo!");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  COMANDOS DISPONIBLES EN EL GRUPO");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  Ver pedidos:");
  console.log("    !pedidos                    — todos los pedidos del día");
  console.log("    !pendientes / !confirmados  — filtrar por estado");
  console.log("    !domicilios / !mostradores  — filtrar por tipo");
  console.log("    !cancelados / !rechazados   — filtrar por estado");
  console.log("    !pedido [tel]               — detalle completo de un pedido");
  console.log("  Gestionar pedidos:");
  console.log("    !confirmar [tel]            — confirmar pedido");
  console.log("    !listo [tel]                — avisar listo/en camino");
  console.log("    !cancelar [tel]             — cancelar con aviso al cliente");
  console.log("    !rechazar [tel]             — rechazar pedido");
  console.log("  Clientes:");
  console.log("    !cliente [tel]              — datos del cliente");
  console.log("    !buscar [nombre]            — buscar cliente por nombre");
  console.log("    !historial [tel]            — historial de pedidos");
  console.log("    !top                        — top 10 clientes por pedidos");
  console.log("    !editar [tel] [campo] [v]   — editar datos de un cliente");
  console.log("    !mensaje [tel] [texto]      — mensaje directo al cliente");
  console.log("  Reportes:");
  console.log("    !stats                      — resumen del día");
  console.log("    !reporte ayer / semana      — reporte de fechas anteriores");
  console.log("  Menú y productos:");
  console.log("    !precios                    — ver precios del menú");
  console.log("    !precio [corte] [t] [to]    — actualizar precio de un corte");
  console.log("    !agotado / !disponible      — marcar corte agotado o disponible");
  console.log("  Negocio:");
  console.log("    !cerrar / !abrir            — cerrar o abrir el negocio hoy");
  console.log("  Bot:");
  console.log("    !pausar / !reanudar         — pausar/activar el bot");
  console.log("    !sesiones                   — ver sesiones activas de clientes");
  console.log("    !resetear [tel]             — limpiar sesión de un cliente");
  console.log("    !limpiar                    — eliminar TODAS las sesiones activas");
  console.log("    !estado                     — uptime, sesiones y estado del bot");
  console.log("    !ayuda                      — lista de comandos en el grupo");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
});

client.on("auth_failure", () => {
  setWaEstado("desconectado");
  logger.error("Error de autenticación de WhatsApp. Borra .wwebjs_auth y reintenta.");
});

// ── Reconexión automática con backoff exponencial ─────────────────────────────
let _reintentos = 0;
const _MAX_REINTENTOS = 8;

client.on("disconnected", (reason) => {
  setWaEstado("desconectado");
  logger.warn(`Bot desconectado: ${reason}`);

  if (_reintentos >= _MAX_REINTENTOS) {
    logger.error(`Se alcanzó el límite de ${_MAX_REINTENTOS} reconexiones. Reinicia el proceso manualmente.`);
    return;
  }

  const delay = Math.min(5000 * 2 ** _reintentos, 5 * 60 * 1000); // máx 5 min
  _reintentos++;
  logger.info(`Reintentando conexión en ${Math.round(delay / 1000)}s (intento ${_reintentos}/${_MAX_REINTENTOS})...`);

  setTimeout(() => {
    client.initialize().catch(err => logger.error(`Error al reinicializar: ${err.message}`));
  }, delay);
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

  // Resolver LID a JID real — WhatsApp envía @lid en lugar de @c.us en algunos dispositivos
  if (msg.from.endsWith("@lid")) {
    try {
      const resultados = await client.getContactLidAndPhone([msg.from]);
      if (resultados && resultados[0] && resultados[0].pn) {
        msg.from = resultados[0].pn;
      }
    } catch (_) {}
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

// ── Backup automático cada 6 horas ───────────────────────────────────────────
function _runBackup() {
  const hijo = fork(path.join(__dirname, "scripts/backup-db.js"), [], { silent: true });
  hijo.stdout.on("data", d => logger.info(`[backup] ${d.toString().trim()}`));
  hijo.stderr.on("data", d => logger.error(`[backup] ${d.toString().trim()}`));
  hijo.on("error", err => logger.error(`Error al lanzar backup: ${err.message}`));
}

// ── Manejadores globales de errores ──────────────────────────────────────────
process.on("uncaughtException", (err) => {
  logger.error(`Error no capturado: ${err.message}\n${err.stack}`);
  Sentry.captureException(err);
});

process.on("unhandledRejection", (reason) => {
  const msg = reason instanceof Error ? `${reason.message}\n${reason.stack}` : String(reason);
  logger.error(`Promesa rechazada sin manejar: ${msg}`);
  if (reason instanceof Error) Sentry.captureException(reason);
  else Sentry.captureMessage(msg, "error");
});

// Inicializar BD, restaurar sesiones, panel y bot
initDB().then(() => {
  console.log("🌮 Iniciando Bot de Tacos Javier...");
  console.log("─────────────────────────────────────────────");

  restaurarTodasLasSesiones();
  startPanel(process.env.PANEL_PORT || 3000);
  client.initialize();

  // Primer backup al arrancar, luego cada 6 horas
  _runBackup();
  setInterval(_runBackup, 6 * 60 * 60 * 1000);
}).catch(err => {
  logger.error(`Error al inicializar la base de datos: ${err.message}`);
  process.exit(1);
});