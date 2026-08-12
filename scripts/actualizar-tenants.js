#!/usr/bin/env node
/**
 * scripts/actualizar-tenants.js
 * Propaga el código fuente actualizado a todos los tenants existentes y los reinicia.
 *
 * Uso:
 *   node scripts/actualizar-tenants.js                     ← actualiza todos
 *   node scripts/actualizar-tenants.js --dry-run           ← simula sin cambios
 *   node scripts/actualizar-tenants.js --tenant=tacos-pepe ← solo un tenant
 *   node scripts/actualizar-tenants.js --no-restart        ← sincroniza pero no reinicia PM2
 *   node scripts/actualizar-tenants.js --no-npm            ← salta npm install
 *   node scripts/actualizar-tenants.js --pull              ← hace git pull en el fuente primero
 *
 * Qué aplica en cada tenant:
 *   ✅ Código fuente nuevo (JS, HTML, CSS, JSON — todo excepto datos del tenant)
 *   ✅ Nuevas dependencias npm (si package.json cambió)
 *   ✅ Migraciones de BD — aliases NLU, nuevos cortes, nuevas config keys, nuevas tablas
 *      (se aplican automáticamente cuando el bot arranca vía seedDB)
 *
 * Lo que NUNCA toca:
 *   🔒 data/        ← base de datos del tenant
 *   🔒 .env         ← credenciales y configuración del tenant
 *   🔒 .wwebjs_auth ← sesión de WhatsApp
 *   🔒 logs/        ← logs del proceso
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const { execSync, spawnSync } = require('child_process');

// ── Archivos y carpetas que NUNCA se sincronizan al tenant ────────────────────
const EXCLUIR = new Set([
  'node_modules', '.wwebjs_auth', '.wwebjs_cache',
  'data', 'capturas', 'backups', 'logs',
  '.env', 'CLAUDE.md', 'analisis', '.git',
]);

// ── Flags de línea de comandos ────────────────────────────────────────────────
const ARGS         = process.argv.slice(2);
const DRY_RUN      = ARGS.includes('--dry-run');
const SKIP_RESTART = ARGS.includes('--no-restart');
const SKIP_NPM     = ARGS.includes('--no-npm');
const DO_PULL      = ARGS.includes('--pull');
const SOLO_TENANT  = (ARGS.find(a => a.startsWith('--tenant=')) || '').split('=')[1] || null;

const SEP  = '━'.repeat(54);
const SEP2 = '─'.repeat(54);

function log(msg)  { console.log(msg); }
function ok(msg)   { console.log(`   ✅ ${msg}`); }
function warn(msg) { console.log(`   ⚠️  ${msg}`); }
function info(msg) { console.log(`   ℹ️  ${msg}`); }

// ── Directorio del fuente (este repo) y de los tenants ───────────────────────
const ORIGEN = path.resolve(__dirname, '..');
const RAIZ   = path.resolve(ORIGEN, '..');  // directorio padre donde viven los tenants

// ── Sincronizar: copia archivos que cambiaron (comparación byte a byte) ───────
function sincronizar(src, dst) {
  let cambiados = 0;
  let total     = 0;

  function recorrer(s, d) {
    const entries = fs.readdirSync(s, { withFileTypes: true });
    for (const entry of entries) {
      if (EXCLUIR.has(entry.name)) continue;
      const sp = path.join(s, entry.name);
      const dp = path.join(d, entry.name);

      if (entry.isDirectory()) {
        if (!fs.existsSync(dp) && !DRY_RUN) fs.mkdirSync(dp, { recursive: true });
        recorrer(sp, dp);
      } else {
        total++;
        const srcBuf   = fs.readFileSync(sp);
        const dstExiste = fs.existsSync(dp);
        const igual    = dstExiste && srcBuf.equals(fs.readFileSync(dp));
        if (!igual) {
          if (!DRY_RUN) fs.copyFileSync(sp, dp);
          cambiados++;
        }
      }
    }
  }

  recorrer(src, dst);
  return { cambiados, total };
}

// ── Detectar tenants: subdirectorios del padre con .env que tienen TENANT_ID ──
function detectarTenants() {
  if (!fs.existsSync(RAIZ)) return [];
  const resultado = [];

  for (const entry of fs.readdirSync(RAIZ, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dir     = path.join(RAIZ, entry.name);
    if (dir === ORIGEN) continue;  // no actualizar el propio fuente

    const envPath = path.join(dir, '.env');
    if (!fs.existsSync(envPath)) continue;

    const envTxt = fs.readFileSync(envPath, 'utf8');
    const match  = envTxt.match(/^TENANT_ID=(.+)$/m);
    if (!match) continue;

    resultado.push({
      tenantId: match[1].trim(),
      dir,
    });
  }

  return resultado;
}

// ── Verificar si package.json del tenant difiere del fuente ──────────────────
function pkgCambio(tenantDir) {
  const src = path.join(ORIGEN,    'package.json');
  const dst = path.join(tenantDir, 'package.json');
  if (!fs.existsSync(dst)) return true;
  return !fs.readFileSync(src).equals(fs.readFileSync(dst));
}

// ── Reiniciar proceso PM2 del tenant ─────────────────────────────────────────
function pm2Restart(tenantId) {
  const r = spawnSync('pm2', ['restart', tenantId], {
    encoding: 'utf8',
    shell: true,
    timeout: 20000,
  });
  if (r.status === 0) return { ok: true };
  return {
    ok: false,
    error: (r.stderr || r.stdout || 'proceso no encontrado en PM2').trim().split('\n')[0],
  };
}

// ── Git pull en el fuente ─────────────────────────────────────────────────────
function gitPull() {
  log(`📥 git pull en el fuente (${ORIGEN})...`);
  if (DRY_RUN) { log('   [dry-run] omitido'); return; }
  try {
    const out = execSync('git pull', { cwd: ORIGEN, encoding: 'utf8', stdio: 'pipe' });
    log(`   ${out.trim().split('\n')[0]}`);
  } catch (e) {
    warn(`git pull falló: ${e.message.split('\n')[0]}`);
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────
function main() {
  log(`\n${SEP}`);
  log('   Actualizar Tenants — Bot Rajem');
  if (DRY_RUN) log('   ⚠️  Modo --dry-run: ningún cambio real');
  log(`${SEP}\n`);

  // 0. Pull opcional
  if (DO_PULL) {
    gitPull();
    log('');
  }

  // 1. Detectar tenants
  let tenants = detectarTenants();

  if (!tenants.length) {
    warn(`No se encontraron tenants en: ${RAIZ}`);
    info('Asegúrate de ejecutar este script desde el directorio del bot fuente.');
    process.exit(0);
  }

  if (SOLO_TENANT) {
    tenants = tenants.filter(t => t.tenantId === SOLO_TENANT);
    if (!tenants.length) {
      log(`❌ Tenant "${SOLO_TENANT}" no encontrado.\nTenants detectados:`);
      detectarTenants().forEach(t => log(`   • ${t.tenantId}  (${t.dir})`));
      process.exit(1);
    }
  }

  log(`📋 ${tenants.length} tenant(s) encontrado(s):`);
  tenants.forEach(t => log(`   • ${t.tenantId.padEnd(26)} ${t.dir}`));
  log('');

  const resultados = [];

  // 2. Procesar cada tenant
  for (const { tenantId, dir } of tenants) {
    log(SEP2);
    log(`🔄 ${tenantId}`);

    // a. Sincronizar código
    const { cambiados, total } = sincronizar(ORIGEN, dir);
    if (cambiados > 0) {
      ok(`${cambiados} / ${total} archivos actualizados`);
    } else {
      info(`Sin cambios en código (${total} archivos revisados)`);
    }

    // b. npm install si package.json cambió
    let npmEstado = 'omitido';
    if (!SKIP_NPM && pkgCambio(dir)) {
      log('   📦 package.json cambió — npm install...');
      if (!DRY_RUN) {
        try {
          execSync('npm install --omit=dev --prefer-offline --no-audit', {
            cwd: dir, stdio: 'pipe', timeout: 120000,
          });
          ok('npm install OK');
          npmEstado = 'OK';
        } catch (e) {
          warn(`npm install falló: ${e.message.split('\n')[0]}`);
          npmEstado = 'FALLO';
        }
      } else {
        info('[dry-run] npm install omitido');
        npmEstado = 'dry-run';
      }
    }

    // c. Reiniciar PM2 (el bot corre seedDB al arrancar → aplica migraciones de BD)
    let restartEstado = 'omitido';
    if (!SKIP_RESTART && !DRY_RUN) {
      log(`   🔁 pm2 restart ${tenantId}...`);
      const r = pm2Restart(tenantId);
      if (r.ok) {
        ok('Reiniciado');
        restartEstado = 'OK';
      } else {
        warn(`PM2: ${r.error}`);
        warn(`Reinicia manualmente: pm2 restart ${tenantId}`);
        restartEstado = 'FALLO';
      }
    } else if (DRY_RUN) {
      info(`[dry-run] pm2 restart ${tenantId} omitido`);
      restartEstado = 'dry-run';
    } else {
      info(`--no-restart: ejecuta manualmente: pm2 restart ${tenantId}`);
    }

    resultados.push({ tenantId, cambiados, total, npmEstado, restartEstado });
    log('');
  }

  // 3. Resumen final
  log(SEP);
  log('   Resumen');
  log(SEP);
  log('');

  const col = (s, n) => String(s).padEnd(n);
  log(`   ${col('Tenant', 28)} ${col('Archivos', 10)} ${col('npm', 9)} Restart`);
  log(`   ${col('─'.repeat(27), 28)} ${col('─'.repeat(9), 10)} ${col('─'.repeat(8), 9)} ─────`);

  for (const r of resultados) {
    const icono = r.restartEstado === 'OK'    ? '✅'
                : r.restartEstado === 'FALLO' ? '⚠️ '
                : r.restartEstado === 'dry-run' ? '🔵'
                : '⏭ ';
    log(`   ${icono} ${col(r.tenantId, 26)} ${col(`${r.cambiados}/${r.total}`, 10)} ${col(r.npmEstado, 9)} ${r.restartEstado}`);
  }

  log('');
  log('ℹ️  Las migraciones de BD (nuevos cortes, aliases, config, tablas)');
  log('   se aplican solas cuando el bot arranca — no requieren pasos extra.');
  log('');
}

main();
