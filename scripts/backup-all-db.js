#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

async function main() {
  const root = path.resolve(__dirname, '..');
  const data = path.join(root, 'data');
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const target = path.join(data, 'backups', 'deploy', stamp);
  fs.mkdirSync(target, { recursive: true });
  const files = fs.existsSync(data) ? fs.readdirSync(data).filter(f => f.endsWith('.db')) : [];
  for (const file of files) {
    const db = new Database(path.join(data, file), { readonly: true, fileMustExist: true });
    try { await db.backup(path.join(target, file)); }
    finally { db.close(); }
  }
  console.log(`[backup] ${files.length} base(s) respaldadas en ${target}`);
}

main().catch(e => { console.error('[backup] Error:', e.message); process.exit(1); });
