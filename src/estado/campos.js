/**
 * estado/campos.js
 * Lógica de interpretación de campos del formulario, formulario progresivo,
 * campos completos, y funciones de utilidad del estado.
 */

const {
  conversaciones, datosAcumulados, datosCampos,
  referenciaPreguntas, clientesPreventa,
  horaEntregaPreventa, esperandoMotivoCancelacion, resumenPendiente,
  esperandoCaptura, datosRecibidos, esperandoConfirmacionItem,
  esperandoAgregarMas, pedidoJSONActual, esperandoConfirmacionDatos,
  tipoEntregaCliente, esperandoCorte, esperandoEdicion, esperandoTipoItem,
  esperandoExtras, ordenPreResumen,
} = require("./maps");
const { persistirEstado } = require("./sesiones");
const { eliminarSesion }  = require("../db");
const { getRangoHorario } = require("../horario");

// ── PALABRAS RESERVADAS ───────────────────────────────────────────────────────
const PALABRAS_NO_NOMBRE = /^(efectivo|tarjeta|transferencia|mostrador|domicilio|recoger|colonia|calle|correo|referencia|si|no|ok|va|dale|nada|listo|sale|andale|norte|sur|oriente|poniente|centro|reforma|avenida|boulevard|privada|interior|entre|junto|frente|cerca)$/i;

// ── EXTRACCIÓN DE TELÉFONO ────────────────────────────────────────────────────
function extraerTelefono(texto) {
  // Con código de país: +523312345678 o 52 331 234 5678
  let m = texto.match(/\+?52\s*(\d{3}[\s.-]?\d{3}[\s.-]?\d{4}|\d{10})/);
  if (m) {
    const t = m[1].replace(/[\s.-]/g, "");
    if (t.length === 10 && /^[2-9]/.test(t)) return t;
  }
  // Con separadores: 331-234-5678 o 331 234 5678
  m = texto.match(/\b(\d{3})[\s.-](\d{3})[\s.-](\d{4})\b/);
  if (m) {
    const t = m[1] + m[2] + m[3];
    if (/^[2-9]/.test(t)) return t;
  }
  // 10 dígitos consecutivos válidos (primer dígito 2-9 = LADA mexicano)
  m = texto.match(/\b(\d{10})\b/);
  if (m && /^[2-9]/.test(m[1])) return m[1];
  return null;
}

function extraerTelefonoDeJID(jid) {
  if (!jid) return null;
  // LIDs (@lid) no son teléfonos reales — dejar que getContact() resuelva
  if (jid.endsWith("@lid")) return null;
  const jidRaw = jid.replace(/@.+/, "").split(":")[0];
  const soloDigitos = jidRaw.replace(/\D/g, "");
  if (soloDigitos.length >= 12) {
    const tel = soloDigitos.slice(-10);
    if (/^[2-9]\d{9}$/.test(tel)) return tel;
  }
  if (soloDigitos.length === 10 && /^[2-9]\d{9}$/.test(soloDigitos)) return soloDigitos;
  return null;
}

// ── FUNCIONES BASE ────────────────────────────────────────────────────────────
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
  pedidoJSONActual.delete(numero);
  esperandoConfirmacionDatos.delete(numero);
  tipoEntregaCliente.delete(numero);
  esperandoCorte.delete(numero);
  esperandoEdicion.delete(numero);
  esperandoTipoItem.delete(numero);
  esperandoExtras.delete(numero);
  ordenPreResumen.delete(numero);
  referenciaPreguntas.delete(numero);
  eliminarSesion(numero);
}

function acumularDatos(numero, texto) {
  const actual = datosAcumulados.get(numero) || "";
  const nuevo  = actual + "\n" + texto;
  datosAcumulados.set(numero, nuevo);
  persistirEstado(numero);
  return nuevo;
}

// ── INTERPRETACIÓN DE CAMPOS ──────────────────────────────────────────────────
function interpretarCampos(numero, textoNuevo, esDomicilio = false, esPreventa = false) {
  const campos = datosCampos.get(numero) || {
    nombre: null, telefono: null, metodo: null,
    calle: null, colonia: null, referencia: null, hora: null, tipoEntrega: null,
  };

  if (esDomicilio) campos.tipoEntrega = "domicilio";
  else if (campos.tipoEntrega !== "domicilio") campos.tipoEntrega = "mostrador";

  const textoCompleto = textoNuevo;

  // ── Teléfono ──────────────────────────────────────────────────────────────
  {
    const tel = extraerTelefono(textoCompleto);
    if (tel) campos.telefono = tel;
  }

  // ── Método de pago ────────────────────────────────────────────────────────
  if (!campos.metodo) {
    if (/transferencia/i.test(textoCompleto))                 campos.metodo = "transferencia";
    else if (!esDomicilio && /tarjeta/i.test(textoCompleto)) campos.metodo = "tarjeta";
    else if (/efectivo/i.test(textoCompleto))                campos.metodo = "efectivo";
  }

  // ── Hora (preventa) ───────────────────────────────────────────────────────
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
      const nm = horaExtraida.match(/(\d{1,2})(?::(\d{2}))?/);
      if (nm) {
        const h = parseInt(nm[1]);
        const m = parseInt(nm[2] || "0");
        const esPm = /pm/i.test(horaExtraida);
        let horaDecimal = h + m / 60;
        if (esPm && h < 12) horaDecimal += 12;
        if (horaDecimal < 7)         campos._horaFueraRango = "antes";
        else if (horaDecimal > 12.5) campos._horaFueraRango = "despues";
        else { campos.hora = horaExtraida; delete campos._horaFueraRango; }
      }
    }
  }

  // ── Dirección en una línea con col. ───────────────────────────────────────
  if (esDomicilio && (!campos.calle || !campos.colonia)) {
    const matchCol = textoCompleto.match(/(.+?)\s+col\.?\s+(.+?)(?:\s+(?:efectivo|tarjeta|transferencia|a\s+las?|\d{1,2}\s*(?:am|pm)).*)?$/i);
    if (matchCol) {
      let parteCalle   = matchCol[1].trim();
      let parteColonia = matchCol[2].trim();

      parteCalle = parteCalle
        .replace(/\b\d{10}\b/g, "")
        .replace(/[\w.+-]+@[\w-]+\.[a-z]{2,}/gi, "")
        .replace(/efectivo|tarjeta|transferencia/gi, "")
        .trim();

      if (!campos.calle) {
        const matchDir = parteCalle.match(/([a-záéíóúüñ.]+\s+\d+.*)$/i)
          || parteCalle.match(/(art[ií]culo.+|#.+|\d+.+)$/i);
        if (matchDir) campos.calle = matchDir[1].trim();
        else if (/\d+|#/i.test(parteCalle)) campos.calle = parteCalle;
      }

      if (!campos.colonia) {
        parteColonia = parteColonia
          .replace(/efectivo|tarjeta|transferencia/gi, "")
          .replace(/\ba\s+las?\s+\d{1,2}(?::\d{2})?/gi, "")
          .replace(/\d{1,2}(?::\d{2})?\s*(?:am|pm)/gi, "")
          .trim();
        if (parteColonia.length > 2) campos.colonia = parteColonia;
      }
    }
  }

  // ── Nombre ────────────────────────────────────────────────────────────────
  if (!campos.nombre) {
    const primeraLinea  = textoNuevo.split(/\n/)[0].trim();
    const primeraLimpia = primeraLinea
      .replace(/\b\d{10}\b/g, "")
      .replace(/efectivo|tarjeta|transferencia/gi, "")
      .replace(/[\w.+-]+@[\w-]+\.[a-z]{2,}/gi, "")
      .replace(/col\.?\s+[\w\s]{2,40}/gi, "")
      .replace(/art[ií]culo\s+\d+[^\s]*/gi, "")
      .replace(/#\s*\d+/gi, "")
      .replace(/\b\d+\b/g, "")
      .replace(/\s{2,}/g, " ")
      .trim();
    const palabrasPrimera = (primeraLimpia.match(/[a-záéíóúüñ]{2,}/gi) || [])
      .filter(p => !PALABRAS_NO_NOMBRE.test(p));
    if (palabrasPrimera.length >= 2) {
      campos.nombre = palabrasPrimera.slice(0, 4).join(" ");
    } else {
      let textoSinDatos = textoNuevo
        .replace(/\b\d{10}\b/g, "")
        .replace(/efectivo|tarjeta|transferencia/gi, "")
        .replace(/[\w.+-]+@[\w-]+\.[a-z]{2,}/gi, "")
        .replace(/\b(?:paso|voy|llego|recojo|vengo)\s+a\s+las?\s+\d{1,2}(?::\d{2})?(?:\s*(?:am|pm))?/gi, "")
        .replace(/\ba\s+las?\s+\d{1,2}(?::\d{2})?\s*(?:am|pm|a\.m\.|p\.m\.)?/gi, "")
        .replace(/\b\d{1,2}(?::\d{2})?\s*(?:am|pm|a\.m\.|p\.m\.)/gi, "")
        .replace(/\b(paso|voy|llego|recojo|vengo|mostrador|domicilio|recoger)\b/gi, "")
        .replace(/referencia:?\s*[^\n]*/gi, "")
        .replace(/col\.?\s+[\w\s]{2,40}/gi, "")
        .replace(/art[ií]culo\s+\d+[^\s]*/gi, "")
        .replace(/#\s*\d+/gi, "")
        .replace(/\b\d+\b/g, "")
        .replace(/\s{2,}/g, " ")
        .trim();
      const palabrasValidas = (textoSinDatos.match(/[a-záéíóúüñ]{2,}/gi) || [])
        .filter(p => !PALABRAS_NO_NOMBRE.test(p));
      if (palabrasValidas.length >= 2)
        campos.nombre = palabrasValidas.slice(0, 4).join(" ");
    }
  }

  // ── Dirección por líneas separadas ────────────────────────────────────────
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
      if (!campos.referencia && /referencia|entre\s+calle|cerca\s+de|a\s+un\s+lado|frente\s+a|casa\s+de|edificio|piso\s+\d|depto|departamento|local\s+\d/i.test(l)) {
        campos.referencia = l.replace(/^referencia:?\s*/i, "").trim(); continue;
      }
      if (campos.calle && !campos.colonia && /^[a-záéíóúüñ0-9\s]{3,40}$/i.test(l) && !PALABRAS_NO_NOMBRE.test(l)) {
        campos.colonia = l.trim(); continue;
      }
    }
  }

  datosCampos.set(numero, campos);
  persistirEstado(numero);
  return campos;
}

// ── MOSTRAR FORMULARIO PROGRESIVO ─────────────────────────────────────────────
function mostrarFormularioProgresivo(numero, esDomicilio = false, esPreventa = false) {
  const campos = datosCampos.get(numero) || {};
  const lleno  = v => v ? `${v} ✅` : "___";
  const opc    = v => v ? `${v} ✅` : "___ *(opcional)*";

  const SEP = `━━━━━━━━━━━━━━━━━━`;
  let msg = `📋 *Datos para tu pedido${esPreventa ? " — Preventa" : ""}*\n`;
  msg += `${SEP}\n`;
  msg += `👤 *Nombre y apellido:* ${lleno(campos.nombre)}\n`;
  msg += `📱 *Teléfono:* ${lleno(campos.telefono)}\n`;

  if (esDomicilio) {
    msg += `📍 *Calle y número:* ${lleno(campos.calle)}\n`;
    msg += `🏘️ *Colonia:* ${lleno(campos.colonia)}\n`;
    msg += `📌 *Referencia:* ${opc(campos.referencia)}\n`;
  }

  msg += `💳 *Método de pago:* ${lleno(campos.metodo)}`;
  if (esPreventa)
    msg += `\n🕖 *Hora de ${esDomicilio ? "entrega" : "recolección"}:* ${lleno(campos.hora)}`;
  msg += `\n${SEP}`;
  return msg;
}

// ── SIGUIENTE CAMPO FALTANTE ──────────────────────────────────────────────────
function siguienteCampoFaltante(numero, esDomicilio = false, esPreventa = false) {
  const campos = datosCampos.get(numero) || {};

  if (!campos.nombre)   return { campo: "nombre",   pregunta: "*¿Cuál es tu nombre completo (nombre y apellido)?*" };
  if (!campos.telefono) return { campo: "telefono", pregunta: "*¿Cuál es tu número de teléfono a 10 dígitos?*" };

  if (esDomicilio) {
    if (!campos.calle)   return { campo: "calle",   pregunta: "*¿Cuál es tu calle y número?*" };
    if (!campos.colonia) return { campo: "colonia", pregunta: "*¿En qué colonia?*" };
    if (!campos.referencia && !referenciaPreguntas.has(numero)) {
      referenciaPreguntas.add(numero);
      persistirEstado(numero);
      return { campo: "referencia", pregunta: "*¿Alguna referencia para ubicarte?* _(opcional, escribe 'no' si no tienes)_" };
    }
    if (campos.referencia && !referenciaPreguntas.has(numero)) {
      referenciaPreguntas.add(numero);
      persistirEstado(numero);
    }
  }

  if (!campos.metodo) return { campo: "metodo", pregunta: esDomicilio ? "*¿Cómo vas a pagar?* Efectivo o transferencia." : "*¿Cómo vas a pagar?* Efectivo, tarjeta o transferencia." };
  if (esPreventa && !campos.hora) return { campo: "hora", pregunta: `*¿A qué hora ${esDomicilio ? "deseas recibirlo" : "pasas a recoger"}?* (entre ${getRangoHorario()})` };

  return null;
}

// ── MANEJAR OPCIONALES ────────────────────────────────────────────────────────
function manejarOpcional(numero, campo, texto) {
  const rechazo = /^(no|nel|nop|nope|sin|no\s+tengo|no\s+quiero|no\s+proporciono|omitir|ninguna|ninguno)$/i.test(texto.trim());
  if (!rechazo) return false;
  const campos = datosCampos.get(numero) || {};
  if (campo === "referencia") { campos.referencia = "sin referencia"; datosCampos.set(numero, campos); persistirEstado(numero); return true; }
  return false;
}

// ── CAMPOS COMPLETOS ──────────────────────────────────────────────────────────
function camposCompletos(numero, esDomicilio = false, esPreventa = false) {
  const campos = datosCampos.get(numero) || {};
  if (!campos.nombre || !campos.telefono || !campos.metodo) return false;
  if (esDomicilio && (!campos.calle || !campos.colonia))    return false;
  if (esPreventa  && !campos.hora)                          return false;
  if (esDomicilio && !referenciaPreguntas.has(numero) && !campos.referencia) return false;
  return true;
}

// ── CAMPOS A TEXTO ────────────────────────────────────────────────────────────
function camposATexto(numero) {
  const c = datosCampos.get(numero) || {};
  return [c.nombre, c.telefono, c.metodo, c.calle, c.colonia, c.referencia, c.hora]
    .filter(Boolean).join("\n");
}

// ── FUNCIONES DE UTILIDAD ─────────────────────────────────────────────────────
function datosCompletos(texto, esPreventa = false, esDomicilio = false) {
  const tieneNumeroTelefono = extraerTelefono(texto) !== null;
  const tieneNombre = (() => {
    const palabras = texto.match(/[a-záéíóúüñ]{2,}/gi) || [];
    return palabras.filter(p => !PALABRAS_NO_NOMBRE.test(p)).length >= 2;
  })();
  const tieneMetodoPago = /efectivo|tarjeta|transferencia/i.test(texto);
  const tieneHora = /\b([1-9]|1[0-2])(:[0-5][0-9])?\s*(am|pm|a\.m\.|p\.m\.)/i.test(texto)
    || /\b([1-9]|1[0-2]):[0-5][0-9]\b/.test(texto)
    || /\ba\s+las?\s+\d{1,2}/i.test(texto)
    || /\bpaso\s+a\s+las?\s+\d{1,2}/i.test(texto)
    || /\n\d{1,2}(:\d{2})?\s*$/.test(texto);
  const tieneDireccion = /calle|col\.|colonia|av\.|blvd|#\s*\d|no\.\s*\d|\bn[uú]m/i.test(texto);
  if (esDomicilio && esPreventa) return tieneNumeroTelefono && tieneNombre && tieneMetodoPago && tieneHora && tieneDireccion;
  if (esDomicilio)  return tieneNumeroTelefono && tieneNombre && tieneMetodoPago && tieneDireccion;
  if (esPreventa)   return tieneNumeroTelefono && tieneNombre && tieneMetodoPago && tieneHora;
  return tieneNumeroTelefono && tieneNombre && tieneMetodoPago;
}

function pareceFragmentoDatos(texto) {
  const esTelefono = /\b\d{7,}\b/.test(texto);
  const esNombreOApellido = (() => {
    const limpio = texto.trim();
    if (PALABRAS_NO_NOMBRE.test(limpio)) return false;
    return /^[a-záéíóúüñ\s]{4,50}$/i.test(limpio);
  })();
  const esMetodoPago = /efectivo|tarjeta|transferencia/i.test(texto);
  const esDireccion  = /calle|colonia|#|num|col\.|av\.|blvd/i.test(texto);
  const esHora       = /\b([1-9]|1[0-2])(:[0-5][0-9])?\s*(am|pm|a\.m\.|p\.m\.)/i.test(texto)
    || /\b([1-9]|1[0-2]):[0-5][0-9]\b/.test(texto)
    || /\ba\s+las?\s+\d{1,2}/i.test(texto)
    || /\bpaso\s+a\s+las?\s+\d{1,2}/i.test(texto)
    || /^\d{1,2}(:\d{2})?$/.test(texto.trim());
  return esTelefono || esNombreOApellido || esMetodoPago || esDireccion || esHora;
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

// ── DETECTAR EDICIÓN ─────────────────────────────────────────────────────────
function detectarEdicion(texto) {
  const t = texto.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

  // NOMBRE con valor
  const mNombreVal = texto.match(/cambia(?:r|me)?\s+(?:mi\s+)?nombre(?:\s+y\s+apellido)?\s+(?:a|por)\s+(.+)/i);
  if (mNombreVal) {
    const partes = mNombreVal[1].trim().split(/\s+/);
    return { campo: "nombre", valor: { nombre: partes[0], apellido: partes.slice(1).join(" ") || null }, preguntar: false };
  }
  if (/cambia(?:r|me)?\s+(?:mi\s+)?nombre(?:\s+y\s+apellido)?$/i.test(t))
    return { campo: "nombre", preguntar: true, pregunta: "*¿Cuál es tu nuevo nombre completo (nombre y apellido)?*" };

  // TELÉFONO con valor
  const mTelVal = texto.match(/cambia(?:r|me)?\s+(?:mi\s+)?tel[eé]fono\s+(?:a|por)\s+(\d{10})/i);
  if (mTelVal) return { campo: "telefono", valor: mTelVal[1], preguntar: false };
  if (/cambia(?:r|me)?\s+(?:mi\s+)?tel[eé]fono$/i.test(t))
    return { campo: "telefono", preguntar: true, pregunta: "*¿Cuál es tu nuevo número de teléfono a 10 dígitos?*" };

  // MÉTODO con valor directo
  const mMetVal = texto.match(/cambia(?:r|me)?\s+(?:el\s+)?(?:m[eé]todo|pago)(?:\s+de\s+pago)?\s+(?:a|por)\s+(efectivo|tarjeta|transferencia)/i);
  if (mMetVal) return { campo: "metodo", valor: mMetVal[1].toLowerCase(), preguntar: false };
  if (/cambia(?:r|me)?\s+(?:el\s+)?(?:m[eé]todo|pago)(?:\s+de\s+pago)?$/i.test(t))
    return { campo: "metodo", preguntar: true, pregunta: null };

  // HORA con valor
  const mHoraVal = texto.match(/cambia(?:r|me)?\s+(?:la\s+)?hora\s+(?:a|por)\s+(.+)/i);
  if (mHoraVal) return { campo: "hora", valor: mHoraVal[1].trim(), preguntar: false };
  if (/cambia(?:r|me)?\s+(?:la\s+)?hora$/i.test(t))
    return { campo: "hora", preguntar: true, pregunta: `*¿A qué hora deseas tu pedido?* (entre ${getRangoHorario()})` };

  // CALLE con valor
  const mCalleVal = texto.match(/cambia(?:r|me)?\s+(?:la\s+)?calle\s+(?:a|por)\s+(.+)/i);
  if (mCalleVal) return { campo: "calle", valor: mCalleVal[1].trim(), preguntar: false };
  if (/cambia(?:r|me)?\s+(?:la\s+)?calle$/i.test(t))
    return { campo: "calle", preguntar: true, pregunta: "*¿Cuál es tu nueva calle?*" };

  // NÚMERO DE DIRECCIÓN con valor (antes que teléfono para no confundir)
  const mNumVal = texto.match(/cambia(?:r|me)?\s+(?:el\s+)?n[uú]mero(?:\s+de\s+(?:(?:mi|la|el)\s+)?(?:direcci[oó]n|casa|domicilio|calle))?\s+(?:a|por)\s+(.+)/i);
  if (mNumVal) return { campo: "numero", valor: mNumVal[1].trim(), preguntar: false };
  if (/cambia(?:r|me)?\s+(?:el\s+)?n[uú]mero(?:\s+de\s+(?:(?:mi|la|el)\s+)?(?:direcci[oó]n|casa|domicilio|calle))?$/i.test(t))
    return { campo: "numero", preguntar: true, pregunta: "*¿Cuál es tu nuevo número de dirección?*" };

  // COLONIA con valor
  const mColVal = texto.match(/cambia(?:r|me)?\s+(?:la\s+)?colonia\s+(?:a|por)\s+(.+)/i);
  if (mColVal) return { campo: "colonia", valor: mColVal[1].trim(), preguntar: false };
  if (/cambia(?:r|me)?\s+(?:la\s+)?colonia$/i.test(t))
    return { campo: "colonia", preguntar: true, pregunta: "*¿Cuál es tu nueva colonia?*" };

  // REFERENCIA con valor
  const mRefVal = texto.match(/(?:ponle?(?:me)?\s+(?:de\s+)?referencia|cambia(?:r|me)?\s+(?:la\s+)?referencia|la\s+referencia\s+es|de\s+referencia)\s+(?:que\s+(?:es|sea)\s+)?(.+)/i);
  if (mRefVal) return { campo: "referencia", valor: mRefVal[1].trim(), preguntar: false };
  if (/cambia(?:r|me)?\s+(?:la\s+)?referencia$/i.test(t))
    return { campo: "referencia", preguntar: true, pregunta: "*¿Cuál es la referencia de tu dirección?* (ej: casa azul, edificio, entre calles...)" };

  // QUITAR ÍTEM
  if (/quit(?:a|ar|ame|amelo|amelos)\s+/i.test(texto) || /elimina(?:r|me)?\s+/i.test(texto) || /borra(?:r|me)?\s+/i.test(texto))
    return { campo: "quitar_item", texto, preguntar: false };

  return null;
}

// ── APLICAR EDICIÓN ───────────────────────────────────────────────────────────
function aplicarEdicion(clienteNumero, edicion) {
  const campos = datosCampos.get(clienteNumero) || {};
  switch (edicion.campo) {
    case "nombre":
      if (edicion.valor?.nombre) {
        campos.nombre = edicion.valor.apellido
          ? `${edicion.valor.nombre} ${edicion.valor.apellido}`
          : edicion.valor.nombre;
      }
      break;
    case "telefono":  campos.telefono  = edicion.valor; break;
    case "metodo":    campos.metodo    = edicion.valor; break;
    case "hora":      campos.hora      = edicion.valor; break;
    case "calle": {
      const calleActual = campos.calle || "";
      const numMatch = calleActual.match(/\s*#?\s*\d+\s*$/);
      const numActual = numMatch ? numMatch[0].trim() : "";
      campos.calle = numActual ? `${edicion.valor} ${numActual}` : edicion.valor;
      break;
    }
    case "numero": {
      const calleBase = (campos.calle || "").replace(/\s*#?\s*\d+\s*$/, "").trim();
      campos.calle = calleBase ? `${calleBase} #${edicion.valor}` : `#${edicion.valor}`;
      break;
    }
    case "colonia":   campos.colonia   = edicion.valor; break;
    case "referencia": campos.referencia = edicion.valor; break;
  }
  datosCampos.set(clienteNumero, campos);
  persistirEstado(clienteNumero);
}

module.exports = {
  PALABRAS_NO_NOMBRE,
  getHistorial, limpiarTodo, acumularDatos,
  interpretarCampos, mostrarFormularioProgresivo, siguienteCampoFaltante,
  manejarOpcional, camposCompletos, camposATexto,
  datosCompletos, pareceFragmentoDatos, extraerDatosPedido,
  detectarEdicion, aplicarEdicion,
  extraerTelefono, extraerTelefonoDeJID,
};
