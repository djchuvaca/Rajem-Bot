const fs   = require("fs");
const path = require("path");
const { upsertCliente, registrarPedido, getMensaje, getConfig, getGrupoId, guardarTelefonoReal, guardarJIDReal } = require("../db");
const {
  esperandoCaptura,
  clientesNuevos,
  limpiarTodo,
  pendientesConfirmacion,
  extraerDatosPedido,
  CARPETA_CAPTURAS,
  datosCampos,
  horaEntregaPreventa,
  persistirEstado,
} = require("../estado");
const { ordenPendientePreventa, telefonosReales } = require("./flujos/utils");
const { dividirNombreCompleto } = require('../clientes/nombre');

async function handleImagen(msg, client) {
  if (!msg.hasMedia) return false;
  if (!esperandoCaptura.has(msg.from)) return false;

  const clienteNumero = msg.from;
  const datos         = esperandoCaptura.get(clienteNumero);
  const horaVenta     = new Date().toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });

  try {
    const media = await msg.downloadMedia();
    if (!media?.data) throw new Error("WhatsApp no entregó el contenido del archivo");
    const mimetype = String(media.mimetype || "").toLowerCase().split(";")[0].trim();
    const esImagen = mimetype.startsWith("image/");
    const esPdf = mimetype === "application/pdf";
    if (!esImagen && !esPdf) {
      await msg.reply("Necesito una imagen o PDF del comprobante de transferencia. Intenta enviarlo nuevamente, por favor. 📸");
      return true;
    }
    const extensiones = { "image/jpeg": "jpg", "image/jpg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic", "image/heif": "heif", "application/pdf": "pdf" };
    const ext = extensiones[mimetype] || (esImagen ? "img" : "pdf");
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

    const infoPedido    = extraerDatosPedido(datos.resumen);
    const camposCliente = datosCampos.get(clienteNumero) || {};
    const hora_entrega  = camposCliente.hora || horaEntregaPreventa.get(clienteNumero) || null;

    // Guardar pedido en BD. Si el flujo MP registró el pedido pero falló al crear
    // el enlace y cayó aquí como fallback, datos.pedidoId ya tiene el ID → no duplicar.
    let pedidoId = datos.pedidoId || null;
    if (!pedidoId) {
      try {
        const telefonoLimpio = infoPedido.telefono || datos.telefono || null;
        const { nombre, apellido } = dividirNombreCompleto(infoPedido.nombre);
        const cliente = upsertCliente({
          nombre, apellido, telefono: telefonoLimpio,
          calle_numero: camposCliente.calle    || null,
          colonia:      camposCliente.colonia  || null,
          referencia:   (camposCliente.referencia && camposCliente.referencia !== "sin referencia") ? camposCliente.referencia : null,
        });
        const total = parseFloat((infoPedido.total || "0").replace(/[^0-9.]/g, "")) || 0;
        pedidoId = registrarPedido({
          cliente_id: cliente ? cliente.id : null,
          tipo:        infoPedido.tipo || "mostrador",
          orden:       (datos.resumen || "").substring(0, 500),
          total, metodo_pago: "transferencia", estado: "pendiente", hora_entrega,
        });
        if (telefonoLimpio) {
          telefonosReales.set(clienteNumero, telefonoLimpio);
          try { guardarTelefonoReal(clienteNumero, telefonoLimpio); } catch (_) {}
          try { guardarJIDReal(telefonoLimpio, clienteNumero); } catch (_) {}
        }
      } catch (e) {
        console.error("[BD] Error guardando pedido de transferencia:", e.message);
      }
    }

    esperandoCaptura.delete(clienteNumero);
    ordenPendientePreventa.delete(clienteNumero);
    clientesNuevos.delete(clienteNumero);
    limpiarTodo(clienteNumero);

    // Después de limpiarTodo para que no sea borrado inmediatamente
    pendientesConfirmacion.set(clienteNumero, {
      ...infoPedido,
      resumen: datos.resumen,
      hora: horaVenta,
    });
    persistirEstado(clienteNumero);

    const _negocio = getConfig("nombre_negocio") || "el negocio";
    const msgComprobante = (getMensaje("comprobante_recibido")
      || "¡Gracias! Recibimos tu comprobante 📸\nTu pedido fue solicitado exitosamente y solo queda la confirmación de nuestro equipo de trabajo.\nEn breve te avisamos 🙏").replace(/{negocio}/g, _negocio);
    await msg.reply(msgComprobante);
  } catch (e) {
    console.error("❌ Error al procesar captura:", e.message);
    await msg.reply("Disculpa, tuve un problema al recibir tu comprobante. ¿Puedes mandarlo de nuevo? 🙏");
  }

  return true;
}

module.exports = { handleImagen };
