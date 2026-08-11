require("dotenv").config();
const Sentry             = require("@sentry/node");

// ── SENTRY ────────────────────────────────────────────────────────────────────
if (process.env.SENTRY_DSN) {
  Sentry.init({ dsn: process.env.SENTRY_DSN, tracesSampleRate: 0 });
}

// ── VALIDACIÓN DE VARIABLES DE ENTORNO ───────────────────────────────────────
(function validarEnv() {
  // GROQ_API_KEY ya no es requerida en .env — puede configurarse desde el super-admin (admin.db)
  if (!process.env.GROQ_API_KEY) {
    console.warn("⚠️  GROQ_API_KEY no está en .env. Configúrala desde el super-admin si este tenant tiene IA activa.");
  }
  if (!process.env.PANEL_SECRET) {
    console.warn("⚠️  PANEL_SECRET no está definido. Se usará un secreto por defecto (inseguro en producción).");
  }
})();

const path               = require("path");
const { fork }           = require("child_process");
const { Client, LocalAuth } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");

const logger             = require("./src/logger");
const { handleComandos, setPendienteConfirmacionGrupo, reanudarDespachosPendientes } = require("./src/handlers/comandos");
const { handleImagen }   = require("./src/handlers/imagenes");
const { handleMensaje }  = require("./src/handlers/mensajes");
const { handleMensajeMandaditos } = require("./src/handlers/mandaditos");
const { initDB, getConfig, getGrupoId, getGrupoMandaditosId } = require("./src/db");
const { startPanel }     = require("./src/panel/server");
const { startSuperAdmin, setWaClient: setSuperAdminWaClient } = require("./src/superadmin/server");
const { setWhatsappClient, setWaEstado } = require("./src/panel/whatsapp-bridge");
const { restaurarTodasLasSesiones } = require("./src/estado");

const client = new Client({
  authStrategy: new LocalAuth({ clientId: process.env.TENANT_ID || "carnitas-bot" }),
  puppeteer: {
    headless: true,
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
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
  setSuperAdminWaClient(client);
  reanudarDespachosPendientes(client).catch(e => logger.error("Error al reanudar despachos:", e.message));
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
  console.log("    !en_camino [id]             — avisar en camino por ID de pedido");
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

  setTimeout(async () => {
    try {
      await client.destroy();
    } catch (err) {
      logger.warn(`Error al destruir cliente antes de reconectar (ignorado): ${err.message}`);
    }
    client.initialize().catch(err => logger.error(`Error al reinicializar: ${err.message}`));
  }, delay);
});


// ── Auto-detección del grupo admin ────────────────────────────────────────────
client.on("group_join", async (notification) => {
  try {
    const botJid = client.info?.wid?._serialized;
    if (!notification.recipientIds?.includes(botJid)) return;
    if (getGrupoId()) return; // ya configurado, ignorar
    const nombreNegocio = getConfig("nombre_negocio") || "el bot";
    await client.sendMessage(
      notification.chatId,
      `¡Hola! Soy el bot de *${nombreNegocio}*.\n\n¿Este es el grupo de administración?\nResponde *sí* para configurarlo. Tienes 5 minutos.`
    );
    setPendienteConfirmacionGrupo(notification.chatId);
  } catch (err) {
    logger.warn(`Error en auto-detección de grupo: ${err.message}`);
  }
});

const _msgProcesados = new Set();
const _colaJID = new Map(); // cola de procesamiento por JID (evita concurrencia)

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
const mandaditosId = getGrupoMandaditosId();
    if (mandaditosId && msg.from === mandaditosId) {
      await handleMensajeMandaditos(msg, client);
    } else {
      await handleComandos(msg, client);
    }
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

  // Serializar mensajes del mismo JID para evitar condiciones de carrera
  const _jid = msg.from;
  const _anterior = _colaJID.get(_jid) ?? Promise.resolve();
  const _esta = _anterior.catch(() => {}).then(() => handleMensaje(msg, client));
  _colaJID.set(_jid, _esta);
  _esta.finally(() => { if (_colaJID.get(_jid) === _esta) _colaJID.delete(_jid); });
  await _esta;
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
  // Errores esperados del ciclo logout/reconexión en Windows — no son fallos reales.
  if (reason instanceof Error) {
    const esArchivoSesion = reason.message.includes(".wwebjs_auth");
    const esFrameDetached = reason.message.includes("detached Frame") || reason.message.includes("Navigating frame was detached");
    if ((reason.code === "EBUSY" || reason.code === "ENOTEMPTY") && esArchivoSesion) {
      logger.warn(`Limpieza de sesión WA incompleta (ignorado): ${reason.message}`);
      return;
    }
    if (esFrameDetached) {
      logger.warn(`Frame de Puppeteer ya cerrado al reconectar (ignorado): ${reason.message}`);
      return;
    }
  }
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
  startSuperAdmin(parseInt(process.env.SUPERADMIN_PORT || '3001'), client);
  client.initialize();

  // Primer backup al arrancar, luego cada 6 horas
  _runBackup();
  setInterval(_runBackup, 6 * 60 * 60 * 1000);
}).catch(err => {
  logger.error(`Error al inicializar la base de datos: ${err.message}`);
  process.exit(1);
});