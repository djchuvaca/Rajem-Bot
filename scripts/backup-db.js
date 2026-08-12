#!/usr/bin/env node
// Crea una copia de seguridad de la BD del tenant actual con timestamp.
// Uso:
//   node scripts/backup-db.js
//
// Para programarlo automáticamente (Linux/Mac):
//   crontab -e
//   0 6 * * * cd /ruta/al/bot && node scripts/backup-db.js
//
// Los backups se guardan en data/backups/{TENANT_ID}_YYYY-MM-DD_HH-MM-SS.db
// Los backups de más de 7 días se eliminan automáticamente.

"use strict";

const fs   = require("fs");
const path = require("path");

const TENANT_ID  = process.env.TENANT_ID || "tacos_javier";
const DB_NOMBRE  = `${TENANT_ID}.db`;
const DB_ORIGEN  = path.join(__dirname, "../data", DB_NOMBRE);
const BACKUP_DIR = path.join(__dirname, "../data/backups");
const DIAS_MAX   = 7;

if (!fs.existsSync(DB_ORIGEN)) {
  console.error("❌ No se encontró la BD en:", DB_ORIGEN);
  console.error("   Asegúrate de haber iniciado el bot al menos una vez.");
  process.exit(1);
}

if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });

const ahora     = new Date();
const timestamp = ahora.toISOString()
  .replace("T", "_")
  .replace(/:/g, "-")
  .slice(0, 19);
const destino   = path.join(BACKUP_DIR, `${TENANT_ID}_${timestamp}.db`);

fs.copyFileSync(DB_ORIGEN, destino);

const tamano = (fs.statSync(destino).size / 1024).toFixed(1);
console.log(`✅ Backup creado: ${path.basename(destino)} (${tamano} KB)`);

// Limpiar backups de más de DIAS_MAX días (solo los de este tenant)
const limiteMs = DIAS_MAX * 24 * 60 * 60 * 1000;
const archivos = fs.readdirSync(BACKUP_DIR)
  .filter(f => f.startsWith(`${TENANT_ID}_`) && f.endsWith(".db"));

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
console.log(`📁 Total backups (${TENANT_ID}): ${archivos.length - eliminados}`);
