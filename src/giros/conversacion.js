'use strict';

/** Construye textos conversacionales usando únicamente la definición del Giro. */

function crearConversacionGiro(giro) {
  const tipos = giro.itemTypes || [];
  const vocabulario = giro.vocabulario || {};

  function describirItem(item, { conProducto = false } = {}) {
    if (!item) return 'el producto';
    let descripcion;
    if (item.presentacion === 'gramos') descripcion = `${item.gramos}g`;
    else if (item.presentacion === 'pesos' || item.presentacion === 'por_pesos') descripcion = `$${item.monto}`;
    else {
      const cantidad = Number(item.cantidad || 1);
      const tipo = tipos.find(actual => actual.slug === item.presentacion);
      const nombre = tipo
        ? (cantidad === 1 ? tipo.nombre : (tipo.nombre_plural || `${tipo.nombre}s`))
        : (cantidad === 1 ? item.presentacion : `${item.presentacion}s`);
      const femenino = /as$/i.test(tipo?.nombre_plural || '');
      const articulo = cantidad === 1 ? (femenino ? 'la' : 'el') : (femenino ? 'las' : 'los');
      descripcion = `${articulo} ${cantidad === 1 ? '' : `${cantidad} `}${nombre}`;
    }
    if (conProducto && item.corte) descripcion += ` de ${item.corte}`;
    return descripcion;
  }

  function preguntarVariante(itemODescripcion = null) {
    const descripcion = typeof itemODescripcion === 'string'
      ? itemODescripcion
      : (itemODescripcion ? describirItem(itemODescripcion) : '');
    const plantilla = vocabulario.preguntaCorte || '¿Qué opción quieres para %desc%?';
    return plantilla
      .replace('%desc%', descripcion)
      .replace(/\s+([?!.])/g, '$1')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  function preguntarPresentacion(detalle, opciones) {
    const plantilla = vocabulario.preguntaPresentacion
      || '¿En qué presentación quieres %cantidad% de %producto%? Opciones: %opciones%';
    return plantilla
      .replace('%cantidad%', String(detalle?.cantidad || ''))
      .replace('%producto%', detalle?.corte || detalle?.productoSlug || '')
      .replace('%opciones%', opciones || '')
      .replace(/\s+([?!.])/g, '$1')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  function recordarVariante(item, opciones) {
    const singular = vocabulario.corte || 'opción';
    return `Quedamos esperando ${singular} para ${describirItem(item)}.\n*¿Cuál prefieres?* ${opciones}`;
  }

  return Object.freeze({ describirItem, preguntarVariante, preguntarPresentacion, recordarVariante });
}

module.exports = { crearConversacionGiro };

