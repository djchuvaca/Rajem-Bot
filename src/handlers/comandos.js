const { pendientesConfirmacion } = require("../estado");
const { actualizarEstadoPedido, getPedidosHoy } = require("../db");

// ── HELPERS ───────────────────────────────────────────────────────────────────
function buscarCliente(numBuscar) {
  if (!numBuscar) {
    const primero = pendientesConfirmacion.keys().next();
    return primero.done ? null : primero.value;
  }
  for (const [key] of pendientesConfirmacion) {
    if (key.includes(numBuscar)) return key;
  }
  return null;
}

function formatearPedido(p, i) {
  const tipoIcon  = p.tipo === "domicilio" ? "🛵" : "🏪";
  const nombre    = [p.nombre, p.apellido].filter(Boolean).join(" ") || "Sin nombre";
  const telefono  = p.telefono || "—";
  const total     = p.total ? `$${Math.round(p.total)}` : "—";
  const hora      = p.fecha ? p.fecha.split(" ")[1]?.substring(0, 5) : "—";
  return `${i}. *${nombre}* — ${telefono}\n   ${tipoIcon} ${p.tipo || "—"} | 💰 ${total} | 🕐 ${hora}\n`;
}

function filtrarPedidos(estado) {
  return getPedidosHoy().filter(p => p.estado === estado);
}

// ── HANDLER PRINCIPAL ─────────────────────────────────────────────────────────
async function handleComandos(msg, client) {
  const texto = msg.body && msg.body.trim();
  if (!texto) return;

  const esComando = /^!(pedidos|confirmados|pendientes|cancelados|rechazados|confirmar|rechazar)/i.test(texto);
  if (!esComando) return;

  // ── !pedidos — todos los pedidos del día con estado ──────────────────────
  if (/^!pedidos$/i.test(texto)) {
    const todos = getPedidosHoy();
    if (todos.length === 0) {
      await msg.reply("📋 No hay pedidos registrados hoy.");
      return;
    }

    const porEstado = {
      pendiente:   todos.filter(p => p.estado === "pendiente"),
      confirmado:  todos.filter(p => p.estado === "confirmado"),
      cancelado:   todos.filter(p => p.estado === "cancelado"),
      rechazado:   todos.filter(p => p.estado === "rechazado"),
    };

    let msg_text = `📊 *PEDIDOS DEL DÍA — Tacos Javier*\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    msg_text += `🟡 Pendientes: ${porEstado.pendiente.length}   `;
    msg_text += `✅ Confirmados: ${porEstado.confirmado.length}\n`;
    msg_text += `❌ Cancelados: ${porEstado.cancelado.length}   `;
    msg_text += `⛔ Rechazados: ${porEstado.rechazado.length}\n`;
    msg_text += `━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    msg_text += `📦 *Total: ${todos.length} pedido${todos.length !== 1 ? "s" : ""}*\n\n`;

    const iconEstado = { pendiente: "🟡", confirmado: "✅", cancelado: "❌", rechazado: "⛔" };
    let i = 1;
    for (const p of todos) {
      const nombre   = [p.nombre, p.apellido].filter(Boolean).join(" ") || "Sin nombre";
      const tipoIcon = p.tipo === "domicilio" ? "🛵" : "🏪";
      const total    = p.total ? `$${Math.round(p.total)}` : "—";
      const hora     = p.fecha ? p.fecha.split(" ")[1]?.substring(0, 5) : "—";
      msg_text += `${iconEstado[p.estado] || "⚪"} ${i}. *${nombre}*\n`;
      msg_text += `   📱 ${p.telefono || "—"} | ${tipoIcon} ${p.tipo || "—"}\n`;
      msg_text += `   💰 ${total} | 🕐 ${hora}\n\n`;
      i++;
    }

    await msg.reply(msg_text.trim());
    return;
  }

  // ── !confirmados ──────────────────────────────────────────────────────────
  if (/^!confirmados$/i.test(texto)) {
    const lista = filtrarPedidos("confirmado");
    if (lista.length === 0) {
      await msg.reply("✅ No hay pedidos confirmados hoy.");
      return;
    }
    let out = `✅ *Pedidos confirmados hoy (${lista.length}):*\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    lista.forEach((p, i) => { out += formatearPedido(p, i + 1); });
    await msg.reply(out.trim());
    return;
  }

  // ── !pendientes ───────────────────────────────────────────────────────────
  if (/^!pendientes$/i.test(texto)) {
    // Combina los de la BD (estado pendiente) con los que están en memoria esperando confirmación
    const enBD     = filtrarPedidos("pendiente");
    const enMemoria = [...pendientesConfirmacion.values()];

    if (enBD.length === 0 && enMemoria.length === 0) {
      await msg.reply("🟡 No hay pedidos pendientes de confirmación.");
      return;
    }

    let out = `🟡 *Pedidos pendientes de confirmación (${enBD.length + enMemoria.length}):*\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    enBD.forEach((p, i) => { out += formatearPedido(p, i + 1); });

    // Los de memoria que aún no están en BD confirmados
    enMemoria.forEach((datos, i) => {
      const tipoIcon = datos.tipo === "domicilio" ? "🛵" : "🏪";
      out += `${enBD.length + i + 1}. *${datos.nombre || "—"}* — ${datos.telefono || "—"}\n`;
      out += `   ${tipoIcon} ${datos.tipo || "—"} | 💰 ${datos.total || "—"}\n`;
      out += `   Usa: !confirmar ${datos.telefono}\n\n`;
    });

    await msg.reply(out.trim());
    return;
  }

  // ── !cancelados ───────────────────────────────────────────────────────────
  if (/^!cancelados$/i.test(texto)) {
    const lista = filtrarPedidos("cancelado");
    if (lista.length === 0) {
      await msg.reply("❌ No hay pedidos cancelados hoy.");
      return;
    }
    let out = `❌ *Pedidos cancelados hoy (${lista.length}):*\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    lista.forEach((p, i) => { out += formatearPedido(p, i + 1); });
    await msg.reply(out.trim());
    return;
  }

  // ── !rechazados ───────────────────────────────────────────────────────────
  if (/^!rechazados$/i.test(texto)) {
    const lista = filtrarPedidos("rechazado");
    if (lista.length === 0) {
      await msg.reply("⛔ No hay pedidos rechazados hoy.");
      return;
    }
    let out = `⛔ *Pedidos rechazados hoy (${lista.length}):*\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    lista.forEach((p, i) => { out += formatearPedido(p, i + 1); });
    await msg.reply(out.trim());
    return;
  }

  // ── !confirmar [telefono] ─────────────────────────────────────────────────
  if (/^!confirmar/i.test(texto)) {
    const partes        = texto.split(" ");
    const numBuscar     = partes[1] ? partes[1].replace(/\D/g, "") : null;
    const numeroCliente = buscarCliente(numBuscar);

    if (!numeroCliente) {
      await msg.reply("⚠️ No encontré ese pedido. Usa *!pendientes* para ver la lista.");
      return;
    }

    const datos = pendientesConfirmacion.get(numeroCliente);
    let mensajeCliente = "";

    if (datos.tipo === "mostrador") {
      mensajeCliente =
        `✅ ¡Hola ${datos.nombre}! Tu pedido fue confirmado y está siendo preparado 🌮🔥\n` +
        `Te esperamos en el mostrador. ¡Gracias por tu preferencia! 😊`;
    } else if (datos.tipo === "domicilio") {
      mensajeCliente =
        `✅ ¡Hola ${datos.nombre}! Tu pedido fue confirmado y ya está en proceso 🛵🌮\n` +
        `Nuestro repartidor saldrá pronto. ¡Gracias por tu preferencia! 😊`;
    } else {
      mensajeCliente =
        `✅ ¡Hola ${datos.nombre}! Tu pago fue validado y tu pedido está en proceso 🌮✅\n` +
        `En breve lo tenemos listo. ¡Gracias por tu preferencia! 😊`;
    }

    try {
      await client.sendMessage(numeroCliente, mensajeCliente);
      try { actualizarEstadoPedido(datos.telefono, "confirmado"); } catch (e) { console.error("BD Error:", e.message); }
      pendientesConfirmacion.delete(numeroCliente);
      await msg.reply(`✅ Confirmación enviada a *${datos.nombre}* (${datos.telefono})`);
      console.log(`✅ Pedido confirmado para ${numeroCliente}`);
    } catch (e) {
      await msg.reply(`❌ Error al enviar confirmación: ${e.message}`);
    }
    return;
  }

  // ── !rechazar [telefono] ──────────────────────────────────────────────────
  if (/^!rechazar/i.test(texto)) {
    const partes        = texto.split(" ");
    const numBuscar     = partes[1] ? partes[1].replace(/\D/g, "") : null;
    const numeroCliente = buscarCliente(numBuscar);

    if (!numeroCliente) {
      await msg.reply("⚠️ No encontré ese pedido. Usa *!pendientes* para ver la lista.");
      return;
    }

    const datos = pendientesConfirmacion.get(numeroCliente);
    const mensajeRechazo =
      `⚠️ Estimado/a *${datos.nombre}*, nuestro equipo de trabajo revisó tu pedido ` +
      `y detectó un asunto importante con tu orden.\n` +
      `Enseguida se comunicarán contigo para resolverlo. ¡Disculpa los inconvenientes! 🙏`;

    try {
      await client.sendMessage(numeroCliente, mensajeRechazo);
      try { actualizarEstadoPedido(datos.telefono, "rechazado"); } catch (e) { console.error("BD Error:", e.message); }
      pendientesConfirmacion.delete(numeroCliente);
      await msg.reply(`⚠️ Rechazo enviado a *${datos.nombre}* (${datos.telefono})`);
      console.log(`⚠️ Pedido rechazado para ${numeroCliente}`);
    } catch (e) {
      await msg.reply(`❌ Error al enviar rechazo: ${e.message}`);
    }
  }
}

module.exports = { handleComandos };