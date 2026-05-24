require("dotenv").config();
const readline = require("readline");
const bcrypt   = require("bcryptjs");
const { initDB } = require("../src/db");
const { run, getDB } = require("../src/db/core");

async function main() {
  await initDB();

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = q => new Promise(res => rl.question(q, res));

  const usuario = await ask("Usuario del panel (default: admin): ") || "admin";
  const nueva   = await ask("Nueva contraseña: ");
  rl.close();

  if (!nueva || nueva.length < 6) {
    console.error("❌ La contraseña debe tener al menos 6 caracteres.");
    process.exit(1);
  }

  const hash = bcrypt.hashSync(nueva, 10);
  const { changes } = run(
    "UPDATE usuarios_panel SET password = ? WHERE usuario = ?",
    [hash, usuario]
  );

  if (!changes) {
    console.error(`❌ No existe el usuario "${usuario}" en la base de datos.`);
    process.exit(1);
  }

  // Forzar guardado síncrono a disco
  const db = getDB();
  const fs = require("fs");
  const path = require("path");
  const dataPath = path.join(__dirname, "../data/tacos_javier.db");
  const data = db.export();
  fs.writeFileSync(dataPath, Buffer.from(data));

  console.log(`✅ Contraseña de "${usuario}" actualizada correctamente.`);
  process.exit(0);
}

main().catch(e => { console.error("❌ Error:", e.message); process.exit(1); });
