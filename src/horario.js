const { getHorarioDia, getMensaje, getConfig } = require("./db");

function estaEnHorario() {
  try {
    if (getConfig("cierre_manual") === "1") return false;

    const ahora       = new Date();
    const dia         = ahora.getDay();
    const hora        = ahora.getHours();
    const minutos     = ahora.getMinutes();
    const horaDecimal = hora + minutos / 60;

    const horarioDia = getHorarioDia(dia);
    if (!horarioDia || !horarioDia.abierto) return false;

    const [hIni, mIni] = (horarioDia.hora_inicio || "07:00").split(":").map(Number);
    const [hFin, mFin] = (horarioDia.hora_fin    || "12:30").split(":").map(Number);
    const inicioDecimal = hIni + mIni / 60;
    const finDecimal    = hFin + mFin / 60;

    return horaDecimal >= inicioDecimal && horaDecimal < finDecimal;
  } catch (e) {
    // Fallback si la BD no está lista
    const ahora       = new Date();
    const dia         = ahora.getDay();
    const hora        = ahora.getHours();
    const minutos     = ahora.getMinutes();
    const horaDecimal = hora + minutos / 60;
    return dia !== 1 && horaDecimal >= 7 && horaDecimal < 12.5;
  }
}

function mensajeFueraDeHorario() {
  try {
    const ahora = new Date();
    const dia   = ahora.getDay();

    const horarioDia    = getHorarioDia(dia);
    const hora_inicio   = horarioDia?.hora_inicio || "07:00";
    const hora_fin      = horarioDia?.hora_fin    || "12:30";
    const hora          = ahora.getHours();
    const horaDecimal   = hora + ahora.getMinutes() / 60;
    const [hIni]        = hora_inicio.split(":").map(Number);

    // Buscar próximo día abierto
    let proximoDia = null;
    for (let i = 1; i <= 7; i++) {
      const sig = getHorarioDia((dia + i) % 7);
      if (sig && sig.abierto) { proximoDia = sig; break; }
    }

    const esHoy_cerrado = horarioDia && !horarioDia.abierto;
    const esAntesDe     = horaDecimal < hIni;

    const _claveFH = esHoy_cerrado ? "fuera_horario_lunes" : esAntesDe ? "fuera_horario_antes" : "fuera_horario_despues";
    const _giroH = (() => { try { const { getGiroActivo } = require('./giros'); return getGiroActivo(); } catch(_) { return null; } })();
    let msg = getMensaje(_claveFH)
      || _giroH?.mensajesDefaults?.[_claveFH]
      || "⏰ Por el momento nos encontramos fuera de servicio.\n\n¿Te gustaría hacer un pedido en *preventa* para cuando abramos?";

    const _negocio = getConfig("nombre_negocio") || "el negocio";
    msg = msg.replace(/{negocio}/g, _negocio).replace(/{hora_inicio}/g, hora_inicio).replace(/{hora_fin}/g, hora_fin);
    if (proximoDia) msg = msg.replace(/{proximo_dia}/g, proximoDia.nombre_dia);

    return msg;
  } catch (e) {
    return "⏰ Por el momento nos encontramos fuera de servicio.\n\n¿Te gustaría hacer un pedido en *preventa* para cuando abramos?";
  }
}

function esPreventa() {
  return !estaEnHorario();
}

function _fmt12h(hora24) {
  const [h, m] = hora24.split(":").map(Number);
  const ampm = h < 12 ? "a.m." : "p.m.";
  const h12  = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

function getRangoHorario() {
  try {
    const dia = new Date().getDay();
    const h   = getHorarioDia(dia);
    if (h && h.abierto && h.hora_inicio && h.hora_fin)
      return `${_fmt12h(h.hora_inicio)} a ${_fmt12h(h.hora_fin)}`;
    for (let i = 1; i <= 7; i++) {
      const sig = getHorarioDia((dia + i) % 7);
      if (sig && sig.abierto) return `${_fmt12h(sig.hora_inicio)} a ${_fmt12h(sig.hora_fin)}`;
    }
  } catch (_) {}
  return "7:00 a.m. a 12:30 p.m.";
}

function getLimitesHorario() {
  try {
    const dia = new Date().getDay();
    const hoy = getHorarioDia(dia);
    if (hoy && hoy.abierto) return { inicio: hoy.hora_inicio, fin: hoy.hora_fin };
    for (let i = 1; i <= 7; i++) {
      const siguiente = getHorarioDia((dia + i) % 7);
      if (siguiente && siguiente.abierto)
        return { inicio: siguiente.hora_inicio, fin: siguiente.hora_fin };
    }
  } catch (_) {}
  return { inicio: "07:00", fin: "12:30" };
}

function validarHoraPedido(texto) {
  if (!texto) return null;
  const palabras = {
    siete: "7", ocho: "8", nueve: "9", diez: "10", once: "11", doce: "12",
    trece: "13", catorce: "14", quince: "15", dieciseis: "16", dieciséis: "16",
    diecisiete: "17", dieciocho: "18", diecinueve: "19", veinte: "20",
  };
  let limpio = String(texto).toLowerCase();
  for (const [palabra, numero] of Object.entries(palabras)) {
    limpio = limpio.replace(new RegExp(`\\b${palabra}\\s+y\\s+media\\b`, "gi"), `${numero}:30`);
    limpio = limpio.replace(new RegExp(`\\b${palabra}\\b`, "gi"), numero);
  }
  const m = limpio.match(/(?:a\s+las?\s+)?(\d{1,2})(?::([0-5]\d))?\s*(a\.?\s*m\.?|p\.?\s*m\.?)?/i);
  if (!m) return null;
  let hora = Number(m[1]);
  const minutos = Number(m[2] || 0);
  const meridiano = (m[3] || "").replace(/[.\s]/g, "").toLowerCase();
  if (meridiano === "pm" && hora < 12) hora += 12;
  if (meridiano === "am" && hora === 12) hora = 0;
  if (!meridiano && hora <= 6) hora += 12; // en un turno matutino, "a la 1" significa 13:00
  if (hora > 23) return null;

  const { inicio, fin } = getLimitesHorario();
  const [hi, mi] = inicio.split(":").map(Number);
  const [hf, mf] = fin.split(":").map(Number);
  const valor = hora * 60 + minutos;
  if (valor < hi * 60 + mi || valor > hf * 60 + mf) return null;
  const h12 = hora % 12 || 12;
  return `${h12}:${String(minutos).padStart(2, "0")} ${hora < 12 ? "a.m." : "p.m."}`;
}

module.exports = { estaEnHorario, mensajeFueraDeHorario, esPreventa, getRangoHorario, getLimitesHorario, validarHoraPedido };
