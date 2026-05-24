// src/handlers/flujos/edicion.js
const {
  esperandoEdicion, esperandoConfirmacionDatos, datosCampos,
  tipoEntregaCliente, horaEntregaPreventa, resumenPendiente,
  esperandoAgregarMas, datosRecibidos, clientesPreventa,
  correoPreguntas, referenciaPreguntas, getHistorial,
  mostrarFormularioProgresivo, siguienteCampoFaltante, camposATexto,
  persistirEstado, detectarEdicion, aplicarEdicion,
} = require("../../estado");
const { generarResumen } = require("../../pedido/resumen");
const { MENU_FORMATO } = require("../../config");
const { validarHora } = require("./utils");
const { detectarPreguntaFrecuente } = require("../pedidoParser");
const { generarRespuestaAutomatica } = require("../respuestas");

// ── RESPUESTA A EDICIÓN PENDIENTE ─────────────────────────────────────────────
async function handleEdicionPendiente(msg, textoOriginal, clienteNumero, historial, esPreventa) {
  if (!esperandoEdicion.has(clienteNumero)) return false;

  const edicionPendiente = esperandoEdicion.get(clienteNumero);
  const esOrdenDomEdit = tipoEntregaCliente.get(clienteNumero) === "domicilio"
    || (tipoEntregaCliente.get(clienteNumero) == null && historial.some(h => h.content && h.content.includes("domicilio")));
  let valorNuevo = textoOriginal.trim();

  if (edicionPendiente.campo === "telefono") {
    const telMatch = valorNuevo.match(/(?:\+?52\s*)?(\d{3}[\s.-]?\d{3}[\s.-]?\d{4}|\d{10})/);
    if (telMatch) valorNuevo = telMatch[1].replace(/[\s.-]/g, "");
    if (!/^\d{10}$/.test(valorNuevo)) {
      await msg.reply("El número debe tener exactamente 10 dígitos. *¿Cuál es tu nuevo teléfono?*");
      return true;
    }
  }

  if (edicionPendiente.campo === "metodo") {
    const vNorm = valorNuevo.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    if (!/^(efectivo|tarjeta|transferencia)$/.test(vNorm)) {
      const pregMetodo = esOrdenDomEdit
        ? "*¿Cómo vas a pagar?* Efectivo o transferencia."
        : "*¿Cómo vas a pagar?* Efectivo, tarjeta o transferencia.";
      await msg.reply("Opción no válida. " + pregMetodo);
      return true;
    }
    if (esOrdenDomEdit && /tarjeta/i.test(valorNuevo)) {
      await msg.reply("Para pedidos a domicilio solo aceptamos *efectivo o transferencia*. *¿Cuál prefieres?*");
      return true;
    }
    valorNuevo = vNorm;
  }

  if (edicionPendiente.campo === "hora") {
    const horaValida = validarHora(valorNuevo);
    if (!horaValida) {
      await msg.reply("Esa hora está fuera de nuestro horario. *¿A qué hora deseas tu pedido?* (entre 7:00 a.m. y 12:30 p.m.)");
      return true;
    }
    valorNuevo = horaValida;
  }

  if (edicionPendiente.campo === "nombre") {
    const partes = valorNuevo.split(/\s+/);
    aplicarEdicion(clienteNumero, { campo: "nombre", valor: { nombre: partes[0], apellido: partes.slice(1).join(" ") || null } });
  } else {
    aplicarEdicion(clienteNumero, { campo: edicionPendiente.campo, valor: valorNuevo });
  }

  if (edicionPendiente.campo === "hora") horaEntregaPreventa.set(clienteNumero, valorNuevo);
  esperandoEdicion.delete(clienteNumero);

  if (edicionPendiente.contexto === "resumen" && edicionPendiente.ordenTexto) {
    const esOrdenDom = tipoEntregaCliente.get(clienteNumero) === "domicilio"
      || (tipoEntregaCliente.get(clienteNumero) == null && historial.some(h => h.content && h.content.includes("domicilio")));
    const resumenNuevo = generarResumen(clienteNumero, edicionPendiente.ordenTexto, esOrdenDom, esPreventa);
    resumenPendiente.set(clienteNumero, { texto: resumenNuevo.texto, esTransferencia: resumenNuevo.esTransferencia });
    persistirEstado(clienteNumero);
    await msg.reply("Perfecto! Aquí está tu pedido actualizado:\n\n" + resumenNuevo.texto);
  } else if (edicionPendiente.contexto === "agregarMas") {
    if (edicionPendiente.ordenTexto !== undefined) esperandoAgregarMas.set(clienteNumero, edicionPendiente.ordenTexto);
    const ca = datosCampos.get(clienteNumero) || {};
    const esDomAg = ca.tipoEntrega === "domicilio";
    const formEdAg = mostrarFormularioProgresivo(clienteNumero, esDomAg, esPreventa);
    await msg.reply("Perfecto! Datos actualizados:\n\n" + formEdAg + "\n\n*¿Qué deseas ordenar?*");
  } else if (edicionPendiente.contexto === "formulario") {
    const ca = datosCampos.get(clienteNumero) || {};
    const esDomForm = ca.tipoEntrega === "domicilio";
    const formActualizado = mostrarFormularioProgresivo(clienteNumero, esDomForm, esPreventa);
    await msg.reply("Perfecto! Datos actualizados:\n\n" + formActualizado + "\n\n*¿Son correctos los datos?*");
  }
  return true;
}

// ── 1C. CONFIRMACIÓN DE DATOS PRECARGADOS (cliente frecuente) ─────────────────
async function handleConfirmacionDatos(msg, textoOriginal, clienteNumero, historial, esPreventa) {
  if (!esperandoConfirmacionDatos.has(clienteNumero)) return false;

  const { tipoEntrega, esPreventa: esPreventaDatos } = esperandoConfirmacionDatos.get(clienteNumero);
  const esOrdenDom = tipoEntrega === "domicilio";
  const confirma   = /^(si|sí|s[ií]\s+por\s+fa(vor)?|ok|okey|va|dale|claro|correcto|sale|andale|ándale|órale|orale|perfecto|exacto|listo|así\s+es|asi\s+es|de\s+una|eso\s+es|correcto|afirmativo|todo\s+bien|está\s+bien|esta\s+bien|sip|sep|simón|simon|chido|bueno|bien|me\s+late|nel\s+az|efectivamente|positivo)$/i.test(textoOriginal.trim());
  const niega      = /^(no|nel|nop|nope|nah|incorrecto|cambia(r|me)?|cambio|error|no\s+es\s+correcto|no\s+est[aá]\s+bien|está\s+mal|esta\s+mal|hay\s+un\s+error|modifica(r|me)?|corrige|corr[íi]gelo|actualiza)$/i.test(textoOriginal.trim());

  const edicionForm = detectarEdicion(textoOriginal);
  if (edicionForm && !confirma && !niega) {
    if (edicionForm.campo === "metodo" && edicionForm.preguntar) {
      const pregMetodo = esOrdenDom
        ? "*¿Cómo vas a pagar?* Efectivo o transferencia."
        : "*¿Cómo vas a pagar?* Efectivo, tarjeta o transferencia.";
      esperandoEdicion.set(clienteNumero, { campo: "metodo", contexto: "formulario" });
      await msg.reply(pregMetodo);
      return true;
    }
    if (edicionForm.campo === "metodo" && !edicionForm.preguntar) {
      if (esOrdenDom && /tarjeta/i.test(edicionForm.valor)) {
        await msg.reply("Para pedidos a domicilio solo aceptamos *efectivo o transferencia*. *¿Cuál prefieres?*");
        esperandoEdicion.set(clienteNumero, { campo: "metodo", contexto: "formulario" });
        return true;
      }
      aplicarEdicion(clienteNumero, edicionForm);
      const formAct = mostrarFormularioProgresivo(clienteNumero, esOrdenDom, esPreventa);
      await msg.reply("Perfecto! Datos actualizados:\n\n" + formAct + "\n\n*¿Son correctos los datos?*");
      return true;
    }
    if (edicionForm.campo === "quitar_item") {
      await msg.reply("Solo puedes quitar productos desde el resumen final. *¿Son correctos los datos?*");
      return true;
    }
    if (edicionForm.preguntar) {
      esperandoEdicion.set(clienteNumero, { campo: edicionForm.campo, contexto: "formulario" });
      await msg.reply(edicionForm.pregunta);
      return true;
    }
    aplicarEdicion(clienteNumero, edicionForm);
    const formAct = mostrarFormularioProgresivo(clienteNumero, esOrdenDom, esPreventa);
    await msg.reply("Perfecto! Datos actualizados:\n\n" + formAct + "\n\n*¿Son correctos los datos?*");
    return true;
  }

  // FAQ durante confirmación de datos: responde y re-muestra el formulario
  if (!confirma && !niega && !edicionForm) {
    const pregFaqConf = detectarPreguntaFrecuente(textoOriginal);
    if (pregFaqConf && ["horario", "domicilio", "metodos_pago"].includes(pregFaqConf.tipo)) {
      const respFaqConf = generarRespuestaAutomatica(pregFaqConf, { esDomicilio: esOrdenDom });
      if (respFaqConf) {
        const formCompleto = mostrarFormularioProgresivo(clienteNumero, esOrdenDom, esPreventaDatos);
        await msg.reply(respFaqConf);
        await msg.reply(formCompleto + "\n\n*¿Son correctos los datos?*");
        return true;
      }
    }
  }

  if (confirma) {
    esperandoConfirmacionDatos.delete(clienteNumero);
    correoPreguntas.add(clienteNumero);
    if (esOrdenDom) referenciaPreguntas.add(clienteNumero);
    const faltante = siguienteCampoFaltante(clienteNumero, esOrdenDom, esPreventaDatos);
    if (!faltante) {
      datosRecibidos.add(clienteNumero);
      historial.push({ role: "user",      content: "Mi pedido es " + (esOrdenDom ? "a domicilio" : "para mostrador") });
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
    return true;
  }

  if (niega) {
    const formProgresivo = mostrarFormularioProgresivo(clienteNumero, esOrdenDom, esPreventaDatos);
    await msg.reply(
      formProgresivo +
      "\n\n*¿Qué dato deseas corregir?*\n" +
      "_Dime cuál, por ejemplo: \"cambia mi nombre\", \"cambia mi teléfono\", \"cambia mi método de pago\"._"
    );
    return true;
  }

  const formCompleto = mostrarFormularioProgresivo(clienteNumero, esOrdenDom, esPreventaDatos);
  await msg.reply(formCompleto + "\n\n*¿Son correctos los datos?*");
  return true;
}

module.exports = { handleEdicionPendiente, handleConfirmacionDatos };
