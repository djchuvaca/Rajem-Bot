'use strict';

const express = require('express');
const logistica = require('./index');
const geoTepic = require('../geo/geotepic');

module.exports = function crearRouterLogistica({ getTenants, getTenant, getTenantConfig, auditar } = {}) {
  const router = express.Router();

  const ejecutar = (res, fn, status = 200) => {
    try { res.status(status).json(fn()); }
    catch (error) { res.status(/no encontrad|inválid|obligatori|necesita|puede|superar/i.test(error.message) ? 400 : 500).json({ error: error.message }); }
  };
  const auditoria = (req, accion, entidad, id, detalles = {}) => {
    if (auditar) auditar({ usuario: req.session?.usuario || 'superadmin', accion, entidad, entidadId: String(id || ''), detalles, ip: req.ip });
  };

  router.get('/bootstrap', (_req, res) => ejecutar(res, () => ({
    empresas: logistica.listarEmpresas(),
    politica: logistica.obtenerPolitica(),
    condiciones: logistica.listarCondiciones(),
    cuadrantes: geoTepic.listarCuadrantes().map(({ geometry, ...c }) => c),
    tenants: (getTenants ? getTenants() : []).map(t => ({ id: t.id, nombre: t.nombre, ciudad: t.ciudad, estado: t.estado })),
  })));

  router.put('/politica', (req, res) => ejecutar(res, () => {
    const politica = logistica.actualizarPolitica(req.body);
    auditoria(req, 'logistica.politica.editar', 'politica_logistica', politica.id, req.body);
    return { ok: true, politica };
  }));

  router.get('/reglas', (req, res) => ejecutar(res, () => {
    const politica = logistica.obtenerPolitica();
    const version = req.query.version === 'publicada' ? politica.version_publicada : politica.version_borrador;
    return { politica, version, reglas: version ? logistica.listarReglas(version) : [] };
  }));

  router.post('/reglas', (req, res) => ejecutar(res, () => {
    const id = logistica.guardarRegla(req.body);
    auditoria(req, 'logistica.regla.crear', 'regla_logistica', id, req.body);
    return { ok: true, id };
  }, 201));

  router.put('/reglas/:reglaId', (req, res) => ejecutar(res, () => {
    const id = logistica.guardarRegla(req.body, req.params.reglaId);
    auditoria(req, 'logistica.regla.editar', 'regla_logistica', id, req.body);
    return { ok: true, id };
  }));

  router.delete('/reglas/:reglaId', (req, res) => ejecutar(res, () => {
    if (!logistica.eliminarRegla(req.params.reglaId)) throw new Error('Regla de borrador no encontrada');
    auditoria(req, 'logistica.regla.eliminar', 'regla_logistica', req.params.reglaId);
    return { ok: true };
  }));

  router.post('/publicar', (req, res) => ejecutar(res, () => {
    const politica = logistica.publicarPolitica();
    auditoria(req, 'logistica.politica.publicar', 'politica_logistica', politica.id, { version: politica.version_publicada });
    return { ok: true, politica };
  }));

  router.post('/condiciones', (req, res) => ejecutar(res, () => {
    const id = logistica.guardarCondicion(req.body, req.session?.usuario);
    auditoria(req, 'logistica.condicion.activar', 'condicion_logistica', id, req.body);
    return { ok: true, id };
  }, 201));

  router.delete('/condiciones/:id', (req, res) => ejecutar(res, () => {
    if (!logistica.desactivarCondicion(req.params.id)) throw new Error('Condición no encontrada');
    auditoria(req, 'logistica.condicion.desactivar', 'condicion_logistica', req.params.id);
    return { ok: true };
  }));

  router.post('/clima/:nivel/toggle', (req, res) => ejecutar(res, () => {
    const estado = logistica.alternarFiltroClima(req.params.nivel, req.session?.usuario);
    auditoria(req, 'logistica.clima.alternar', 'condicion_logistica', req.params.nivel, estado);
    return { ok: true, ...estado };
  }));

  router.post('/simular', (req, res) => ejecutar(res, () => {
    const tenant = getTenant?.(req.body.tenant_id);
    if (!tenant) throw new Error('Tenant no encontrado');
    const config = getTenantConfig?.(tenant) || {};
    const resultado = logistica.cotizarEntrega({
      tenantId: tenant.id,
      colonia: req.body.colonia,
      origenLat: req.body.origen_lat ?? config.negocio_lat,
      origenLon: req.body.origen_lon ?? config.negocio_lon,
      momento: req.body.momento || new Date(),
      condicionesSimuladas: Array.isArray(req.body.condiciones) ? req.body.condiciones : null,
      usarBorrador: true,
      persistir: false,
    });
    return resultado;
  }));

  router.get('/cotizaciones', (_req, res) => ejecutar(res, () => logistica.listarCotizaciones(_req.query.limite)));

  return router;
};
