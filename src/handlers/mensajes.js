const Groq = require("groq-sdk");
const { buildPrompt } = require("../prompts/index");
const {
  DATOS_BANCO, MENU_FORMATO,
  FORM_MOSTRADOR, FORM_DOMICILIO,
  FORM_PREVENTA_MOSTRADOR, FORM_PREVENTA_DOMICILIO,
  SALUDO
} = require("../config");
const { estaEnHorario, mensajeFueraDeHorario } = require("../horario");
const {
  clientesPreventa,
  horaEntregaPreventa,
  esperandoMotivoCancelacion,
  pedidosConfirmados,
  clientesNuevos,
  resumenPendiente,
  esperandoCaptura,
  datosRecibidos,
  pendientesConfirmacion,
  getHistorial,
  limpiarTodo,
  acumularDatos,
  interpretarCampos,
  mostrarFormularioProgresivo,
  siguienteCampoFaltante,
  manejarOpcional,
  camposCompletos,
  camposATexto,
  datosCampos,
  esperandoConfirmacionItem,
  esperandoAgregarMas,
  datosCompletos,
  pareceFragmentoDatos,
  extraerDatosPedido,
  persistirEstado,
} = require("../estado");

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const { upsertCliente, registrarPedido, actualizarEstadoPedido } = require("../db");

const PALABRAS_NO_NOMBRE = /^(efectivo|tarjeta|transferencia|mostrador|domicilio|recoger|colonia|calle|correo|referencia|si|no|ok|va|dale|nada|listo|sale|andale)$/i;

function tieneNombreValido(texto) {
  const palabras = (texto.match(/[a-záéíóúüñ]{2,}/gi) || []).filter(p => !PALABRAS_NO_NOMBRE.test(p));
  return palabras.length >= 2;
}

function formatearHora(horaTexto) {
  const match = horaTexto.match(/(\d{1,2})(?::(\d{2}))?/);
  if (!match) return horaTexto;

  let h = parseInt(match[1]);
  const m = parseInt(match[2] || "0");
  const tienePm = /pm/i.test(horaTexto);
  const tieneAm = /am/i.test(horaTexto);

  let sufijo;
  if (tienePm)       sufijo = "p.m.";
  else if (tieneAm)  sufijo = "a.m.";
  else               sufijo = (h === 12) ? "p.m." : "a.m.";

  const minStr = m > 0 ? `:${String(m).padStart(2, "0")}` : ":00";
  return `${h}${minStr} ${sufijo}`;
}

function calcularSubtotal(texto) {
  const lineas = texto.split("\n").filter(l => l.trim());
  let suma = 0;
  for (const linea of lineas) {
    if (/subtotal|💰|total/i.test(linea)) continue;
    const mRep = linea.match(/(\d+)x\s*\[.*?\]\s*[—\-]\s*\$(\d+)/i);
    if (mRep) { suma += parseInt(mRep[1]) * parseInt(mRep[2]); continue; }
    const mPlato = linea.match(/plato\s*\d+.*?[—\-]\s*\$(\d+)/i);
    if (mPlato) { suma += parseInt(mPlato[1]); continue; }
    const mNorm = linea.match(/[—\-]\s*\$(\d+)\s*$/);
    if (mNorm) { suma += parseInt(mNorm[1]); continue; }
  }
  return suma;
}

function formatearListaAcumulada(ordenTexto) {
  const lineas = ordenTexto.split("\n").filter(l => l.trim() && !/subtotal/i.test(l));
  let lista = "📋 *Tu pedido hasta ahora:*\n";
  lista += "━━━━━━━━━━━━━━━━━━━━━━━━━━\n";
  lineas.forEach(l => { lista += `${l.trim()}\n`; });
  const subtotal = calcularSubtotal(ordenTexto);
  lista += "━━━━━━━━━━━━━━━━━━━━━━━━━━\n";
  lista += `💰 *Subtotal: $${subtotal}*`;
  return lista;
}

function generarResumen(clienteNumero, ordenTexto, esDomicilio, esPreventa) {
  const c        = datosCampos.get(clienteNumero) || {};
  const horaConf = horaEntregaPreventa.get(clienteNumero);
  const esTransf = /transferencia/i.test(c.metodo || "");
  const domCosto = 50;

  const subtotal = calcularSubtotal(ordenTexto);
  const total    = esDomicilio ? subtotal + domCosto : subtotal;

  const ordenLimpia = ordenTexto.split("\n")
    .filter(l => !/subtotal/i.test(l))
    .join("\n")
    .trim();

  let resumen = "━━━━━━━━━━━━━━━━━━━━━━━━━━\n";
  resumen += esDomicilio
    ? "🛵 *PEDIDO A DOMICILIO — Tacos Javier*\n"
    : "🏪 *PEDIDO EN MOSTRADOR — Tacos Javier*\n";
  const nombreCapitalizado = (c.nombre || "—").replace(/\b\w/g, l => l.toUpperCase());
  resumen += `👤 *Cliente:* ${nombreCapitalizado}\n`;
  resumen += `📱 *Teléfono:* ${c.telefono || "—"}\n`;
  resumen += `📧 *Correo:* ${c.correo || "no proporcionó"}\n`;
  resumen += `📋 *Orden:*\n${ordenLimpia}\n`;

  if (esDomicilio) {
    resumen += `📍 *Dirección:* ${c.calle || "—"}, Col. ${c.colonia || "—"}\n`;
    resumen += `📌 *Referencia:* ${c.referencia || "sin referencia"}\n`;
    resumen += `💵 *Subtotal:* $${subtotal}\n`;
    resumen += `🛵 *Tarifa domicilio:* $${domCosto}\n`;
  }

  resumen += `💰 *TOTAL: $${total}*\n`;
  resumen += `💳 *Pago:* ${c.metodo || "—"}\n`;

  if (esPreventa && horaConf) {
    const horaFormateada = formatearHora(horaConf);
    resumen += esDomicilio
      ? `🕖 *Hora de entrega:* ${horaFormateada}\n`
      : `🕖 *Recolección:* ${horaFormateada}\n`;
  }

  resumen += "━━━━━━━━━━━━━━━━━━━━━━━━━━\n";
  resumen += "¿Confirmas tu pedido?";

  return { texto: resumen, esTransferencia: esTransf, total };
}

// ── DETECCIÓN DE TIPO DE ENTREGA ──────────────────────────────────────────────
const _MOSTRADOR_PATRONES = [
  { re: /\bmostr(ador)?\b/,                          pts: 10 },
  { re: /\brecoger\b/,                                pts: 10 },
  { re: /\brecojo\b/,                                 pts: 10 },
  { re: /\brecogere\b/,                               pts: 10 },
  { re: /\bpaso\s*a\s*recoger\b/,                    pts: 10 },
  { re: /\bvoy\s*a\s*recoger\b/,                     pts: 10 },
  { re: /\bire\s*a\s*recoger\b/,                     pts: 10 },
  { re: /\blo\s*recojo\b/,                            pts: 10 },
  { re: /\bpara\s*recoger\b/,                         pts:  9 },
  { re: /\bpara\s*llevar\b/,                          pts:  9 },
  { re: /\bme\s*lo\s*llevo\b/,                        pts:  9 },
  { re: /\byo\s*(voy|paso|recojo)\b/,                 pts:  9 },
  { re: /\bvoy\s*por\s*(el|ella|los|ellos|tacos)?\b/, pts:  8 },
  { re: /\bpaso\s*(yo|por\s*el|por\s*ella|por\s*los)?\b/, pts: 7 },
  { re: /\bvengo\s*(yo|a\s*recoger|por\s*el)?\b/,    pts:  7 },
  { re: /\bme\s*acerco\b/,                            pts:  7 },
  { re: /\bme\s*presento\b/,                          pts:  7 },
  { re: /\b(en\s*el\s*)?local\b/,                    pts:  6 },
  { re: /\b(en\s*la\s*)?tienda\b/,                   pts:  6 },
  { re: /\ben\s*tu\s*(local|tienda|negocio)\b/,      pts:  8 },
  { re: /\bahi\s*(mismo|los\s*recojo)?\b/,           pts:  6 },
  { re: /\bvoy\s*a\s*(ir|pasar)\b/,                  pts:  6 },
  { re: /\bpaso\s*(mas\s*tarde|luego|ahorita|en\s*un\s*rato|en\s*un\s*momento)\b/, pts: 8 },
  { re: /\bahorita\s*voy\b/,                          pts:  8 },
  { re: /\bya\s*voy\b/,                               pts:  7 },
  { re: /\bvoy\s*para\s*alla\b/,                     pts:  8 },
  { re: /\bvoy\b/,                                    pts:  3 },
  { re: /\bpaso\b/,                                   pts:  3 },
];

const _DOMICILIO_PATRONES = [
  { re: /\bdomicilio\b/,                              pts: 10 },
  { re: /\bdomici\b/,                                 pts: 10 },
  { re: /\benvio\b/,                                  pts: 10 },
  { re: /\benviar\b/,                                 pts: 10 },
  { re: /\bentrega\b/,                                pts: 10 },
  { re: /\bdelivery\b/,                               pts: 10 },
  { re: /\breparto\b/,                                pts: 10 },
  { re: /\btraemelo\b/,                               pts: 10 },
  { re: /\btraemelos\b/,                              pts: 10 },
  { re: /\btraelo\b/,                                 pts: 10 },
  { re: /\bme\s*lo\s*(traes|llevas|mandan|envias|dejas)\b/, pts: 10 },
  { re: /\bme\s*los\s*(traes|llevas|mandan|envias|dejas)\b/, pts: 10 },
  { re: /\blo\s*(traes|mandas|envias)\b/,             pts:  9 },
  { re: /\blos\s*(traes|mandas|envias)\b/,            pts:  9 },
  { re: /\bpueden\s*(traer|llevar|mandar|enviar)\b/,  pts:  9 },
  { re: /\bpuede\s*(traer|llevar|mandar|enviar)\b/,   pts:  9 },
  { re: /\bque\s*(me\s*)?(traigan|lleven|manden|envien)\b/, pts: 9 },
  { re: /\ba\s*(mi\s*)?(casa|domicilio|direccion)\b/, pts: 10 },
  { re: /\ba\s*la\s*(puerta|direccion)\b/,            pts:  9 },
  { re: /\ba\s*donde\s*(estoy|vivo)\b/,               pts:  9 },
  { re: /\ba\s*mi\s*(trabajo|oficina|depa|departamento|cuarto)\b/, pts: 9 },
  { re: /\bhazlo\s*(llegar|venir)\b/,                 pts:  9 },
  { re: /\bmandamelo\b/,                              pts: 10 },
  { re: /\bmandamelos\b/,                             pts: 10 },
  { re: /\bmandalos\b/,                               pts:  9 },
  { re: /\brepartidor\b/,                             pts:  9 },
  { re: /\bcourier\b/,                                pts:  9 },
  { re: /\bmandar\b/,                                 pts:  4 },
  { re: /\bllevar\b/,                                 pts:  4 },
];

const _UMBRAL_IA = 3;

function _calcularScore(t, patrones) {
  return patrones.reduce((total, { re, pts }) => re.test(t) ? total + pts : total, 0);
}

async function detectarTipoEntrega(texto) {
  const t = texto.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
  const scoreMostrador = _calcularScore(t, _MOSTRADOR_PATRONES);
  const scoreDomicilio = _calcularScore(t, _DOMICILIO_PATRONES);
  console.log(`[ENTREGA] score mostrador:${scoreMostrador} domicilio:${scoreDomicilio}`);
  if (scoreMostrador > 0 && scoreDomicilio === 0) return "mostrador";
  if (scoreDomicilio > 0 && scoreMostrador === 0) return "domicilio";
  if (scoreMostrador === 0 && scoreDomicilio === 0) return "ninguno";
  const diff = Math.abs(scoreMostrador - scoreDomicilio);
  if (diff >= _UMBRAL_IA) {
    const ganador = scoreMostrador > scoreDomicilio ? "mostrador" : "domicilio";
    console.log(`[ENTREGA] scoring decide: ${ganador} (diff:${diff})`);
    return ganador;
  }
  console.log(`[ENTREGA] ambiguo (diff:${diff}) — consultando IA`);
  try {
    const res = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant", max_tokens: 10, temperature: 0,
      messages: [
        { role: "system", content: `Responde SOLO con una palabra: "mostrador", "domicilio" o "ninguno". El usuario está ordenando tacos en México. ¿Quiere recoger en mostrador (ir al local) o pedir a domicilio (que se lo lleven)? Si no queda claro, responde "ninguno".` },
        { role: "user", content: texto },
      ],
    });
    const r = res.choices[0]?.message?.content?.trim().toLowerCase() || "";
    if (r.includes("mostrador")) { console.log("[ENTREGA] IA decide: mostrador"); return "mostrador"; }
    if (r.includes("domicilio")) { console.log("[ENTREGA] IA decide: domicilio"); return "domicilio"; }
    return "ninguno";
  } catch (e) {
    console.error("[ENTREGA] IA falló:", e.message);
    return "ninguno";
  }
}

async function handleMensaje(msg, client) {
  const clienteNumero = msg.from;

  // ── ESPERANDO CAPTURA DE TRANSFERENCIA ───────────────────────────────────
  if (esperandoCaptura.has(clienteNumero) && !msg.hasMedia) {
    if (msg.body && msg.body.trim().length > 0) {
      const textoCap = msg.body.trim();
      if (/cancelar|cancela|cancel|cancelo|cancelame|cancelado|ya no quiero|ya no/i.test(textoCap)) {
        const datosCaptura = esperandoCaptura.get(clienteNumero);
        esperandoCaptura.delete(clienteNumero);
        limpiarTodo(clienteNumero);
        clientesNuevos.delete(clienteNumero);
        const grupoId = process.env.GRUPO_ID;
        if (grupoId) {
          const horaCancel = new Date().toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
          try {
            await client.sendMessage(grupoId,
              `Solicitud de Cancelacion\nHora: ${horaCancel}\nCliente: (canceló antes de enviar captura)\nTelefono: ${datosCaptura?.telefono || "—"}\nMotivo: Canceló durante espera de transferencia`
            );
          } catch (e) { console.error("Error notificando cancelacion:", e.message); }
        }
        await msg.reply("Tu pedido ha sido cancelado. Cuando gustes ordenar, aqui estaremos. Hasta pronto!");
        return;
      }
      await msg.reply("Estamos esperando tu captura de transferencia. Mandala cuando puedas y confirmamos tu pedido.");
    }
    return;
  }

  if (!msg.body || !msg.body.trim()) return;
  const textoOriginal = msg.body.trim();
  if (textoOriginal.length < 2) return;
  console.log(`\n📨 [${clienteNumero}]: ${textoOriginal}`);

  const quiereCancelar = /cancelar|cancela|cancel|cancelo|cancelame|cancelado|ya no quiero|ya no/i.test(textoOriginal);

  // ── PRIORIDAD: cancelación de pedido confirmado ───────────────────────────
  if (pedidosConfirmados.has(clienteNumero)) {
    const datosPedido = pedidosConfirmados.get(clienteNumero);
    const minutosTranscurridos = (Date.now() - (datosPedido.confirmadoEn || 0)) / 60000;
    if (quiereCancelar) {
      if (minutosTranscurridos > 15) {
        await msg.reply("Lo sentimos, el tiempo para cancelar tu pedido ya venció (15 minutos).\nSi tienes algún problema, comunícate directamente con nosotros. Gracias por tu comprensión!");
        return;
      }
      esperandoMotivoCancelacion.set(clienteNumero, { nombre: datosPedido.nombre, telefono: datosPedido.telefono, notificarGrupo: true });
      persistirEstado(clienteNumero); // ← PUNTO 5
      pedidosConfirmados.delete(clienteNumero);
      clientesNuevos.delete(clienteNumero);
      await msg.reply("Lamento escuchar eso. Podrias indicarme el motivo de tu cancelacion?");
      return;
    }
    const minRestantes = Math.max(0, Math.ceil(15 - minutosTranscurridos));
    await msg.reply("Tu pedido ya fue recibido y esta en espera de confirmacion de nuestro equipo.\n" +
      (minRestantes > 0 ? `Si deseas cancelarlo tienes ${minRestantes} minuto${minRestantes !== 1 ? "s" : ""} para escribir *cancelar*.` : "El tiempo para cancelar ya venció."));
    return;
  }

  // ── PRIORIDAD: motivo de cancelación ─────────────────────────────────────
  if (esperandoMotivoCancelacion.has(clienteNumero)) {
    const datosCancelacion = esperandoMotivoCancelacion.get(clienteNumero);
    const horaCancel = new Date().toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
    const grupoId = process.env.GRUPO_ID;
    if (grupoId && datosCancelacion.notificarGrupo) {
      try {
        await client.sendMessage(grupoId, `Solicitud de Cancelacion\nHora: ${horaCancel}\nCliente: ${datosCancelacion.nombre}\nTelefono: ${datosCancelacion.telefono}\nMotivo: ${textoOriginal}`);
      } catch (e) { console.error("Error al notificar cancelacion:", e.message); }
    }
    esperandoMotivoCancelacion.delete(clienteNumero);
    clientesNuevos.delete(clienteNumero);
    limpiarTodo(clienteNumero); // ya llama eliminarSesion internamente
    try { actualizarEstadoPedido(datosCancelacion.telefono, "cancelado"); } catch (e) {}
    await msg.reply("Tu solicitud de cancelacion fue enviada a nuestro equipo.\nEn breve se comunicaran contigo para confirmarte. Disculpa los inconvenientes!");
    return;
  }

  // ── 1. PRIMER MENSAJE ─────────────────────────────────────────────────────
  if (!clientesNuevos.has(clienteNumero)) {
    clientesNuevos.add(clienteNumero);
    persistirEstado(clienteNumero); // ← PUNTO: primer contacto
    if (!estaEnHorario()) { await msg.reply(mensajeFueraDeHorario()); return; }
    await msg.reply(SALUDO);
    return;
  }

  // ── 1B. FUERA DE HORARIO ──────────────────────────────────────────────────
  if (!estaEnHorario() && !clientesPreventa.has(clienteNumero)) {
    const aceptaPreventa  = /^(si|ok|va|dale|quiero|claro|adelante|sale|andale)$/i.test(textoOriginal.trim());
    const rechazaPreventa = /^(no|nel|nop|nope)$/i.test(textoOriginal.trim());
    if (aceptaPreventa) {
      clientesPreventa.add(clienteNumero);
      persistirEstado(clienteNumero); // ← PUNTO 1: preventa aceptada
      await msg.reply("Perfecto! Tomamos tu pedido en preventa.\nTu orden estara lista al inicio de nuestro servicio.\n\n" + SALUDO);
      return;
    }
    if (rechazaPreventa) {
      clientesNuevos.delete(clienteNumero);
      limpiarTodo(clienteNumero);
      await msg.reply("Esta bien! Cuando gustes pedir, aqui estaremos. Hasta pronto!");
      return;
    }
    await msg.reply(mensajeFueraDeHorario());
    return;
  }

  const historial  = getHistorial(clienteNumero);
  const esPreventa = clientesPreventa.has(clienteNumero);

  // ── 2. TIPO DE ENTREGA ────────────────────────────────────────────────────
  if (historial.length === 0) {
    const tipoEntrega = await detectarTipoEntrega(textoOriginal);
    if (tipoEntrega === "ninguno") { await msg.reply("Tu pedido sera para domicilio o pasas a recoger al mostrador?"); return; }
    if (tipoEntrega === "mostrador") {
      await msg.reply(esPreventa ? FORM_PREVENTA_MOSTRADOR : FORM_MOSTRADOR);
      historial.push({ role: "user", content: "Mi pedido es para recoger en mostrador." });
      historial.push({ role: "assistant", content: "Perfecto, llena el formulario con tus datos." });
    } else {
      await msg.reply(esPreventa ? FORM_PREVENTA_DOMICILIO : FORM_DOMICILIO);
      historial.push({ role: "user", content: "Mi pedido es a domicilio." });
      historial.push({ role: "assistant", content: "Perfecto, llena el formulario con tus datos." });
    }
    persistirEstado(clienteNumero); // ← PUNTO: tipo de entrega decidido
    console.log(`Bot: [FORMULARIO - ${tipoEntrega.toUpperCase()}${esPreventa ? " PREVENTA" : ""}]`);
    return;
  }

  // ── 2B. CANCELACIÓN DURANTE EL PEDIDO ────────────────────────────────────
  if (quiereCancelar) {
    clientesNuevos.delete(clienteNumero);
    limpiarTodo(clienteNumero); // ya llama eliminarSesion internamente
    await msg.reply("Tu pedido ha sido cancelado. Cuando gustes ordenar, aqui estaremos. Hasta pronto!");
    return;
  }

  // ── 3. FORMULARIO PROGRESIVO ──────────────────────────────────────────────
  if (!datosRecibidos.has(clienteNumero)) {
    const esOrdenDomicilio = historial.some(h => h.content && h.content.includes("domicilio"));
    const campos = interpretarCampos(clienteNumero, textoOriginal, esOrdenDomicilio, esPreventa);
    // interpretarCampos ya llama persistirEstado internamente

    if (esPreventa && campos._horaFueraRango) {
      const formProgresivo = mostrarFormularioProgresivo(clienteNumero, esOrdenDomicilio, esPreventa);
      const tipoPedido     = esOrdenDomicilio ? "recibirlo" : "pasar a recoger";
      const msg_hora = campos._horaFueraRango === "antes"
        ? "Aun no iniciamos labores a esa hora. Nuestro horario es de *7:00 a.m. a 12:30 p.m.*"
        : "A esa hora ya estamos fuera de servicio. Nuestro horario es de *7:00 a.m. a 12:30 p.m.*";
      await msg.reply(formProgresivo + "\n\n" + msg_hora + "\nA que hora deseas " + tipoPedido + "? (entre 7:00 a.m. y 12:30 p.m.)");
      delete campos._horaFueraRango;
      datosCampos.set(clienteNumero, campos);
      persistirEstado(clienteNumero);
      return;
    }

    const faltante = siguienteCampoFaltante(clienteNumero, esOrdenDomicilio, esPreventa);
    if (faltante && (faltante.campo === "correo" || faltante.campo === "referencia"))
      manejarOpcional(clienteNumero, faltante.campo, textoOriginal);
    // manejarOpcional ya llama persistirEstado internamente

    acumularDatos(clienteNumero, textoOriginal);
    // acumularDatos ya llama persistirEstado internamente

    if (camposCompletos(clienteNumero, esOrdenDomicilio, esPreventa)) {
      const camposActuales = datosCampos.get(clienteNumero);
      if (esPreventa && camposActuales.hora) horaEntregaPreventa.set(clienteNumero, camposActuales.hora);
      const textoFinal = camposATexto(clienteNumero);
      datosRecibidos.add(clienteNumero);
      historial.push({ role: "user", content: textoFinal });
      historial.push({ role: "assistant", content: "Datos recibidos. MENU TACOS JAVIER enviado." });
      persistirEstado(clienteNumero); // ← PUNTO: formulario completo
      const formCompleto = mostrarFormularioProgresivo(clienteNumero, esOrdenDomicilio, esPreventa);
      await msg.reply(formCompleto + "\n\nPerfecto, datos recibidos! Aqui te mando el menu.");
      await new Promise(r => setTimeout(r, 600));
      await msg.reply(MENU_FORMATO);
      return;
    }

    const siguienteFaltante = siguienteCampoFaltante(clienteNumero, esOrdenDomicilio, esPreventa);
    const formProgresivo    = mostrarFormularioProgresivo(clienteNumero, esOrdenDomicilio, esPreventa);
    await msg.reply(siguienteFaltante ? formProgresivo + "\n\n" + siguienteFaltante.pregunta : formProgresivo);
    return;
  }

  // ── 4. CONFIRMACIÓN FINAL DEL PEDIDO ─────────────────────────────────────
  const palabrasConfirmacion = /^(si|sí|ok|va|dale|listo|sale|andale|adelante|confirmo|confirmado|correcto|asi|si porfavor|sí porfavor|si por favor|sí por favor|claro|perfecto|va bien|dale pues|ándale|órale|va que va)$/i;

  // Cambio de método de pago con resumen pendiente
  if (resumenPendiente.has(clienteNumero) && /transferencia|efectivo|tarjeta/i.test(textoOriginal)) {
    const esCambio = /cambiar|cambio|mejor|voy\s+a\s+pagar|quiero\s+pagar|pagar\s+con|con\s+(efectivo|tarjeta|transferencia)/i.test(textoOriginal)
      || /^(efectivo|tarjeta|transferencia)$/i.test(textoOriginal.trim());
    if (esCambio) {
      const campos = datosCampos.get(clienteNumero) || {};
      if (/transferencia/i.test(textoOriginal)) campos.metodo = "transferencia";
      else if (/tarjeta/i.test(textoOriginal))  campos.metodo = "tarjeta";
      else if (/efectivo/i.test(textoOriginal)) campos.metodo = "efectivo";
      datosCampos.set(clienteNumero, campos);

      const pendienteActual = resumenPendiente.get(clienteNumero);
      const matchOrden = pendienteActual.texto.match(/📋 \*Orden:\*\n([\s\S]+?)\n💰/);
      const ordenExtraida = matchOrden ? matchOrden[1].trim() : "";
      resumenPendiente.delete(clienteNumero);

      if (ordenExtraida) {
        const esOrdenDomAux = historial.some(h => h.content && h.content.includes("domicilio"));
        const resumenNuevo  = generarResumen(clienteNumero, ordenExtraida, esOrdenDomAux, esPreventa);
        resumenPendiente.set(clienteNumero, { texto: resumenNuevo.texto, esTransferencia: resumenNuevo.esTransferencia });
        persistirEstado(clienteNumero); // ← PUNTO 2: resumen actualizado
        await msg.reply(resumenNuevo.texto);
        console.log(`Bot: [RESUMEN ACTUALIZADO — método: ${campos.metodo}]`);
        return;
      }
    }
  }

  // "no, ..." con texto → corrección/adición
  if (resumenPendiente.has(clienteNumero) && /^no[,\s]/i.test(textoOriginal.trim())) {
    const pendienteActual = resumenPendiente.get(clienteNumero);
    const matchOrden = pendienteActual.texto.match(/📋 \*Orden:\*\n([\s\S]+?)\n💰/);
    const ordenExtraida = matchOrden ? matchOrden[1].trim() : "";
    resumenPendiente.delete(clienteNumero);
    if (ordenExtraida) {
      esperandoAgregarMas.set(clienteNumero, ordenExtraida);
      persistirEstado(clienteNumero); // ← PUNTO 7
    }
  }

  // "no" solo → cancelar resumen
  if (resumenPendiente.has(clienteNumero) && /^(no|nel|nop)$/i.test(textoOriginal.trim())) {
    resumenPendiente.delete(clienteNumero);
    persistirEstado(clienteNumero);
    await msg.reply("Entendido! ¿Qué te gustaría cambiar o agregar?");
    await new Promise(r => setTimeout(r, 300));
    await msg.reply(MENU_FORMATO);
    return;
  }

  // Confirmación del resumen → enviar pedido
  if (resumenPendiente.has(clienteNumero) && palabrasConfirmacion.test(textoOriginal.trim())) {
    const pendiente  = resumenPendiente.get(clienteNumero);
    const horaVenta  = new Date().toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
    const infoPedido = extraerDatosPedido(pendiente.texto);

    if (pendiente.esTransferencia) {
      esperandoCaptura.set(clienteNumero, { resumen: pendiente.texto, telefono: infoPedido.telefono });
      resumenPendiente.delete(clienteNumero);
      persistirEstado(clienteNumero); // ← PUNTO 3: esperando captura
      await msg.reply(DATOS_BANCO);
      return;
    }

    const grupoId = process.env.GRUPO_ID;
    if (grupoId) {
      try {
        await client.sendMessage(grupoId, `Nueva venta!\nHora: ${horaVenta}\n\n${pendiente.texto}\n\nUsa: !confirmar ${infoPedido.telefono}`);
      } catch (e) { console.error("Error al notificar grupo:", e.message); }
    }

    pendientesConfirmacion.set(clienteNumero, { ...infoPedido, resumen: pendiente.texto, hora: horaVenta });

    try {
      const telefonoLimpio = infoPedido.telefono || clienteNumero.replace("@c.us","").replace("@lid","").split(":")[0];
      const nombreParts    = (infoPedido.nombre || "").split(" ");
      const cliente        = upsertCliente({ nombre: nombreParts[0]||null, apellido: nombreParts.slice(1).join(" ")||null, telefono: telefonoLimpio, correo: null, calle_numero: null, colonia: null, referencia: null });
      const pedidoId       = registrarPedido({
        cliente_id:   cliente ? cliente.id : null,
        tipo:         infoPedido.tipo || "mostrador",
        orden:        pendiente.texto.substring(0, 500),
        total:        parseFloat((infoPedido.total || "0").replace(/[^0-9.]/g, "")) || 0,
        metodo_pago:  /transferencia/i.test(pendiente.texto) ? "transferencia" : /tarjeta/i.test(pendiente.texto) ? "tarjeta" : "efectivo",
        estado:       "pendiente",
        hora_entrega: horaEntregaPreventa.get(clienteNumero) || null,
      });
      console.log(`BD: Pedido #${pedidoId} registrado`);
    } catch (e) { console.error("BD Error:", e.message); }

    pedidosConfirmados.set(clienteNumero, { nombre: infoPedido.nombre, telefono: infoPedido.telefono, total: infoPedido.total, resumen: pendiente.texto, confirmadoEn: Date.now() });
    persistirEstado(clienteNumero); // ← PUNTO 4: pedido confirmado por cliente
    clientesNuevos.delete(clienteNumero);
    limpiarTodo(clienteNumero);
    clientesNuevos.add(clienteNumero);
    persistirEstado(clienteNumero); // ← conservar clienteNuevo tras limpiar
    await msg.reply("Listo! Tu pedido fue recibido y esta en espera de confirmacion de nuestro equipo.\nEn breve te avisamos. Gracias por tu preferencia!\n\n_Si deseas cancelar tu pedido escribe *cancelar*._");
    return;
  }

  // ── 4B. TOMA DE PEDIDO CON FLUJO CONTROLADO ──────────────────────────────
  const esOrdenDom     = historial.some(h => h.content && h.content.includes("domicilio"));
  const esConfirmacion = /^(si|sí|ok|va|dale|correcto|exacto|claro|perfecto|sale|andale|órale|ándale)$/i.test(textoOriginal.trim());
  const esRechazo      = /^(nel|nop|nope|incorrecto|cambia|error|no\s+es\s+correcto|no\s+est[aá]\s+bien)$/i.test(textoOriginal.trim());
  const esAgregarSi    = /^(si|sí|ok|va|dale|claro|sale|andale|quiero|agrega|más|mas)$/i.test(textoOriginal.trim());
  const esAgregarNo    = /^(no|nel|nop|nada\s*m[aá]s?|ya\s*es\s*todo|eso\s*es\s*todo|listo|ya|solo\s*eso|eso|no\s*,?\s*(gracias|gra|gras)|as[ií]\s*est[aá](\s*bien)?|eso\s*es\s*todo|ya\s*fue|ya\s*con\s*eso)$/i.test(textoOriginal.trim());

  // ── ESTADO: esperando confirmación del ítem ───────────────────────────────
  if (esperandoConfirmacionItem.has(clienteNumero)) {
    const itemData = esperandoConfirmacionItem.get(clienteNumero);

    if (esRechazo || /^no$/i.test(textoOriginal.trim())) {
      esperandoConfirmacionItem.delete(clienteNumero);
      esperandoAgregarMas.delete(clienteNumero);
      const hist = getHistorial(clienteNumero);
      if (hist.length >= 2 && hist[hist.length - 1].role === "assistant") {
        hist.splice(hist.length - 2, 2);
      }
      persistirEstado(clienteNumero); // ← ítem rechazado, limpiar
      await msg.reply("No pasa nada! Dime de nuevo qué deseas ordenar 😊");
      await new Promise(r => setTimeout(r, 400));
      await msg.reply(MENU_FORMATO);
      return;
    }

    if (esConfirmacion) {
      esperandoConfirmacionItem.delete(clienteNumero);
      const ordenActual = esperandoAgregarMas.get(clienteNumero) || "";
      const nuevaOrden  = ordenActual ? ordenActual + "\n" + itemData.lineas : itemData.lineas;
      esperandoAgregarMas.set(clienteNumero, nuevaOrden);
      historial.push({ role: "user", content: "si, correcto" });
      historial.push({ role: "assistant", content: itemData.lineas });
      persistirEstado(clienteNumero); // ← PUNTO 7: orden acumulada actualizada
      await msg.reply("¿Deseas agregar algo más a tu pedido?");
      return;
    }

    await msg.reply(itemData.lineas + "\n\n¿Es correcto?");
    return;
  }

  // ── ESTADO: esperando si agrega más ──────────────────────────────────────
  if (esperandoAgregarMas.has(clienteNumero)) {
    if (esAgregarNo) {
      const ordenCompleta   = esperandoAgregarMas.get(clienteNumero);
      esperandoAgregarMas.delete(clienteNumero);
      const resumenGenerado = generarResumen(clienteNumero, ordenCompleta, esOrdenDom, esPreventa);
      resumenPendiente.set(clienteNumero, { texto: resumenGenerado.texto, esTransferencia: resumenGenerado.esTransferencia });
      historial.push({ role: "user", content: textoOriginal });
      historial.push({ role: "assistant", content: resumenGenerado.texto });
      persistirEstado(clienteNumero); // ← PUNTO 2: resumen listo para confirmar
      await msg.reply(resumenGenerado.texto);
      console.log("Bot: [RESUMEN FINAL GENERADO POR CÓDIGO]");
      return;
    }

    if (esAgregarSi) {
      const ordenActual = esperandoAgregarMas.get(clienteNumero) || "";
      const listaActual = formatearListaAcumulada(ordenActual);
      await msg.reply(listaActual);
      await new Promise(r => setTimeout(r, 400));
      await msg.reply(MENU_FORMATO);
      await new Promise(r => setTimeout(r, 400));
      await msg.reply("¿Qué más te gustaría agregar de nuestro menú?");
      return;
    }
  }

  // ── LLAMADA A GROQ ────────────────────────────────────────────────────────
  historial.push({ role: "user", content: textoOriginal });
  if (historial.length > 15) historial.splice(0, 2);

  try {
    const systemPrompt = buildPrompt({
      tomandoPedido:  true,
      textoCliente:   textoOriginal,
      horaConfirmada: horaEntregaPreventa.get(clienteNumero) || null,
      esPreventa,
    });

    const respuestaGroq = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant",
      max_tokens: 300,
      temperature: 0.5,
      messages: [{ role: "system", content: systemPrompt }, ...historial],
    });

    let respuestaTexto = respuestaGroq.choices[0]?.message?.content || "Disculpa, no entendi. Me repites tu pedido?";
    historial.push({ role: "assistant", content: respuestaTexto });
    persistirEstado(clienteNumero); // ← PUNTO 8: historial actualizado tras Groq

    const tieneSubtotal     = /subtotal|💰/i.test(respuestaTexto);
    const tieneLineasPedido = /taco|torta|gramo|carnita|kilo|\dx\s*\[/i.test(respuestaTexto);

    if (tieneSubtotal && tieneLineasPedido) {
      const lineasOrden = respuestaTexto.split("\n")
        .filter(l => /taco|torta|gramo|carnita|plato|kilo|\$\d+|\d+g|\d+x|\dx\s*\[/i.test(l))
        .join("\n");
      esperandoConfirmacionItem.set(clienteNumero, { lineas: lineasOrden || respuestaTexto.trim() });
      persistirEstado(clienteNumero); // ← PUNTO 6: esperando confirmación de ítem
      await msg.reply(respuestaTexto + "\n\n¿Es correcto?");
      return;
    }

    await msg.reply(respuestaTexto);
    console.log(`Bot: ${respuestaTexto.substring(0, 80)}...`);

  } catch (error) {
    console.error("Error:", error.message);
    try { await msg.reply("Disculpa, tuve un problemita. Me vuelves a decir que quieres?"); } catch (_) {}
  }
}

module.exports = { handleMensaje };