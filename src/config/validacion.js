'use strict';

const CAMPOS_TIEMPO = Object.freeze({
  tiempo_cancelacion:       { min: 0, max: 120 },
  timeout_recordatorio_min: { min: 1, max: 240 },
  timeout_sesion_min:       { min: 2, max: 480 },
  alerta_pedido_min:        { min: 1, max: 240 },
  mandaditos_delay_min:     { min: 0, max: 240 },
});

function validarConfiguracion(clave, valor, getActual = () => null) {
  if (CAMPOS_TIEMPO[clave]) {
    const numero = Number(valor);
    const { min, max } = CAMPOS_TIEMPO[clave];
    if (!Number.isInteger(numero) || numero < min || numero > max) {
      return { ok: false, error: `El valor debe ser un número entero entre ${min} y ${max} minutos` };
    }
    const recordatorio = clave === 'timeout_recordatorio_min' ? numero : Number(getActual('timeout_recordatorio_min'));
    const cierre       = clave === 'timeout_sesion_min' ? numero : Number(getActual('timeout_sesion_min'));
    if (Number.isFinite(recordatorio) && Number.isFinite(cierre) && cierre <= recordatorio) {
      return { ok: false, error: 'Limpiar sesión debe ser mayor que el recordatorio de inactividad' };
    }
    return { ok: true, valor: String(numero) };
  }
  if (clave === 'estrategia_precio_mixto') {
    if (!['mas_caro', 'promedio'].includes(valor)) return { ok: false, error: 'Estrategia de precio inválida' };
    return { ok: true, valor };
  }
  return { ok: true, valor: String(valor ?? '') };
}

module.exports = { CAMPOS_TIEMPO, validarConfiguracion };
