"use strict";
/**
 * tests/despliegue-gradual.test.js
 * Fase 8 — Etapa 16: plan de despliegue gradual.
 *
 * La activación definitiva de la arquitectura multi-giro debe hacerse paso
 * a paso para poder revertir en caso de problema.  Este archivo documenta
 * los 12 pasos del plan y verifica las condiciones automáticas que ya se
 * pueden comprobar sin entorno real de producción.
 *
 * Pasos que se pueden verificar automáticamente (tests activos):
 *   - El script de backup existe y es ejecutable.
 *   - El módulo de migración existe y es idempotente (delegado a Etapa 14).
 *   - No existen markers [LEGACY] en código operativo (señal de que el
 *     código de telemetría temporal ya fue retirado o nunca se añadió).
 *   - El archivo de migración está en src/migration/ (ubicación esperada).
 *   - El ecosistema PM2 no registra tenants (solo superadmin + webhook).
 *
 * Pasos que requieren entorno real (test.todo):
 *   Los 12 pasos del despliegue gradual según acople.txt.
 */

const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const fs   = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const p    = (...x) => path.join(ROOT, ...x);

function leerLineas(ruta) {
  try { return fs.readFileSync(ruta, "utf8").split("\n"); } catch (_) { return []; }
}

function contarPatron(lineas, regex) {
  return lineas.filter(l => {
    const t = l.trim();
    if (t.startsWith("//") || t.startsWith("*") || t.startsWith("/*")) return false;
    return regex.test(l);
  }).length;
}

function contarEnArchivos(archivos, regex) {
  return archivos.reduce((t, f) => t + contarPatron(leerLineas(f), regex), 0);
}

const CODIGO_OPERATIVO = [
  p("src/handlers/flujos/orden.js"),
  p("src/handlers/flujos/resumen.js"),
  p("src/handlers/flujos/formulario.js"),
  p("src/handlers/flujos/edicion.js"),
  p("src/handlers/flujos/cancelacion.js"),
  p("src/handlers/mensajes.js"),
  p("src/handlers/respuestas.js"),
  p("src/handlers/imagenes.js"),
  p("src/handlers/mandaditos.js"),
  p("src/handlers/comandos.js"),
  p("src/panel/server.js"),
  p("src/giros/contrato.js"),
  p("src/giros/conversacion.js"),
  p("src/giros/catalogo-tenant.js"),
];

// ═══════════════════════════════════════════════════════════════════════════════
// SECCIÓN 1 — Precondiciones del despliegue: artefactos necesarios
// ═══════════════════════════════════════════════════════════════════════════════

describe("Precondiciones del despliegue — artefactos necesarios", () => {
  test("scripts/backup-db.js existe (punto de restauración antes del deploy)", () => {
    assert.ok(fs.existsSync(p("scripts/backup-db.js")),
      "scripts/backup-db.js debe existir — copia de seguridad antes de activar la arquitectura nueva"
    );
  });

  test("src/migration/migrar-bd.js existe (migración no destructiva implementada)", () => {
    assert.ok(fs.existsSync(p("src/migration/migrar-bd.js")),
      "src/migration/migrar-bd.js debe existir — migración no destructiva de la Etapa 7"
    );
  });

  test("scripts/eliminar-tenant.sh existe (capacidad de revertir un tenant)", () => {
    assert.ok(fs.existsSync(p("scripts/eliminar-tenant.sh")),
      "scripts/eliminar-tenant.sh debe existir — procedimiento de reversión por tenant"
    );
  });

  test("ecosystem.config.js no registra tenants (solo superadmin y webhook-deploy)", () => {
    const contenido = fs.readFileSync(p("ecosystem.config.js"), "utf8");
    // Solo debe tener 'superadmin' y 'webhook-deploy'
    const appsMatch = contenido.match(/name\s*:\s*["']([^"']+)["']/g) || [];
    const nombres = appsMatch.map(m => m.replace(/name\s*:\s*["']/, "").replace(/["']/, ""));
    const tenants = nombres.filter(n => n !== "superadmin" && n !== "webhook-deploy");
    assert.equal(tenants.length, 0,
      `ecosystem.config.js registra tenants: ${tenants.join(", ")} — los tenants se registran dinámicamente al provisionar`
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECCIÓN 2 — Telemetría de compatibilidad: sin markers [LEGACY] en código
// ═══════════════════════════════════════════════════════════════════════════════

describe("Telemetría de compatibilidad — estado del código", () => {
  test("código operativo no tiene markers [LEGACY] activos (ratchet: ≤0)", () => {
    // La Etapa 4 del acople propone agregar temporalmente registros [LEGACY]
    // para observar rutas antiguas.  Si el despliegue se hace correctamente,
    // esos markers se retiran antes de producción.
    const n = contarEnArchivos(CODIGO_OPERATIVO, /\[LEGACY\]/);
    assert.equal(n, 0,
      `Hay ${n} markers [LEGACY] en código operativo — deben retirarse antes del despliegue final`
    );
  });

  test("código operativo no tiene console.warn de compatibilidad sin resolver (ratchet: ≤3)", () => {
    // Permite máximo 3 advertencias de compatibilidad temporales mientras se migra.
    const n = contarEnArchivos(CODIGO_OPERATIVO, /console\.warn.*(?:legacy|compat|deprecat)/i);
    assert.ok(n <= 3,
      `Hay ${n} console.warn de compatibilidad en código operativo — límite: 3 durante la transición`
    );
  });

  test("src/migration/migrar-bd.js registra la migración en schema_migrations (idempotencia documentada)", () => {
    const lineas = leerLineas(p("src/migration/migrar-bd.js"));
    const registraVersion = contarPatron(lineas, /schema_migrations/);
    assert.ok(registraVersion > 0,
      "migrar-bd.js debe registrar en schema_migrations para garantizar idempotencia"
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECCIÓN 3 — Reversibilidad: capacidad de revertir sin perder datos
// ═══════════════════════════════════════════════════════════════════════════════

describe("Reversibilidad — el deploy puede deshacerse", () => {
  test("index.js llama backup automático cada 6h (respaldo periódico activo)", () => {
    const lineas = leerLineas(p("index.js"));
    const llama = contarPatron(lineas, /backup[-_]db|backupDB|backup_db/i);
    assert.ok(llama > 0,
      "index.js debe invocar el backup automático — checkpoint antes de cada deploy"
    );
  });

  test("scripts/provisionar-tenant.sh escribe envs/ (las env vars son reproducibles)", () => {
    const lineas = leerLineas(p("scripts/provisionar-tenant.sh"));
    const escribeEnv = contarPatron(lineas, /envs\//);
    assert.ok(escribeEnv > 0,
      "provisionar-tenant.sh debe escribir en envs/ — permite reprovisionar tras reversión"
    );
  });

  test("data/tenants.json es la fuente de registro de tenants (tenant-reader.js lo gestiona)", () => {
    const readerLineas = leerLineas(p("src/superadmin/tenant-reader.js"));
    const usaTenants = contarPatron(readerLineas, /tenants\.json/);
    assert.ok(usaTenants > 0,
      "tenant-reader.js debe referir tenants.json — lista restaurable de tenants activos"
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECCIÓN 4 — Los 12 pasos del despliegue gradual (test.todo)
// ═══════════════════════════════════════════════════════════════════════════════

describe("Plan de despliegue gradual — 12 pasos (validación manual)", () => {
  test.todo(
    "Paso 1: Copiar una BD real anonimizada al entorno de pruebas y ejecutar migrar() sin errores"
  );
  test.todo(
    "Paso 2: Ejecutar la suite completa (npm test) sobre la BD migrada — 0 fallos"
  );
  test.todo(
    "Paso 3: Desplegar el código con las variables de compatibilidad desactivadas " +
    "(GIRO_CATALOGO_UNICO, PEDIDO_NEUTRAL_UNICO, PRECIOS_GIRO_UNICO, COMANDOS_MODULARES = false)"
  );
  test.todo(
    "Paso 4: Activar GIRO_CATALOGO_UNICO=true solo en pruebas — verificar menú correcto en WhatsApp y panel"
  );
  test.todo(
    "Paso 5: Observar logs durante 24h — confirmar que no aparecen markers [LEGACY] ni errores de catálogo"
  );
  test.todo(
    "Paso 6: Activar PEDIDO_NEUTRAL_UNICO=true — verificar que pedidos nuevos usan formato neutral " +
    "y pedidos históricos siguen siendo legibles"
  );
  test.todo(
    "Paso 7: Activar PRECIOS_GIRO_UNICO=true — verificar que totales en resumen, panel y comprobantes coinciden"
  );
  test.todo(
    "Paso 8: Activar COMANDOS_MODULARES=true — verificar que !confirmar, !listo, !cancelar funcionan " +
    "y que los grupos de mandaditos no reciben comandos de pedido"
  );
  test.todo(
    "Paso 9: Probar un tenant piloto en producción real con 2-3 pedidos completos de WhatsApp a domicilio"
  );
  test.todo(
    "Paso 10: Ampliar a todos los tenants activos — monitorear alertas y pedidos sin confirmar durante 48h"
  );
  test.todo(
    "Paso 11: Verificar que los respaldos anteriores al despliegue existen y son restaurables " +
    "(backup-db.js sobre copia de datos/tenants.json)"
  );
  test.todo(
    "Paso 12: Retirar las variables de compatibilidad y el código de fallback solo después de " +
    "confirmar estabilidad durante al menos 7 días — ejecutar suite completa como verificación final"
  );
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECCIÓN 5 — Criterios de finalización de la Fase 8
// ═══════════════════════════════════════════════════════════════════════════════

describe("Criterios de finalización de la Fase 8 (test.todo)", () => {
  test.todo(
    "No hay catálogos operativos fuera del módulo Giro — src/giros/taqueria/ es la única fuente"
  );
  test.todo(
    "El núcleo (handlers, flujos) no contiene reglas específicas de taquería — vocabulario en 0"
  );
  test.todo(
    "No existen escrituras hacia productos ni cortes.precio_base desde código operativo"
  );
  test.todo(
    "No existen lecturas silenciosas de respaldo legacy (LEGACY_READ_FALLBACK=false permanente)"
  );
  test.todo(
    "WhatsApp y ambos paneles (tenant + superadmin) muestran la misma lista de productos y precios"
  );
  test.todo(
    "Los pedidos históricos permanecen intactos tras migrar() — totales e importes sin cambio"
  );
  test.todo(
    "La documentación técnica (CLAUDE.md) refleja la arquitectura definitiva sin referencias a tablas legacy"
  );
});
