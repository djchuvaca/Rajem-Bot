#!/usr/bin/env node
const { initDB } = require('../src/db/core');
const { buscarColonia, normalizar } = require('../src/geo');

initDB();

const casos = [
  // ── Exactas ──────────────────────────────────────────────────────────────────
  { input: "San Juan",                 esperado: "San Juan" },
  { input: "Los Fresnos",              esperado: "Los Fresnos" },
  { input: "Las Brisas",              esperado: "Las Brisas" },

  // ── Con prefijos ─────────────────────────────────────────────────────────────
  { input: "Col. San Juan",            esperado: "San Juan" },
  { input: "Colonia San Juan",         esperado: "San Juan" },
  { input: "col san juan",             esperado: "San Juan" },
  { input: "la colonia reforma",       esperado: "Reforma" },
  { input: "Col. Los Fresnos",         esperado: "Los Fresnos" },

  // ── Parciales legítimas ───────────────────────────────────────────────────────
  { input: "fresnos infonavit",        esperado: "INFONAVIT los Fresnos" },
  { input: "los fresnos infonavit",    esperado: "INFONAVIT los Fresnos" },
  { input: "sauces infonavit",         esperado: "INFONAVIT Los Sauces" },
  { input: "tecolote infonavit",       esperado: "INFONAVIT El Tecolote" },
  { input: "mirador infonavit",        esperado: "INFONAVIT EL Mirador" },
  { input: "lomas bonitas",            esperado: "Lomas Bonitas" },
  { input: "rincon de san juan",       esperado: "Rincón de San Juan" },
  { input: "brisas de san juan",       esperado: "Brisas de San Juan" },
  { input: "villas de san juan",       esperado: "Villas de San Juan" },

  // ── Sin acentos ───────────────────────────────────────────────────────────────
  { input: "Arboledas",                esperado: "Arboledas" },
  { input: "Aztlan Solidaridad",       esperado: "Aztlán Solidaridad" },
  { input: "Felix Peña",               esperado: "Félix Peña" },
  { input: "Rincon de San Juan",       esperado: "Rincón de San Juan" },

  // ── Ambiguos que deben retornar null (demasiado vagos) ───────────────────────
  { input: "lomas",                    esperado: null },
  { input: "valle",                    esperado: null },
  { input: "san",                      esperado: null },
  { input: "infonavit",               esperado: null },  // ambiguo — 4 colonias

  // ── Eliminadas — NO deben existir ────────────────────────────────────────────
  { input: "Primero de Mayo",          esperado: null },
  { input: "Zapopan",                  esperado: null },

  // ── No existe en BD ──────────────────────────────────────────────────────────
  { input: "Colonia Fantasma",         esperado: null },
  { input: "xyz",                      esperado: null },
];

let ok = 0, fail = 0;

for (const { input, esperado } of casos) {
  const resultado = buscarColonia(input);
  const nombre    = resultado?.nombre ?? null;
  const paso      = esperado === null ? nombre === null : nombre === esperado;
  const icono     = paso ? "✅" : "❌";
  if (paso) ok++; else fail++;

  if (!paso || process.argv.includes("--verbose") || process.argv.includes("-v")) {
    const got = nombre ?? "null";
    const exp = esperado ?? "null";
    console.log(`${icono} "${input}" → ${got}${!paso ? `  (esperado: ${exp})` : ""}`);
  }
}

console.log(`\n${ok}/${ok+fail} pasaron`);
if (fail > 0) process.exit(1);
