// src/handlers/flujos/formulario.js
const { detectarTipoEntrega } = require("../entrega");
const {
  clientesPreventa, clientesNuevos, datosRecibidos, datosCampos,
  tipoEntregaCliente, horaEntregaPreventa, referenciaPreguntas,
  correoPreguntas, esperandoConfirmacionDatos, getHistorial,
  acumularDatos, interpretarCampos, mostrarFormularioProgresivo,
  siguienteCampoFaltante, manejarOpcional, camposCompletos, camposATexto,
  persistirEstado, detectarEdicion, aplicarEdicion, extraerTelefonoDeJID,
} = require("../../estado");
const { getCliente, getTelefonoReal } = require("../../db");
const { SALUDO, MENU_FORMATO } = require("../../config");
const { estaEnHorario, mensajeFueraDeHorario } = require("../../horario");
const { detectarPreguntaFrecuente } = require("../pedidoParser");
const { generarRespuestaAutomatica } = require("../respuestas");
const { telefonosReales, replyConTyping } = require("./utils");

// ── 1. PRIMER MENSAJE ─────────────────────────────────────────────────────────
// Retorna true si consumió el mensaje (sin tipo de entrega detectado)
// Retorna false si hay tipo de entrega en el primer mensaje → continuar al bloque de entrega
async function handlePrimerMensaje(msg, textoOriginal, clienteNumero) {
  if (clientesNuevos.has(clienteNumero)) return false;

  clientesNuevos.add(clienteNumero);
  if (!estaEnHorario()) { await replyConTyping(msg, mensajeFueraDeHorario()); return true; }
  await replyConTyping(msg, SALUDO);

  const tNorm = textoOriginal.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  if (!/\bdomicilio\b|\benvio\b|\ba\s+casa\b|\bmostrador\b|\brecoger\b|\bpara\s+llevar\b/.test(tNorm)) return true;
  return false; // tiene tipo de entrega — caer al bloque de tipo de entrega
}

// ── 1B. FUERA DE HORARIO ──────────────────────────────────────────────────────
async function handleFueraDeHorario(msg, textoOriginal, clienteNumero) {
  if (estaEnHorario() || clientesPreventa.has(clienteNumero)) return false;

  const aceptaPreventa  = /^(si|sí|s[ií]\s+por\s+fa(vor)?|ok|okey|va|dale|quiero|claro|adelante|sale|andale|ándale|órale|orale|de\s+una|venga|eso|perfecto|listo|con\s+gusto|me\s+apunto|apuntame|ponme|anotame|anota(me)?|por\s+fa(vor)?|please|plis|sip|sep|simón|simon|chido|chale\s+va|esta\s+bien|está\s+bien|bueno|bien|ah\s+si|ah\s+sí)$/i.test(textoOriginal.trim());
  const rechazaPreventa = /^(no|nel|nop|nope|nah|naa|para\s+nada|nones|negativo|nei|nein|no\s+gracias|no\s+gra(s|cias)?|no\s+por\s+fa(vor)?|mejor\s+no|al\s+rato|luego|despues|después|ahorita\s+no|otro\s+dia|otro\s+día|mañana)$/i.test(textoOriginal.trim());

  if (aceptaPreventa) {
    clientesPreventa.add(clienteNumero);
    await msg.reply("Perfecto! Tomamos tu pedido en preventa.\nTu orden estara lista al inicio de nuestro servicio.\n\n" + SALUDO);
    return true;
  }
  if (rechazaPreventa) {
    clientesNuevos.delete(clienteNumero);
    await msg.reply("Esta bien! Cuando gustes pedir, aqui estaremos. Hasta pronto!");
    return true;
  }
  await msg.reply(mensajeFueraDeHorario());
  return true;
}

// ── 2. TIPO DE ENTREGA ────────────────────────────────────────────────────────
async function handleTipoEntrega(msg, client, textoOriginal, clienteNumero, historial, esPreventa) {
  if (historial.length !== 0) return false;

  const tNorm = textoOriginal.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const esMostradorLocal = /\bpara\s+llevar\b|\bpa[`']?\s*llevar\b|\bpaso\s+(yo\s+)?a\s+recoger\b|\bvoy\s+a?\s*recoger\b|\bme\s+(?:lo\s+)?llevo\b|\bpara\s+recoger\b|\blo\s+recojo\b|\byo\s+(recojo|paso\b)/.test(tNorm);
  const tipoEntrega = esMostradorLocal ? "mostrador" : await detectarTipoEntrega(textoOriginal);
  if (tipoEntrega === "ninguno") {
    await msg.reply("*¿Tu pedido será para domicilio o pasas a recoger al mostrador?*");
    return true;
  }

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
      tipoEntrega,
    };
    datosCampos.set(clienteNumero, campos);
    historial.push({ role: "user",      content: tipoEntrega === "domicilio" ? "Mi pedido es a domicilio." : "Mi pedido es para recoger en mostrador." });
    historial.push({ role: "assistant", content: "Perfecto, verificando tus datos." });
    esperandoConfirmacionDatos.set(clienteNumero, { tipoEntrega, esPreventa });
    const formPrecargado = mostrarFormularioProgresivo(clienteNumero, tipoEntrega === "domicilio", esPreventa);
    await msg.reply(`Hola de nuevo *${campos.nombre.split(" ")[0]}*! 😊 Encontramos tus datos:\n\n${formPrecargado}\n\n*¿Son correctos los datos?*`);
    console.log(`Bot: [CLIENTE FRECUENTE — datos precargados]`);
    return true;
  }

  let telAutodetectado = telefonosReales.get(clienteNumero) || getTelefonoReal(clienteNumero) || null;
  if (!telAutodetectado) telAutodetectado = extraerTelefonoDeJID(clienteNumero);
  if (!telAutodetectado) {
    try {
      const contacto = await msg.getContact();
      const numRaw   = (contacto.number || "").replace(/\D/g, "");
      const sinPais  = numRaw.length > 10 ? numRaw.slice(-10) : numRaw;
      if (/^[2-9]\d{9}$/.test(sinPais)) telAutodetectado = sinPais;
    } catch (_) {}
  }

  const camposIniciales = datosCampos.get(clienteNumero) || {};
  if (telAutodetectado && !camposIniciales.telefono) camposIniciales.telefono = telAutodetectado;
  camposIniciales.tipoEntrega = tipoEntrega;
  datosCampos.set(clienteNumero, camposIniciales);

  // Extraer datos que el cliente haya incluido en el mismo mensaje
  const esDomicilioLocal = tipoEntrega === "domicilio";
  interpretarCampos(clienteNumero, textoOriginal, esDomicilioLocal, esPreventa);

  tipoEntregaCliente.set(clienteNumero, tipoEntrega);
  const parEntrega = tipoEntrega === "mostrador"
    ? { user: "Mi pedido es para recoger en mostrador.", bot: "Perfecto, llena el formulario con tus datos." }
    : { user: "Mi pedido es a domicilio.",               bot: "Perfecto, llena el formulario con tus datos." };
  historial.length = 0;
  historial.push({ role: "user",      content: parEntrega.user });
  historial.push({ role: "assistant", content: parEntrega.bot  });

  const camposAct = datosCampos.get(clienteNumero);
  const formProg  = mostrarFormularioProgresivo(clienteNumero, esDomicilioLocal, esPreventa);

  if (camposCompletos(clienteNumero, esDomicilioLocal, esPreventa)) {
    // El cliente incluyó todos sus datos en el primer mensaje
    persistirEstado(clienteNumero);
    await msg.reply(formProg + "\n\n*¿Son correctos los datos?*");
    console.log(`Bot: [FORMULARIO COMPLETO EN PRIMER MSG - ${tipoEntrega.toUpperCase()}]`);
    return true;
  }

  const siguienteFalt = siguienteCampoFaltante(clienteNumero, esDomicilioLocal, esPreventa);
  persistirEstado(clienteNumero);
  await msg.reply(siguienteFalt ? formProg + "\n\n" + siguienteFalt.pregunta : formProg + "\n\n*¿Son correctos los datos?*");
  console.log(`Bot: [FORMULARIO - ${tipoEntrega.toUpperCase()}${esPreventa ? " PREVENTA" : ""}] Tel: ${camposAct?.telefono}`);
  return true;
}

// ── 2C. CAMBIO DE TIPO DURANTE FORMULARIO ────────────────────────────────────
async function handleCambioTipoDuranteFormulario(msg, textoOriginal, clienteNumero, esPreventa) {
  if (datosRecibidos.has(clienteNumero)) return false;

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

  if (!esCambioDomicilio && !esCambioMostrador) return false;

  const nuevoTipo = esCambioDomicilio ? "domicilio" : "mostrador";
  tipoEntregaCliente.set(clienteNumero, nuevoTipo);
  const camposActuales = datosCampos.get(clienteNumero) || {};
  camposActuales.tipoEntrega = nuevoTipo;
  if (esCambioMostrador) {
    camposActuales.calle = null; camposActuales.colonia = null; camposActuales.referencia = null;
    referenciaPreguntas.delete(clienteNumero);
  }
  if (esCambioDomicilio) {
    const telActual = camposActuales.telefono || null;
    if (telActual) {
      const clienteBD = getCliente(telActual);
      if (clienteBD) {
        if (!camposActuales.calle)      camposActuales.calle      = clienteBD.calle_numero || null;
        if (!camposActuales.colonia)    camposActuales.colonia    = clienteBD.colonia      || null;
        if (!camposActuales.referencia) camposActuales.referencia = clienteBD.referencia   || null;
      }
    }
  }
  datosCampos.set(clienteNumero, camposActuales);
  const formActualizado = mostrarFormularioProgresivo(clienteNumero, esCambioDomicilio, esPreventa);
  const sfaltante = siguienteCampoFaltante(clienteNumero, esCambioDomicilio, esPreventa);
  await msg.reply(
    (esCambioDomicilio ? "Perfecto, cambié tu pedido a domicilio!\n\n" : "Perfecto, cambié tu pedido a mostrador!\n\n") +
    formActualizado +
    (sfaltante ? "\n\n" + sfaltante.pregunta : "")
  );
  return true;
}

// ── 3. FORMULARIO PROGRESIVO ──────────────────────────────────────────────────
async function handleFormularioProgresivo(msg, textoOriginal, clienteNumero, historial, esPreventa) {
  if (datosRecibidos.has(clienteNumero)) return false;

  const camposActualesFormulario = datosCampos.get(clienteNumero) || {};
  const esOrdenDomicilio = camposActualesFormulario.tipoEntrega === "domicilio"
    || (camposActualesFormulario.tipoEntrega == null && tipoEntregaCliente.get(clienteNumero) === "domicilio");

  // FAQ durante formulario: responde y re-muestra el progreso
  {
    const pregFaqForm = detectarPreguntaFrecuente(textoOriginal);
    if (pregFaqForm && ["horario", "domicilio", "metodos_pago"].includes(pregFaqForm.tipo)) {
      const respFaqForm = generarRespuestaAutomatica(pregFaqForm, { esDomicilio: esOrdenDomicilio });
      if (respFaqForm) {
        await msg.reply(respFaqForm);
        const formProg = mostrarFormularioProgresivo(clienteNumero, esOrdenDomicilio, esPreventa);
        const sigFalt  = siguienteCampoFaltante(clienteNumero, esOrdenDomicilio, esPreventa);
        await msg.reply(formProg + (sigFalt ? "\n\n" + sigFalt.pregunta : "\n\n*¿Son correctos los datos?*"));
        return true;
      }
    }
  }

  const esConfirmacionDatos = /^(si|sí|ok|okey|va|dale|claro|correcto|listo|sip|sep|exacto|perfecto|todo\s+bien|está\s+bien|esta\s+bien|así\s+es|asi\s+es|afirmativo|bueno|bien)$/i.test(textoOriginal.trim());
  if (esConfirmacionDatos && camposCompletos(clienteNumero, esOrdenDomicilio, esPreventa)) {
    const camposAct = datosCampos.get(clienteNumero);
    if (esPreventa && camposAct.hora) horaEntregaPreventa.set(clienteNumero, camposAct.hora);
    const textoFinal = camposATexto(clienteNumero);
    datosRecibidos.add(clienteNumero);
    historial.length = 0;
    historial.push({ role: "user",      content: textoFinal });
    historial.push({ role: "assistant", content: "Datos recibidos. MENU TACOS JAVIER enviado." });
    const formCompleto = mostrarFormularioProgresivo(clienteNumero, esOrdenDomicilio, esPreventa);
    persistirEstado(clienteNumero);
    await msg.reply(formCompleto + "\n\nPerfecto, datos recibidos! Aqui te mando el menu.");
    await new Promise(r => setTimeout(r, 600));
    await msg.reply(MENU_FORMATO);
    return true;
  }

  if (detectarEdicion(textoOriginal)) {
    const faltanteActual = siguienteCampoFaltante(clienteNumero, esOrdenDomicilio, esPreventa);
    const formActual = mostrarFormularioProgresivo(clienteNumero, esOrdenDomicilio, esPreventa);
    await msg.reply(
      "Puedes corregir tus datos cuando te muestre el resumen completo y te pregunte si son correctos. 😊\n\n" +
      formActual +
      (faltanteActual ? "\n\n" + faltanteActual.pregunta : "\n\n*¿Son correctos los datos?*")
    );
    return true;
  }

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
    return true;
  }

  const referenciaYaPreguntada = referenciaPreguntas.has(clienteNumero);
  const faltante = siguienteCampoFaltante(clienteNumero, esOrdenDomicilio, esPreventa);
  if (faltante && (faltante.campo === "correo" || faltante.campo === "referencia")) {
    const fueMarcado = manejarOpcional(clienteNumero, faltante.campo, textoOriginal);
    if (!fueMarcado && faltante.campo === "referencia" && referenciaYaPreguntada) {
      const ca = datosCampos.get(clienteNumero) || {};
      ca.referencia = textoOriginal.trim();
      datosCampos.set(clienteNumero, ca);
      persistirEstado(clienteNumero);
    }
    if (!fueMarcado && faltante.campo === "correo") {
      const ca = datosCampos.get(clienteNumero) || {};
      if (/[\w.+-]+@[\w-]+\.[a-z]{2,}/i.test(textoOriginal.trim())) {
        ca.correo = textoOriginal.trim();
        datosCampos.set(clienteNumero, ca);
        persistirEstado(clienteNumero);
      }
    }
  }

  // Extrae calle + colonia de mensajes como "Av. Reforma 456, Col. Centro"
  {
    const ca = datosCampos.get(clienteNumero) || {};
    if (ca.tipoEntrega === "domicilio" && !ca.calle && !ca.colonia) {
      const matchComa = textoOriginal.match(/^(.+?),\s*(.+)$/);
      if (matchComa) {
        const parte1       = matchComa[1].trim();
        const coloniaLimpia = matchComa[2].trim().replace(/^col(?:onia)?\.?\s*/i, "").trim();
        if (parte1.length > 3 && coloniaLimpia.length > 2 && /\d/.test(parte1)) {
          ca.calle = parte1; ca.colonia = coloniaLimpia; datosCampos.set(clienteNumero, ca);
        }
      }
    }
  }
  acumularDatos(clienteNumero, textoOriginal);

  if (camposCompletos(clienteNumero, esOrdenDomicilio, esPreventa)) {
    const camposAct = datosCampos.get(clienteNumero);
    if (esPreventa && camposAct.hora) horaEntregaPreventa.set(clienteNumero, camposAct.hora);
    const textoFinal = camposATexto(clienteNumero);
    datosRecibidos.add(clienteNumero);
    historial.length = 0;
    historial.push({ role: "user",      content: textoFinal });
    historial.push({ role: "assistant", content: "Datos recibidos. MENU TACOS JAVIER enviado." });
    const formCompleto = mostrarFormularioProgresivo(clienteNumero, esOrdenDomicilio, esPreventa);
    await msg.reply(formCompleto + "\n\nPerfecto, datos recibidos! Aqui te mando el menu.");
    await new Promise(r => setTimeout(r, 600));
    await msg.reply(MENU_FORMATO);
    return true;
  }

  const siguienteFaltante = siguienteCampoFaltante(clienteNumero, esOrdenDomicilio, esPreventa);
  const formProgresivo    = mostrarFormularioProgresivo(clienteNumero, esOrdenDomicilio, esPreventa);

  if (siguienteFaltante) {
    await msg.reply(formProgresivo + "\n\n" + siguienteFaltante.pregunta);
  } else {
    const ca = datosCampos.get(clienteNumero) || {};
    if (!ca.correo)                         { ca.correo     = "no proporcionó"; correoPreguntas.add(clienteNumero); }
    if (esOrdenDomicilio && !ca.referencia) { ca.referencia = "sin referencia"; referenciaPreguntas.add(clienteNumero); }
    datosCampos.set(clienteNumero, ca);
    persistirEstado(clienteNumero);
    const formActualizado = mostrarFormularioProgresivo(clienteNumero, esOrdenDomicilio, esPreventa);
    await msg.reply(formActualizado + "\n\n*¿Son correctos los datos?*");
  }
  return true;
}

module.exports = {
  handlePrimerMensaje,
  handleFueraDeHorario,
  handleTipoEntrega,
  handleCambioTipoDuranteFormulario,
  handleFormularioProgresivo,
};
