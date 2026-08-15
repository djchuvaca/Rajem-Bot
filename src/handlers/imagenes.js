const fs   = require("fs");
const path = require("path");
const { MessageMedia } = require("whatsapp-web.js");
const { upsertCliente, registrarPedido, getMensaje, getConfig, getNotifDestinoJID, guardarTelefonoReal, guardarJIDReal } = require("../db");
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

async function descargarMediaDirecto(msg, client) {
  const messageId = msg.id?._serialized || msg.id?.$1;
  if (!messageId || !client?.pupPage) return null;
  return client.pupPage.evaluate(async msgId => {
    const coleccion = window.require('WAWebCollections').Msg;
    const modelo = coleccion.get(msgId) || (await coleccion.getMessagesById([msgId]))?.messages?.[0];
    if (!modelo) return null;
    const mockQpl = { addAnnotations() { return this; }, addPoint() { return this; } };
    const bytes = await window.require('WAWebDownloadManager').downloadManager.downloadAndMaybeDecrypt({
      directPath: modelo.directPath,
      encFilehash: modelo.encFilehash,
      filehash: modelo.filehash,
      mediaKey: modelo.mediaKey,
      mediaKeyTimestamp: modelo.mediaKeyTimestamp,
      type: modelo.type,
      signal: new AbortController().signal,
      downloadQpl: mockQpl,
    });
    return {
      data: await window.WWebJS.arrayBufferToBase64Async(bytes),
      mimetype: modelo.mimetype,
      filename: modelo.filename,
      filesize: modelo.size,
    };
  }, messageId);
}

async function descargarMediaConReintento(msg, client) {
  try {
    return await msg.downloadMedia();
  } catch (primerError) {
    const messageId = msg.id?._serialized || msg.id?.$1;
    if (messageId && typeof client?.getMessageById === 'function') {
      try {
        const actualizado = await client.getMessageById(messageId);
        if (actualizado && typeof actualizado.downloadMedia === 'function') return await actualizado.downloadMedia();
      } catch (_) {}
    }
    try {
      const directo = await descargarMediaDirecto(msg, client);
      if (directo?.data) return directo;
    } catch (fallbackError) {
      const detalle = fallbackError?.stack || fallbackError?.message || String(fallbackError);
      console.error('❌ Falló también la descarga directa del comprobante:', detalle);
    }
    throw primerError;
  }
}

async function reenviarComprobanteOriginal(msg, client, destinoJID) {
  if (!destinoJID) return false;
  try {
    if (typeof msg.forward === "function") {
      await msg.forward(destinoJID);
      return true;
    }
  } catch (error) {
    console.warn("[Comprobante] Falló msg.forward; intentando reenvío directo:", error?.message || String(error));
  }

  const messageId = msg.id?._serialized || msg.id?.$1;
  if (!messageId || !client?.pupPage) return false;
  try {
    await client.pupPage.evaluate(async (chatId, msgId) => {
      await window.WWebJS.forwardMessage(chatId, msgId);
    }, destinoJID, messageId);
    return true;
  } catch (error) {
    console.error("[Comprobante] Falló el reenvío directo:", error?.stack || error?.message || String(error));
    return false;
  }
}

async function handleImagen(msg, client) {
  if (!msg.hasMedia) return false;
  if (!esperandoCaptura.has(msg.from)) return false;

  const clienteNumero = msg.from;
  const datos         = esperandoCaptura.get(clienteNumero);
  const horaVenta     = new Date().toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });

  try {
    const destinoJID = getNotifDestinoJID();
    let media = null;
    let reenviadoOriginal = false;
    try {
      media = await descargarMediaConReintento(msg, client);
      if (!media?.data) throw new Error("WhatsApp no entregó el contenido del archivo");
    } catch (errorDescarga) {
      const tipo = String(msg.type || "").toLowerCase();
      if (tipo !== "image" && tipo !== "document") throw errorDescarga;
      reenviadoOriginal = await reenviarComprobanteOriginal(msg, client, destinoJID);
      if (!reenviadoOriginal) throw errorDescarga;
      console.warn("[Comprobante] Descarga no disponible; mensaje original reenviado para validación manual");
    }

    if (media) {
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
    }

    if (destinoJID) {
      try {
        await client.sendMessage(destinoJID,
          `🔔 *COMPROBANTE DE TRANSFERENCIA*\n🕐 *Hora:* ${horaVenta}\n\n${datos.resumen}\n\n` +
          `⚠️ *Validar antes de confirmar*${reenviadoOriginal ? " (reenvío original; descarga local no disponible)" : ""}\n` +
          `Usa: !confirmar ${datos.telefono}`
        );
        if (media) {
          const adjunto = media instanceof MessageMedia
            ? media
            : new MessageMedia(media.mimetype, media.data, media.filename || undefined, media.filesize || undefined);
          await client.sendMessage(destinoJID, adjunto);
        }
        console.log("📲 Resumen + comprobante enviados al destino administrativo");
      } catch (e) { console.error("❌ Error al enviar comprobante al destino administrativo:", e.message); }
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
    console.error("❌ Error al procesar captura:", e?.stack || e?.message || String(e));
    await msg.reply("Disculpa, tuve un problema al recibir tu comprobante. ¿Puedes mandarlo de nuevo? 🙏");
  }

  return true;
}

module.exports = { handleImagen, descargarMediaConReintento, descargarMediaDirecto, reenviarComprobanteOriginal };
