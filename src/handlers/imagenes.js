const fs   = require("fs");
const path = require("path");
const { upsertCliente, registrarPedido } = require("../db");
const {
  esperandoCaptura,
  clientesNuevos,
  limpiarTodo,
  pendientesConfirmacion,
  extraerDatosPedido,
  CARPETA_CAPTURAS,
} = require("../estado");

async function handleImagen(msg, client) {
  if (!msg.hasMedia || (msg.type !== "image" && msg.type !== "document")) return false;
  if (!esperandoCaptura.has(msg.from)) return false;

  const clienteNumero = msg.from;
  const datos         = esperandoCaptura.get(clienteNumero);
  const horaVenta     = new Date().toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });

  try {
    const media         = await msg.downloadMedia();
    const ext           = media.mimetype.split("/")[1] || "jpg";
    const nombreArchivo = `captura_${clienteNumero.replace(/[^0-9]/g, "")}_${Date.now()}.${ext}`;
    fs.writeFileSync(path.join(CARPETA_CAPTURAS, nombreArchivo), Buffer.from(media.data, "base64"));
    console.log(`📸 Captura guardada: ${nombreArchivo}`);

    const grupoId = process.env.GRUPO_ID;
    if (grupoId) {
      try {
        await client.sendMessage(grupoId,
          `🔔 *COMPROBANTE DE TRANSFERENCIA*\n🕐 *Hora:* ${horaVenta}\n\n${datos.resumen}\n\n` +
          `⚠️ *Validar antes de confirmar*\n` +
          `Usa: !confirmar ${datos.telefono}`
        );
        await client.sendMessage(grupoId, media);
        console.log("📲 Resumen + captura enviados al grupo");
      } catch (e) { console.error("❌ Error al enviar al grupo:", e.message); }
    }

    const infoPedido = extraerDatosPedido(datos.resumen);
    pendientesConfirmacion.set(clienteNumero, {
      ...infoPedido,
      resumen: datos.resumen,
      hora: horaVenta,
    });

    esperandoCaptura.delete(clienteNumero);
    clientesNuevos.delete(clienteNumero);
    limpiarTodo(clienteNumero);

    await msg.reply(
      "¡Gracias! Recibimos tu comprobante 📸\n" +
      "Tu pedido fue solicitado exitosamente y solo queda la confirmación de nuestro equipo de trabajo.\n" +
      "En breve te avisamos 🙏"
    );
  } catch (e) {
    console.error("❌ Error al procesar captura:", e.message);
    await msg.reply("Disculpa, tuve un problema al recibir tu comprobante. ¿Puedes mandarlo de nuevo? 🙏");
  }

  return true;
}

module.exports = { handleImagen };
