const { getHorarioDia, getMensaje, getConfig } = require("./db");

function estaEnHorario() {
  try {
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
      const { getHorarioDia: gH } = require("./db");
      const sig = gH((dia + i) % 7);
      if (sig && sig.abierto) { proximoDia = sig; break; }
    }

    const esHoy_cerrado = horarioDia && !horarioDia.abierto;
    const esAntesDe     = horaDecimal < hIni;

    let msg = getMensaje(esHoy_cerrado ? "fuera_horario_lunes" : esAntesDe ? "fuera_horario_antes" : "fuera_horario_despues")
      || "⏰ Por el momento nos encontramos fuera de servicio.\n\n¿Te gustaría hacer un pedido en *preventa* para cuando abramos?";

    msg = msg.replace(/{hora_inicio}/g, hora_inicio).replace(/{hora_fin}/g, hora_fin);
    if (proximoDia) msg = msg.replace(/{proximo_dia}/g, proximoDia.nombre_dia);

    return msg;
  } catch (e) {
    return "⏰ Por el momento nos encontramos fuera de servicio.\n\n¿Te gustaría hacer un pedido en *preventa* para cuando abramos?";
  }
}

function esPreventa() {
  return !estaEnHorario();
}

module.exports = { estaEnHorario, mensajeFueraDeHorario, esPreventa };
