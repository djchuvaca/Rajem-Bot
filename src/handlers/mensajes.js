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
  pedidoJSONActual,
  correoPreguntas,
  referenciaPreguntas,
  datosCompletos,
  pareceFragmentoDatos,
  extraerDatosPedido,
  persistirEstado,
  esperandoConfirmacionDatos,
} = require("../estado");

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const { parsearPedidoSimple } = require("./pedidoParser");
const { upsertCliente, registrarPedido, actualizarEstadoPedido, getCliente, guardarTelefonoReal, getTelefonoReal } = require("../db");

// Clientes frecuentes
const telefonosReales            = new Map();

const PALABRAS_NO_NOMBRE = /^(efectivo|tarjeta|transferencia|mostrador|domicilio|recoger|colonia|calle|correo|referencia|si|no|ok|va|dale|nada|listo|sale|andale)$/i;

function formatearHora(horaTexto) {
  const match = horaTexto.match(/(\d{1,2})(?::(\d{2}))?/);
  if (!match) return horaTexto;
  const h = parseInt(match[1]);
  const m = parseInt(match[2] || "0");
  const tienePm = /pm/i.test(horaTexto);
  const tieneAm = /am/i.test(horaTexto);
  let sufijo;
  if (tienePm)      sufijo = "p.m.";
  else if (tieneAm) sufijo = "a.m.";
  else              sufijo = (h === 12) ? "p.m." : "a.m.";
  const minStr = m > 0 ? `:${String(m).padStart(2, "0")}` : ":00";
  return `${h}${minStr} ${sufijo}`;
}

function calcularSubtotal(texto) {
  const lineas = texto.split("\n").filter(l => l.trim());
  let suma = 0;
  for (const linea of lineas) {
    if (/subtotal|💰|total|direcci[oó]n|referencia|tarifa|domicilio:\s*\$|📍|📌|🛵/i.test(linea)) continue;
    const mRep = linea.match(/(\d+)x\s*\[.*?\]\s*[—\-]\s*\$(\d+)/i);
    if (mRep) { suma += parseInt(mRep[1]) * parseInt(mRep[2]); continue; }
    const mPlato = linea.match(/plato\s*\d+.*?[—\-]\s*\$(\d+)/i);
    if (mPlato) { suma += parseInt(mPlato[1]); continue; }
    const mNorm = linea.match(/[—\-]\s*\$(\d+)\s*$/);
    if (mNorm) { suma += parseInt(mNorm[1]); continue; }
  }
  return suma;
}

function getPrecios() {
  const { getConfig } = require("../db");
  return {
    pTaco:  parseInt(getConfig("precio_taco")  || "30"),
    pTorta: parseInt(getConfig("precio_torta") || "40"),
    p100g:  parseInt(getConfig("precio_100g")  || "32"),
  };
}

function calcularPrecioItem(item, precios) {
  const { pTaco, pTorta, p100g } = precios;
  switch (item.presentacion) {
    case "taco":    return item.cantidad * pTaco;
    case "torta":   return item.cantidad * pTorta;
    case "gramos":  return Math.round((item.gramos / 100) * p100g);
    case "pesos":   return item.monto;
    case "grupo_repetido":
      return item.grupos * item.items_por_grupo.reduce((s, i) => s + calcularPrecioItem(i, precios), 0);
    case "plato_separado":
      return item.items.reduce((s, i) => s + calcularPrecioItem(i, precios), 0);
    default: return 0;
  }
}

function procesarItemJSON(item, precios) {
  const { pTaco, pTorta, p100g } = precios;
  const corte = Array.isArray(item.corte) ? item.corte.join(" con ") : (item.corte || "surtido");
  switch (item.presentacion) {
    case "taco":
      return `🌮 ${item.cantidad} taco${item.cantidad > 1 ? "s" : ""} carnitas ${corte} — $${item.cantidad * pTaco}`;
    case "torta":
      return `🥖 ${item.cantidad} torta${item.cantidad > 1 ? "s" : ""} carnitas ${corte} — $${item.cantidad * pTorta}`;
    case "gramos":
      return `⚖️ ${item.gramos}g carnitas ${corte} — $${Math.round((item.gramos / 100) * p100g)}`;
    case "pesos":
      return `⚖️ ${Math.round((item.monto / p100g) * 100)}g carnitas ${corte} — $${item.monto}`;
    case "grupo_repetido": {
      const lg = item.items_por_grupo.map(i => {
        const c = Array.isArray(i.corte) ? i.corte.join(" con ") : (i.corte || "surtido");
        if (i.presentacion === "taco")   return `${i.cantidad} taco${i.cantidad > 1 ? "s" : ""} carnitas ${c}`;
        if (i.presentacion === "torta")  return `${i.cantidad} torta${i.cantidad > 1 ? "s" : ""} carnitas ${c}`;
        if (i.presentacion === "gramos") return `${i.gramos}g carnitas ${c}`;
        if (i.presentacion === "pesos")  return `${Math.round((i.monto / p100g) * 100)}g carnitas ${c}`;
        return "";
      }).filter(Boolean).join(" + ");
      const pg = item.items_por_grupo.reduce((s, i) => s + calcularPrecioItem(i, precios), 0);
      return `${item.grupos}x [${lg}] — $${pg} c/u`;
    }
    case "plato_separado": {
      const lp = item.items.map(i => procesarItemJSON(i, precios)).join(" + ");
      return `🍽️ Plato ${item.numero}: ${lp.replace(/^[🌮🥖⚖️]\s*/, "")}`;
    }
    default: return "";
  }
}

function jsonALineas(jsonData) {
  const precios  = getPrecios();
  const lineas   = jsonData.items.map(i => procesarItemJSON(i, precios)).filter(Boolean);
  const subtotal = jsonData.items.reduce((s, i) => s + calcularPrecioItem(i, precios), 0);
  lineas.push(`💰 Subtotal: $${subtotal}`);
  return { texto: lineas.join("\n"), subtotal };
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
  const ordenLimpia = ordenTexto.split("\n").filter(l => !/subtotal/i.test(l)).join("\n").trim();

  let resumen = "━━━━━━━━━━━━━━━━━━━━━━━━━━\n";
  resumen += esDomicilio ? "🛵 *PEDIDO A DOMICILIO — Tacos Javier*\n" : "🏪 *PEDIDO EN MOSTRADOR — Tacos Javier*\n";
  const nombreCap = (c.nombre || "—").replace(/\b\w/g, l => l.toUpperCase());
  resumen += `👤 *Cliente:* ${nombreCap}\n`;
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
    const hf = formatearHora(horaConf);
    resumen += esDomicilio ? `🕖 *Hora de entrega:* ${hf}\n` : `🕖 *Recolección:* ${hf}\n`;
  }
  resumen += "━━━━━━━━━━━━━━━━━━━━━━━━━━\n";
  resumen += "*¿Confirmas tu pedido?*";
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
    if (r.includes("mostrador")) return "mostrador";
    if (r.includes("domicilio")) return "domicilio";
    return "ninguno";
  } catch (e) {
    console.error("[ENTREGA] IA falló:", e.message);
    return "ninguno";
  }
}

async function handleMensaje(msg, client) {
  const clienteNumero = msg.from;

  // ── ESPERANDO CAPTURA ─────────────────────────────────────────────────────
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

  // ── CANCELACIÓN DE PEDIDO CONFIRMADO ─────────────────────────────────────
  if (pedidosConfirmados.has(clienteNumero)) {
    const datosPedido = pedidosConfirmados.get(clienteNumero);
    const minutosTranscurridos = (Date.now() - (datosPedido.confirmadoEn || 0)) / 60000;
    if (quiereCancelar) {
      if (minutosTranscurridos > 15) {
        await msg.reply("Lo sentimos, el tiempo para cancelar tu pedido ya venció (15 minutos).\nSi tienes algún problema, comunícate directamente con nosotros. Gracias por tu comprensión!");
        return;
      }
      esperandoMotivoCancelacion.set(clienteNumero, { nombre: datosPedido.nombre, telefono: datosPedido.telefono, notificarGrupo: true });
      pedidosConfirmados.delete(clienteNumero);
      clientesNuevos.delete(clienteNumero);
      await msg.reply("Lamento escuchar eso. *¿Podrías indicarme el motivo de tu cancelación?*");
      return;
    }
    const minRestantes = Math.max(0, Math.ceil(15 - minutosTranscurridos));
    await msg.reply("Tu pedido ya fue recibido y esta en espera de confirmacion de nuestro equipo.\n" +
      (minRestantes > 0 ? `Si deseas cancelarlo tienes ${minRestantes} minuto${minRestantes !== 1 ? "s" : ""} para escribir *cancelar*.` : "El tiempo para cancelar ya venció."));
    return;
  }

  // ── MOTIVO DE CANCELACIÓN ─────────────────────────────────────────────────
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
    limpiarTodo(clienteNumero);
    try { actualizarEstadoPedido(datosCancelacion.telefono, "cancelado"); } catch (e) {}
    await msg.reply("Tu solicitud de cancelacion fue enviada a nuestro equipo.\nEn breve se comunicaran contigo para confirmarte. Disculpa los inconvenientes!");
    return;
  }

  // ── 1. PRIMER MENSAJE ─────────────────────────────────────────────────────
  if (!clientesNuevos.has(clienteNumero)) {
    clientesNuevos.add(clienteNumero);
    if (!estaEnHorario()) { await msg.reply(mensajeFueraDeHorario()); return; }
    await msg.reply(SALUDO);
    return;
  }

  // ── 1B. FUERA DE HORARIO ──────────────────────────────────────────────────
  if (!estaEnHorario() && !clientesPreventa.has(clienteNumero)) {
    const aceptaPreventa  = /^(si|sí|s[ií]\s+por\s+fa(vor)?|ok|okey|va|dale|quiero|claro|adelante|sale|andale|ándale|órale|orale|de\s+una|venga|eso|perfecto|listo|con\s+gusto|me\s+apunto|apuntame|ponme|anotame|anota(me)?|por\s+fa(vor)?|please|plis|sip|sep|simón|simon|chido|chale\s+va|esta\s+bien|está\s+bien|bueno|bien|ah\s+si|ah\s+sí)$/i.test(textoOriginal.trim());
    const rechazaPreventa = /^(no|nel|nop|nope|nah|naa|para\s+nada|nones|negativo|nei|nein|no\s+gracias|no\s+gra(s|cias)?|no\s+por\s+fa(vor)?|mejor\s+no|al\s+rato|luego|despues|después|ahorita\s+no|otro\s+dia|otro\s+día|mañana)$/i.test(textoOriginal.trim());
    if (aceptaPreventa) {
      clientesPreventa.add(clienteNumero);
      await msg.reply("Perfecto! Tomamos tu pedido en preventa.\nTu orden estara lista al inicio de nuestro servicio.\n\n" + SALUDO);
      return;
    }
    if (rechazaPreventa) {
      clientesNuevos.delete(clienteNumero);
      await msg.reply("Esta bien! Cuando gustes pedir, aqui estaremos. Hasta pronto!");
      return;
    }
    await msg.reply(mensajeFueraDeHorario());
    return;
  }

  const historial  = getHistorial(clienteNumero);
  const esPreventa = clientesPreventa.has(clienteNumero);

  // ── 1C. CONFIRMACIÓN DE DATOS PRECARGADOS (cliente frecuente) ─────────────
  if (esperandoConfirmacionDatos.has(clienteNumero)) {
    const { tipoEntrega, esPreventa: esPreventaDatos } = esperandoConfirmacionDatos.get(clienteNumero);
    const esOrdenDom = tipoEntrega === "domicilio";
    const confirma = /^(si|sí|s[ií]\s+por\s+fa(vor)?|ok|okey|va|dale|claro|correcto|sale|andale|ándale|órale|orale|perfecto|exacto|listo|así\s+es|asi\s+es|de\s+una|eso\s+es|correcto|afirmativo|todo\s+bien|está\s+bien|esta\s+bien|sip|sep|simón|simon|chido|bueno|bien|me\s+late|nel\s+az|efectivamente|positivo)$/i.test(textoOriginal.trim());
    const niega    = /^(no|nel|nop|nope|nah|incorrecto|cambia(r|me)?|cambio|error|no\s+es\s+correcto|no\s+est[aá]\s+bien|está\s+mal|esta\s+mal|hay\s+un\s+error|modifica(r|me)?|corrige|corr[íi]gelo|actualiza)$/i.test(textoOriginal.trim());

    if (confirma) {
      esperandoConfirmacionDatos.delete(clienteNumero);
      correoPreguntas.add(clienteNumero);
      if (esOrdenDom) referenciaPreguntas.add(clienteNumero);
      const faltante = siguienteCampoFaltante(clienteNumero, esOrdenDom, esPreventaDatos);
      if (!faltante) {
        datosRecibidos.add(clienteNumero);
        historial.push({ role: "user", content: "Mi pedido es " + (esOrdenDom ? "a domicilio" : "para mostrador") });
        historial.push({ role: "assistant", content: "Datos confirmados. Menú enviado." });
        persistirEstado(clienteNumero);
        const formCompleto = mostrarFormularioProgresivo(clienteNumero, esOrdenDom, esPreventaDatos);
        await msg.reply(formCompleto + "\n\nPerfecto! Aqui te mando el menu.");
        await new Promise(r => setTimeout(r, 600));
        await msg.reply(MENU_FORMATO);
      } else {
        const formCompleto = mostrarFormularioProgresivo(clienteNumero, esOrdenDom, esPreventaDatos);
        await msg.reply(formCompleto + "\n\n" + faltante.pregunta);
      }
      return;
    }

    if (niega) {
      esperandoConfirmacionDatos.delete(clienteNumero);
      const formProgresivo = mostrarFormularioProgresivo(clienteNumero, esOrdenDom, esPreventaDatos);
      const faltante = siguienteCampoFaltante(clienteNumero, esOrdenDom, esPreventaDatos);
      await msg.reply(formProgresivo + "\n\n" + (faltante ? faltante.pregunta : "*¿Qué datos deseas corregir?*"));
      return;
    }

    const formCompleto = mostrarFormularioProgresivo(clienteNumero, esOrdenDom, esPreventaDatos);
    await msg.reply(formCompleto + "\n\n*¿Son correctos los datos?*");
    return;
  }

  // ── 2. TIPO DE ENTREGA ────────────────────────────────────────────────────
  if (historial.length === 0) {
    const tipoEntrega = await detectarTipoEntrega(textoOriginal);
    if (tipoEntrega === "ninguno") { await msg.reply("*¿Tu pedido será para domicilio o pasas a recoger al mostrador?*"); return; }

    // Buscar cliente frecuente
    const telGuardado   = telefonosReales.get(clienteNumero) || getTelefonoReal(clienteNumero);
    const telFormulario = datosCampos.get(clienteNumero)?.telefono;
    const telBuscar     = telGuardado || telFormulario || null;
    console.log(`[CLIENTE FRECUENTE] buscando tel: ${telBuscar}`);
    const clienteBD = telBuscar ? getCliente(telBuscar) : null;
    console.log(`[CLIENTE FRECUENTE] encontrado:`, clienteBD ? clienteBD.nombre : "NO");

    if (clienteBD && clienteBD.nombre) {
      const campos = {
        nombre:     [clienteBD.nombre, clienteBD.apellido].filter(Boolean).join(" "),
        telefono:   clienteBD.telefono,
        correo:     clienteBD.correo || "no proporcionó",
        metodo:     null,
        calle:      tipoEntrega === "domicilio" ? (clienteBD.calle_numero || null) : null,
        colonia:    tipoEntrega === "domicilio" ? (clienteBD.colonia || null) : null,
        referencia: tipoEntrega === "domicilio" ? (clienteBD.referencia || "sin referencia") : null,
        hora:       null,
      };
      datosCampos.set(clienteNumero, campos);
      historial.push({ role: "user", content: tipoEntrega === "domicilio" ? "Mi pedido es a domicilio." : "Mi pedido es para recoger en mostrador." });
      historial.push({ role: "assistant", content: "Perfecto, verificando tus datos." });
      esperandoConfirmacionDatos.set(clienteNumero, { tipoEntrega, esPreventa });
      const formPrecargado = mostrarFormularioProgresivo(clienteNumero, tipoEntrega === "domicilio", esPreventa);
      await msg.reply(`Hola de nuevo *${campos.nombre.split(" ")[0]}*! 😊 Encontramos tus datos:\n\n${formPrecargado}\n\n*¿Son correctos los datos?*`);
      console.log(`Bot: [CLIENTE FRECUENTE — datos precargados]`);
      return;
    }

    // Cliente nuevo
    if (tipoEntrega === "mostrador") {
      await msg.reply(esPreventa ? FORM_PREVENTA_MOSTRADOR : FORM_MOSTRADOR);
      historial.push({ role: "user", content: "Mi pedido es para recoger en mostrador." });
      historial.push({ role: "assistant", content: "Perfecto, llena el formulario con tus datos." });
    } else {
      await msg.reply(esPreventa ? FORM_PREVENTA_DOMICILIO : FORM_DOMICILIO);
      historial.push({ role: "user", content: "Mi pedido es a domicilio." });
      historial.push({ role: "assistant", content: "Perfecto, llena el formulario con tus datos." });
    }
    console.log(`Bot: [FORMULARIO - ${tipoEntrega.toUpperCase()}${esPreventa ? " PREVENTA" : ""}]`);
    return;
  }

  // ── 2B. CANCELACIÓN DURANTE EL PEDIDO ────────────────────────────────────
  if (quiereCancelar) {
    clientesNuevos.delete(clienteNumero);
    limpiarTodo(clienteNumero);
    await msg.reply("Tu pedido ha sido cancelado. Cuando gustes ordenar, aqui estaremos. Hasta pronto!");
    return;
  }

  // ── 2C. CAMBIO DE TIPO DURANTE FORMULARIO ────────────────────────────────
  if (!datosRecibidos.has(clienteNumero)) {
    const esCambioDomicilio = /cambi(a|ar|ame|amelo|arme)\s*(a|al|para|el)?\s*domicilio/i.test(textoOriginal)
      || /quiero\s*(que\s*)?(sea\s*)?a\s*domicilio/i.test(textoOriginal)
      || /mejor\s*(a\s*)?domicilio/i.test(textoOriginal)
      || /que\s+sea\s+(a\s+)?domicilio/i.test(textoOriginal)
      || /para\s+domicilio/i.test(textoOriginal)
      || /mejor\s*(que\s*)?(me\s*)?(lo\s*)?(env[íi]a|manda|lleva|trae)(melo|me|lo)?/i.test(textoOriginal)
      || /^(env[íi]amelo|mandamelo|traemelo|llevamelo|mandalos|traelos)$/i.test(textoOriginal.trim());
    const esCambioMostrador = /cambi(a|ar|ame|amelo|arme)\s*(a|al|para|el)?\s*mostrador/i.test(textoOriginal)
      || /mejor\s*(al?\s*)?mostrador/i.test(textoOriginal)
      || /quiero\s*(que\s*)?(sea\s*)?en\s*mostrador/i.test(textoOriginal)
      || /que\s+sea\s+(en\s+)?mostrador/i.test(textoOriginal)
      || /para\s+mostrador/i.test(textoOriginal)
      || /mejor\s*(lo\s*)?(recojo|voy|paso)/i.test(textoOriginal)
      || /yo\s*(voy|paso)\s*(a\s*)?(recoger|buscarlo)?/i.test(textoOriginal)
      || /voy\s*(a\s*)?(pasar|recoger)/i.test(textoOriginal)
      || /paso\s*(yo\s*)?(a\s*recoger)?/i.test(textoOriginal);

    if (esCambioDomicilio || esCambioMostrador) {
      const nuevoTipo = esCambioDomicilio ? "domicilio" : "mostrador";
      const idxTipo = historial.findIndex(h => h.content && (h.content.includes("domicilio") || h.content.includes("mostrador")));
      if (idxTipo !== -1) {
        historial[idxTipo].content = nuevoTipo === "domicilio" ? "Mi pedido es a domicilio." : "Mi pedido es para recoger en mostrador.";
      }
      if (esCambioMostrador) {
        const camposActuales = datosCampos.get(clienteNumero) || {};
        camposActuales.calle = null; camposActuales.colonia = null; camposActuales.referencia = null;
        datosCampos.set(clienteNumero, camposActuales);
      }
      persistirEstado(clienteNumero);
      const formActualizado = mostrarFormularioProgresivo(clienteNumero, esCambioDomicilio, esPreventa);
      const sfaltante = siguienteCampoFaltante(clienteNumero, esCambioDomicilio, esPreventa);
      await msg.reply(
        (esCambioDomicilio ? "Perfecto, cambié tu pedido a domicilio!\n\n" : "Perfecto, cambié tu pedido a mostrador!\n\n") +
        formActualizado +
        (sfaltante ? "\n\n" + sfaltante.pregunta : "")
      );
      return;
    }
  }

  // ── 3. FORMULARIO PROGRESIVO ──────────────────────────────────────────────
  if (!datosRecibidos.has(clienteNumero)) {
    const esOrdenDomicilio = historial.some(h => h.content && h.content.includes("domicilio"));
    const campos = interpretarCampos(clienteNumero, textoOriginal, esOrdenDomicilio, esPreventa);

    if (esPreventa && campos._horaFueraRango) {
      const formProgresivo = mostrarFormularioProgresivo(clienteNumero, esOrdenDomicilio, esPreventa);
      const tipoPedido     = esOrdenDomicilio ? "recibirlo" : "pasar a recoger";
      const msgHora = campos._horaFueraRango === "antes"
        ? "Aun no iniciamos labores a esa hora. Nuestro horario es de *7:00 a.m. a 12:30 p.m.*"
        : "A esa hora ya estamos fuera de servicio. Nuestro horario es de *7:00 a.m. a 12:30 p.m.*";
      await msg.reply(formProgresivo + "\n\n" + msgHora + "\n*¿A qué hora deseas " + tipoPedido + "?* (entre 7:00 a.m. y 12:30 p.m.)");
      delete campos._horaFueraRango;
      datosCampos.set(clienteNumero, campos);
      return;
    }

    const faltante = siguienteCampoFaltante(clienteNumero, esOrdenDomicilio, esPreventa);
    if (faltante && (faltante.campo === "correo" || faltante.campo === "referencia"))
      manejarOpcional(clienteNumero, faltante.campo, textoOriginal);

    acumularDatos(clienteNumero, textoOriginal);

    if (camposCompletos(clienteNumero, esOrdenDomicilio, esPreventa)) {
      const camposActuales = datosCampos.get(clienteNumero);
      if (esPreventa && camposActuales.hora) horaEntregaPreventa.set(clienteNumero, camposActuales.hora);
      const textoFinal = camposATexto(clienteNumero);
      datosRecibidos.add(clienteNumero);
      historial.push({ role: "user", content: textoFinal });
      historial.push({ role: "assistant", content: "Datos recibidos. MENU TACOS JAVIER enviado." });
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
  const palabrasConfirmacion = /^(si|sí|s[ií]\s+por\s+fa(vor)?|ok|okey|va|dale|listo|sale|andale|ándale|adelante|confirmo|confirmado|correcto|asi|así|si\s+porfavor|sí\s+porfavor|si\s+por\s+favor|sí\s+por\s+favor|claro|perfecto|va\s+bien|dale\s+pues|ándale|órale|orale|va\s+que\s+va|de\s+una|eso\s+es|así\s+es|asi\s+es|todo\s+bien|está\s+bien|esta\s+bien|sip|sep|simón|simon|chido|bueno|bien|afirmativo|positivo|exacto|exactamente|procede|proceder|pa\s+delante|p'adelante|con\s+eso|con\s+eso\s+voy|va\s+ese|nel\s+az)$/i;

  if (resumenPendiente.has(clienteNumero) && (
    /cambi(a|ar|ame|amelo|arme)\s*(a|al|para|el)?\s*domicilio/i.test(textoOriginal)
    || /mejor\s*(a\s*)?domicilio/i.test(textoOriginal)
    || /mejor\s*(que\s*)?(me\s*)?(lo\s*)?(env[íi]a|manda|lleva|trae)(melo|me|lo)?/i.test(textoOriginal)
    || /^(env[íi]amelo|mandamelo|traemelo|llevamelo)$/i.test(textoOriginal.trim())
  )) {
    const pendienteActual = resumenPendiente.get(clienteNumero);
    const matchOrden = pendienteActual.texto.match(/📋 \*Orden:\*\n([\s\S]+?)\n💰/);
    const ordenExtraida = matchOrden ? matchOrden[1].trim() : "";
    const idxTipo = historial.findIndex(h => h.content && (h.content.includes("domicilio") || h.content.includes("mostrador")));
    if (idxTipo !== -1) historial[idxTipo].content = "Mi pedido es a domicilio.";
    if (ordenExtraida) esperandoAgregarMas.set(clienteNumero, ordenExtraida);
    resumenPendiente.delete(clienteNumero);
    datosRecibidos.delete(clienteNumero);
    persistirEstado(clienteNumero);
    await msg.reply("Perfecto! Para cambiar a domicilio necesito tu dirección.\n*¿Cuál es tu calle y número?*");
    return;
  }

  if (resumenPendiente.has(clienteNumero) && (
    /cambi(a|ar|ame|amelo|arme)\s*(a|al|para|el)?\s*mostrador/i.test(textoOriginal)
    || /mejor\s*(al?\s*)?mostrador/i.test(textoOriginal)
    || /mejor\s*(lo\s*)?(recojo|voy|paso)/i.test(textoOriginal)
  )) {
    const pendienteActual = resumenPendiente.get(clienteNumero);
    const matchOrden = pendienteActual.texto.match(/📋 \*Orden:\*\n([\s\S]+?)\n💰/);
    const ordenExtraida = matchOrden ? matchOrden[1].trim() : "";
    const idxTipo = historial.findIndex(h => h.content && (h.content.includes("domicilio") || h.content.includes("mostrador")));
    if (idxTipo !== -1) historial[idxTipo].content = "Mi pedido es para recoger en mostrador.";
    const campos = datosCampos.get(clienteNumero) || {};
    campos.calle = null; campos.colonia = null; campos.referencia = null;
    datosCampos.set(clienteNumero, campos);
    resumenPendiente.delete(clienteNumero);
    if (ordenExtraida) {
      const resumenNuevo = generarResumen(clienteNumero, ordenExtraida, false, esPreventa);
      resumenPendiente.set(clienteNumero, { texto: resumenNuevo.texto, esTransferencia: resumenNuevo.esTransferencia });
      persistirEstado(clienteNumero);
      await msg.reply("Perfecto! Cambié tu pedido a mostrador.\n\n" + resumenNuevo.texto);
    }
    return;
  }

  if (resumenPendiente.has(clienteNumero) && /transferencia|efectivo|tarjeta/i.test(textoOriginal)) {
    const esCambio = /cambiar|cambio|mejor|voy\s+a\s+pagar|quiero\s+pagar|pagar\s+con|con\s+(efectivo|tarjeta|transferencia)/i.test(textoOriginal)
      || /^(efectivo|tarjeta|transferencia)$/i.test(textoOriginal.trim());
    if (esCambio) {
      const campos = datosCampos.get(clienteNumero) || {};
      if (/transferencia/i.test(textoOriginal))     campos.metodo = "transferencia";
      else if (/tarjeta/i.test(textoOriginal))      campos.metodo = "tarjeta";
      else if (/efectivo/i.test(textoOriginal))     campos.metodo = "efectivo";
      datosCampos.set(clienteNumero, campos);
      const pendienteActual = resumenPendiente.get(clienteNumero);
      const matchOrden = pendienteActual.texto.match(/📋 \*Orden:\*\n([\s\S]+?)\n💰/);
      const ordenExtraida = matchOrden ? matchOrden[1].trim() : "";
      resumenPendiente.delete(clienteNumero);
      if (ordenExtraida) {
        const esOrdenDomAux = historial.some(h => h.content && h.content.includes("domicilio"));
        const resumenNuevo  = generarResumen(clienteNumero, ordenExtraida, esOrdenDomAux, esPreventa);
        resumenPendiente.set(clienteNumero, { texto: resumenNuevo.texto, esTransferencia: resumenNuevo.esTransferencia });
        await msg.reply(resumenNuevo.texto);
        return;
      }
    }
  }

  if (resumenPendiente.has(clienteNumero) && (
    /agrega(me|r|nos)?|añade|también\s+quiero|y\s+también|y\s+además|suma(me)?|ponme\s+(también|además)|quiero\s+también|también\s+dame|y\s+dame/i.test(textoOriginal)
  )) {
    const pendienteActual = resumenPendiente.get(clienteNumero);
    const matchOrden = pendienteActual.texto.match(/📋 \*Orden:\*\n([\s\S]+?)\n💰/);
    const ordenExtraida = matchOrden ? matchOrden[1].trim() : "";

    // Intentar parsear el ítem nuevo directamente del mensaje
    const jsonNuevo = parsearPedidoSimple(textoOriginal);
    if (jsonNuevo && jsonNuevo.tipo === "pedido" && Array.isArray(jsonNuevo.items) && jsonNuevo.items.length > 0) {
      // Hay ítem parseable: mostrar para confirmación sin borrar el resumen aún
      const resultadoNuevo = jsonALineas(jsonNuevo);
      pedidoJSONActual.set(clienteNumero, { _esModificacionResumen: true, ordenBase: ordenExtraida, jsonNuevo });
      esperandoConfirmacionItem.set(clienteNumero, { lineas: resultadoNuevo.texto, _esModificacionResumen: true, ordenBase: ordenExtraida, jsonNuevo });
      resumenPendiente.delete(clienteNumero);
      persistirEstado(clienteNumero);
      await msg.reply(resultadoNuevo.texto + "\n\n*¿Agrego esto a tu pedido?*");
      return;
    }

    // No se pudo parsear: flujo original (mostrar menú)
    resumenPendiente.delete(clienteNumero);
    if (ordenExtraida) esperandoAgregarMas.set(clienteNumero, ordenExtraida);
  }

  if (resumenPendiente.has(clienteNumero) && /^no[,\s]/i.test(textoOriginal.trim())) {
    const pendienteActual = resumenPendiente.get(clienteNumero);
    const matchOrden = pendienteActual.texto.match(/📋 \*Orden:\*\n([\s\S]+?)\n💰/);
    const ordenExtraida = matchOrden ? matchOrden[1].trim() : "";
    resumenPendiente.delete(clienteNumero);
    if (ordenExtraida) esperandoAgregarMas.set(clienteNumero, ordenExtraida);
  }

  if (resumenPendiente.has(clienteNumero) && /^(no|nel|nop|nope|nah|negativo)$/i.test(textoOriginal.trim())) {
    resumenPendiente.delete(clienteNumero);
    await msg.reply("Entendido! *¿Qué te gustaría cambiar o agregar?*");
    await new Promise(r => setTimeout(r, 300));
    await msg.reply(MENU_FORMATO);
    return;
  }

  if (resumenPendiente.has(clienteNumero) && palabrasConfirmacion.test(textoOriginal.trim())) {
    const pendiente  = resumenPendiente.get(clienteNumero);
    const horaVenta  = new Date().toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
    const infoPedido = extraerDatosPedido(pendiente.texto);

    if (pendiente.esTransferencia) {
      esperandoCaptura.set(clienteNumero, { resumen: pendiente.texto, telefono: infoPedido.telefono });
      resumenPendiente.delete(clienteNumero);
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
      const camposCliente  = datosCampos.get(clienteNumero) || {};
      const cliente = upsertCliente({
        nombre:       nombreParts[0] || null,
        apellido:     nombreParts.slice(1).join(" ") || null,
        telefono:     telefonoLimpio,
        correo:       camposCliente.correo !== "no proporcionó" ? camposCliente.correo : null,
        calle_numero: camposCliente.calle || null,
        colonia:      camposCliente.colonia || null,
        referencia:   camposCliente.referencia !== "sin referencia" ? camposCliente.referencia : null,
      });
      const pedidoId = registrarPedido({
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

    // Guardar teléfono real para futuros pedidos
    if (infoPedido.telefono) {
      telefonosReales.set(clienteNumero, infoPedido.telefono);
      try { guardarTelefonoReal(clienteNumero, infoPedido.telefono); } catch (e) {}
    }

    pedidosConfirmados.set(clienteNumero, { nombre: infoPedido.nombre, telefono: infoPedido.telefono, total: infoPedido.total, resumen: pendiente.texto, confirmadoEn: Date.now() });
    clientesNuevos.delete(clienteNumero);
    limpiarTodo(clienteNumero);
    clientesNuevos.add(clienteNumero);
    await msg.reply("Listo! Tu pedido fue recibido y esta en espera de confirmacion de nuestro equipo.\nEn breve te avisamos. Gracias por tu preferencia!\n\n_Si deseas cancelar tu pedido escribe *cancelar*._");
    return;
  }

  // ── 4B. TOMA DE PEDIDO ────────────────────────────────────────────────────
  const esOrdenDom     = historial.some(h => h.content && h.content.includes("domicilio"));
  const esConfirmacion = /^(si|sí|ok|va|dale|correcto|exacto|claro|perfecto|sale|andale|órale|ándale)$/i.test(textoOriginal.trim());
  const esRechazo      = /^(nel|nop|nope|incorrecto|cambia|error|no\s+es\s+correcto|no\s+est[aá]\s+bien)$/i.test(textoOriginal.trim());
  const esAgregarSi    = /^(si|sí|ok|va|dale|claro|sale|andale|quiero|agrega|más|mas)$/i.test(textoOriginal.trim());
  const esAgregarNo    = /^(no|nel|nop|nada\s*m[aá]s?|ya\s*es\s*todo|eso\s*es\s*todo|listo|ya|solo\s*eso|eso|no\s*,?\s*(gracias|gra|gras)|as[ií]\s*est[aá](\s*bien)?|ya\s*fue|ya\s*con\s*eso)$/i.test(textoOriginal.trim());

  // ── CONFIRMACIÓN DEL ÍTEM ─────────────────────────────────────────────────
  if (esperandoConfirmacionItem.has(clienteNumero)) {
    const itemData = esperandoConfirmacionItem.get(clienteNumero);

    const quiereModificar = /quit(a|ar|ame|amelo|amelos)|elimina|borra|cambia|sin\s+los?|no\s+(quiero|pongas?)\s+los?/i.test(textoOriginal);
    if (quiereModificar && pedidoJSONActual.has(clienteNumero)) {
      const jsonActual = pedidoJSONActual.get(clienteNumero);
      esperandoConfirmacionItem.delete(clienteNumero);
      historial.push({ role: "user", content: textoOriginal });
      historial.push({ role: "system", content: `El pedido actual en JSON es: ${JSON.stringify(jsonActual)}. El cliente quiere modificarlo. Devuelve el JSON actualizado con los cambios solicitados.` });
      if (historial.length > 15) historial.splice(2, 2); // preserva el par [0,1] con tipo de entrega
      try {
        const systemPrompt = buildPrompt({ tomandoPedido: true, textoCliente: textoOriginal, horaConfirmada: horaEntregaPreventa.get(clienteNumero) || null, esPreventa });
        const respMod = await groq.chat.completions.create({
          model: "llama-3.3-70b-versatile", max_tokens: 400, temperature: 0.2,
          messages: [{ role: "system", content: systemPrompt }, ...historial],
        });
        const textoMod = respMod.choices[0]?.message?.content?.trim() || "";
        let jsonMod = null;
        try { jsonMod = JSON.parse(textoMod.replace(/```json|```/g, "").trim()); } catch (_) {}
        if (jsonMod && jsonMod.tipo === "pedido" && Array.isArray(jsonMod.items)) {
          pedidoJSONActual.set(clienteNumero, jsonMod);
          const resultado = jsonALineas(jsonMod);
          esperandoConfirmacionItem.set(clienteNumero, { lineas: resultado.texto });
          historial.push({ role: "assistant", content: textoMod });
          await msg.reply(resultado.texto + "\n\n*¿Es correcto?*");
          return;
        }
      } catch (e) { console.error("Error modificando JSON:", e.message); }
    }

    if (esRechazo || /^no$/i.test(textoOriginal.trim())) {
      esperandoConfirmacionItem.delete(clienteNumero);
      esperandoAgregarMas.delete(clienteNumero);
      const hist = getHistorial(clienteNumero);
      if (hist.length >= 2 && hist[hist.length - 1].role === "assistant")
        hist.splice(hist.length - 2, 2);
      await msg.reply("No pasa nada! *¿Qué deseas ordenar?* 😊");
      await new Promise(r => setTimeout(r, 400));
      await msg.reply(MENU_FORMATO);
      return;
    }

    if (esConfirmacion) {
      esperandoConfirmacionItem.delete(clienteNumero);

      // Caso especial: modificación directa desde el resumen final
      if (itemData._esModificacionResumen) {
        const ordenBase  = itemData.ordenBase || "";
        const jsonNuevo  = itemData.jsonNuevo;
        const { texto: lineasNuevas } = jsonALineas(jsonNuevo);
        const lineasFiltradas = lineasNuevas.split("\n")
          .filter(l => l.trim() && !/subtotal/i.test(l) && !ordenBase.includes(l.trim()))
          .join("\n");
        const ordenCombinada = ordenBase ? ordenBase + "\n" + lineasFiltradas : lineasFiltradas;
        const resumenNuevo   = generarResumen(clienteNumero, ordenCombinada, esOrdenDom, esPreventa);
        resumenPendiente.set(clienteNumero, { texto: resumenNuevo.texto, esTransferencia: resumenNuevo.esTransferencia });
        historial.push({ role: "user", content: "si, agrega" });
        historial.push({ role: "assistant", content: resumenNuevo.texto });
        persistirEstado(clienteNumero);
        await msg.reply(resumenNuevo.texto);
        return;
      }

      const ordenActual = esperandoAgregarMas.get(clienteNumero) || "";
      const lineasNuevas = itemData.lineas.split("\n")
        .filter(l => l.trim() && !ordenActual.includes(l.trim()))
        .join("\n");
      const nuevaOrden = ordenActual ? ordenActual + "\n" + lineasNuevas : lineasNuevas;
      esperandoAgregarMas.set(clienteNumero, nuevaOrden);
      historial.push({ role: "user", content: "si, correcto" });
      historial.push({ role: "assistant", content: itemData.lineas });
      persistirEstado(clienteNumero);
      await msg.reply("*¿Deseas agregar algo más a tu pedido?*");
      return;
    }

    await msg.reply(itemData.lineas + "\n\n*¿Es correcto?*");
    return;
  }

  // ── ESPERANDO SI AGREGA MÁS ───────────────────────────────────────────────
  if (esperandoAgregarMas.has(clienteNumero)) {
    if (esAgregarNo) {
      const ordenCompleta   = esperandoAgregarMas.get(clienteNumero);
      esperandoAgregarMas.delete(clienteNumero);
      const resumenGenerado = generarResumen(clienteNumero, ordenCompleta, esOrdenDom, esPreventa);
      resumenPendiente.set(clienteNumero, { texto: resumenGenerado.texto, esTransferencia: resumenGenerado.esTransferencia });
      historial.push({ role: "user", content: textoOriginal });
      historial.push({ role: "assistant", content: resumenGenerado.texto });
      await msg.reply(resumenGenerado.texto);
      return;
    }

    if (esAgregarSi) {
      const ordenActual = esperandoAgregarMas.get(clienteNumero) || "";
      const listaActual = formatearListaAcumulada(ordenActual);
      await msg.reply(listaActual);
      await new Promise(r => setTimeout(r, 400));
      await msg.reply(MENU_FORMATO);
      await new Promise(r => setTimeout(r, 400));
      await msg.reply("*¿Qué más te gustaría agregar de nuestro menú?*");
      return;
    }
  }

  // ── PRE-FILTRO SIN GROQ ───────────────────────────────────────────────────
  const jsonSimple = parsearPedidoSimple(textoOriginal);
  if (jsonSimple && jsonSimple.tipo === "pedido") {
    pedidoJSONActual.set(clienteNumero, jsonSimple);
    persistirEstado(clienteNumero);
    const resultado = jsonALineas(jsonSimple);
    esperandoConfirmacionItem.set(clienteNumero, { lineas: resultado.texto });
    historial.push({ role: "user", content: textoOriginal });
    historial.push({ role: "assistant", content: resultado.texto });
    await msg.reply(resultado.texto + "\n\n*¿Es correcto?*");
    console.log(`Bot: [PARSER LOCAL] Subtotal: $${resultado.subtotal} — sin llamar a Groq`);
    return;
  }

  // ── LLAMADA A GROQ ────────────────────────────────────────────────────────
  historial.push({ role: "user", content: textoOriginal });
  if (historial.length > 15) historial.splice(2, 2); // preserva el par [0,1] con tipo de entrega

  try {
    const systemPrompt = buildPrompt({
      tomandoPedido:  true,
      textoCliente:   textoOriginal,
      horaConfirmada: horaEntregaPreventa.get(clienteNumero) || null,
      esPreventa,
    });

    const respuestaGroq = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      max_tokens: 400,
      temperature: 0.2,
      messages: [{ role: "system", content: systemPrompt }, ...historial],
    });

    let respuestaTexto = respuestaGroq.choices[0]?.message?.content?.trim() || "";
    historial.push({ role: "assistant", content: respuestaTexto });

    let jsonData = null;
    try {
      const clean = respuestaTexto.replace(/```json|```/g, "").trim();
      jsonData = JSON.parse(clean);
    } catch (_) {}

    if (jsonData && jsonData.tipo === "pedido" && Array.isArray(jsonData.items)) {
      pedidoJSONActual.set(clienteNumero, jsonData);
      persistirEstado(clienteNumero);
      const resultado = jsonALineas(jsonData);
      esperandoConfirmacionItem.set(clienteNumero, { lineas: resultado.texto });
      await msg.reply(resultado.texto + "\n\n*¿Es correcto?*");
      console.log(`Bot: [JSON→LÍNEAS] Subtotal: $${resultado.subtotal}`);
      return;
    }

    if (jsonData && jsonData.tipo === "pregunta" && jsonData.mensaje) {
      await msg.reply(jsonData.mensaje);
      return;
    }

    if (jsonData && jsonData.tipo === "info" && jsonData.mensaje) {
      await msg.reply(jsonData.mensaje);
      return;
    }

    if (respuestaTexto) {
      await msg.reply(respuestaTexto);
      console.log(`Bot: ${respuestaTexto.substring(0, 80)}...`);
    } else {
      await msg.reply("Disculpa, no entendi. Me repites tu pedido?");
    }

  } catch (error) {
    console.error("Error:", error.message);
    try { await msg.reply("Disculpa, tuve un problemita. Me vuelves a decir que quieres?"); } catch (_) {}
  }
}

module.exports = { handleMensaje };