const express = require('express');
const geoTepic = require('./index');

// Factory: recibe getTenants para no crear dependencia circular con superadmin
module.exports = function crearRouterGeoTepic({ getTenants } = {}) {
  const router = express.Router();

  function responderError(res, error) {
    if (error instanceof geoTepic.GeoTepicError) {
      const estados = {
        COLONIA_NO_ENCONTRADA: 404,
        CUADRANTE_NO_ENCONTRADO: 404,
        COORDENADAS_INVALIDAS: 400,
        CUADRANTE_INVALIDO: 400,
        NIVEL_INVALIDO: 400,
      };
      return res.status(estados[error.codigo] || 400).json({ ok: false, codigo: error.codigo });
    }
    return res.status(500).json({ ok: false, codigo: 'ERROR_INTERNO', error: error.message });
  }

  // ── Servicio geográfico reutilizable ────────────────────────────────────────

  router.get('/ubicacion', (req, res) => {
    try { res.json({ ok: true, ...geoTepic.obtenerZonaPorCoordenadas(req.query.lat, req.query.lng) }); }
    catch (e) { responderError(res, e); }
  });

  router.get('/colonia', (req, res) => {
    try { res.json({ ok: true, ...geoTepic.obtenerZonaDeColonia(req.query.nombre) }); }
    catch (e) { responderError(res, e); }
  });

  router.get('/ruta', (req, res) => {
    try { res.json({ ok: true, ...geoTepic.obtenerRutaGeograficaPorColonia(req.query.nombre) }); }
    catch (e) { responderError(res, e); }
  });

  router.get('/misma-zona', (req, res) => {
    try { res.json({ ok: true, ...geoTepic.sonColoniasMismaZona(req.query.colonia_a, req.query.colonia_b, req.query.nivel) }); }
    catch (e) { responderError(res, e); }
  });

  router.get('/status', (_req, res) => {
    try { res.json(geoTepic.obtenerEstado()); }
    catch (e) { responderError(res, e); }
  });

  // ── Diccionario maestro de colonias ──────────────────────────────────────────

  router.get('/colonias', (req, res) => {
    try {
      if (getTenants) geoTepic.inicializarDesdeTenants(getTenants());
      res.json(geoTepic.listarColonias({ incluirExcluidas: req.query.incluir_excluidas === '1' }));
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.post('/colonias', (req, res) => {
    try { res.json({ ok: true, id: geoTepic.guardarColonia(req.body) }); }
    catch (e) { res.status(400).json({ error: e.message }); }
  });

  router.put('/colonias/:colId', (req, res) => {
    try { res.json({ ok: true, id: geoTepic.guardarColonia({ ...req.body, id: req.params.colId }) }); }
    catch (e) { res.status(400).json({ error: e.message }); }
  });

  router.delete('/colonias/:colId', (req, res) => {
    try { res.json({ ok: geoTepic.eliminarColonia(req.params.colId) }); }
    catch (e) { res.status(400).json({ error: e.message }); }
  });

  router.post('/colonias/:colId/restaurar', (req, res) => {
    try { res.json({ ok: geoTepic.restaurarColonia(req.params.colId) }); }
    catch (e) { res.status(400).json({ error: e.message }); }
  });

  router.get('/auditoria', (req, res) => {
    try { res.json(geoTepic.listarAuditoria(req.query.limite)); }
    catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ── Cuadrantes ────────────────────────────────────────────────────────────────

  router.get('/cuadrantes', (_req, res) => {
    try { res.json(geoTepic.listarCuadrantes()); }
    catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.get('/cuadrantes/:cId/colonias', (req, res) => {
    try { res.json({ ok: true, ...geoTepic.obtenerColoniasPorCuadrante(req.params.cId) }); }
    catch (e) { responderError(res, e); }
  });

  router.post('/cuadrantes', (req, res) => {
    try {
      const { nombre, parentId, geometry } = req.body;
      const cuadrante = geoTepic.crearCuadrante({ nombre, parentId, geometry });
      res.status(201).json({ ok: true, cuadrante });
    } catch (e) { res.status(400).json({ error: e.message }); }
  });

  router.put('/cuadrantes/:cId', (req, res) => {
    try {
      const { nombre, geometry } = req.body;
      const cuadrante = geoTepic.actualizarCuadrante(req.params.cId, { nombre, geometry });
      res.json({ ok: true, cuadrante });
    } catch (e) { res.status(400).json({ error: e.message }); }
  });

  router.delete('/cuadrantes/:cId', (req, res) => {
    try {
      geoTepic.eliminarCuadrante(req.params.cId);
      res.json({ ok: true });
    } catch (e) { res.status(400).json({ error: e.message }); }
  });

  // ── Mapa GeoTepic — coordenadas limpias para Leaflet ─────────────────────────

  router.get('/mapa-colonias', (_req, res) => {
    try { res.json(require('./colonias_tepic.json')); }
    catch (e) { res.status(500).json({ error: e.message }); }
  });

  return router;
};
