#!/usr/bin/env node
// scripts/onboarding.js
// Asistente interactivo para configurar el negocio por primera vez.
// Uso: node scripts/onboarding.js

require("dotenv").config();
const readline = require("readline");
const { initDB }       = require("../src/db");
const { setConfig, updateBanco, updateHorario, getProductos, updateProducto } = require("../src/db");
const { run }          = require("../src/db/core");
const bcrypt           = require("bcryptjs");

const rl  = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q, def) => new Promise(res =>
  rl.question(def !== undefined ? `${q} [${def}]: ` : `${q}: `, ans => {
    const r = ans.trim();
    return res(r === "" && def !== undefined ? String(def) : r);
  })
);

function sep(titulo) {
  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  if (titulo) console.log(`  ${titulo}`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
}

async function main() {
  sep("Bienvenido al asistente de configuración del Bot");
  console.log("  Completa los datos de tu negocio.");
  console.log("  Presiona Enter para conservar el valor por defecto.\n");

  await initDB();

  // ── 1. Datos del negocio ────────────────────────────────────────────────────
  sep("1 / 5 — Datos del negocio");

  const nombreNegocio = await ask("Nombre del negocio", "Tacos Javier");
  const tipoNegocio   = await ask("Tipo de negocio (ej: carnitas, tacos, mariscos)", "carnitas");
  const domCosto      = await ask("Costo de domicilio ($)", "50");
  const tiempoCancel  = await ask("Minutos para cancelar un pedido confirmado", "15");

  setConfig("nombre_negocio",     nombreNegocio);
  setConfig("tipo_negocio",       tipoNegocio);
  setConfig("domicilio_costo",    domCosto);
  setConfig("tiempo_cancelacion", tiempoCancel);
  console.log("✅ Datos del negocio guardados");

  // ── 2. Horarios ─────────────────────────────────────────────────────────────
  sep("2 / 5 — Horario de atención");
  console.log("  Configura el horario para cada día (0=Dom … 6=Sáb).");
  const DIAS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
  const abiertoDef  = "07:00";
  const cerradoDef  = "12:30";
  const cerradosDef = new Set([0]); // domingo cerrado por defecto

  for (let d = 0; d < 7; d++) {
    const dia = DIAS[d];
    const abiertoPorDef = cerradosDef.has(d) ? "no" : "si";
    const resp = await ask(`${dia} — ¿Abierto? (si/no)`, abiertoPorDef);
    const abierto = /^s/i.test(resp);
    if (abierto) {
      const inicio = await ask(`  ${dia} — Hora inicio (HH:MM)`, abiertoDef);
      const fin    = await ask(`  ${dia} — Hora fin   (HH:MM)`, cerradoDef);
      updateHorario(d, 1, inicio, fin);
    } else {
      updateHorario(d, 0, abiertoDef, cerradoDef);
    }
  }
  console.log("✅ Horarios guardados");

  // ── 3. Datos bancarios ──────────────────────────────────────────────────────
  sep("3 / 5 — Datos bancarios para transferencias");
  const banco       = await ask("Banco (ej: BBVA, Banamex, OXXO Pay)");
  const beneficiario = await ask("Nombre del beneficiario");
  const clabe       = await ask("CLABE interbancaria (18 dígitos)");
  if (banco || beneficiario || clabe) {
    updateBanco(banco, beneficiario, clabe);
    console.log("✅ Datos bancarios guardados");
  } else {
    console.log("⚠️  Datos bancarios omitidos (se pueden configurar desde el panel)");
  }

  // ── 4. Precios de productos ─────────────────────────────────────────────────
  sep("4 / 5 — Precios de los cortes");
  const productos = getProductos();
  if (productos.length === 0) {
    console.log("  No hay productos en la BD. Configúralos desde el panel admin.");
  } else {
    console.log("  Ajusta los precios por corte.\n");
    for (const p of productos) {
      const taco  = await ask(`  ${p.nombre} — precio taco  ($)`, p.precio_taco);
      const torta = await ask(`  ${p.nombre} — precio torta ($)`, p.precio_torta);
      const g100  = await ask(`  ${p.nombre} — precio 100g  ($)`, p.precio_100g);
      updateProducto(p.id, {
        nombre:      p.nombre,
        precio_taco:  parseFloat(taco)  || p.precio_taco,
        precio_torta: parseFloat(torta) || p.precio_torta,
        precio_100g:  parseFloat(g100)  || p.precio_100g,
        descripcion: p.descripcion,
        sinonimos:   p.sinonimos,
        activo:      p.activo,
      });
    }
    console.log("✅ Precios guardados");
  }

  // ── 5. Contraseña del panel ──────────────────────────────────────────────────
  sep("5 / 5 — Contraseña del panel de administración");
  console.log("  El usuario es siempre: admin");
  const cambiar = await ask("¿Deseas establecer una contraseña ahora? (si/no)", "si");
  if (/^s/i.test(cambiar)) {
    const pass = await ask("Nueva contraseña (mín. 6 caracteres)");
    if (pass && pass.length >= 6) {
      const hash = bcrypt.hashSync(pass, 10);
      run("UPDATE usuarios_panel SET password = ? WHERE usuario = ?", [hash, "admin"]);
      console.log("✅ Contraseña del panel actualizada");
    } else {
      console.log("⚠️  Contraseña inválida. Usa `node scripts/reset-password.js` para cambiarla luego.");
    }
  }

  // ── Cerrar ──────────────────────────────────────────────────────────────────
  rl.close();

  sep("¡Configuración completada!");
  console.log(`  Negocio: ${nombreNegocio}`);
  console.log(`  Panel:   http://localhost:${process.env.PANEL_PORT || 3000}`);
  console.log(`  Arrancar: node index.js  (o: pm2 start ecosystem.config.js)`);
  console.log();
  process.exit(0);
}

main().catch(e => { console.error("❌ Error:", e.message); rl.close(); process.exit(1); });
