'use strict';
const { getDB } = require('./core');

function getRepartidores() {
  return getDB().prepare(
    'SELECT * FROM repartidores ORDER BY activo DESC, en_ruta DESC, nombre'
  ).all();
}

function getRepartidor(jid) {
  return getDB().prepare('SELECT * FROM repartidores WHERE jid = ?').get(jid);
}

function upsertRepartidor(jid, nombre) {
  getDB().prepare(
    'INSERT INTO repartidores (jid, nombre) VALUES (?,?) ON CONFLICT(jid) DO NOTHING'
  ).run(jid, nombre);
}

function setEnRuta(jid, pedidoId, tiempoInicio) {
  getDB().prepare(`
    UPDATE repartidores
    SET en_ruta=1, pedido_actual_id=?, tiempo_ruta_inicio=?, ultima_actividad=datetime('now')
    WHERE jid=?
  `).run(pedidoId, tiempoInicio, jid);
}

function setLibre(jid) {
  getDB().prepare(`
    UPDATE repartidores
    SET en_ruta=0, pedido_actual_id=NULL, tiempo_ruta_inicio=NULL
    WHERE jid=?
  `).run(jid);
}

function registrarEntregaConfirmada(jid, minutos, pedidoId = null, colonia = null) {
  const rep = getRepartidor(jid);
  if (!rep) return;
  const confirmadas   = (rep.entregas_confirmadas || 0) + 1;
  const promAnterior  = rep.promedio_entrega_min  || 0;
  const nuevoProm     = Math.round(((promAnterior * (confirmadas - 1)) + minutos) / confirmadas * 10) / 10;
  getDB().prepare(`
    UPDATE repartidores
    SET en_ruta=0, pedido_actual_id=NULL, tiempo_ruta_inicio=NULL,
        entregas_hoy         = entregas_hoy + 1,
        entregas_total       = entregas_total + 1,
        entregas_confirmadas = ?,
        promedio_entrega_min = ?
    WHERE jid=?
  `).run(confirmadas, nuevoProm, jid);
  getDB().prepare(
    'INSERT INTO entregas_historial (repartidor_id, pedido_id, colonia, minutos, confirmado) VALUES (?,?,?,?,1)'
  ).run(rep.id, pedidoId, colonia, minutos);
}

function registrarEntregaTimeout(jid, pedidoId = null, colonia = null) {
  const rep = getRepartidor(jid);
  if (!rep) return;
  getDB().prepare(`
    UPDATE repartidores
    SET en_ruta=0, pedido_actual_id=NULL, tiempo_ruta_inicio=NULL,
        entregas_hoy   = entregas_hoy + 1,
        entregas_total = entregas_total + 1
    WHERE jid=?
  `).run(jid);
  getDB().prepare(
    'INSERT INTO entregas_historial (repartidor_id, pedido_id, colonia, minutos, confirmado) VALUES (?,?,?,NULL,0)'
  ).run(rep.id, pedidoId, colonia);
}

function getHistorialRepartidor(repartidorId, limit = 100) {
  return getDB().prepare(
    'SELECT * FROM entregas_historial WHERE repartidor_id=? ORDER BY creado_en DESC LIMIT ?'
  ).all(repartidorId, limit);
}

function getHistorialTenant(desde = null, hasta = null, repartidorId = null) {
  const condiciones = ['1=1'];
  const params      = [];
  if (repartidorId) { condiciones.push('h.repartidor_id=?'); params.push(repartidorId); }
  if (desde)        { condiciones.push('h.fecha>=?');        params.push(desde); }
  if (hasta)        { condiciones.push('h.fecha<=?');        params.push(hasta); }
  return getDB().prepare(`
    SELECT h.*, r.nombre AS repartidor_nombre
    FROM entregas_historial h
    JOIN repartidores r ON r.id = h.repartidor_id
    WHERE ${condiciones.join(' AND ')}
    ORDER BY h.creado_en DESC
    LIMIT 500
  `).all(...params);
}

function getReporteDesempeno(desde = null, hasta = null) {
  return getDB().prepare(`
    SELECT r.id, r.nombre, r.activo, r.promedio_entrega_min AS promedio_global,
           COUNT(h.id)                                              AS total_entregas,
           SUM(CASE WHEN h.confirmado=1 THEN 1 ELSE 0 END)         AS confirmadas,
           SUM(CASE WHEN h.confirmado=0 THEN 1 ELSE 0 END)         AS timeouts,
           ROUND(AVG(CASE WHEN h.confirmado=1 THEN h.minutos END), 1) AS promedio_min_periodo
    FROM repartidores r
    LEFT JOIN entregas_historial h
      ON h.repartidor_id = r.id
      AND (? IS NULL OR h.fecha >= ?)
      AND (? IS NULL OR h.fecha <= ?)
    GROUP BY r.id
    ORDER BY total_entregas DESC, r.nombre
  `).all(desde, desde, hasta, hasta);
}

function setActivo(jid, activo) {
  getDB().prepare('UPDATE repartidores SET activo=? WHERE jid=?').run(activo ? 1 : 0, jid);
}

function setNombre(jid, nombre) {
  getDB().prepare('UPDATE repartidores SET nombre=? WHERE jid=?').run(nombre, jid);
}

function resetEntregasHoy() {
  getDB().prepare('UPDATE repartidores SET entregas_hoy=0').run();
}

function eliminarRepartidor(id) {
  getDB().prepare('DELETE FROM repartidores WHERE id=?').run(id);
}

module.exports = {
  getRepartidores,
  getRepartidor,
  upsertRepartidor,
  setEnRuta,
  setLibre,
  registrarEntregaConfirmada,
  registrarEntregaTimeout,
  getHistorialRepartidor,
  getHistorialTenant,
  getReporteDesempeno,
  setActivo,
  setNombre,
  resetEntregasHoy,
  eliminarRepartidor,
};
