const { queryAll, queryOne, run } = require("./core");

// ─── CONFIGURACIÓN ────────────────────────────────────────────────────────────
function getConfig(clave) {
  const row = queryOne("SELECT valor FROM configuracion WHERE clave = ?", [clave]);
  return row ? row.valor : null;
}
function setConfig(clave, valor) {
  run("INSERT OR REPLACE INTO configuracion (clave, valor) VALUES (?,?)", [clave, valor]);
}
function getAllConfig() {
  return queryAll("SELECT * FROM configuracion");
}

// ─── HORARIOS ─────────────────────────────────────────────────────────────────
function getHorarios() {
  return queryAll("SELECT * FROM horarios ORDER BY dia");
}
function getHorarioDia(dia) {
  return queryOne("SELECT * FROM horarios WHERE dia = ?", [dia]);
}
function updateHorario(dia, abierto, hora_inicio, hora_fin) {
  run("UPDATE horarios SET abierto=?, hora_inicio=?, hora_fin=? WHERE dia=?",
    [abierto, hora_inicio, hora_fin, dia]);
}

// ─── BANCO ────────────────────────────────────────────────────────────────────
function getBanco() {
  return queryOne("SELECT * FROM banco WHERE activo = 1 ORDER BY id DESC");
}
function updateBanco(banco, beneficiario, clabe) {
  run("UPDATE banco SET banco=?, beneficiario=?, clabe=? WHERE activo=1",
    [banco, beneficiario, clabe]);
}

// ─── MENSAJES BOT ─────────────────────────────────────────────────────────────
function getMensaje(clave) {
  const row = queryOne("SELECT valor FROM mensajes_bot WHERE clave = ?", [clave]);
  return row ? row.valor : null;
}
function setMensaje(clave, valor) {
  run("INSERT OR REPLACE INTO mensajes_bot (clave, valor) VALUES (?,?)", [clave, valor]);
}
function getAllMensajes() {
  return queryAll("SELECT * FROM mensajes_bot");
}

// ─── USUARIOS PANEL ───────────────────────────────────────────────────────────
function getUsuarioPanel(usuario) {
  return queryOne("SELECT * FROM usuarios_panel WHERE usuario = ?", [usuario]);
}
function updatePasswordPanel(usuario, hash) {
  run("UPDATE usuarios_panel SET password = ? WHERE usuario = ?", [hash, usuario]);
}

// ─── SESIONES ACTIVAS ─────────────────────────────────────────────────────────
function guardarSesion(numero, estadoObj, historial = []) {
  const { getDB, guardarDB } = require("./core");
  const dbInst = getDB();
  if (!dbInst) return;
  try {
    dbInst.run(
      `INSERT OR REPLACE INTO sesiones_activas (numero, estado_json, historial_json, actualizado_en)
       VALUES (?, ?, ?, datetime('now', 'localtime'))`,
      [numero, JSON.stringify(estadoObj), JSON.stringify(historial)]
    );
    guardarDB();
  } catch (e) { console.error("[SESION] Error guardando sesión:", e.message); }
}

function eliminarSesion(numero) {
  const { getDB, guardarDB } = require("./core");
  const dbInst = getDB();
  if (!dbInst) return;
  try {
    dbInst.run("DELETE FROM sesiones_activas WHERE numero = ?", [numero]);
    guardarDB();
  } catch (e) { console.error("[SESION] Error eliminando sesión:", e.message); }
}

function cargarTodasLasSesiones() {
  const { getDB } = require("./core");
  if (!getDB()) return [];
  try {
    return queryAll("SELECT numero, estado_json, historial_json FROM sesiones_activas").map(r => ({
      numero:    r.numero,
      estado:    JSON.parse(r.estado_json    || "{}"),
      historial: JSON.parse(r.historial_json || "[]"),
    }));
  } catch (e) { console.error("[SESION] Error cargando sesiones:", e.message); return []; }
}

function limpiarSesionesAntiguas(horas = 6) {
  const { getDB, guardarDB } = require("./core");
  const dbInst = getDB();
  if (!dbInst) return;
  try {
    dbInst.run(`DELETE FROM sesiones_activas WHERE actualizado_en < datetime('now', 'localtime', '-${horas} hours')`);
    guardarDB();
  } catch (e) { console.error("[SESION] Error limpiando sesiones:", e.message); }
}

function limpiarTodasLasSesionesDB() {
  const { getDB } = require("./core");
  const dbInst = getDB();
  if (!dbInst) return;
  try {
    dbInst.run("DELETE FROM sesiones_activas");
  } catch (e) { console.error("[SESION] Error limpiando todas las sesiones:", e.message); }
}

// ─── TELÉFONOS REALES ─────────────────────────────────────────────────────────
function guardarTelefonoReal(numeroWhatsApp, telefonoReal) {
  run("INSERT OR REPLACE INTO configuracion (clave, valor) VALUES (?,?)",
    [`tel_real_${numeroWhatsApp}`, telefonoReal]);
}
function getTelefonoReal(numeroWhatsApp) {
  const row = queryOne("SELECT valor FROM configuracion WHERE clave = ?",
    [`tel_real_${numeroWhatsApp}`]);
  return row ? row.valor : null;
}

function getGrupoId() {
  return process.env.GRUPO_ID || getConfig("grupo_id") || null;
}

function guardarJIDReal(telefono, jid) {
  run("INSERT OR REPLACE INTO configuracion (clave, valor) VALUES (?,?)",
    [`jid_real_${telefono}`, jid]);
}
function getJIDReal(telefono) {
  const row = queryOne("SELECT valor FROM configuracion WHERE clave = ?",
    [`jid_real_${telefono}`]);
  return row ? row.valor : null;
}

module.exports = {
  getConfig, setConfig, getAllConfig,
  getHorarios, getHorarioDia, updateHorario,
  getBanco, updateBanco,
  getMensaje, setMensaje, getAllMensajes,
  getUsuarioPanel, updatePasswordPanel,
  guardarSesion, eliminarSesion, cargarTodasLasSesiones, limpiarSesionesAntiguas, limpiarTodasLasSesionesDB,
  guardarTelefonoReal, getTelefonoReal,
  guardarJIDReal, getJIDReal,
  getGrupoId,
};
