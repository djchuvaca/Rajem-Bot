// Estado de pausa del bot. Persiste en BD para sobrevivir reinicios del contenedor.
// Usa getter/setter con lazy-load para evitar problemas de circular deps o timing.

let _pausado = false;
let _cargado = false;

function _cargarDesdeDB() {
  if (_cargado) return;
  _cargado = true;
  try {
    const { queryOne } = require('../db/core');
    const row = queryOne('SELECT valor FROM configuracion WHERE clave = ?', ['bot_pausado']);
    if (row) _pausado = row.valor === '1';
  } catch (_) {}
}

const estado = {
  get pausado() {
    _cargarDesdeDB();
    return _pausado;
  },
  set pausado(valor) {
    _pausado = !!valor;
    _cargado = true;
    try {
      const { run } = require('../db/core');
      run('INSERT OR REPLACE INTO configuracion (clave, valor) VALUES (?,?)', ['bot_pausado', valor ? '1' : '0']);
    } catch (_) {}
  },
};

module.exports = estado;
