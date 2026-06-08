const fs   = require("fs");
const path = require("path");
const { upsertCliente, registrarPedido, getMensaje, getGrupoId } = require("../db");
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

    const grupoId = getGrupoId();
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

    const msgComprobante = getMensaje("comprobante_recibido")
      || "¡Gracias! Recibimos tu comprobante 📸\nTu pedido fue solicitado exitosamente y solo queda la confirmación de nuestro equipo de trabajo.\nEn breve te avisamos 🙏";
    await msg.reply(msgComprobante);
  } catch (e) {
    console.error("❌ Error al procesar captura:", e.message);
    await msg.reply("Disculpa, tuve un problema al recibir tu comprobante. ¿Puedes mandarlo de nuevo? 🙏");
  }

  return true;
}

module.exports = { handleImagen };
