"use strict";
/**
 * src/migration/clasificacion-bd.js
 * Fase 8 — Etapa 6: diseño de migración de base de datos.
 *
 * Clasifica cada tabla (y columnas clave) de la BD del tenant según su
 * destino en la arquitectura final:
 *
 *   VIGENTE     — fuente operativa activa; se conserva sin modificar semántica.
 *   TRANSFORMAR — doble función; debe simplificarse antes de la Etapa 13.
 *   HISTORIAL   — conservar para recuperación; sin escrituras operativas nuevas.
 *   OBSOLETA    — sin consumidores activos; candidata a Etapa 13 versión A.
 *   ELIMINAR    — puede eliminarse en Etapa 13 versión B tras validar cero lecturas.
 *
 * Principios de seguridad que toda migración debe respetar (ver PRINCIPIOS).
 *
 * Este módulo NO toca la BD — solo describe el plan.
 */

// ── CLASIFICACIÓN DE TABLAS ─────────────────────────────────────────────────

const TABLAS = {
  // Catálogo multi-giro
  business_types:         { estado: "VIGENTE",    razon: "Registro de giros activos — seed idempotente en cada arranque" },
  item_types:             { estado: "VIGENTE",    razon: "Formatos/presentaciones por giro — seed sincroniza desde módulo Giro" },
  menu_items:             { estado: "VIGENTE",    razon: "Fuente definitiva del catálogo operativo: habilitación + precios del tenant" },
  cortes:                 { estado: "TRANSFORMAR",razon: "NLU lee aliases de aquí; aliases deben migrar al módulo Giro (Etapa 11)" },

  // Operativa del bot
  clientes:               { estado: "VIGENTE",    razon: "Datos permanentes de clientes — no tocar" },
  pedidos:                { estado: "VIGENTE",    razon: "Historial permanente; los totales NO se recalculan con reglas nuevas" },
  configuracion:          { estado: "VIGENTE",    razon: "Configuración del tenant — fuente única de config operativa" },
  horarios:               { estado: "VIGENTE",    razon: "Horarios de atención del tenant" },
  banco:                  { estado: "VIGENTE",    razon: "Datos bancarios del tenant" },
  mensajes_bot:           { estado: "VIGENTE",    razon: "Mensajes personalizados del tenant" },
  usuarios_panel:         { estado: "VIGENTE",    razon: "Credenciales del panel — no tocar" },
  sesiones_activas:       { estado: "VIGENTE",    razon: "Conversaciones en curso — restaurar en reinicios" },
  pagos_pendientes:       { estado: "VIGENTE",    razon: "Pagos en proceso — crítico para integridad financiera" },
  schema_migrations:      { estado: "VIGENTE",    razon: "Registro de versiones de migración — idempotencia garantizada" },

  // Geo y zonas
  colonias:               { estado: "VIGENTE",    razon: "Cobertura geográfica del tenant" },
  tarifas_zonas:          { estado: "VIGENTE",    razon: "Tarifas de envío por zona" },

  // Mandaditos
  repartidores:           { estado: "VIGENTE",    razon: "Datos de repartidores activos" },
  entregas_historial:     { estado: "VIGENTE",    razon: "Historial de entregas — KPIs de desempeño" },
  despachos_programados:  { estado: "VIGENTE",    razon: "Despachos pendientes de ejecución" },

  // Observabilidad
  conversaciones_trace:   { estado: "VIGENTE",    razon: "Trazabilidad de conversaciones — retención 90 días" },
  conversacion_eventos:   { estado: "VIGENTE",    razon: "Línea de tiempo de conversaciones" },
  alertas_operativas:     { estado: "VIGENTE",    razon: "Alertas para el panel del tenant" },

  // Solicitudes
  solicitudes_producto:   { estado: "VIGENTE",    razon: "Solicitudes de producto pendientes de revisión" },
  solicitudes_geo:        { estado: "VIGENTE",    razon: "Solicitudes geográficas pendientes de revisión" },

  // Legacy
  productos:              { estado: "HISTORIAL",  razon: "Catálogo legacy; solo lectura para migración. Ninguna ruta operativa escribe aquí." },
};

// ── CLASIFICACIÓN DE COLUMNAS CLAVE ─────────────────────────────────────────

const COLUMNAS = {
  // productos — tabla HISTORIAL
  "productos.precio_taco":  { estado: "HISTORIAL",  razon: "Solo para migración legacy → menu_items" },
  "productos.precio_torta": { estado: "HISTORIAL",  razon: "Solo para migración legacy → menu_items" },
  "productos.precio_100g":  { estado: "HISTORIAL",  razon: "Solo para migración legacy → menu_items" },
  "productos.activo":       { estado: "HISTORIAL",  razon: "Solo para migración legacy; menu_items.activo es la fuente definitiva" },
  "productos.catalogo_slug":{ estado: "HISTORIAL",  razon: "Metadato de migración" },

  // pedidos — preservar integridad histórica
  "pedidos.total":  { estado: "VIGENTE", razon: "Importe registrado al momento del pedido; no recalcular" },
  "pedidos.orden":  { estado: "VIGENTE", razon: "Texto del pedido; conservar como string histórico" },

  // cortes — en transformación
  "cortes.aliases_json": { estado: "TRANSFORMAR", razon: "Los aliases deben migrar al módulo Giro (Etapa 11)" },
  "cortes.precios_json": { estado: "HISTORIAL",   razon: "Precios específicos por formato; menu_items es la fuente definitiva" },

  // configuracion — claves operativas
  "configuracion.precio_taco":  { estado: "VIGENTE", razon: "Precio global de taco como fallback" },
  "configuracion.precio_torta": { estado: "VIGENTE", razon: "Precio global de torta como fallback" },
  "configuracion.precio_100g":  { estado: "VIGENTE", razon: "Precio global de 100g como fallback" },
};

// ── PRINCIPIOS DE SEGURIDAD ──────────────────────────────────────────────────

const PRINCIPIOS = [
  "nunca_modificar_sin_respaldo",
  "no_borrar_columnas_primera_migracion",
  "migraciones_idempotentes",
  "registrar_version_migracion",
  "ejecutar_en_transaccion",
  "validar_conteos_antes_y_despues",
  "ejecutar_integrity_check",
  "conservar_ids_pedidos_clientes",
  "no_reinterpretar_precios_historicos",
];

// ── DEPENDENCIAS ENTRE TABLAS ────────────────────────────────────────────────

const DEPENDENCIAS = {
  // Antes de eliminar cortes, menu_items debe ser la fuente completa de aliases
  cortes:    ["menu_items"],
  // Antes de eliminar productos, confirmar que menu_items ya tiene toda la configuración
  productos: ["menu_items"],
  // item_types referencia business_types
  item_types: ["business_types"],
  // pedidos referencia clientes
  pedidos: ["clientes"],
};

// ── ORDEN DE ETAPA 9 (retirar escrituras) ───────────────────────────────────

const ORDEN_RETIRAR_ESCRITURAS = [
  "panel_superadmin",    // 1. Panel del superadmin — no más escrituras a productos
  "panel_tenant",        // 2. Panel del tenant — solo escribe a menu_items
  "provisionamiento",    // 3. Seed — no repobla productos en instalaciones nuevas
  "bot_whatsapp",        // 4. Bot — precio y catálogo desde menu_items / Giro
  "scripts",             // 5. Scripts administrativos
  "tests",               // 6. Tests y utilidades
];

// ── API DEL MÓDULO ──────────────────────────────────────────────────────────

/** Retorna la clasificación de una tabla. Lanza si no está clasificada. */
function clasificarTabla(nombre) {
  if (!(nombre in TABLAS)) {
    throw new Error(`Tabla no clasificada: '${nombre}'`);
  }
  return TABLAS[nombre];
}

/** Retorna la clasificación de una columna 'tabla.columna'. */
function clasificarColumna(clave) {
  if (!(clave in COLUMNAS)) {
    throw new Error(`Columna no clasificada: '${clave}'`);
  }
  return COLUMNAS[clave];
}

/** Retorna todas las tablas de un estado dado. */
function tablasConEstado(estado) {
  return Object.entries(TABLAS)
    .filter(([, v]) => v.estado === estado)
    .map(([k]) => k);
}

/** Verifica que todas las tablas en la lista de `nombres` están clasificadas. */
function todasClasificadas(nombres) {
  return nombres.every(n => n in TABLAS);
}

/** Lista los principios de seguridad aplicables. */
function listarPrincipios() {
  return [...PRINCIPIOS];
}

module.exports = {
  TABLAS,
  COLUMNAS,
  PRINCIPIOS,
  DEPENDENCIAS,
  ORDEN_RETIRAR_ESCRITURAS,
  clasificarTabla,
  clasificarColumna,
  tablasConEstado,
  todasClasificadas,
  listarPrincipios,
};
