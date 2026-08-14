const {
  pendientesConfirmacion, clientesNuevos, datosCampos, resumenPendiente,
  esperandoConfirmacionItem, esperandoAgregarMas, esperandoCorte,
  esperandoTipoItem, esperandoCaptura, esperandoExtras, ordenPreResumen,
  limpiarTodo, extraerTelefonoDeJID, persistirEstado,
} = require("../estado");
const {
  actualizarEstadoPedido, actualizarEstadoConfirmado, actualizarEstadoPorId,
  getPedidosHoy, getPedidosPorCliente, getPedidosPorFecha,
  getCliente, getAllClientes, getTopClientes,
  upsertCliente, getConfig, setConfig, getJIDReal, limpiarTodasLasSesionesDB,
  guardarDespachoProgramado, marcarDespachoEjecutado, getDespachosPendientes,
} = require("../db");
const { invalidarCacheCortes } = require("./pedidoParser");
const catalogoTenant = require('../giros/catalogo-tenant');
const botPausado = require("../estado/bot-pausado");
const { enviarDespachoMandaditos, despacharConDelay } = require("./mandaditos");
const { calcularTarifaDomicilio } = require("../geo");
const { ordenPendientePreventa } = require("./flujos/utils");

// ── CONFIRMACIÓN DE GRUPO ADMIN ───────────────────────────────────────────────
let _grupoPendiente = null; // { id, timeout }

function setPendienteConfirmacionGrupo(grupoId) {
  if (_grupoPendiente?.timeout) clearTimeout(_grupoPendiente.timeout);
  _grupoPendiente = {
    id: grupoId,
    timeout: setTimeout(() => { _grupoPendiente = null; }, 5 * 60 * 1000),
  };
}

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

function construirJID(telefono) {
  const tel = telefono.replace(/\D/g, "").slice(-10);
  return getJIDReal(tel) || `521${tel}@c.us`;
}

function buscarJIDActivo(telRaw) {
  const mapas = [datosCampos, resumenPendiente, esperandoConfirmacionItem,
                 esperandoAgregarMas, esperandoCorte, esperandoTipoItem, esperandoCaptura,
                 esperandoExtras, ordenPreResumen];
  for (const mapa of mapas) {
    for (const jid of mapa.keys()) {
      if (jid.includes(telRaw)) return jid;
    }
  }
  for (const jid of clientesNuevos) {
    if (jid.includes(telRaw)) return jid;
  }
  return null;
}

function descripcionEstado(jid) {
  if (esperandoCaptura.has(jid))            return "esperando captura de pago 📸";
  if (resumenPendiente.has(jid))            return "confirmando resumen del pedido";
  if (esperandoConfirmacionItem.has(jid))   return "confirmando ítem del pedido";
  if (esperandoAgregarMas.has(jid))         return "decidiendo si agrega más";
  if (esperandoExtras.has(jid))             return "agregando extras (refresco/salsa)";
  if (ordenPreResumen.has(jid))             return "llenando formulario post-orden";
  if (esperandoCorte.has(jid))              return "eligiendo corte de carne";
  if (esperandoTipoItem.has(jid))           return "eligiendo taco o torta";
  if (datosCampos.has(jid))                 return "llenando formulario";
  if (clientesNuevos.has(jid))              return "inicio del flujo";
  return "activo";
}

function nombresCortesActivos() {
  const slugs = new Set(catalogoTenant.getMenuItemsActivos('corte').map(i => i.producto_slug));
  return catalogoTenant.getCortesTenant().filter(c => slugs.has(c.slug)).map(c => c.nombre.toLowerCase());
}

// ── HELPERS MANDADITOS ────────────────────────────────────────────────────────
// Parsea "8:00 a.m." / "12:30 p.m." a un Date de hoy
function _parsearHoraEntrega(horaStr) {
  if (!horaStr) return null;
  const m = horaStr.match(/(\d{1,2}):(\d{2})\s*(a\.m\.|p\.m\.)/i);
  if (!m) return null;
  let h = parseInt(m[1]);
  const min = parseInt(m[2]);
  if (/p\.m\./i.test(m[3]) && h < 12) h += 12;
  if (/a\.m\./i.test(m[3]) && h === 12) h = 0;
  const hoy = new Date();
  const fecha = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate(), h, min, 0, 0);
  // Si la hora de entrega ya pasó hoy, la entrega es mañana
  if (fecha.getTime() < Date.now()) fecha.setDate(fecha.getDate() + 1);
  return fecha;
}

// ── HANDLER PRINCIPAL ─────────────────────────────────────────────────────────
async function handleComandos(msg, client) {
  const texto = msg.body && msg.body.trim();
  if (!texto) return;

  // Diagnóstico seguro: solo revela el identificador del mismo grupo desde
  // el que se solicita. No requiere ser administrador del grupo.
  if (/^!(?:jid|idgrupo)$/i.test(texto) && String(msg.from || '').endsWith('@g.us')) {
    await msg.reply(`🆔 *JID de este grupo:*
${msg.from}

Puedes copiarlo completo en la configuración del tenant.`);
    return true;
  }

  // Cuando viene de un grupo: solo los admins del grupo pueden ejecutar comandos
  if (msg.from.endsWith('@g.us')) {
    try {
      const chat = await msg.getChat();
      const participante = chat.participants.find(p => p.id._serialized === msg.author);
      if (!participante?.isAdmin && !participante?.isSuperAdmin) return;
    } catch (_) {
      return; // sin permiso verificable = bloquear
    }
  }

  // ── Confirmación de grupo admin (respuesta a la pregunta de auto-detección) ──
  if (_grupoPendiente?.id === msg.from) {
    if (/^(s[íi]|si|yes|ok|dale|claro|correcto|afirmativo)$/i.test(texto)) {
      clearTimeout(_grupoPendiente.timeout);
      _grupoPendiente = null;
      setConfig("grupo_id", msg.from);
      await msg.reply("✅ ¡Listo! Este grupo queda configurado como grupo de administración.\nYa recibirás pedidos y notificaciones aquí.\n\nEscribe *!ayuda* para ver los comandos disponibles.");
      return;
    }
  }

  const esComando = /^!(pedidos|confirmados|pendientes|cancelados|rechazados|confirmar|rechazar|stats|cliente|listo|en_camino|mostradores|domicilios|mensaje|pausar|reanudar|buscar|historial|cancelar|ayuda|reporte|sesiones|resetear|limpiar|pedido|agotado|disponible|cerrar|abrir|precios|precio|editar|top|estado|cortes|ingresos)/i.test(texto);
  if (!esComando) return;

  // ── !ayuda — lista de comandos ─────────────────────────────────────────────
  if (/^!ayuda$/i.test(texto)) {
    const out =
      `🤖 *COMANDOS DISPONIBLES*\n━━━━━━━━━━━━━━━━━━\n` +
      `*Ver pedidos:*\n` +
      `!pedidos — todos los pedidos del día\n` +
      `!pendientes — esperando confirmación\n` +
      `!confirmados — pedidos confirmados\n` +
      `!domicilios — solo pedidos a domicilio\n` +
      `!mostradores — solo pedidos de mostrador\n` +
      `!cancelados / !rechazados\n\n` +
      `*Gestionar pedidos:*\n` +
      `!confirmar [tel] — confirmar pedido\n` +
      `!listo [tel] — avisar listo/en camino\n` +
      `!en_camino [id] — avisar en camino por ID de pedido\n` +
      `!cancelar [tel] — cancelar con aviso\n` +
      `!rechazar [tel] — rechazar pedido\n\n` +
      `*Clientes:*\n` +
      `!cliente [tel] — datos del cliente\n` +
      `!buscar [nombre] — buscar por nombre\n` +
      `!historial [tel] — historial de pedidos\n` +
      `!mensaje [tel] [texto] — mensaje directo\n\n` +
      `*Reportes:*\n` +
      `!stats — resumen del día\n` +
      `!ingresos — resumen financiero (ventas, ticket, método de pago)\n` +
      `!cortes — desglose de pedidos por corte hoy\n` +
      `!reporte ayer — resumen de ayer\n` +
      `!reporte semana — últimos 7 días\n\n` +
      `*Menú y productos:*\n` +
      `!precios — ver precios del menú\n` +
      `!precio [corte] [taco] [torta] — actualizar precio\n` +
      `!agotado [corte] — ocultarlo temporalmente de WhatsApp\n` +
      `!disponible [corte] — volver a mostrarlo en WhatsApp\n\n` +
      `*Negocio:*\n` +
      `!cerrar — cerrar el negocio manualmente hoy\n` +
      `!abrir — reabrir el negocio\n` +
      `!top — top clientes por número de pedidos\n\n` +
      `*Bot:*\n` +
      `!jid — mostrar el identificador de este grupo\n` +
      `!pausar — pausar respuestas automáticas\n` +
      `!reanudar — reactivar el bot\n` +
      `!sesiones — ver sesiones activas de clientes\n` +
      `!resetear [tel] — limpiar sesión de un cliente\n` +
      `!limpiar — eliminar TODAS las sesiones activas\n` +
      `!estado — estado del bot (uptime, sesiones, etc.)\n` +
      `━━━━━━━━━━━━━━━━━━`;
    await msg.reply(out);
    return;
  }

  // ── !pausar / !reanudar ────────────────────────────────────────────────────
  if (/^!pausar$/i.test(texto)) {
    botPausado.pausado = true; // el setter ya persiste en BD
    await msg.reply("⏸️ Bot en pausa. Los clientes no recibirán respuestas automáticas.\nUsa *!reanudar* para activarlo de nuevo.");
    return;
  }
  if (/^!reanudar$/i.test(texto)) {
    botPausado.pausado = false; // el setter ya persiste en BD
    await msg.reply("▶️ Bot reactivado. Volviendo a responder mensajes normalmente.");
    return;
  }

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

    const negocio = getConfig("nombre_negocio") || "el negocio";
    let msg_text = `📊 *PEDIDOS DEL DÍA — ${negocio.toUpperCase()}*\n━━━━━━━━━━━━━━━━━━\n`;
    msg_text += `🟡 Pendientes: ${porEstado.pendiente.length}   `;
    msg_text += `✅ Confirmados: ${porEstado.confirmado.length}\n`;
    msg_text += `❌ Cancelados: ${porEstado.cancelado.length}   `;
    msg_text += `⛔ Rechazados: ${porEstado.rechazado.length}\n`;
    msg_text += `━━━━━━━━━━━━━━━━━━\n`;
    msg_text += `📦 *Total: ${todos.length} pedido${todos.length !== 1 ? "s" : ""}*\n\n`;

    const iconEstado = { pendiente: "🟡", confirmado: "✅", cancelado: "❌", rechazado: "⛔", listo: "🏪", en_camino: "🛵" };
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
    let out = `✅ *Pedidos confirmados hoy (${lista.length}):*\n━━━━━━━━━━━━━━━━━━\n`;
    lista.forEach((p, i) => { out += formatearPedido(p, i + 1); });
    await msg.reply(out.trim());
    return;
  }

  // ── !pendientes ───────────────────────────────────────────────────────────
  if (/^!pendientes$/i.test(texto)) {
    const enBD      = filtrarPedidos("pendiente");
    const enMemoria = [...pendientesConfirmacion.values()];

    if (enBD.length === 0 && enMemoria.length === 0) {
      await msg.reply("🟡 No hay pedidos pendientes de confirmación.");
      return;
    }

    let out = `🟡 *Pedidos pendientes de confirmación (${enBD.length + enMemoria.length}):*\n━━━━━━━━━━━━━━━━━━\n`;
    enBD.forEach((p, i) => { out += formatearPedido(p, i + 1); });

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
    let out = `❌ *Pedidos cancelados hoy (${lista.length}):*\n━━━━━━━━━━━━━━━━━━\n`;
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
    let out = `⛔ *Pedidos rechazados hoy (${lista.length}):*\n━━━━━━━━━━━━━━━━━━\n`;
    lista.forEach((p, i) => { out += formatearPedido(p, i + 1); });
    await msg.reply(out.trim());
    return;
  }

  // ── !domicilios — solo pedidos a domicilio ────────────────────────────────
  if (/^!domicilios$/i.test(texto)) {
    const lista = getPedidosHoy().filter(p => p.tipo === "domicilio");
    if (lista.length === 0) {
      await msg.reply("🛵 No hay pedidos a domicilio hoy.");
      return;
    }
    const iconEstado = { pendiente: "🟡", confirmado: "✅", cancelado: "❌", rechazado: "⛔", listo: "🏪", en_camino: "🛵" };
    let out = `🛵 *Domicilios hoy (${lista.length}):*\n━━━━━━━━━━━━━━━━━━\n`;
    lista.forEach((p, i) => {
      const nombre = [p.nombre, p.apellido].filter(Boolean).join(" ") || "Sin nombre";
      const total  = p.total ? `$${Math.round(p.total)}` : "—";
      const hora   = p.fecha ? p.fecha.split(" ")[1]?.substring(0, 5) : "—";
      out += `${iconEstado[p.estado] || "⚪"} ${i + 1}. *${nombre}* — ${p.telefono || "—"}\n`;
      out += `   💰 ${total} | 🕐 ${hora}\n\n`;
    });
    await msg.reply(out.trim());
    return;
  }

  // ── !mostradores — solo pedidos de mostrador ──────────────────────────────
  if (/^!mostradores$/i.test(texto)) {
    const lista = getPedidosHoy().filter(p => p.tipo === "mostrador");
    if (lista.length === 0) {
      await msg.reply("🏪 No hay pedidos de mostrador hoy.");
      return;
    }
    const iconEstado = { pendiente: "🟡", confirmado: "✅", cancelado: "❌", rechazado: "⛔", listo: "🏪", en_camino: "🛵" };
    let out = `🏪 *Mostradores hoy (${lista.length}):*\n━━━━━━━━━━━━━━━━━━\n`;
    lista.forEach((p, i) => {
      const nombre = [p.nombre, p.apellido].filter(Boolean).join(" ") || "Sin nombre";
      const total  = p.total ? `$${Math.round(p.total)}` : "—";
      const hora   = p.fecha ? p.fecha.split(" ")[1]?.substring(0, 5) : "—";
      out += `${iconEstado[p.estado] || "⚪"} ${i + 1}. *${nombre}* — ${p.telefono || "—"}\n`;
      out += `   💰 ${total} | 🕐 ${hora}\n\n`;
    });
    await msg.reply(out.trim());
    return;
  }

  // ── !confirmar [telefono] ─────────────────────────────────────────────────
  if (/^!confirmar/i.test(texto)) {
    const partes    = texto.split(" ");
    const numBuscar = partes[1] ? partes[1].replace(/\D/g, "") : null;
    let numeroCliente = buscarCliente(numBuscar);
    let datos = numeroCliente ? pendientesConfirmacion.get(numeroCliente) : null;

    // Fallback a BD cuando el mapa en memoria está vacío (ej: reinicio del bot)
    if (!datos && numBuscar) {
      const tel = numBuscar.slice(-10);
      const cliente = getCliente(tel);
      if (cliente) {
        const pedidos = getPedidosPorCliente(tel);
        const pedidoPend = pedidos.find(p => p.estado === "pendiente");
        if (pedidoPend) {
          datos = {
            nombre:   [cliente.nombre, cliente.apellido].filter(Boolean).join(" ") || "Cliente",
            tipo:     pedidoPend.tipo || "mostrador",
            telefono: tel,
          };
          numeroCliente = construirJID(tel);
        }
      }
    }

    if (!datos) {
      await msg.reply("⚠️ No encontré ese pedido. Usa *!pendientes* para ver la lista.");
      return;
    }

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
      persistirEstado(numeroCliente); // elimina la sesión de BD para que no reaparezca en el próximo reinicio

      let replyAdmin = `✅ Confirmación enviada a *${datos.nombre}* (${datos.telefono})`;

      // Despacho al grupo de mandaditos (solo pedidos a domicilio)
      if (datos.tipo === "domicilio") {
        try {
          const tel10     = (datos.telefono || "").replace(/\D/g, "").slice(-10);
          const clienteBD = getCliente(tel10);
          const pedidoBD  = getPedidosPorCliente(tel10).find(p => p.estado === "confirmado");
          if (clienteBD && pedidoBD) {
            const tarifaInfo = calcularTarifaDomicilio(clienteBD.colonia);
            const tarifa     = tarifaInfo ? tarifaInfo.tarifa : 50;
            const despachoData = {
              pedidoId:          pedidoBD.id,
              clienteNombre:     datos.nombre,
              clienteTelefono:   tel10,
              clienteCalle:      clienteBD.calle_numero,
              clienteColonia:    clienteBD.colonia,
              clienteReferencia: clienteBD.referencia,
              totalOrden:        `$${pedidoBD.total}`,
              tarifaDomicilio:   tarifa,
            };

            if (pedidoBD.hora_entrega) {
              // Preventa: despachar 1 hora antes de la hora de entrega
              const horaEntrega  = _parsearHoraEntrega(pedidoBD.hora_entrega);
              const horaDespacho = horaEntrega ? new Date(horaEntrega.getTime() - 60 * 60 * 1000) : null;
              const msRestantes  = horaDespacho ? horaDespacho.getTime() - Date.now() : 0;

              if (horaDespacho && msRestantes > 0) {
                const horaStr = horaDespacho.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", hour12: true });
                const despachoId = guardarDespachoProgramado({
                  ...despachoData,
                  horaDespacho: horaDespacho.toISOString(),
                });
                setTimeout(() => {
                  enviarDespachoMandaditos(client, despachoData)
                    .then(() => marcarDespachoEjecutado(despachoId))
                    .catch(e => console.error("[Mandaditos] Error en despacho programado:", e.message));
                }, msRestantes);
                console.log(`[Mandaditos] Despacho preventa #${pedidoBD.id} (db #${despachoId}) programado para las ${horaStr}`);
                replyAdmin += `\n🕐 Despacho a mandaditos programado para las *${horaStr}* (1h antes de entrega a las ${pedidoBD.hora_entrega})`;
              } else {
                // La hora ya pasó (admin confirmó tarde): despachar de inmediato
                enviarDespachoMandaditos(client, despachoData)
                  .catch(e => console.error("[Mandaditos] Error al despachar:", e.message));
              }
            } else {
              // Pedido normal (no preventa): despacho con delay configurable
              despacharConDelay(client, despachoData)
                .catch(e => console.error("[Mandaditos] Error al programar despacho:", e.message));
            }
          }
        } catch (e) { console.error("[Mandaditos] Error preparando despacho:", e.message); }
      }

      await msg.reply(replyAdmin);
      console.log(`✅ Pedido confirmado para ${numeroCliente}`);
    } catch (e) {
      await msg.reply(`❌ Error al enviar confirmación: ${e.message}`);
    }
    return;
  }

  // ── !listo [telefono] — avisar al cliente que está listo/en camino ─────────
  if (/^!listo/i.test(texto)) {
    const partes    = texto.split(" ");
    const telRaw    = partes[1] ? partes[1].replace(/\D/g, "") : null;

    if (!telRaw) {
      await msg.reply("⚠️ Especifica el teléfono: *!listo 3312345678*");
      return;
    }

    const cliente = getCliente(telRaw);
    if (!cliente) {
      await msg.reply(`⚠️ No encontré ningún cliente con teléfono *${telRaw}*.`);
      return;
    }

    const pedidoHoy = getPedidosHoy().find(p => p.telefono === telRaw && p.estado === "confirmado");
    if (!pedidoHoy) {
      await msg.reply(`⚠️ No encontré un pedido *confirmado* para *${telRaw}*.\nAsegúrate de haber usado *!confirmar* primero.`);
      return;
    }

    const nombre = [cliente.nombre, cliente.apellido].filter(Boolean).join(" ") || "Cliente";
    const jid    = construirJID(telRaw);
    let mensajeCliente, nuevoEstado;

    if (pedidoHoy.tipo === "domicilio") {
      mensajeCliente = `🛵 ¡Hola ${nombre}! Tu pedido ya va en camino, pronto llegará. ¡Gracias por tu preferencia! 😊`;
      nuevoEstado    = "en_camino";
    } else {
      mensajeCliente = `🏪 ¡Hola ${nombre}! Tu pedido ya está listo para recoger en el mostrador. ¡Te esperamos! 😊`;
      nuevoEstado    = "listo";
    }

    try {
      await client.sendMessage(jid, mensajeCliente);
      try { actualizarEstadoConfirmado(telRaw, nuevoEstado); } catch (e) { console.error("BD Error:", e.message); }
      await msg.reply(`✅ Aviso enviado a *${nombre}* (${telRaw}) — pedido marcado como *${nuevoEstado}*`);
    } catch (e) {
      await msg.reply(`❌ Error al notificar: ${e.message}`);
    }
    return;
  }

  // ── !en_camino [id] — avisar que el pedido va en camino (por ID de pedido) ──
  if (/^!en_camino/i.test(texto)) {
    const partes = texto.split(" ");
    const idNum  = partes[1] ? parseInt(partes[1]) : NaN;

    if (isNaN(idNum)) {
      await msg.reply("⚠️ Especifica el ID del pedido: *!en_camino 42*\nEl ID aparece en el resumen del grupo y en el panel.");
      return;
    }

    const pedidoHoy = getPedidosHoy().find(p => p.id === idNum);
    if (!pedidoHoy) {
      await msg.reply(`⚠️ No encontré el pedido *#${idNum}* en los pedidos de hoy.`);
      return;
    }
    if (!pedidoHoy.telefono) {
      await msg.reply(`⚠️ El pedido *#${idNum}* no tiene teléfono registrado. Usa *!listo [tel]* directamente.`);
      return;
    }

    const cliente = getCliente(pedidoHoy.telefono);
    const nombre  = [cliente?.nombre, cliente?.apellido].filter(Boolean).join(" ") || "Cliente";
    const jid     = construirJID(pedidoHoy.telefono);
    const mensajeCliente = `🛵 ¡Hola ${nombre}! Tu pedido ya va en camino, pronto llegará. ¡Gracias por tu preferencia! 😊`;

    try {
      await client.sendMessage(jid, mensajeCliente);
      try { actualizarEstadoPorId(idNum, "en_camino"); } catch (e) { console.error("BD Error:", e.message); }
      await msg.reply(`✅ Aviso enviado a *${nombre}* (${pedidoHoy.telefono}) — pedido *#${idNum}* marcado como en camino`);
    } catch (e) {
      await msg.reply(`❌ Error al notificar: ${e.message}`);
    }
    return;
  }

  // ── !cancelar [telefono] — cancelar pedido con aviso al cliente ────────────
  if (/^!cancelar/i.test(texto)) {
    const partes    = texto.split(" ");
    const numBuscar = partes[1] ? partes[1].replace(/\D/g, "") : null;

    // Primero busca en pendientes (aún no confirmados)
    const numeroCliente = buscarCliente(numBuscar);
    if (numeroCliente) {
      const datos = pendientesConfirmacion.get(numeroCliente);
      const mensajeCancelacion =
        `❌ Hola *${datos.nombre}*, lamentablemente tuvimos que cancelar tu pedido.\n` +
        `Si tienes alguna duda, con gusto te atendemos. ¡Disculpa los inconvenientes! 🙏`;
      try {
        await client.sendMessage(numeroCliente, mensajeCancelacion);
        try { actualizarEstadoPedido(datos.telefono, "cancelado"); } catch (e) { console.error("BD Error:", e.message); }
        pendientesConfirmacion.delete(numeroCliente);
        persistirEstado(numeroCliente); // elimina sesión de BD
        await msg.reply(`❌ Cancelación enviada a *${datos.nombre}* (${datos.telefono})`);
      } catch (e) {
        await msg.reply(`❌ Error al enviar cancelación: ${e.message}`);
      }
      return;
    }

    // Si no está en pendientes, busca en confirmados del día
    if (!numBuscar) {
      await msg.reply("⚠️ Especifica el teléfono: *!cancelar 3312345678*\nUsa *!pendientes* o *!confirmados* para ver la lista.");
      return;
    }

    const cliente = getCliente(numBuscar);
    if (!cliente) {
      await msg.reply(`⚠️ No encontré ningún cliente con teléfono *${numBuscar}*.`);
      return;
    }

    const nombre = [cliente.nombre, cliente.apellido].filter(Boolean).join(" ") || "Cliente";
    const jid    = construirJID(numBuscar);
    const mensajeCancelacion =
      `❌ Hola *${nombre}*, lamentablemente tuvimos que cancelar tu pedido.\n` +
      `Si tienes alguna duda, con gusto te atendemos. ¡Disculpa los inconvenientes! 🙏`;

    try {
      await client.sendMessage(jid, mensajeCancelacion);
      try { actualizarEstadoConfirmado(numBuscar, "cancelado"); } catch (e) { console.error("BD Error:", e.message); }
      persistirEstado(jid); // limpia cualquier sesión residual en BD
      await msg.reply(`❌ Cancelación enviada a *${nombre}* (${numBuscar})`);
    } catch (e) {
      await msg.reply(`❌ Error al enviar cancelación: ${e.message}`);
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
      persistirEstado(numeroCliente); // elimina sesión de BD
      await msg.reply(`⚠️ Rechazo enviado a *${datos.nombre}* (${datos.telefono})`);
      console.log(`⚠️ Pedido rechazado para ${numeroCliente}`);
    } catch (e) {
      await msg.reply(`❌ Error al enviar rechazo: ${e.message}`);
    }
    return;
  }

  // ── !stats — resumen del día ──────────────────────────────────────────────
  if (/^!stats$/i.test(texto)) {
    const pedidos     = getPedidosHoy();
    const confirmados = pedidos.filter(p => ["confirmado", "listo", "en_camino"].includes(p.estado));
    const pendientes  = pedidos.filter(p => p.estado === "pendiente");
    const cancelados  = pedidos.filter(p => p.estado === "cancelado");
    const rechazados  = pedidos.filter(p => p.estado === "rechazado");

    const totalVentas = confirmados.reduce((s, p) => s + (p.total || 0), 0);
    const ticket      = confirmados.length ? Math.round(totalVentas / confirmados.length) : 0;
    const negocio     = getConfig("nombre_negocio") || "Tacos Javier";

    const CORTES    = nombresCortesActivos();
    const conteo    = {};
    for (const p of pedidos) {
      const orden = (p.orden || "").toLowerCase();
      for (const c of CORTES) if (orden.includes(c)) conteo[c] = (conteo[c] || 0) + 1;
    }
    const ranking = Object.entries(conteo).sort((a, b) => b[1] - a[1]);

    const fecha = new Date().toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" });

    let out = `📊 *RESUMEN DEL DÍA — ${negocio}*\n`;
    out    += `_${fecha}_\n`;
    out    += `━━━━━━━━━━━━━━━━━━\n`;
    out    += `📦 Total pedidos:  *${pedidos.length}*\n`;
    out    += `✅ Confirmados:    *${confirmados.length}*\n`;
    out    += `🟡 Pendientes:     *${pendientes.length}*\n`;
    if (cancelados.length) out += `❌ Cancelados:    *${cancelados.length}*\n`;
    if (rechazados.length) out += `⛔ Rechazados:    *${rechazados.length}*\n`;
    out    += `\n💰 Ventas:        *$${Math.round(totalVentas)}*\n`;
    if (ticket) out += `🎫 Ticket prom:   *$${ticket}*\n`;

    if (ranking.length) {
      out += `\n🥩 *Top cortes:*\n`;
      for (const [corte, n] of ranking) {
        out += `   ${corte} — ${n} pedido${n !== 1 ? "s" : ""}\n`;
      }
    }
    out += `━━━━━━━━━━━━━━━━━━`;

    await msg.reply(out);
    return;
  }

  // ── !reporte [ayer|semana] — resumen de fechas anteriores ─────────────────
  if (/^!reporte/i.test(texto)) {
    const partes  = texto.split(" ");
    const periodo = (partes[1] || "ayer").toLowerCase();

    const hoy = new Date();
    let fechaInicio, fechaFin, label;

    if (periodo === "semana") {
      const hace7 = new Date(hoy);
      hace7.setDate(hoy.getDate() - 7);
      fechaInicio = hace7.toISOString().split("T")[0];
      fechaFin    = hoy.toISOString().split("T")[0];
      label       = "últimos 7 días";
    } else if (periodo === "mes") {
      const primero = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
      fechaInicio = primero.toISOString().split("T")[0];
      fechaFin    = hoy.toISOString().split("T")[0];
      label       = `${hoy.toLocaleString("es-MX", { month: "long" })} ${hoy.getFullYear()}`;
    } else {
      const ayer = new Date(hoy);
      ayer.setDate(hoy.getDate() - 1);
      fechaInicio = ayer.toISOString().split("T")[0];
      fechaFin    = ayer.toISOString().split("T")[0];
      label       = "ayer";
    }

    const pedidos = getPedidosPorFecha(fechaInicio, fechaFin);
    if (pedidos.length === 0) {
      await msg.reply(`📊 No hay pedidos registrados para *${label}*.`);
      return;
    }

    const confirmados  = pedidos.filter(p => ["confirmado", "listo", "en_camino"].includes(p.estado));
    const cancelados   = pedidos.filter(p => ["cancelado", "rechazado"].includes(p.estado));
    const totalVentas  = confirmados.reduce((s, p) => s + (p.total || 0), 0);
    const ticket       = confirmados.length ? Math.round(totalVentas / confirmados.length) : 0;

    const CORTES = nombresCortesActivos();
    const conteo = {};
    for (const p of pedidos) {
      const orden = (p.orden || "").toLowerCase();
      for (const c of CORTES) if (orden.includes(c)) conteo[c] = (conteo[c] || 0) + 1;
    }
    const ranking = Object.entries(conteo).sort((a, b) => b[1] - a[1]);

    let out = `📊 *REPORTE — ${label.toUpperCase()}*\n━━━━━━━━━━━━━━━━━━\n`;
    out += `📦 Total pedidos:  *${pedidos.length}*\n`;
    out += `✅ Confirmados:    *${confirmados.length}*\n`;
    if (cancelados.length) out += `❌ Cancelados:    *${cancelados.length}*\n`;
    out += `\n💰 Ventas:        *$${Math.round(totalVentas)}*\n`;
    if (ticket) out += `🎫 Ticket prom:   *$${ticket}*\n`;
    if (ranking.length) {
      out += `\n🥩 *Top cortes:*\n`;
      for (const [corte, n] of ranking) {
        out += `   ${corte} — ${n} pedido${n !== 1 ? "s" : ""}\n`;
      }
    }
    out += `━━━━━━━━━━━━━━━━━━`;

    await msg.reply(out);
    return;
  }

  // ── !cliente [telefono] — datos de un cliente ─────────────────────────────
  if (/^!cliente/i.test(texto)) {
    const partes   = texto.split(" ");
    const telRaw   = partes[1] ? partes[1].replace(/\D/g, "") : null;

    const tel = telRaw || (() => {
      const jid = [...pendientesConfirmacion.keys()][0];
      return jid ? jid.replace(/\D/g, "").slice(-10) : null;
    })();

    if (!tel) {
      await msg.reply("⚠️ Uso: *!cliente [teléfono]*\nEjemplo: !cliente 3312345678");
      return;
    }

    const cliente = getCliente(tel) ||
      (tel.length < 10 ? (() => {
        const todos = require("../db").getAllClientes();
        return todos.find(c => c.telefono?.endsWith(tel)) || null;
      })() : null);

    if (!cliente) {
      await msg.reply(`⚠️ No encontré ningún cliente con teléfono *${tel}*.`);
      return;
    }

    const nombre    = [cliente.nombre, cliente.apellido].filter(Boolean).join(" ") || "Sin nombre";
    const fechaReg  = cliente.fecha_registro?.split(" ")[0] || "—";

    let out = `👤 *CLIENTE — ${nombre}*\n`;
    out    += `━━━━━━━━━━━━━━━━━━\n`;
    out    += `📱 Teléfono:  ${cliente.telefono}\n`;
    if (cliente.calle_numero) {
      out += `🏠 Dirección: ${cliente.calle_numero}`;
      if (cliente.colonia) out += `, ${cliente.colonia}`;
      out += "\n";
    }
    if (cliente.referencia)   out += `📍 Ref:       ${cliente.referencia}\n`;
    out    += `📦 Pedidos:   ${cliente.total_pedidos || 0} en total\n`;
    out    += `🗓️  Registro:  ${fechaReg}\n`;

    if (cliente.ultimo_pedido_json) {
      try {
        const ultimo = JSON.parse(cliente.ultimo_pedido_json);
        const desc   = Array.isArray(ultimo) ? ultimo.map(i => i.linea || i).join(", ") : JSON.stringify(ultimo);
        out += `\n_Último pedido:_ ${desc}`;
      } catch (_) {}
    }

    await msg.reply(out);
    return;
  }

  // ── !buscar [nombre] — buscar cliente por nombre ──────────────────────────
  if (/^!buscar/i.test(texto)) {
    const partes = texto.split(" ");
    const query  = partes.slice(1).join(" ").toLowerCase().trim();

    if (!query) {
      await msg.reply("⚠️ Uso: *!buscar [nombre]*\nEjemplo: !buscar Juan García");
      return;
    }

    const todos       = getAllClientes();
    const resultados  = todos.filter(c => {
      const nombre = `${c.nombre || ""} ${c.apellido || ""}`.toLowerCase();
      return nombre.includes(query) || (c.telefono || "").includes(query);
    }).slice(0, 5);

    if (!resultados.length) {
      await msg.reply(`⚠️ No encontré clientes con *"${query}"*.`);
      return;
    }

    let out = `🔍 *Resultados para "${query}" (${resultados.length}):*\n━━━━━━━━━━━━━━━━━━\n`;
    for (const c of resultados) {
      const nombre = [c.nombre, c.apellido].filter(Boolean).join(" ") || "Sin nombre";
      out += `👤 *${nombre}*\n`;
      out += `   📱 ${c.telefono} | 📦 ${c.total_pedidos || 0} pedidos\n`;
      if (c.calle_numero) out += `   🏠 ${c.calle_numero}${c.colonia ? ", " + c.colonia : ""}\n`;
      out += "\n";
    }

    await msg.reply(out.trim());
    return;
  }

  // ── !historial [telefono] — pedidos anteriores de un cliente ─────────────
  if (/^!historial/i.test(texto)) {
    const partes = texto.split(" ");
    const telRaw = partes[1] ? partes[1].replace(/\D/g, "") : null;

    if (!telRaw) {
      await msg.reply("⚠️ Uso: *!historial [teléfono]*\nEjemplo: !historial 3312345678");
      return;
    }

    const cliente = getCliente(telRaw);
    const pedidos = getPedidosPorCliente(telRaw);

    if (!cliente || !pedidos.length) {
      await msg.reply(`⚠️ No encontré historial para *${telRaw}*.`);
      return;
    }

    const nombre    = [cliente.nombre, cliente.apellido].filter(Boolean).join(" ") || "Sin nombre";
    const iconEstado = { pendiente: "🟡", confirmado: "✅", cancelado: "❌", rechazado: "⛔", listo: "🏪", en_camino: "🛵" };

    let out = `📋 *Historial de ${nombre}* (${pedidos.length} pedidos)\n━━━━━━━━━━━━━━━━━━\n`;
    for (const p of pedidos) {
      const fecha = p.fecha ? p.fecha.split(" ")[0] : "—";
      const hora  = p.fecha ? p.fecha.split(" ")[1]?.substring(0, 5) : "—";
      const total = p.total ? `$${Math.round(p.total)}` : "—";
      const tipo  = p.tipo === "domicilio" ? "🛵" : "🏪";
      out += `${iconEstado[p.estado] || "⚪"} ${fecha} ${hora} — ${tipo} ${total}\n`;
      if (p.orden) out += `   _${p.orden.substring(0, 60)}${p.orden.length > 60 ? "..." : ""}_\n`;
      out += "\n";
    }

    await msg.reply(out.trim());
    return;
  }

  // ── !pedido [telefono] — detalle completo de un pedido del día ───────────
  if (/^!pedido/i.test(texto)) {
    const partes = texto.split(" ");
    const telRaw = partes[1] ? partes[1].replace(/\D/g, "") : null;

    if (!telRaw) {
      await msg.reply("⚠️ Uso: *!pedido [teléfono]*\nEjemplo: !pedido 3312345678");
      return;
    }

    const cliente   = getCliente(telRaw);
    const pedidoHoy = getPedidosHoy().find(p => p.telefono === telRaw);

    if (!pedidoHoy) {
      await msg.reply(`⚠️ No encontré ningún pedido hoy para *${telRaw}*.`);
      return;
    }

    const nombre    = [pedidoHoy.nombre, pedidoHoy.apellido].filter(Boolean).join(" ") || "Sin nombre";
    const hora      = pedidoHoy.fecha ? pedidoHoy.fecha.split(" ")[1]?.substring(0, 5) : "—";
    const total     = pedidoHoy.total ? `$${Math.round(pedidoHoy.total)}` : "—";
    const iconEstado = { pendiente: "🟡", confirmado: "✅", cancelado: "❌", rechazado: "⛔", listo: "🏪", en_camino: "🛵" };

    let out = `📋 *Pedido de ${nombre}*\n━━━━━━━━━━━━━━━━━━\n`;
    out += `${pedidoHoy.tipo === "domicilio" ? "🛵 Domicilio" : "🏪 Mostrador"} | 🕐 ${hora}\n`;

    if (pedidoHoy.tipo === "domicilio" && cliente) {
      if (cliente.calle_numero) out += `📍 ${cliente.calle_numero}${cliente.colonia ? ", " + cliente.colonia : ""}\n`;
      if (cliente.referencia)   out += `   Ref: ${cliente.referencia}\n`;
    }
    if (pedidoHoy.hora_entrega) out += `⏰ Entrega: ${pedidoHoy.hora_entrega}\n`;
    if (pedidoHoy.metodo_pago)  out += `💳 ${pedidoHoy.metodo_pago} | `;
    out += `💰 ${total}\n`;

    if (pedidoHoy.orden) {
      out += `\n🥩 *Orden:*\n${pedidoHoy.orden}\n`;
    }

    out += `\nEstado: ${iconEstado[pedidoHoy.estado] || "⚪"} ${pedidoHoy.estado}`;

    await msg.reply(out);
    return;
  }

  // ── !precios — ver precios actuales del menú ──────────────────────────────
  if (/^!precios$/i.test(texto)) {
    const items = catalogoTenant.getMenuItemsActivos();
    if (!items.length) {
      await msg.reply("⚠️ No hay productos registrados.");
      return;
    }
    const negocio = getConfig("nombre_negocio") || "Tacos Javier";
    let out = `🥩 *Menú — ${negocio}*\n━━━━━━━━━━━━━━━━━━\n`;
    for (const p of items) {
      const def = catalogoTenant.getDefinicionProducto(p.categoria, p.producto_slug);
      const nombre = def?.nombre || p.producto_slug;
      const formato = p.formato_slug ? ` · ${p.formato_slug}` : '';
      out += `• *${nombre}${formato}* — $${Number(p.precio || 0)}\n`;
    }
    await msg.reply(out.trim());
    return;
  }

  // ── !precio [corte] [taco] [torta] — actualizar precio de un corte ───────
  if (/^!precio\s/i.test(texto)) {
    const partes = texto.split(/\s+/);
    if (partes.length < 4) {
      await msg.reply("⚠️ Uso: *!precio [corte] [precio taco] [precio torta]*\nEjemplo: !precio buche 30 60");
      return;
    }
    const corte      = partes[1].toLowerCase();
    const precioTaco  = parseFloat(partes[2]);
    const precioTorta = parseFloat(partes[3]);

    if (isNaN(precioTaco) || isNaN(precioTorta) || precioTaco <= 0 || precioTorta <= 0) {
      await msg.reply("⚠️ Los precios deben ser números válidos mayores a 0.");
      return;
    }

    const def = catalogoTenant.getDefinicionProducto('corte', corte);
    if (!def) {
      await msg.reply(`⚠️ No encontré el corte *${corte}*. Usa *!precios* para ver los disponibles.`);
      return;
    }

    const cambios = catalogoTenant.setPreciosCorte(def.slug, { taco: precioTaco, torta: precioTorta });
    if (!cambios) {
      await msg.reply(`⚠️ El corte *${corte}* no está agregado al menú con taco o torta.`);
      return;
    }
    invalidarCacheCortes();
    await msg.reply(`✅ Precio de *${corte}* actualizado:\n🌮 Taco: $${precioTaco}  🥪 Torta: $${precioTorta}`);
    return;
  }

  // Disponibilidad operativa. No altera la habilitación asignada por Superadmin.
  if (/^!(agotado|disponible)\b/i.test(texto)) {
    const disponible = /^!disponible\b/i.test(texto);
    const corte = texto.split(/\s+/).slice(1).join(' ').toLowerCase().trim();
    if (!corte) {
      await msg.reply(`⚠️ Uso: *!${disponible ? 'disponible' : 'agotado'} [corte]*`);
      return;
    }
    const def = catalogoTenant.getDefinicionProducto('corte', corte);
    if (!def) {
      await msg.reply(`⚠️ No encontré el corte *${corte}* en el Giro activo.`);
      return;
    }
    const cambios = catalogoTenant.setMenuItemDisponibilidad(def.slug, 'corte', disponible);
    if (!cambios) {
      await msg.reply(`⚠️ *${def.nombre || corte}* no está habilitado por el Superadmin para este negocio.`);
      return;
    }
    invalidarCacheCortes();
    await msg.reply(disponible
      ? `✅ *${def.nombre || corte}* está disponible y vuelve a mostrarse en WhatsApp.`
      : `⛔ *${def.nombre || corte}* quedó agotado y se ocultó temporalmente de WhatsApp.`);
    return;
  }

  // ── !cerrar — cerrar el negocio manualmente hoy ───────────────────────────
  if (/^!cerrar$/i.test(texto)) {
    setConfig("cierre_manual", "1");
    await msg.reply("🔒 Negocio cerrado manualmente. Los clientes recibirán el mensaje de fuera de horario.\nUsa *!abrir* para reabrir.");
    return;
  }

  // ── !abrir — reabrir el negocio ───────────────────────────────────────────
  if (/^!abrir$/i.test(texto)) {
    setConfig("cierre_manual", "0");
    await msg.reply("🔓 Negocio abierto. El bot vuelve a atender en horario normal.");
    return;
  }

  // ── !top — top clientes por número de pedidos ────────────────────────────
  if (/^!top$/i.test(texto)) {
    const lista = getTopClientes(10);
    if (!lista.length) {
      await msg.reply("📭 No hay clientes con pedidos registrados aún.");
      return;
    }
    const negocio = getConfig("nombre_negocio") || "Tacos Javier";
    let out = `🏆 *Top clientes — ${negocio}*\n━━━━━━━━━━━━━━━━━━\n`;
    lista.forEach((c, i) => {
      const nombre = [c.nombre, c.apellido].filter(Boolean).join(" ") || "Sin nombre";
      const gasto  = c.gasto_total ? ` | 💰 $${Math.round(c.gasto_total)}` : "";
      out += `${i + 1}. *${nombre}*\n   📱 ${c.telefono} | 📦 ${c.total_pedidos} pedidos${gasto}\n\n`;
    });
    await msg.reply(out.trim());
    return;
  }

  // ── !editar [telefono] [campo] [valor] — editar datos de un cliente ───────
  if (/^!editar/i.test(texto)) {
    const partes = texto.split(/\s+/);
    if (partes.length < 4) {
      await msg.reply(
        "⚠️ Uso: *!editar [teléfono] [campo] [valor]*\n" +
        "Campos: nombre, apellido, direccion, colonia, referencia\n" +
        "Ejemplo: !editar 3312345678 direccion Calle Morelos 123"
      );
      return;
    }

    const telRaw = partes[1].replace(/\D/g, "");
    const campo  = partes[2].toLowerCase();
    const valor  = partes.slice(3).join(" ").trim();

    const camposValidos = { nombre: "nombre", apellido: "apellido", direccion: "calle_numero",
                            dirección: "calle_numero", colonia: "colonia", referencia: "referencia",
                            ref: "referencia" };
    const campoDb = camposValidos[campo];

    if (!campoDb) {
      await msg.reply("⚠️ Campo inválido. Usa: nombre, apellido, direccion, colonia, referencia");
      return;
    }

    const cliente = getCliente(telRaw);
    if (!cliente) {
      await msg.reply(`⚠️ No encontré ningún cliente con teléfono *${telRaw}*.`);
      return;
    }

    upsertCliente({ telefono: telRaw, [campoDb]: valor });
    const nombre = [cliente.nombre, cliente.apellido].filter(Boolean).join(" ") || telRaw;
    await msg.reply(`✅ *${campo}* de *${nombre}* actualizado a: ${valor}`);
    return;
  }

  // ── !estado — estado del bot ──────────────────────────────────────────────
  if (/^!estado$/i.test(texto)) {
    const uptime  = process.uptime();
    const horas   = Math.floor(uptime / 3600);
    const minutos = Math.floor((uptime % 3600) / 60);
    const uptimeStr = horas > 0 ? `${horas}h ${minutos}m` : `${minutos}m`;

    const mapasActivos = [datosCampos, resumenPendiente, esperandoConfirmacionItem,
                          esperandoAgregarMas, esperandoCorte, esperandoTipoItem, esperandoCaptura];
    const sesionesActivas = mapasActivos.reduce((acc, m) => acc + m.size, 0) + clientesNuevos.size;

    const cerradoManual = getConfig("cierre_manual") === "1";
    const negocio       = getConfig("nombre_negocio") || "Tacos Javier";

    let out = `🤖 *ESTADO — ${negocio}*\n━━━━━━━━━━━━━━━━━━\n`;
    out += `⏱️ Uptime:    *${uptimeStr}*\n`;
    out += `📡 Sesiones:  *${sesionesActivas} activa(s)*\n`;
    out += `🔘 Bot:       *${botPausado.pausado ? "⏸️ Pausado" : "▶️ Activo"}*\n`;
    out += `🏪 Negocio:   *${cerradoManual ? "🔒 Cerrado manual" : "🔓 Abierto"}*\n`;
    out += `📦 Versión:   *${require("../../package.json").version}*\n`;
    out += `━━━━━━━━━━━━━━━━━━`;

    await msg.reply(out);
    return;
  }

  // ── !sesiones — ver sesiones activas de clientes ─────────────────────────
  if (/^!sesiones$/i.test(texto)) {
    const activos = new Map(); // jid → descripción de estado

    const registrar = (jid) => {
      if (!activos.has(jid)) activos.set(jid, descripcionEstado(jid));
    };

    for (const jid of clientesNuevos)                  registrar(jid);
    for (const [jid] of datosCampos)                   registrar(jid);
    for (const [jid] of esperandoCorte)                registrar(jid);
    for (const [jid] of esperandoTipoItem)             registrar(jid);
    for (const [jid] of esperandoConfirmacionItem)     registrar(jid);
    for (const [jid] of esperandoAgregarMas)           registrar(jid);
    for (const [jid] of resumenPendiente)              registrar(jid);
    for (const [jid] of esperandoCaptura)              registrar(jid);

    if (activos.size === 0) {
      await msg.reply("📭 No hay sesiones de clientes activas en este momento.");
      return;
    }

    let out = `📡 *Sesiones activas (${activos.size}):*\n━━━━━━━━━━━━━━━━━━\n`;
    let i = 1;
    for (const [jid, estado] of activos) {
      const tel = extraerTelefonoDeJID(jid) || jid;
      out += `${i}. 📱 *${tel}*\n   ${estado}\n\n`;
      i++;
    }
    out += `_Usa !resetear [tel] para limpiar una sesión._`;

    await msg.reply(out.trim());
    return;
  }

  // ── !resetear [telefono] — limpiar sesión de un cliente ──────────────────
  if (/^!resetear/i.test(texto)) {
    const partes = texto.split(" ");
    const telRaw = partes[1] ? partes[1].replace(/\D/g, "") : null;

    if (!telRaw) {
      await msg.reply("⚠️ Uso: *!resetear [teléfono]*\nEjemplo: !resetear 3312345678\nUsa *!sesiones* para ver las activas.");
      return;
    }

    const jid = buscarJIDActivo(telRaw) || getJIDReal(telRaw);

    if (!jid) {
      await msg.reply(`⚠️ No encontré sesión activa para *${telRaw}*.\nUsa *!sesiones* para ver las sesiones activas.`);
      return;
    }

    limpiarTodo(jid);
    ordenPendientePreventa.delete(jid);
    clientesNuevos.delete(jid);

    await msg.reply(`🗑️ Sesión de *${telRaw}* eliminada. El cliente puede iniciar de nuevo cuando escriba.`);
    return;
  }

  // ── !limpiar — eliminar todas las sesiones activas ───────────────────────
  if (/^!limpiar/i.test(texto)) {
    const jidsActivos = new Set();
    for (const jid of clientesNuevos)              jidsActivos.add(jid);
    for (const [jid] of datosCampos)               jidsActivos.add(jid);
    for (const [jid] of resumenPendiente)           jidsActivos.add(jid);
    for (const [jid] of esperandoConfirmacionItem)  jidsActivos.add(jid);
    for (const [jid] of esperandoAgregarMas)        jidsActivos.add(jid);
    for (const [jid] of esperandoCorte)             jidsActivos.add(jid);
    for (const [jid] of esperandoTipoItem)          jidsActivos.add(jid);
    for (const [jid] of esperandoCaptura)           jidsActivos.add(jid);

    if (!/^!limpiar\s+confirmar$/i.test(texto)) {
      if (jidsActivos.size === 0) {
        await msg.reply("📭 No hay sesiones activas en este momento.");
        return;
      }
      await msg.reply(
        `⚠️ *¿Eliminar TODAS las sesiones?*\n\n` +
        `Esto borrará *${jidsActivos.size} sesión(es) activa(s)*.\n` +
        `Los clientes en medio de un pedido perderán su progreso y tendrán que empezar de nuevo.\n\n` +
        `Si estás seguro, escribe:\n*!limpiar confirmar*`
      );
      return;
    }

    for (const jid of jidsActivos) {
      limpiarTodo(jid);
      ordenPendientePreventa.delete(jid);
      clientesNuevos.delete(jid);
    }
    // Borrar también sesiones huérfanas en BD (no cargadas en memoria)
    limpiarTodasLasSesionesDB();
    await msg.reply(`🗑️ Listo. Se eliminaron *${jidsActivos.size} sesión(es)* activa(s) y se limpió la BD de sesiones.`);
    return;
  }

  // ── !cortes — desglose de pedidos por corte hoy ──────────────────────────
  if (/^!cortes$/i.test(texto)) {
    const pedidos    = getPedidosHoy();
    const productos  = catalogoTenant.getCortesTenant().filter(c =>
      new Set(catalogoTenant.getMenuItemsActivos('corte').map(i => i.producto_slug)).has(c.slug));
    const negocio    = getConfig("nombre_negocio") || "Tacos Javier";
    const fecha      = new Date().toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" });

    if (pedidos.length === 0) {
      await msg.reply("📋 No hay pedidos registrados hoy todavía.");
      return;
    }

    const conteo = {};
    for (const p of pedidos) {
      const orden = (p.orden || "").toLowerCase();
      for (const prod of productos) {
        if (orden.includes(prod.nombre.toLowerCase()))
          conteo[prod.nombre] = (conteo[prod.nombre] || 0) + 1;
      }
    }

    const ranking = Object.entries(conteo).sort((a, b) => b[1] - a[1]);
    if (!ranking.length) {
      await msg.reply("🥩 No se encontraron cortes identificables en los pedidos de hoy.");
      return;
    }

    const total = ranking.reduce((s, [, n]) => s + n, 0);
    let out = `🥩 *Cortes del día — ${negocio}*\n_${fecha}_\n━━━━━━━━━━━━━━━━━━\n`;
    for (const [corte, n] of ranking) {
      const pct  = Math.round(n / total * 100);
      const bar  = "█".repeat(Math.round(pct / 10)) + "░".repeat(10 - Math.round(pct / 10));
      const cap  = corte.charAt(0).toUpperCase() + corte.slice(1);
      out += `*${cap}*: ${n} pedido${n !== 1 ? "s" : ""} (${pct}%)\n${bar}\n\n`;
    }
    out += `📦 Total identificados: *${total}* en ${pedidos.length} pedido${pedidos.length !== 1 ? "s" : ""}`;
    await msg.reply(out);
    return;
  }

  // ── !ingresos — resumen financiero del día ────────────────────────────────
  if (/^!ingresos$/i.test(texto)) {
    const pedidos    = getPedidosHoy();
    const negocio    = getConfig("nombre_negocio") || "Tacos Javier";
    const fecha      = new Date().toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" });
    const confirmados = pedidos.filter(p => ["confirmado","listo","en_camino"].includes(p.estado));
    const pendientes  = pedidos.filter(p => p.estado === "pendiente");
    const domicilios  = confirmados.filter(p => p.tipo === "domicilio");
    const mostradores = confirmados.filter(p => p.tipo === "mostrador");

    const ventas         = confirmados.reduce((s, p) => s + (p.total || 0), 0);
    const ventasDom      = domicilios.reduce((s, p) => s + (p.total || 0), 0);
    const ventasMos      = mostradores.reduce((s, p) => s + (p.total || 0), 0);
    const ticket         = confirmados.length ? Math.round(ventas / confirmados.length) : 0;
    const ventasPend     = pendientes.reduce((s, p) => s + (p.total || 0), 0);

    const metodos = {};
    for (const p of confirmados) {
      const m = (p.metodo_pago || "otro").toLowerCase();
      metodos[m] = (metodos[m] || 0) + (p.total || 0);
    }

    let out = `💰 *INGRESOS DEL DÍA — ${negocio}*\n_${fecha}_\n━━━━━━━━━━━━━━━━━━\n`;
    out += `💵 Total cobrado:   *$${Math.round(ventas)}*\n`;
    if (ticket) out += `🎫 Ticket promedio:  *$${ticket}*\n`;
    out += `\n🛵 Domicilio:  *${domicilios.length} pedidos — $${Math.round(ventasDom)}*\n`;
    out += `🏪 Mostrador:  *${mostradores.length} pedidos — $${Math.round(ventasMos)}*\n`;

    if (Object.keys(metodos).length) {
      out += `\n💳 *Por método de pago:*\n`;
      for (const [m, monto] of Object.entries(metodos).sort((a, b) => b[1] - a[1]))
        out += `   ${m}: $${Math.round(monto)}\n`;
    }

    if (ventasPend > 0)
      out += `\n⏳ En espera (${pendientes.length} pendiente${pendientes.length !== 1 ? "s" : ""}): *$${Math.round(ventasPend)}*\n`;

    out += `━━━━━━━━━━━━━━━━━━`;
    await msg.reply(out);
    return;
  }

  // ── !mensaje [telefono] [texto] — mensaje directo a un cliente ────────────
  if (/^!mensaje/i.test(texto)) {
    const partes = texto.split(" ");
    if (partes.length < 3) {
      await msg.reply("⚠️ Uso: *!mensaje [teléfono] [texto]*\nEjemplo: !mensaje 3312345678 Tu pedido sale en 10 min");
      return;
    }

    const telRaw   = partes[1].replace(/\D/g, "");
    const contenido = partes.slice(2).join(" ");
    const jid       = construirJID(telRaw);

    try {
      await client.sendMessage(jid, contenido);
      await msg.reply(`✅ Mensaje enviado a *${telRaw}*`);
    } catch (e) {
      await msg.reply(`❌ Error al enviar: ${e.message}`);
    }
    return;
  }
}

// ── REANUDAR DESPACHOS TRAS REINICIO ─────────────────────────────────────────
async function reanudarDespachosPendientes(client) {
  const pendientes = getDespachosPendientes();
  if (!pendientes.length) return;

  console.log(`[Mandaditos] Reanudando ${pendientes.length} despacho(s) programado(s) tras reinicio...`);

  for (const d of pendientes) {
    const horaDespacho = new Date(d.hora_despacho);
    const msRestantes  = horaDespacho.getTime() - Date.now();
    const despachoData = {
      pedidoId:          d.pedido_id,
      clienteNombre:     d.cliente_nombre,
      clienteTelefono:   d.cliente_tel,
      clienteCalle:      d.cliente_calle,
      clienteColonia:    d.cliente_colonia,
      clienteReferencia: d.cliente_ref,
      totalOrden:        d.total_orden,
      tarifaDomicilio:   d.tarifa,
    };

    if (msRestantes > 0) {
      const horaStr = horaDespacho.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", hour12: true });
      console.log(`[Mandaditos] Despacho db #${d.id} (pedido #${d.pedido_id}) reprogramado para las ${horaStr}`);
      setTimeout(() => {
        enviarDespachoMandaditos(client, despachoData)
          .then(() => marcarDespachoEjecutado(d.id))
          .catch(e => console.error(`[Mandaditos] Error en despacho db #${d.id}:`, e.message));
      }, msRestantes);
    } else {
      // La hora pasó mientras el bot estaba apagado → despachar de inmediato
      console.log(`[Mandaditos] Despacho db #${d.id} atrasado, enviando ahora...`);
      enviarDespachoMandaditos(client, despachoData)
        .then(() => marcarDespachoEjecutado(d.id))
        .catch(e => console.error(`[Mandaditos] Error en despacho db #${d.id}:`, e.message));
    }
  }
}

module.exports = { handleComandos, setPendienteConfirmacionGrupo, reanudarDespachosPendientes };
