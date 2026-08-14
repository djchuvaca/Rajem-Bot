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

    const infoPedido    = extraerDatosPedido(datos.resumen);
    const camposCliente = datosCampos.get(clienteNumero) || {};
    const hora_entrega  = camposCliente.hora || horaEntregaPreventa.get(clienteNumero) || null;

    // Guardar pedido en BD. Si el flujo MP registró el pedido pero falló al crear
    // el enlace y cayó aquí como fallback, datos.pedidoId ya tiene el ID → no duplicar.
    let pedidoId = datos.pedidoId || null;
    if (!pedidoId) {
      try {
        const telefonoLimpio = infoPedido.telefono || datos.telefono || null;
        const nombreCompleto = (infoPedido.nombre || "Cliente").trim();
        const partes = nombreCompleto.split(/\s+/);
        let nombre, apellido;
        if (partes.length === 1)      { nombre = partes[0];                    apellido = null; }
        else if (partes.length === 2) { nombre = partes[0];                    apellido = partes[1]; }
        else                          { nombre = partes.slice(0, 2).join(" "); apellido = partes.slice(2).join(" "); }
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
