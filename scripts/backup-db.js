#!/usr/bin/env node
// Crea una copia de seguridad de tacos_javier.db con timestamp.
// Uso:
//   node scripts/backup-db.js
//
// Para programarlo automáticamente (Linux/Mac):
//   crontab -e
//   0 6 * * * cd /ruta/al/bot && node scripts/backup-db.js
//
// Los backups se guardan en backups/tacos_javier_YYYY-MM-DD_HH-MM-SS.db
// Los backups de más de 7 días se eliminan automáticamente.

"use strict";

const fs   = require("fs");
const path = require("path");

const DB_ORIGEN  = path.join(__dirname, "../data/tacos_javier.db");
const BACKUP_DIR = path.join(__dirname, "../backups");
const DIAS_MAX   = 7;

if (!fs.existsSync(DB_ORIGEN)) {
  console.error("❌ No se encontró la BD en:", DB_ORIGEN);
  console.error("   Asegúrate de haber iniciado el bot al menos una vez.");
  process.exit(1);
}

if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });

// Nombre con timestamp: tacos_javier_2026-05-23_14-30-00.db
const ahora     = new Date();
const timestamp = ahora.toISOString()
  .replace("T", "_")
  .replace(/:/g, "-")
  .slice(0, 19);
const destino   = path.join(BACKUP_DIR, `tacos_javier_${timestamp}.db`);

fs.copyFileSync(DB_ORIGEN, destino);

const tamano = (fs.statSync(destino).size / 1024).toFixed(1);
console.log(`✅ Backup creado: ${path.basename(destino)} (${tamano} KB)`);

// Limpiar backups de más de DIAS_MAX días
const limiteMs = DIAS_MAX * 24 * 60 * 60 * 1000;
const archivos = fs.readdirSync(BACKUP_DIR)
  .filter(f => f.startsWith("tacos_javier_") && f.endsWith(".db"));

let eliminados = 0;
for (const archivo of archivos) {
  const ruta  = path.join(BACKUP_DIR, archivo);
  const mtime = fs.statSync(ruta).mtimeMs;
  if (Date.now() - mtime > limiteMs) {
    fs.unlinkSync(ruta);
    eliminados++;
  }
}

if (eliminados > 0) console.log(`🗑️  ${eliminados} backup(s) antiguos eliminados (+${DIAS_MAX} días)`);
console.log(`📁 Total backups: ${archivos.length - eliminados}`);
