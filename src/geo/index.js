const { queryAll } = require('../db/core');
const { getConfig } = require('../db/config');

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function normalizar(texto) {
  return (texto || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/^(col\.?\s*|colonia\s+|fracc\.?\s*|fraccionamiento\s+|residencial\s+|unidad\s+|privada\s+|ampliacion\s+|ampl\.\s*)/i, '')
    .trim();
}

function buscarColonia(nombre) {
  if (!nombre) return null;
  const norm = normalizar(nombre);
  if (!norm || norm.length < 2) return null;

  const todas = queryAll('SELECT * FROM colonias WHERE activo = 1');
  for (const c of todas) {
    if (normalizar(c.nombre) === norm) return c;
  }
  for (const c of todas) {
    const cn = normalizar(c.nombre);
    if (cn.includes(norm) || norm.includes(cn)) return c;
  }
  return null;
}

function calcularTarifaDomicilio(nombreColonia) {
  const fallback    = parseInt(getConfig('domicilio_costo') || '50');
  const negocioLat  = parseFloat(getConfig('negocio_lat')   || '0');
  const negocioLon  = parseFloat(getConfig('negocio_lon')   || '0');

  if (!negocioLat || !negocioLon) {
    return { tarifa: fallback, zona: null, distancia: null, encontrada: false };
  }

  const colonia = buscarColonia(nombreColonia);
  if (!colonia) {
    return { tarifa: fallback, zona: null, distancia: null, encontrada: false };
  }

  const distancia = haversine(negocioLat, negocioLon, colonia.lat, colonia.lon);
  const zonas     = queryAll('SELECT * FROM tarifas_zonas ORDER BY distancia_max ASC');

  for (const zona of zonas) {
    if (distancia <= zona.distancia_max) {
      return {
        tarifa:     zona.tarifa,
        zona:       zona.nombre_zona,
        distancia:  Math.round(distancia * 10) / 10,
        encontrada: true,
      };
    }
  }

  // Más lejos que la última zona: usa su tarifa
  if (zonas.length > 0) {
    const ultima = zonas[zonas.length - 1];
    return {
      tarifa:     ultima.tarifa,
      zona:       ultima.nombre_zona,
      distancia:  Math.round(distancia * 10) / 10,
      encontrada: true,
    };
  }

  return { tarifa: fallback, zona: null, distancia: Math.round(distancia * 10) / 10, encontrada: false };
}

module.exports = { haversine, buscarColonia, calcularTarifaDomicilio };
