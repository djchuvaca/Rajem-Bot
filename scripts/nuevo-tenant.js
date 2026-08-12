#!/usr/bin/env node
// scripts/nuevo-tenant.js
// Provisiona una nueva instancia del bot para un tenant distinto.
// Uso: node scripts/nuevo-tenant.js
// Flags opcionales: --business-type=pizzeria  (por defecto: taqueria)

const fs       = require("fs");
const path     = require("path");
const readline = require("readline");
const { execSync } = require("child_process");

const rl  = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q, def) => new Promise(res =>
  rl.question(def !== undefined ? `${q} [${def}]: ` : `${q}: `, ans => res(ans.trim() || def || ""))
);

// Archivos/carpetas que NO se copian al nuevo tenant
const EXCLUIR = new Set([
  "node_modules", ".wwebjs_auth", ".wwebjs_cache",
  "data", "capturas", "backups", "logs",
  ".env", "CLAUDE.md", "analisis", "apply_fixes.js",
]);

function copiarDir(src, dst) {
  if (!fs.existsSync(dst)) fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src)) {
    if (EXCLUIR.has(entry)) continue;
    const srcPath = path.join(src, entry);
    const dstPath = path.join(dst, entry);
    if (fs.statSync(srcPath).isDirectory()) {
      copiarDir(srcPath, dstPath);
    } else {
      fs.copyFileSync(srcPath, dstPath);
    }
  }
}

// Parsear flags de línea de comandos (--business-type=pizzeria)
const _cliFlags = {};
for (const arg of process.argv.slice(2)) {
  const m = arg.match(/^--([a-z-]+)=(.+)$/);
  if (m) _cliFlags[m[1]] = m[2];
}

// Tipos de negocio disponibles
const BUSINESS_TYPES_DISPONIBLES = ['taqueria', 'pizzeria', 'hamburgueseria'];

async function main() {
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("   Provisioning de nuevo tenant — Bot Tacos");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  const tenantId   = await ask("ID del tenant (ej: tacos-pepe, carnitas-norte)");
  if (!tenantId || !/^[a-z0-9-]+$/.test(tenantId)) {
    console.error("❌ El ID debe ser minúsculas, números y guiones. Ej: tacos-pepe");
    process.exit(1);
  }

  const raizDefault = path.resolve(__dirname, "..", "..");
  const raiz        = await ask("Carpeta donde crear el tenant", raizDefault);
  const destino     = path.join(raiz, tenantId);

  if (fs.existsSync(destino)) {
    console.error(`❌ Ya existe la carpeta: ${destino}`);
    process.exit(1);
  }

  const groqKey   = await ask("GROQ_API_KEY (gsk_...)");
  const grupoId   = await ask("GRUPO_ID del WhatsApp (521XXXXXXXXXX@g.us)");
  const panelPort = await ask("Puerto del panel", "3001");
  const panelSecret = await ask("PANEL_SECRET (cadena aleatoria larga)");
  const negocio   = await ask("Nombre del negocio", tenantId);

  // Tipo de negocio (NLU template)
  const btDefault = _cliFlags['business-type'] || 'taqueria';
  if (!BUSINESS_TYPES_DISPONIBLES.includes(btDefault)) {
    console.warn(`⚠️  Tipo de negocio desconocido: "${btDefault}". Usando "taqueria".`);
  }
  const businessType = BUSINESS_TYPES_DISPONIBLES.includes(btDefault) ? btDefault : 'taqueria';
  console.log(`   Tipo de negocio: ${businessType}`);

  rl.close();

  // ── Copiar código fuente ──────────────────────────────────────────────────
  const origen = path.resolve(__dirname, "..");
  console.log(`\n📦 Copiando código fuente → ${destino}`);
  copiarDir(origen, destino);

  // ── Crear carpetas de datos ───────────────────────────────────────────────
  for (const d of ["data", "capturas", "backups", "logs"]) {
    fs.mkdirSync(path.join(destino, d), { recursive: true });
    fs.writeFileSync(path.join(destino, d, ".gitkeep"), "");
  }

  // ── Generar .env ──────────────────────────────────────────────────────────
  const envContenido = [
    `# Generado por scripts/nuevo-tenant.js`,
    `TENANT_ID=${tenantId}`,
    `GROQ_API_KEY=${groqKey}`,
    `GRUPO_ID=${grupoId}`,
    `PANEL_PORT=${panelPort}`,
    `PANEL_SECRET=${panelSecret}`,
    `NOMBRE_NEGOCIO=${negocio}`,
    `BUSINESS_TYPE=${businessType}`,
  ].join("\n") + "\n";

  fs.writeFileSync(path.join(destino, ".env"), envContenido);

  // ── Instalar dependencias ─────────────────────────────────────────────────
  console.log("\n📦 Instalando dependencias (npm install)...");
  try {
    execSync("npm install --omit=dev", { cwd: destino, stdio: "inherit" });
  } catch (e) {
    console.error("⚠️  npm install falló. Hazlo manualmente dentro de la carpeta del tenant.");
  }

  // ── Seed inicial + poblar productos desde plantilla ───────────────────────
  console.log("\n🗄️  Inicializando base de datos y cargando plantilla de productos...");
  try {
    const seedScript = `
      (async () => {
        require('dotenv').config();
        const { initDB, run, queryOne } = require('./src/db/core');
        const { seedDB }                = require('./src/db/seed');
        const { getTemplateProducts, getBusinessTypeSlug } = require('./src/db');
        await initDB();
        await seedDB();
        // Poblar productos desde la plantilla del business_type activo (si la tabla está vacía)
        const cnt = queryOne('SELECT COUNT(*) as c FROM productos')?.c || 0;
        if (cnt > 0) { console.log('Productos ya existen — omitiendo seed de plantilla.'); return; }
        const slug  = getBusinessTypeSlug();
        const prods = getTemplateProducts(slug);
        if (!prods.length) { console.log('Sin productos en plantilla ' + slug); return; }
        for (const p of prods) {
          try {
            run('INSERT OR IGNORE INTO productos (nombre, descripcion, categoria, precio_taco, precio_torta, precio_100g, sinonimos) VALUES (?,?,?,?,?,?,?)',
              [p.nombre, p.descripcion, p.categoria, p.precio_taco, p.precio_torta, p.precio_100g, p.sinonimos || '']);
          } catch(_) {}
        }
        console.log('✅ ' + prods.length + ' productos cargados desde la plantilla ' + slug);
      })().catch(e => { console.error('❌ Error en seed:', e.message); process.exit(1); });
    `;
    const tmpScript = path.join(destino, '_seed_init.js');
    fs.writeFileSync(tmpScript, seedScript);
    execSync(`node ${tmpScript}`, { cwd: destino, stdio: "inherit" });
    fs.unlinkSync(tmpScript);
  } catch (e) {
    console.error("⚠️  Seed inicial falló:", e.message);
  }

  // ── Resultado ─────────────────────────────────────────────────────────────
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`✅ Tenant "${tenantId}" creado en: ${destino}`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("\nPróximos pasos:");
  console.log(`  1. cd "${destino}"`);
  console.log(`  2. node scripts/onboarding.js    # configura negocio, precios, horarios`);
  console.log(`  3. pm2 start ecosystem.config.js # o: node index.js`);
  console.log(`  4. Escanea el QR con el WhatsApp del negocio`);
  console.log(`  5. Panel en http://localhost:${panelPort}\n`);
}

main().catch(e => { console.error("❌ Error:", e.message); rl.close(); process.exit(1); });
