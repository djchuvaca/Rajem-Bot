const fs   = require("fs");
const path = require("path");
const { guardarSesion, eliminarSesion } = require("./db");

// ─── ESTRUCTURAS EN MEMORIA ───────────────────────────────────────────────────
const conversaciones             = new Map();
const resumenPendiente           = new Map();
const clientesNuevos             = new Set();
const esperandoCaptura           = new Map();
const datosRecibidos             = new Set();
const datosAcumulados            = new Map();
const datosCampos                = new Map();
const pendientesConfirmacion     = new Map();
const clientesPreventa           = new Set();
const horaEntregaPreventa        = new Map();
const esperandoMotivoCancelacion = new Map();
const pedidosConfirmados         = new Map();
const esperandoConfirmacionItem  = new Map();
const esperandoAgregarMas        = new Map();
const correoPreguntas            = new Set();
const referenciaPreguntas        = new Set();

const CARPETA_CAPTURAS = path.join(__dirname, "../capturas");
if (!fs.existsSync(CARPETA_CAPTURAS)) fs.mkdirSync(CARPETA_CAPTURAS);

// ─── SERIALIZACIÓN DEL ESTADO ─────────────────────────────────────────────────
/**
 * Construye un objeto JSON con todo el estado de un cliente.
 * Solo guarda los campos que tienen valor (para no inflar la BD).
 */
function serializarEstado(numero) {
  const estado = {};

  if (clientesNuevos.has(numero))             estado.clienteNuevo             = true;
  if (clientesPreventa.has(numero))           estado.preventa                 = true;
  if (datosRecibidos.has(numero))             estado.datosRecibidos           = true;
  if (correoPreguntas.has(numero))            estado.correoPreguntas          = true;
  if (referenciaPreguntas.has(numero))        estado.referenciaPreguntas      = true;

  if (horaEntregaPreventa.has(numero))        estado.horaEntrega              = horaEntregaPreventa.get(numero);
  if (resumenPendiente.has(numero))           estado.resumenPendiente         = resumenPendiente.get(numero);
  if (esperandoCaptura.has(numero))           estado.esperandoCaptura         = esperandoCaptura.get(numero);
  if (datosAcumulados.has(numero))            estado.datosAcumulados          = datosAcumulados.get(numero);
  if (datosCampos.has(numero))                estado.datosCampos              = datosCampos.get(numero);
  if (pedidosConfirmados.has(numero))         estado.pedidoConfirmado         = pedidosConfirmados.get(numero);
  if (esperandoMotivoCancelacion.has(numero)) estado.esperandoCancelacion     = esperandoMotivoCancelacion.get(numero);
  if (esperandoConfirmacionItem.has(numero))  estado.esperandoConfirmItem     = esperandoConfirmacionItem.get(numero);
  if (esperandoAgregarMas.has(numero))        estado.esperandoAgregarMas      = esperandoAgregarMas.get(numero);

  return estado;
}

/**
 * Restaura el estado de un cliente desde un objeto JSON previamente serializado.
 */
function restaurarEstado(numero, estado, historial = []) {
  if (!estado || Object.keys(estado).length === 0) return;

  if (estado.clienteNuevo)          clientesNuevos.add(numero);
  if (estado.preventa)              clientesPreventa.add(numero);
  if (estado.datosRecibidos)        datosRecibidos.add(numero);
  if (estado.correoPreguntas)       correoPreguntas.add(numero);
  if (estado.referenciaPreguntas)   referenciaPreguntas.add(numero);

  if (estado.horaEntrega)           horaEntregaPreventa.set(numero, estado.horaEntrega);
  if (estado.resumenPendiente)      resumenPendiente.set(numero, estado.resumenPendiente);
  if (estado.esperandoCaptura)      esperandoCaptura.set(numero, estado.esperandoCaptura);
  if (estado.datosAcumulados)       datosAcumulados.set(numero, estado.datosAcumulados);
  if (estado.datosCampos)           datosCampos.set(numero, estado.datosCampos);
  if (estado.pedidoConfirmado)      pedidosConfirmados.set(numero, estado.pedidoConfirmado);
  if (estado.esperandoCancelacion)  esperandoMotivoCancelacion.set(numero, estado.esperandoCancelacion);
  if (estado.esperandoConfirmItem)  esperandoConfirmacionItem.set(numero, estado.esperandoConfirmItem);
  if (estado.esperandoAgregarMas)   esperandoAgregarMas.set(numero, estado.esperandoAgregarMas);

  if (historial.length > 0)         conversaciones.set(numero, historial);
}

/**
 * Persiste el estado actual de un cliente en la BD.
 * Llamar después de cualquier cambio de estado importante.
 */
function persistirEstado(numero) {
  const estado   = serializarEstado(numero);
  const historial = conversaciones.get(numero) || [];

  // Si el estado está vacío (cliente limpio), eliminar de la BD
  if (Object.keys(estado).length === 0) {
    eliminarSesion(numero);
    return;
  }

  guardarSesion(numero, estado, historial);
}

// ─── CARGA INICIAL (llamar desde initDB en index.js) ─────────────────────────
/**
 * Restaura todas las sesiones activas al arrancar el bot.
 * Llama a esta función desde index.js después de initDB().
 */
function restaurarTodasLasSesiones() {
  const { cargarTodasLasSesiones, limpiarSesionesAntiguas } = require("./db");

  // Primero limpiar sesiones muy antiguas (más de 6 horas)
  limpiarSesionesAntiguas(6);

  const sesiones = cargarTodasLasSesiones();
  let restauradas = 0;

  for (const { numero, estado, historial } of sesiones) {
    try {
      restaurarEstado(numero, estado, historial);
      restauradas++;
    } catch (e) {
      console.error(`[SESION] Error restaurando ${numero}:`, e.message);
    }
  }

  if (restauradas > 0) {
    console.log(`♻️  ${restauradas} sesión(es) activa(s) restaurada(s) desde la BD`);
  }
}

// ─── FUNCIONES ORIGINALES ─────────────────────────────────────────────────────
function getHistorial(numero) {
  if (!conversaciones.has(numero)) conversaciones.set(numero, []);
  return conversaciones.get(numero);
}

function limpiarTodo(numero) {
  clientesPreventa.delete(numero);
  horaEntregaPreventa.delete(numero);
  esperandoMotivoCancelacion.delete(numero);
  conversaciones.set(numero, []);
  resumenPendiente.delete(numero);
  esperandoCaptura.delete(numero);
  datosRecibidos.delete(numero);
  datosAcumulados.delete(numero);
  datosCampos.delete(numero);
  esperandoConfirmacionItem.delete(numero);
  esperandoAgregarMas.delete(numero);
  correoPreguntas.delete(numero);
  referenciaPreguntas.delete(numero);

  // Eliminar sesión de la BD
  eliminarSesion(numero);
}

function acumularDatos(numero, texto) {
  const actual = datosAcumulados.get(numero) || "";
  const nuevo  = actual + "\n" + texto;
  datosAcumulados.set(numero, nuevo);

  // Persistir después de acumular datos del formulario
  persistirEstado(numero);
  return nuevo;
}

// ── PALABRAS RESERVADAS ───────────────────────────────────────────────────────
const PALABRAS_NO_NOMBRE = /^(efectivo|tarjeta|transferencia|mostrador|domicilio|recoger|colonia|calle|correo|referencia|si|no|ok|va|dale|nada|listo|sale|andale)$/i;

// ── INTERPRETACIÓN DE CAMPOS ──────────────────────────────────────────────────
function interpretarCampos(numero, textoNuevo, esDomicilio = false, esPreventa = false) {
  const campos = datosCampos.get(numero) || {
    nombre:     null,
    telefono:   null,
    correo:     null,
    metodo:     null,
    calle:      null,
    colonia:    null,
    referencia: null,
    hora:       null,
  };

  const textoCompleto = textoNuevo;

  if (!campos.telefono) {
    const telMatch = textoCompleto.match(/\b(\d{10})\b/);
    if (telMatch) campos.telefono = telMatch[1];
  }

  if (!campos.correo) {
    const correoMatch = textoCompleto.match(/[\w.+-]+@[\w-]+\.[a-z]{2,}/i);
    if (correoMatch) campos.correo = correoMatch[0];
  }

  if (!campos.metodo) {
    if (/transferencia/i.test(textoCompleto)) campos.metodo = "transferencia";
    else if (/tarjeta/i.test(textoCompleto))  campos.metodo = "tarjeta";
    else if (/efectivo/i.test(textoCompleto)) campos.metodo = "efectivo";
  }

  if (esPreventa && !campos.hora) {
    let horaExtraida = null;
    const t = textoCompleto;

    const m1 = t.match(/\ba\s+las?\s+(\d{1,2}(?::\d{2})?)\s*(?:am|pm|a\.m\.|p\.m\.)?/i);
    if (m1) horaExtraida = m1[0].trim();

    if (!horaExtraida) {
      const m2 = t.match(/\b(?:paso|voy|llego|recojo|vengo)\s+a\s+las?\s+(\d{1,2}(?::\d{2})?)\s*(?:am|pm)?/i);
      if (m2) horaExtraida = m2[0].trim();
    }

    if (!horaExtraida) {
      const m3 = t.match(/\b(\d{1,2}(?::\d{2})?)\s*(?:am|pm|a\.m\.|p\.m\.)/i);
      if (m3) horaExtraida = m3[0].trim();
    }

    if (horaExtraida) {
      const numMatch = horaExtraida.match(/(\d{1,2})(?::(\d{2}))?/);
      if (numMatch) {
        const h = parseInt(numMatch[1]);
        const m = parseInt(numMatch[2] || "0");
        const esPm = /pm/i.test(horaExtraida);
        let horaDecimal = h + m / 60;
        if (esPm && h < 12) horaDecimal += 12;
        if (horaDecimal < 7)         campos._horaFueraRango = "antes";
        else if (horaDecimal > 12.5) campos._horaFueraRango = "despues";
        else { campos.hora = horaExtraida; delete campos._horaFueraRango; }
      }
    }
  }

  if (!campos.nombre) {
    let textoSinDatos = textoCompleto
      .replace(/\b\d{10}\b/, "")
      .replace(/efectivo|tarjeta|transferencia/gi, "")
      .replace(/[\w.+-]+@[\w-]+\.[a-z]{2,}/gi, "")
      .replace(/\b(?:paso|voy|llego|recojo|vengo)\s+a\s+las?\s+\d{1,2}(?::\d{2})?(?:\s*(?:am|pm))?/gi, "")
      .replace(/\ba\s+las?\s+\d{1,2}(?::\d{2})?\s*(?:am|pm|a\.m\.|p\.m\.)?/gi, "")
      .replace(/\b\d{1,2}(?::\d{2})?\s*(?:am|pm|a\.m\.|p\.m\.)/gi, "")
      .replace(/\b(paso|voy|llego|recojo|vengo|mostrador|domicilio|recoger)\b/gi, "")
      .replace(/\s{2,}/g, " ")
      .trim();

    const palabrasValidas = (textoSinDatos.match(/[a-záéíóúüñ]{2,}/gi) || [])
      .filter(p => !PALABRAS_NO_NOMBRE.test(p));

    if (palabrasValidas.length >= 2) {
      campos.nombre = palabrasValidas.slice(0, 4).join(" ");
    }
  }

  if (esDomicilio) {
    const lineas = textoNuevo.split(/\n|,|;/).map(l => l.trim()).filter(Boolean);
    for (const linea of lineas) {
      const l = linea.trim();
      if (!campos.calle && /calle|av\.|blvd|#\s*\d|no\.\s*\d|\bn[uú]m|\d+\s+[a-z]/i.test(l)) {
        campos.calle = l; continue;
      }
      if (!campos.colonia && /col\.|colonia\s+\w|^col\s/i.test(l)) {
        campos.colonia = l.replace(/^col\.?\s*/i, "").trim(); continue;
      }
      if (!campos.referencia && /referencia|entre\s+calle|cerca\s+de|a\s+un\s+lado|frente\s+a/i.test(l)) {
        campos.referencia = l.replace(/^referencia:?\s*/i, "").trim(); continue;
      }
      if (campos.calle && !campos.colonia && /^[a-záéíóúüñ0-9\s]{3,40}$/i.test(l) && !PALABRAS_NO_NOMBRE.test(l)) {
        campos.colonia = l.trim(); continue;
      }
    }
  }

  datosCampos.set(numero, campos);

  // Persistir después de interpretar campos
  persistirEstado(numero);
  return campos;
}

// ── MOSTRAR FORMULARIO PROGRESIVO ─────────────────────────────────────────────
function mostrarFormularioProgresivo(numero, esDomicilio = false, esPreventa = false) {
  const campos  = datosCampos.get(numero) || {};
  const lleno   = v => v ? `${v} ✅` : "___";
  const opc     = v => v ? `${v} ✅` : "___ *(opcional)*";

  let msg = `📋 *Datos para tu pedido${esPreventa ? " (PREVENTA)" : ""}*\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `👤 *Nombre y apellido:* ${lleno(campos.nombre)}\n`;
  msg += `📱 *Teléfono:* ${lleno(campos.telefono)}\n`;
  msg += `📧 *Correo:* ${opc(campos.correo)}\n`;

  if (esDomicilio) {
    msg += `📍 *Calle y número:* ${lleno(campos.calle)}\n`;
    msg += `🏘️ *Colonia:* ${lleno(campos.colonia)}\n`;
    msg += `📌 *Referencia:* ${opc(campos.referencia)}\n`;
  }

  msg += `💳 *Método de pago:* ${lleno(campos.metodo)}`;

  if (esPreventa) {
    msg += `\n🕖 *Hora de ${esDomicilio ? "entrega" : "recolección"}:* ${lleno(campos.hora)}`;
  }

  msg += `\n━━━━━━━━━━━━━━━━━━━━━━━━━━`;
  return msg;
}

// ── OBTENER SIGUIENTE CAMPO FALTANTE ─────────────────────────────────────────
function siguienteCampoFaltante(numero, esDomicilio = false, esPreventa = false) {
  const campos = datosCampos.get(numero) || {};

  if (!campos.nombre)    return { campo: "nombre",    pregunta: "¿Cuál es tu nombre completo (nombre y apellido)?" };
  if (!campos.telefono)  return { campo: "telefono",  pregunta: "¿Cuál es tu número de teléfono a 10 dígitos?" };

  if (!campos.correo && !correoPreguntas.has(numero)) {
    correoPreguntas.add(numero);
    persistirEstado(numero);
    return { campo: "correo", pregunta: "¿Tienes correo electrónico? _(opcional, escribe 'no' si no quieres proporcionarlo)_" };
  }

  if (esDomicilio) {
    if (!campos.calle)   return { campo: "calle",    pregunta: "¿Cuál es tu calle y número?" };
    if (!campos.colonia) return { campo: "colonia",  pregunta: "¿En qué colonia?" };
    if (!campos.referencia && !referenciaPreguntas.has(numero)) {
      referenciaPreguntas.add(numero);
      persistirEstado(numero);
      return { campo: "referencia", pregunta: "¿Alguna referencia para ubicarte? _(opcional, escribe 'no' si no tienes)_" };
    }
  }

  if (!campos.metodo)    return { campo: "metodo",   pregunta: esDomicilio ? "¿Cómo vas a pagar? Efectivo o transferencia." : "¿Cómo vas a pagar? Efectivo, tarjeta o transferencia." };

  if (esPreventa && !campos.hora) return { campo: "hora", pregunta: `¿A qué hora ${esDomicilio ? "deseas recibirlo" : "pasas a recoger"}? (entre 7:00 a.m. y 12:30 p.m.)` };

  return null;
}

// ── MANEJAR OPCIONALES ───────────────────────────────────────────────────────
function manejarOpcional(numero, campo, texto) {
  const rechazo = /^(no|nel|nop|nope|sin|no\s+tengo|no\s+quiero|no\s+proporciono|omitir|ninguna|ninguno)$/i.test(texto.trim());
  if (!rechazo) return false;

  const campos = datosCampos.get(numero) || {};
  if (campo === "correo")     { campos.correo     = "no proporcionó"; datosCampos.set(numero, campos); persistirEstado(numero); return true; }
  if (campo === "referencia") { campos.referencia = "sin referencia"; datosCampos.set(numero, campos); persistirEstado(numero); return true; }
  return false;
}

// ── CAMPOS COMPLETOS ──────────────────────────────────────────────────────────
function camposCompletos(numero, esDomicilio = false, esPreventa = false) {
  const campos = datosCampos.get(numero) || {};
  if (!campos.nombre || !campos.telefono || !campos.metodo) return false;
  if (esDomicilio && (!campos.calle || !campos.colonia))    return false;
  if (esPreventa  && !campos.hora)                          return false;
  if (!correoPreguntas.has(numero))                         return false;
  if (esDomicilio && !referenciaPreguntas.has(numero))      return false;
  return true;
}

// ── CONSTRUIR TEXTO DESDE CAMPOS ─────────────────────────────────────────────
function camposATexto(numero) {
  const c = datosCampos.get(numero) || {};
  return [c.nombre, c.telefono, c.correo, c.metodo, c.calle, c.colonia, c.referencia, c.hora]
    .filter(Boolean).join("\n");
}

// ── FUNCIONES ORIGINALES ─────────────────────────────────────────────────────
function datosCompletos(texto, esPreventa = false, esDomicilio = false) {
  const tieneNumeroTelefono = /\b\d{10}\b/.test(texto);
  const tieneNombre = (() => {
    const palabras = texto.match(/[a-záéíóúüñ]{2,}/gi) || [];
    const validas  = palabras.filter(p => !PALABRAS_NO_NOMBRE.test(p));
    return validas.length >= 2;
  })();
  const tieneMetodoPago = /efectivo|tarjeta|transferencia/i.test(texto);
  const tieneHora       = /\b([1-9]|1[0-2])(:[0-5][0-9])?\s*(am|pm|a\.m\.|p\.m\.)/i.test(texto)
    || /\b([1-9]|1[0-2]):[0-5][0-9]\b/.test(texto)
    || /\ba\s+las?\s+\d{1,2}/i.test(texto)
    || /\bpaso\s+a\s+las?\s+\d{1,2}/i.test(texto)
    || /\n\d{1,2}(:\d{2})?\s*$/.test(texto);
  const tieneDireccion  = /calle|col\.|colonia|av\.|blvd|#\s*\d|no\.\s*\d|\bn[uú]m/i.test(texto);
  if (esDomicilio && esPreventa) return tieneNumeroTelefono && tieneNombre && tieneMetodoPago && tieneHora && tieneDireccion;
  if (esDomicilio)  return tieneNumeroTelefono && tieneNombre && tieneMetodoPago && tieneDireccion;
  if (esPreventa)   return tieneNumeroTelefono && tieneNombre && tieneMetodoPago && tieneHora;
  return tieneNumeroTelefono && tieneNombre && tieneMetodoPago;
}

function pareceFragmentoDatos(texto) {
  const esTelefono        = /\b\d{7,}\b/.test(texto);
  const esNombreOApellido = (() => {
    const limpio = texto.trim();
    if (PALABRAS_NO_NOMBRE.test(limpio)) return false;
    return /^[a-záéíóúüñ\s]{4,50}$/i.test(limpio);
  })();
  const esCorreo     = /\S+@\S+\.\S+/.test(texto);
  const esMetodoPago = /efectivo|tarjeta|transferencia/i.test(texto);
  const esDireccion  = /calle|colonia|#|num|col\.|av\.|blvd/i.test(texto);
  const esHora       = /\b([1-9]|1[0-2])(:[0-5][0-9])?\s*(am|pm|a\.m\.|p\.m\.)/i.test(texto)
    || /\b([1-9]|1[0-2]):[0-5][0-9]\b/.test(texto)
    || /\ba\s+las?\s+\d{1,2}/i.test(texto)
    || /\bpaso\s+a\s+las?\s+\d{1,2}/i.test(texto)
    || /^\d{1,2}(:\d{2})?$/.test(texto.trim());
  return esTelefono || esNombreOApellido || esCorreo || esMetodoPago || esDireccion || esHora;
}

function extraerDatosPedido(resumenTexto) {
  const nombreMatch = resumenTexto.match(/👤 \*Cliente:\* (.+)/);
  const totalMatch  = resumenTexto.match(/💰 \*TOTAL: (\$[\d,]+)\*/);
  const telMatch    = resumenTexto.match(/📱 \*Teléfono:\* (\d+)/);
  const esDomicilio = resumenTexto.includes("DOMICILIO");
  const esMostrador = resumenTexto.includes("MOSTRADOR");
  return {
    nombre:          nombreMatch ? nombreMatch[1].trim() : "Cliente",
    total:           totalMatch  ? totalMatch[1]         : "?",
    tipo:            esDomicilio ? "domicilio" : esMostrador ? "mostrador" : "desconocido",
    esTransferencia: /transferencia/i.test(resumenTexto),
    telefono:        telMatch    ? telMatch[1]            : "",
  };
}

module.exports = {
  // Maps y Sets (acceso directo para handlers)
  clientesPreventa,
  horaEntregaPreventa,
  pedidosConfirmados,
  esperandoMotivoCancelacion,
  conversaciones,
  resumenPendiente,
  clientesNuevos,
  esperandoCaptura,
  datosRecibidos,
  datosAcumulados,
  datosCampos,
  esperandoConfirmacionItem,
  esperandoAgregarMas,
  correoPreguntas,
  referenciaPreguntas,
  pendientesConfirmacion,
  CARPETA_CAPTURAS,
  // Funciones
  getHistorial,
  limpiarTodo,
  acumularDatos,
  interpretarCampos,
  mostrarFormularioProgresivo,
  siguienteCampoFaltante,
  manejarOpcional,
  camposCompletos,
  camposATexto,
  datosCompletos,
  pareceFragmentoDatos,
  extraerDatosPedido,
  persistirEstado,
  restaurarTodasLasSesiones,
};