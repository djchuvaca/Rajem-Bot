'use strict';
// Feature flags y planes de membresía.
// Todo el código se despliega en todos los tenants — el plan controla el acceso.
// Cambiar plan_activo en configuracion desbloquea funciones de inmediato, sin re-provisionar.

const _ORDEN = ['basico', 'plus', 'pro'];

// Cada plan declara explícitamente qué features incluye (sin herencia implícita).
// Agregar una feature a 'plus' requiere agregarla también a 'pro' — es intencional
// para mantener la lista legible y sin magia oculta.
const PLANES = {
  basico: new Set([
    'pedidos',              // gestión de pedidos (siempre incluido)
    'clientes',             // gestión y exportación de clientes
    'productos',            // catálogo de productos y precios
    'horarios',             // configuración de horarios de atención
    'config_basica',        // nombre, precios globales, métodos de pago
    'solicitudes_producto', // solicitar nuevos productos al superadmin
    'stats_basicas',        // dashboard con métricas del día
  ]),
  plus: new Set([
    'pedidos', 'clientes', 'productos', 'horarios', 'config_basica',
    'solicitudes_producto', 'stats_basicas',
    'pagos_mp',             // links de pago con MercadoPago
    'geo_zonas',            // zonas de envío con tarifas dinámicas
    'reportes_avanzados',   // histórico de reportes, top clientes
    'multi_formatos',       // quesadillas, vampiros, burritos (item types adicionales)
  ]),
  pro: new Set([
    'pedidos', 'clientes', 'productos', 'horarios', 'config_basica',
    'solicitudes_producto', 'stats_basicas',
    'pagos_mp', 'geo_zonas', 'reportes_avanzados', 'multi_formatos',
    'reparto',              // rastreo de repartidores (Fase 7)
    'asistente_ia',         // funciones de IA avanzadas (Fase 7)
    'multi_sesion',         // múltiples sesiones WhatsApp simultáneas (Fase 7)
  ]),
};

function planIncluye(plan, feature) {
  return (PLANES[plan] || PLANES.basico).has(feature);
}

function planGte(plan, minPlan) {
  return _ORDEN.indexOf(plan ?? 'basico') >= _ORDEN.indexOf(minPlan);
}

// Lee el plan activo desde la BD del tenant actual.
// Devuelve 'basico' si no está configurado — safe default que nunca bloquea funciones core.
function getPlanActivo() {
  try {
    const { getConfig } = require('../db/config');
    return getConfig('plan_activo') || 'basico';
  } catch (_) {
    return 'basico';
  }
}

module.exports = { PLANES, _ORDEN, planIncluye, planGte, getPlanActivo };
