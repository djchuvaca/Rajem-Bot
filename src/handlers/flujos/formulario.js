// src/handlers/flujos/formulario.js
const { detectarTipoEntrega } = require("../entrega");
const { getTipoServicio } = require("../../db/config");
const {
  clientesPreventa, clientesNuevos, datosRecibidos, datosCampos,
  tipoEntregaCliente, horaEntregaPreventa, referenciaPreguntas,
  esperandoConfirmacionDatos, ordenPreResumen, getHistorial,
  acumularDatos, interpretarCampos, mostrarFormularioProgresivo,
  siguienteCampoFaltante, manejarOpcional, camposCompletos, camposATexto,
  persistirEstado, detectarEdicion, aplicarEdicion, extraerTelefonoDeJID,
  sanitizarColonia, resumenPendiente,
  esperandoColonia,
} = require("../../estado");
const { generarResumen } = require("../../pedido/resumen");
const { getCliente, getTelefonoReal } = require("../../db");
const { SALUDO, MENU_FORMATO } = require("../../config");
const { estaEnHorario, mensajeFueraDeHorario, getRangoHorario } = require("../../horario");
const { detectarPreguntaFrecuente, calcularScore, detectarSinTipo, parsearPedidoSimple } = require("../pedidoParser");
const { generarRespuestaAutomatica } = require("../respuestas");
const { telefonosReales, replyConTyping, ordenPendientePreventa, enFlujoActivo } = require("./utils");
const { buscarColonia, buscarColoniaDetallada } = require("../../geo");

// Contador de intentos fallidos de colonia por cliente (vive solo en memoria, se limpia al aceptar)
const _intentosColonia = new Map();
// Clientes a los que ya se les envió el menú en handlePrimerMensaje (evita doble saludo en handleTipoEntrega)
const _menuEnviado = new Set();

// ── DETECCIÓN Y RESUMEN DE SEÑALES DE PEDIDO ─────────────────────────────────
const _PRESUPUESTO_RE = /\bpor\s*\$\s*\d+|\$\s*\d+\s*(de|en)\b/i;

function _tieneSeñalesDePedido(texto) {
  return calcularScore(texto) >= 4 || _PRESUPUESTO_RE.test(texto);
}

function _resumirIntentoPedido(texto) {
  const st = detectarSinTipo(texto);
  if (st) return `${st.cantidad} tacos o tortas de ${st.corte}`;
  const pp = parsearPedidoSimple(texto);
  if (pp && pp.tipo === "pedido" && pp.items?.length) {
    const item = pp.items[0];
    if (item.presentacion === "pesos")  return `$${item.monto} de ${item.corte}`;
    if (item.presentacion === "taco")   return `${item.cantidad} taco${item.cantidad !== 1 ? "s" : ""} de ${item.corte}`;
    if (item.presentacion === "torta")  return `${item.cantidad} torta${item.cantidad !== 1 ? "s" : ""} de ${item.corte}`;
    if (item.presentacion === "gramos") return `${item.gramos}g de ${item.corte}`;
  }
  return texto;
}

// ── 1. PRIMER MENSAJE ─────────────────────────────────────────────────────────
// Retorna true si consumió el mensaje (sin tipo de entrega detectado)
// Retorna false si hay tipo de entrega en el primer mensaje → continuar al bloque de entrega
async function handlePrimerMensaje(msg, textoOriginal, clienteNumero) {
  if (clientesNuevos.has(clienteNumero)) return false;

  clientesNuevos.add(clienteNumero);
  _intentosColonia.delete(clienteNumero); // Resetear contador de intentos de sesión anterior
  _menuEnviado.delete(clienteNumero); // Resetear flag de menú enviado de sesión anterior
  if (!estaEnHorario()) {
    if (_tieneSeñalesDePedido(textoOriginal)) {
      ordenPendientePreventa.set(clienteNumero, textoOriginal);
      const resumen = _resumirIntentoPedido(textoOriginal);
      await replyConTyping(msg,
        `Entiendo que quieres ordenar *${resumen}*, pero en este momento estamos fuera de servicio.\n\n` +
        `¿Te gustaría hacer tu pedido en *preventa*? Tu orden estará lista al inicio de nuestro horario de atención.`
      );
    } else {
      await replyConTyping(msg, mensajeFueraDeHorario());
    }
    return true;
  }
  const tipoServicio = getTipoServicio();
  const tNorm = textoOriginal.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const tieneTipoEntrega = /\bdomicilio\b|\benvio\b|\ba\s+casa\b|\bmostrador\b|\brecoger\b|\bpara\s+llevar\b/.test(tNorm);

  const telKnown        = extraerTelefonoDeJID(clienteNumero) || telefonosReales.get(clienteNumero);
  const clienteConocido = telKnown ? getCliente(telKnown) : null;
  const primerNombre    = clienteConocido?.nombre?.split(" ")[0] || null;

  if (_tieneSeñalesDePedido(textoOriginal)) {
    ordenPendientePreventa.set(clienteNumero, textoOriginal);
  }

  // Cuando solo hay un tipo de servicio no se pregunta — handleTipoEntrega auto-setea
  if (tipoServicio !== "ambos") {
    if (primerNombre) {
      await replyConTyping(msg, `Hola de nuevo, *${primerNombre}*! 😊`);
    } else {
      await replyConTyping(msg, SALUDO());
    }
    return false; // caer a handleTipoEntrega para que auto-setee el tipo
  }

  // Para clientes recurrentes sin tipo de entrega en el primer mensaje:
  // saludar por nombre y preguntar tipo de entrega; el menú se envía después en handleTipoEntrega.
  // Para clientes recurrentes con tipo de entrega en el primer mensaje:
  // handleTipoEntrega mostrará el saludo + menú (returns false aquí, cae al siguiente handler).
  if (!tieneTipoEntrega || !primerNombre) {
    if (primerNombre) {
      await replyConTyping(msg, `Hola de nuevo, *${primerNombre}*! 😊 ¿Tu pedido será para domicilio o pasas a recoger al mostrador?`);
      _menuEnviado.add(clienteNumero); // marca que el saludo ya fue enviado; handleTipoEntrega no lo repite
    } else {
      await replyConTyping(msg, SALUDO());
    }
  }

  if (!tieneTipoEntrega) return true;
  return false; // tiene tipo de entrega — caer al bloque de tipo de entrega
}

// ── 1B. FUERA DE HORARIO ──────────────────────────────────────────────────────
async function handleFueraDeHorario(msg, textoOriginal, clienteNumero) {
  if (estaEnHorario() || clientesPreventa.has(clienteNumero)) return false;

  const aceptaPreventa  = /^(si|sí|s[ií]\s+por\s+fa(vor)?|ok|okey|va|dale|quiero|claro|adelante|sale|andale|ándale|órale|orale|de\s+una|venga|eso|perfecto|listo|con\s+gusto|me\s+apunto|apuntame|ponme|anotame|anota(me)?|por\s+fa(vor)?|please|plis|sip|sep|simón|simon|chido|chale\s+va|esta\s+bien|está\s+bien|bueno|bien|ah\s+si|ah\s+sí)$/i.test(textoOriginal.trim());
  const rechazaPreventa = /^(no|nel|nop|nope|nah|naa|para\s+nada|nones|negativo|nei|nein|no\s+gracias|no\s+gra(s|cias)?|no\s+por\s+fa(vor)?|mejor\s+no|al\s+rato|luego|despues|después|ahorita\s+no|otro\s+dia|otro\s+día|mañana)$/i.test(textoOriginal.trim());

  if (aceptaPreventa) {
    clientesPreventa.add(clienteNumero);
    _menuEnviado.add(clienteNumero); // SALUDO() ya fue enviado; handleTipoEntrega no repite el saludo
    persistirEstado(clienteNumero);
    await msg.reply(`¡Perfecto! Tomamos tu pedido en preventa.\nTu orden estará lista a partir de *${getRangoHorario().split(" a ")[0]}* al inicio de nuestro horario. 😊\n\n` + SALUDO());
    return true;
  }
  if (rechazaPreventa) {
    clientesNuevos.delete(clienteNumero);
    ordenPendientePreventa.delete(clienteNumero);
    await msg.reply("¡Está bien! Cuando gustes pedir, aquí estaremos. ¡Hasta pronto! 😊");
    return true;
  }
  if (_tieneSeñalesDePedido(textoOriginal)) {
    const textoAnterior  = ordenPendientePreventa.get(clienteNumero);
    const textoAcumulado = textoAnterior ? `${textoAnterior}, ${textoOriginal}` : textoOriginal;
    ordenPendientePreventa.set(clienteNumero, textoAcumulado);
    const resumen = _resumirIntentoPedido(textoAcumulado);
    await msg.reply(
      `Entiendo que quieres ordenar *${resumen}*, pero en este momento estamos fuera de servicio.\n\n` +
      `¿Te gustaría hacer tu pedido en *preventa*? Tu orden estará lista al inicio de nuestro horario de atención.`
    );
  } else if (ordenPendientePreventa.has(clienteNumero)) {
    const resumen = _resumirIntentoPedido(ordenPendientePreventa.get(clienteNumero));
    await msg.reply(
      `Recuerda que estamos fuera de servicio.\n¿Confirmas que quieres *${resumen}* en preventa?\n\nResponde *sí* para apartar tu pedido o *no* si prefieres esperar.`
    );
  } else {
    await msg.reply(mensajeFueraDeHorario());
  }
  return true;
}

// ── 2. TIPO DE ENTREGA ────────────────────────────────────────────────────────
async function handleTipoEntrega(msg, client, textoOriginal, clienteNumero, historial, esPreventa) {
  if (historial.length !== 0) return false;
  if (enFlujoActivo(clienteNumero)) return false;

  const tipoServicio = getTipoServicio();
  let tipoEntrega;
  if (tipoServicio === "solo_domicilio") {
    tipoEntrega = "domicilio";
  } else if (tipoServicio === "solo_mostrador") {
    tipoEntrega = "mostrador";
  } else {
    const tNorm = textoOriginal.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    const esMostradorLocal = /\bpara\s+llevar\b|\bpa[`']?\s*llevar\b|\bpaso\s+(yo\s+)?a\s+recoger\b|\bvoy\s+a?\s*recoger\b|\bme\s+(?:lo\s+)?llevo\b|\bpara\s+recoger\b|\blo\s+recojo\b|\byo\s+(recojo|paso\b)/.test(tNorm);
    tipoEntrega = esMostradorLocal ? "mostrador" : await detectarTipoEntrega(textoOriginal);
    if (tipoEntrega === "ninguno") {
      if (_tieneSeñalesDePedido(textoOriginal)) return false;
      await msg.reply("*¿Tu pedido será para domicilio o pasas a recoger al mostrador?*");
      return true;
    }
  }

  // Pre-cargar datos del cliente frecuente (silencioso — el formulario se muestra después del pedido)
  const telGuardado   = telefonosReales.get(clienteNumero) || getTelefonoReal(clienteNumero);
  const telFormulario = datosCampos.get(clienteNumero)?.telefono;
  const telBuscar     = telGuardado || telFormulario || null;
  const clienteBD     = telBuscar ? getCliente(telBuscar) : null;

  if (clienteBD && clienteBD.nombre) {
    const campos = {
      nombre:     [clienteBD.nombre, clienteBD.apellido].filter(Boolean).join(" "),
      telefono:   clienteBD.telefono,
      metodo:     null,
      calle:      tipoEntrega === "domicilio" ? (clienteBD.calle_numero || null) : null,
      colonia:    tipoEntrega === "domicilio" ? (sanitizarColonia(clienteBD.colonia) || null) : null,
      referencia: tipoEntrega === "domicilio" ? (clienteBD.referencia || "sin referencia") : null,
      hora:       null,
      tipoEntrega,
    };
    datosCampos.set(clienteNumero, campos);
    console.log(`[CLIENTE FRECUENTE] datos pre-cargados: ${campos.nombre}`);
  } else {
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
    interpretarCampos(clienteNumero, textoOriginal, tipoEntrega === "domicilio", esPreventa);
  }

  tipoEntregaCliente.set(clienteNumero, tipoEntrega);
  const parUser = tipoEntrega === "domicilio" ? "Mi pedido es a domicilio." : "Mi pedido es para recoger en mostrador.";
  historial.length = 0;
  historial.push({ role: "user",      content: parUser });
  historial.push({ role: "assistant", content: "Perfecto, aquí el menú." });

  persistirEstado(clienteNumero);
  const primerNombre = clienteBD?.nombre?.split(" ")[0] || null;
  const saludoYaEnviado = _menuEnviado.has(clienteNumero);
  _menuEnviado.delete(clienteNumero);
  if (primerNombre && !saludoYaEnviado) {
    // Primer mensaje del cliente ya incluía tipo de entrega — saludar aquí
    await replyConTyping(msg, `Hola de nuevo *${primerNombre}*! 😊 Aquí te mando el menú:`);
    await new Promise(r => setTimeout(r, 400));
  } else {
    // Saludo ya fue enviado en handlePrimerMensaje — solo confirmar tipo de entrega
    const intro = tipoEntrega === "domicilio" ? "Perfecto! 🛵 Aquí te mando el menú:" : "Perfecto! Aquí te mando el menú:";
    await replyConTyping(msg, intro);
    await new Promise(r => setTimeout(r, 400));
  }
  await msg.reply(MENU_FORMATO());
  console.log(`Bot: [TIPO ENTREGA — ${tipoEntrega.toUpperCase()}${esPreventa ? " PREVENTA" : ""}]`);
  return true;
}

// ── 2C. CAMBIO DE TIPO DURANTE FORMULARIO (post-orden) ───────────────────────
async function handleCambioTipoDuranteFormulario(msg, textoOriginal, clienteNumero, esPreventa) {
  if (!ordenPreResumen.has(clienteNumero)) return false;
  if (getTipoServicio() !== "ambos") return false; // solo un tipo activo — no aplica cambio

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
        if (!camposActuales.colonia)    camposActuales.colonia    = sanitizarColonia(clienteBD.colonia) || null;
        if (!camposActuales.referencia) camposActuales.referencia = clienteBD.referencia   || null;
      }
    }
  }
  datosCampos.set(clienteNumero, camposActuales);
  persistirEstado(clienteNumero);
  const formActualizado = mostrarFormularioProgresivo(clienteNumero, esCambioDomicilio, esPreventa);
  const sfaltante = siguienteCampoFaltante(clienteNumero, esCambioDomicilio, esPreventa);
  await msg.reply(
    (esCambioDomicilio ? "Perfecto, cambié tu pedido a domicilio!\n\n" : "Perfecto, cambié tu pedido a mostrador!\n\n") +
    formActualizado +
    (sfaltante ? "\n\n" + sfaltante.pregunta : "")
  );
  return true;
}

// ── 3. FORMULARIO PROGRESIVO (post-orden) ────────────────────────────────────
async function handleFormularioProgresivo(msg, textoOriginal, clienteNumero, historial, esPreventa) {
  if (!ordenPreResumen.has(clienteNumero)) return false;

  const camposActualesFormulario = datosCampos.get(clienteNumero) || {};

  // Capturar tipo de entrega si el flujo de orden corrió antes de preguntar
  if (!camposActualesFormulario.tipoEntrega && !tipoEntregaCliente.has(clienteNumero)) {
    const ts = getTipoServicio();
    let tipo = null;
    if (ts === "solo_domicilio") {
      tipo = "domicilio";
    } else if (ts === "solo_mostrador") {
      tipo = "mostrador";
    } else {
      const tNorm = textoOriginal.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
      const esDom = /\bdomicilio\b|\benv[íi]o\b|\ba\s+casa\b/.test(tNorm);
      const esMos = /\bmostrador\b|\brecoger\b|\bpara\s+llevar\b|\bpa['`]?\s*llevar\b|\bpaso\b|\bvoy\s+a\s+recoger\b|\byo\s+paso\b/.test(tNorm);
      if (esDom || esMos) tipo = esDom ? "domicilio" : "mostrador";
    }
    if (tipo) {
      tipoEntregaCliente.set(clienteNumero, tipo);
      camposActualesFormulario.tipoEntrega = tipo;
      const telGuardado = telefonosReales.get(clienteNumero) || getTelefonoReal(clienteNumero);
      const telBuscar   = telGuardado || extraerTelefonoDeJID(clienteNumero);
      const clienteBD   = telBuscar ? getCliente(telBuscar) : null;
      if (clienteBD && clienteBD.nombre) {
        camposActualesFormulario.nombre   = [clienteBD.nombre, clienteBD.apellido].filter(Boolean).join(" ");
        camposActualesFormulario.telefono = clienteBD.telefono;
        if (tipo === "domicilio") {
          camposActualesFormulario.calle      = clienteBD.calle_numero || null;
          camposActualesFormulario.colonia    = sanitizarColonia(clienteBD.colonia) || null;
          camposActualesFormulario.referencia = clienteBD.referencia   || null;
        }
      }
      datosCampos.set(clienteNumero, camposActualesFormulario);
      persistirEstado(clienteNumero);
    } else {
      await msg.reply("Para confirmar tu pedido, *¿será para domicilio o pasas a recoger al mostrador?*");
      return true;
    }
  }

  const esOrdenDomicilio = camposActualesFormulario.tipoEntrega === "domicilio"
    || (camposActualesFormulario.tipoEntrega == null && tipoEntregaCliente.get(clienteNumero) === "domicilio");

  if (esOrdenDomicilio && esperandoColonia.has(clienteNumero)) {
    const opciones = esperandoColonia.get(clienteNumero).opciones || [];
    const limpio = textoOriginal.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const ordinales = { "la primera": 0, primera: 0, "la segunda": 1, segunda: 1, "la tercera": 2, tercera: 2 };
    let indice = /^\d+$/.test(limpio) ? Number(limpio) - 1 : ordinales[limpio];
    let elegida = Number.isInteger(indice) ? opciones[indice] : null;
    if (!elegida) elegida = opciones.find(o => {
      const nombre = o.nombre.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      return limpio === nombre || (o.codigoPostal && limpio.includes(o.codigoPostal)) || (o.tipo && limpio.includes(o.tipo.replace(/_/g, " ")));
    });
    if (!elegida) {
      const lista = opciones.map((o, i) => `${i + 1}. *${o.nombre}*${o.codigoPostal ? ` — CP ${o.codigoPostal}` : ""}`).join("\n");
      await msg.reply(`No pude identificar cuál elegiste. Responde con el *número*, nombre completo o código postal:\n${lista}`);
      return true;
    }
    esperandoColonia.delete(clienteNumero);
    textoOriginal = elegida.nombre;
    persistirEstado(clienteNumero);
  }

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
    if (camposAct.hora) horaEntregaPreventa.set(clienteNumero, camposAct.hora);
    datosRecibidos.add(clienteNumero);
    const ordenTexto = ordenPreResumen.get(clienteNumero);
    ordenPreResumen.delete(clienteNumero);
    const resumenGenerado = generarResumen(clienteNumero, ordenTexto, esOrdenDomicilio, esPreventa);
    resumenPendiente.set(clienteNumero, { texto: resumenGenerado.texto, esTransferencia: resumenGenerado.esTransferencia });
    historial.push({ role: "user",      content: camposATexto(clienteNumero) });
    historial.push({ role: "assistant", content: resumenGenerado.texto });
    persistirEstado(clienteNumero);
    await msg.reply(resumenGenerado.texto);
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

  const coloniaAntes = (datosCampos.get(clienteNumero) || {}).colonia;
  const campos = interpretarCampos(clienteNumero, textoOriginal, esOrdenDomicilio, esPreventa);

  if (campos._horaFueraRango) {
    const formProgresivo = mostrarFormularioProgresivo(clienteNumero, esOrdenDomicilio, esPreventa);
    const tipoPedido     = esOrdenDomicilio ? "recibirlo" : "pasar a recoger";
    const rango    = getRangoHorario();
    const msgHora  = campos._horaFueraRango === "antes"
      ? `Esa hora está fuera de nuestro horario de *${rango}*`
      : `Esa hora está fuera de nuestro horario de *${rango}*`;
    await msg.reply(formProgresivo + "\n\n" + msgHora + "\n*¿A qué hora deseas " + tipoPedido + "?* (entre " + rango + ")");
    delete campos._horaFueraRango;
    datosCampos.set(clienteNumero, campos);
    persistirEstado(clienteNumero);
    return true;
  }

  const referenciaYaPreguntada = referenciaPreguntas.has(clienteNumero);
  if (esOrdenDomicilio && referenciaYaPreguntada) {
    const ca = datosCampos.get(clienteNumero) || {};
    if (!ca.referencia) {
      const fueMarcado = manejarOpcional(clienteNumero, "referencia", textoOriginal);
      if (!fueMarcado) {
        ca.referencia = textoOriginal.trim();
        datosCampos.set(clienteNumero, ca);
        persistirEstado(clienteNumero);
      }
    }
  }

  // Extrae calle + colonia de mensajes como "Av. Reforma 456, Col. Centro"
  {
    const ca = datosCampos.get(clienteNumero) || {};
    if ((ca.tipoEntrega === "domicilio" || tipoEntregaCliente.get(clienteNumero) === "domicilio") && !ca.calle && !ca.colonia) {
      const matchComa = textoOriginal.match(/^([^,]+),\s*([^,]+)$/);
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

  // ── Validar colonia recién capturada en este mensaje ─────────────────────────
  if (esOrdenDomicilio && !coloniaAntes) {
    const caVal = datosCampos.get(clienteNumero) || {};
    if (caVal.colonia && !caVal._coloniaNoVerificada) {
      const resultadoColonia = buscarColoniaDetallada(caVal.colonia);
      const encontrada = resultadoColonia.estado === "encontrada" ? resultadoColonia.colonia : null;
      if (resultadoColonia.estado === "ambigua") {
        caVal.colonia = null;
        datosCampos.set(clienteNumero, caVal);
        persistirEstado(clienteNumero);
        esperandoColonia.set(clienteNumero, { opciones: resultadoColonia.opciones });
        persistirEstado(clienteNumero);
        const lista = resultadoColonia.opciones.map((o, i) => `${i + 1}. *${o.nombre}*${o.tipo ? ` (${o.tipo.replace(/_/g, " ")})` : ""}${o.codigoPostal ? ` — CP ${o.codigoPostal}` : ""}`).join("\n");
        await msg.reply(mostrarFormularioProgresivo(clienteNumero, true, esPreventa) +
          `\n\nEncontré varias colonias con ese nombre:\n${lista}\n\nEscribe el *nombre completo* de la que corresponde a tu domicilio.`);
        return true;
      }
      if (!encontrada) {
        const intentos = _intentosColonia.get(clienteNumero) || 0;
        if (intentos < 2) {
          const coloniaEscrita = caVal.colonia;
          caVal.colonia = null;
          datosCampos.set(clienteNumero, caVal);
          persistirEstado(clienteNumero);
          _intentosColonia.set(clienteNumero, intentos + 1);
          const form = mostrarFormularioProgresivo(clienteNumero, true, esPreventa);
          const aviso = intentos === 0
            ? `No reconocí la colonia *"${coloniaEscrita}"*.\n¿Puedes escribir solo el nombre de tu colonia? _Ej: Los Fresnos, San Juan, Centro..._`
            : `Aún no encuentro *"${coloniaEscrita}"* en nuestras colonias.\nEscribe solo el nombre de tu colonia, sin calle ni número.`;
          await msg.reply(form + '\n\n' + aviso);
          return true;
        } else {
          // Tercer intento fallido — aceptar el texto crudo y marcar para revisión
          caVal._coloniaNoVerificada = true;
          datosCampos.set(clienteNumero, caVal);
          _intentosColonia.delete(clienteNumero);
        }
      } else {
        // Encontrada — normalizar al nombre canónico
        caVal.colonia = encontrada.nombre;
        delete caVal._coloniaNoVerificada;
        datosCampos.set(clienteNumero, caVal);
        _intentosColonia.delete(clienteNumero);
      }
    }
  }

  if (camposCompletos(clienteNumero, esOrdenDomicilio, esPreventa)) {
    const camposAct = datosCampos.get(clienteNumero);
    if (camposAct.hora) horaEntregaPreventa.set(clienteNumero, camposAct.hora);
    datosRecibidos.add(clienteNumero);
    const ordenTexto = ordenPreResumen.get(clienteNumero);
    ordenPreResumen.delete(clienteNumero);
    const resumenGenerado = generarResumen(clienteNumero, ordenTexto, esOrdenDomicilio, esPreventa);
    resumenPendiente.set(clienteNumero, { texto: resumenGenerado.texto, esTransferencia: resumenGenerado.esTransferencia });
    historial.push({ role: "user",      content: camposATexto(clienteNumero) });
    historial.push({ role: "assistant", content: resumenGenerado.texto });
    persistirEstado(clienteNumero);
    await msg.reply(resumenGenerado.texto);
    return true;
  }

  const siguienteFaltante = siguienteCampoFaltante(clienteNumero, esOrdenDomicilio, esPreventa);
  const formProgresivo    = mostrarFormularioProgresivo(clienteNumero, esOrdenDomicilio, esPreventa);

  if (siguienteFaltante) {
    await msg.reply(formProgresivo + "\n\n" + siguienteFaltante.pregunta);
  } else {
    const ca = datosCampos.get(clienteNumero) || {};
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
