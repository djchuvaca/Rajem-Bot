const crypto = require('crypto');
const { getBsdb, queryAll, queryOne } = require('./core');

const _trazasActivas = new Map();

function _db() {
  const db = getBsdb();
  if (!db) throw new Error('Base de datos no inicializada');
  return db;
}

function _texto(valor, max = 1500) {
  return String(valor ?? '').replace(/\0/g, '').trim().substring(0, max);
}

function _json(valor) {
  try { return JSON.stringify(valor ?? {}); } catch (_) { return '{}'; }
}

function obtenerEtapaConversacion(jid) {
  try {
    const e = require('../estado');
    const etapas = [
      ['esperando_captura', e.esperandoCaptura], ['resumen_pendiente', e.resumenPendiente],
      ['confirmacion_datos', e.esperandoConfirmacionDatos], ['edicion', e.esperandoEdicion],
      ['extras', e.esperandoExtras], ['agregar_mas', e.esperandoAgregarMas],
      ['confirmacion_item', e.esperandoConfirmacionItem], ['corte', e.esperandoCorte],
      ['tipo_item', e.esperandoTipoItem], ['colonia', e.esperandoColonia],
      ['formulario', e.datosCampos],
    ];
    return etapas.find(([, contenedor]) => contenedor?.has(jid))?.[0] || 'inicio';
  } catch (_) { return 'desconocida'; }
}

function obtenerOCrearTraza(jid) {
  const clave = _texto(jid, 180);
  const cache = _trazasActivas.get(clave);
  if (cache) return cache;
  const activa = queryOne(
    `SELECT id FROM conversaciones_trace WHERE jid=? AND estado='activa'
     AND actualizada_en >= datetime('now','-48 hours') ORDER BY actualizada_en DESC LIMIT 1`, [clave]
  );
  const id = activa?.id || crypto.randomUUID();
  if (!activa) {
    _db().prepare(`INSERT INTO conversaciones_trace (id,jid,etapa_actual) VALUES (?,?,?)`)
      .run(id, clave, obtenerEtapaConversacion(clave));
  }
  _trazasActivas.set(clave, id);
  return id;
}

function registrarEvento(jid, direccion, tipo, contenido, metadata = {}) {
  try {
    const traceId = obtenerOCrearTraza(jid);
    const etapa = metadata.etapa || obtenerEtapaConversacion(jid);
    _db().prepare(`INSERT INTO conversacion_eventos
      (trace_id,direccion,tipo,etapa,contenido,metadata_json) VALUES (?,?,?,?,?,?)`)
      .run(traceId, direccion, _texto(tipo, 80), _texto(etapa, 80), _texto(contenido), _json(metadata));
    _db().prepare(`UPDATE conversaciones_trace SET etapa_actual=?, actualizada_en=datetime('now','localtime') WHERE id=?`)
      .run(_texto(etapa, 80), traceId);
    return traceId;
  } catch (e) {
    console.error('[Trazabilidad] No se pudo registrar evento:', e.message);
    return null;
  }
}

function registrarEntrada(jid, contenido, metadata = {}) {
  return registrarEvento(jid, 'cliente', 'mensaje', contenido, metadata);
}

function registrarSalida(jid, contenido, metadata = {}) {
  return registrarEvento(jid, 'bot', 'respuesta', contenido, metadata);
}

function registrarRuta(jid, ruta, metadata = {}) {
  return registrarEvento(jid, 'sistema', 'ruta_nlu', ruta, { ...metadata, etapa: obtenerEtapaConversacion(jid) });
}

function vincularPedido(jid, pedidoId) {
  try {
    const traceId = obtenerOCrearTraza(jid);
    _db().prepare(`UPDATE conversaciones_trace SET pedido_id=?, estado='completada',
      etapa_actual='pedido_registrado', actualizada_en=datetime('now','localtime') WHERE id=?`).run(pedidoId, traceId);
    _db().prepare(`INSERT INTO conversacion_eventos
      (trace_id,direccion,tipo,etapa,contenido,metadata_json) VALUES (?,?,?,?,?,?)`)
      .run(traceId, 'sistema', 'pedido', 'pedido_registrado', `Pedido #${pedidoId}`, _json({ pedidoId }));
    _trazasActivas.delete(_texto(jid, 180));
    return traceId;
  } catch (e) { console.error('[Trazabilidad] No se pudo vincular pedido:', e.message); return null; }
}

function cerrarTraza(jid, estado = 'abandonada') {
  try {
    const traceId = obtenerOCrearTraza(jid);
    _db().prepare(`UPDATE conversaciones_trace SET estado=?, actualizada_en=datetime('now','localtime') WHERE id=?`)
      .run(_texto(estado, 30), traceId);
    _trazasActivas.delete(_texto(jid, 180));
    return traceId;
  } catch (_) { return null; }
}

function crearAlerta(jid, tipo, titulo, detalle, opciones = {}) {
  try {
    const trazaPedido = opciones.pedidoId
      ? queryOne('SELECT id FROM conversaciones_trace WHERE pedido_id=? ORDER BY actualizada_en DESC LIMIT 1', [opciones.pedidoId])
      : null;
    const traceId = opciones.traceId || trazaPedido?.id || obtenerOCrearTraza(jid);
    const existente = queryOne(`SELECT id FROM alertas_operativas WHERE trace_id=? AND tipo=? AND estado='abierta'`, [traceId, tipo]);
    if (existente) {
      _db().prepare(`UPDATE alertas_operativas SET ocurrencias=ocurrencias+1, detalle=?, actualizada_en=datetime('now','localtime') WHERE id=?`)
        .run(_texto(detalle), existente.id);
      return existente.id;
    }
    const r = _db().prepare(`INSERT INTO alertas_operativas
      (trace_id,pedido_id,tipo,severidad,titulo,detalle) VALUES (?,?,?,?,?,?)`)
      .run(traceId, opciones.pedidoId || null, _texto(tipo, 80), _texto(opciones.severidad || 'media', 20), _texto(titulo, 180), _texto(detalle));
    _db().prepare(`UPDATE conversaciones_trace SET requiere_atencion=1, motivo_atencion=? WHERE id=?`)
      .run(_texto(titulo, 180), traceId);
    return Number(r.lastInsertRowid);
  } catch (e) { console.error('[Trazabilidad] No se pudo crear alerta:', e.message); return null; }
}

function listarAlertas({ estado = 'abierta', limite = 100 } = {}) {
  const filtro = estado === 'todas' ? '' : 'WHERE a.estado=?';
  const params = estado === 'todas' ? [] : [estado];
  return queryAll(`SELECT a.*, c.jid, c.etapa_actual FROM alertas_operativas a
    LEFT JOIN conversaciones_trace c ON c.id=a.trace_id ${filtro}
    ORDER BY CASE a.severidad WHEN 'critica' THEN 1 WHEN 'alta' THEN 2 WHEN 'media' THEN 3 ELSE 4 END,
    a.actualizada_en DESC LIMIT ?`, [...params, Math.min(Math.max(Number(limite) || 100, 1), 500)]);
}

function resolverAlerta(id, usuario, nota = '') {
  const r = _db().prepare(`UPDATE alertas_operativas SET estado='resuelta', resuelta_por=?, nota_resolucion=?,
    resuelta_en=datetime('now','localtime'), actualizada_en=datetime('now','localtime') WHERE id=? AND estado='abierta'`)
    .run(_texto(usuario, 80), _texto(nota), id);
  return r.changes > 0;
}

function listarConversaciones(limite = 100) {
  return queryAll(`SELECT c.*, (SELECT COUNT(*) FROM conversacion_eventos e WHERE e.trace_id=c.id) eventos,
    (SELECT COUNT(*) FROM alertas_operativas a WHERE a.trace_id=c.id AND a.estado='abierta') alertas_abiertas
    FROM conversaciones_trace c ORDER BY c.actualizada_en DESC LIMIT ?`,
    [Math.min(Math.max(Number(limite) || 100, 1), 500)]);
}

function obtenerConversacion(id) {
  const conversacion = queryOne('SELECT * FROM conversaciones_trace WHERE id=?', [id]);
  if (!conversacion) return null;
  return {
    ...conversacion,
    eventos: queryAll('SELECT * FROM conversacion_eventos WHERE trace_id=? ORDER BY id', [id]),
    alertas: queryAll('SELECT * FROM alertas_operativas WHERE trace_id=? ORDER BY id DESC', [id]),
  };
}

function limpiarObservabilidadAntigua(dias = 90) {
  const retencion = Math.min(Math.max(Number(dias) || 90, 7), 730);
  const db = _db();
  return db.transaction(() => {
    db.prepare(`UPDATE conversaciones_trace SET estado='abandonada'
      WHERE estado='activa' AND actualizada_en < datetime('now','-48 hours')`).run();
    db.prepare(`DELETE FROM alertas_operativas WHERE estado='resuelta' AND resuelta_en < datetime('now', ?)`)
      .run(`-${retencion} days`);
    return db.prepare(`DELETE FROM conversaciones_trace WHERE estado!='activa' AND actualizada_en < datetime('now', ?)`)
      .run(`-${retencion} days`).changes;
  })();
}

module.exports = {
  obtenerEtapaConversacion, registrarEvento, registrarEntrada, registrarSalida, registrarRuta,
  vincularPedido, cerrarTraza, crearAlerta, listarAlertas, resolverAlerta, listarConversaciones,
  obtenerConversacion, limpiarObservabilidadAntigua,
};
