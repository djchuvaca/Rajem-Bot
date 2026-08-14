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

function registrarEntregaConfirmada(jid, minutos) {
  const rep = getRepartidor(jid);
  if (!rep) return;
  const confirmadas   = (rep.entregas_confirmadas || 0) + 1;
  const promAnterior  = rep.promedio_entrega_min  || 0;
  const nuevoProm     = Math.round(((promAnterior * (confirmadas - 1)) + minutos) / confirmadas * 10) / 10;
  getDB().prepare(`
    UPDATE repartidores
    SET en_ruta=0, pedido_actual_id=NULL, tiempo_ruta_inicio=NULL,
        entregas_hoy        = entregas_hoy + 1,
        entregas_total      = entregas_total + 1,
        entregas_confirmadas = ?,
        promedio_entrega_min = ?
    WHERE jid=?
  `).run(confirmadas, nuevoProm, jid);
}

function registrarEntregaTimeout(jid) {
  getDB().prepare(`
    UPDATE repartidores
    SET en_ruta=0, pedido_actual_id=NULL, tiempo_ruta_inicio=NULL,
        entregas_hoy   = entregas_hoy + 1,
        entregas_total = entregas_total + 1
    WHERE jid=?
  `).run(jid);
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
  setActivo,
  setNombre,
  resetEntregasHoy,
  eliminarRepartidor,
};
