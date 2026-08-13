"use strict";
// Tests para horario.js — estaEnHorario, getRangoHorario, validarHora (utils.js)
// Usa better-sqlite3 en memoria (sin mocks de BD, sin tocar el archivo de producción).

const { test, describe, before } = require("node:test");
const assert = require("node:assert/strict");

const { initDB } = require("../src/db/core");
const { seedDB } = require("../src/db/seed");
const { run }    = require("../src/db/core");
const { estaEnHorario, getRangoHorario } = require("../src/horario");
const { validarHora }                    = require("../src/handlers/flujos/utils");

before(async () => {
  await initDB();
  await seedDB();
});

// ═══════════════════════════════════════════════════════════════════════════
// getRangoHorario()
// ═══════════════════════════════════════════════════════════════════════════
describe("getRangoHorario", () => {
  test("retorna string no vacío", () => {
    const r = getRangoHorario();
    assert.ok(typeof r === "string" && r.length > 0);
  });

  test("incluye 'a.m.' o 'p.m.'", () => {
    const r = getRangoHorario();
    assert.match(r, /a\.m\.|p\.m\./);
  });

  test("tiene formato HH:MM a.m. a HH:MM p.m.", () => {
    const r = getRangoHorario();
    assert.match(r, /\d{1,2}:\d{2}/);
  });

  test("fallback cuando la BD no tiene horario abierto", () => {
    // Cerrar todos los días temporalmente
    run("UPDATE horarios SET abierto = 0");
    const r = getRangoHorario();
    assert.ok(typeof r === "string" && r.length > 0, "debe dar fallback");
    // Restaurar
    run("UPDATE horarios SET abierto = 1 WHERE dia != 0");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// estaEnHorario()
// ═══════════════════════════════════════════════════════════════════════════
describe("estaEnHorario", () => {
  test("retorna booleano", () => {
    const r = estaEnHorario();
    assert.ok(typeof r === "boolean");
  });

  test("abierto cuando horario cubre hora actual", () => {
    const ahora  = new Date();
    const hIni   = `${String(ahora.getHours()).padStart(2,"0")}:00`;
    const hFin   = `${String((ahora.getHours() + 1) % 24).padStart(2,"0")}:00`;
    run(`UPDATE horarios SET abierto=1, hora_inicio=?, hora_fin=? WHERE dia=?`,
        [hIni, hFin, ahora.getDay()]);
    assert.ok(estaEnHorario() === true);
  });

  test("cerrado cuando horario no cubre hora actual", () => {
    const ahora = new Date();
    const dia   = ahora.getDay();
    const hora  = ahora.getHours();
    // Usar un rango 3-4 horas en el futuro: nunca incluye la hora actual
    const hIni = `${String((hora + 3) % 24).padStart(2, "0")}:00`;
    const hFin = `${String((hora + 4) % 24).padStart(2, "0")}:00`;
    run(`UPDATE horarios SET abierto=1, hora_inicio=?, hora_fin=? WHERE dia=?`, [hIni, hFin, dia]);
    assert.ok(estaEnHorario() === false);
    // Restaurar horario normal de la semilla
    run(`UPDATE horarios SET hora_inicio='07:00', hora_fin='12:30' WHERE dia=?`, [dia]);
  });

  test("cerrado si el día está marcado como cerrado", () => {
    const ahora = new Date();
    const dia   = ahora.getDay();
    run(`UPDATE horarios SET abierto=0 WHERE dia=?`, [dia]);
    assert.ok(estaEnHorario() === false);
    run(`UPDATE horarios SET abierto=1 WHERE dia=?`, [dia]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// validarHora() — importada de flujos/utils.js
// ═══════════════════════════════════════════════════════════════════════════
describe("validarHora", () => {
  test("acepta '8am'", () => {
    const r = validarHora("8am");
    assert.ok(r !== null, "debe aceptar 8am");
    assert.match(r, /a\.m\./i);
  });

  test("acepta '10:30'", () => {
    const r = validarHora("10:30");
    assert.ok(r !== null);
  });

  test("acepta 'nueve y media' → 9:30", () => {
    const r = validarHora("nueve y media");
    assert.ok(r !== null);
    assert.match(r, /9:30/);
  });

  test("acepta 'siete' → 7:00", () => {
    const r = validarHora("siete");
    assert.ok(r !== null);
    assert.match(r, /7:00/);
  });

  test("rechaza hora fuera del horario (3am)", () => {
    const r = validarHora("3am");
    assert.equal(r, null);
  });

  test("rechaza hora fuera del horario (2pm)", () => {
    const r = validarHora("2pm");
    assert.equal(r, null);
  });

  test("rechaza texto sin hora", () => {
    const r = validarHora("hola buenas tardes");
    assert.equal(r, null);
  });

  test("acepta '12:30' (límite)", () => {
    const r = validarHora("12:30");
    assert.ok(r !== null);
  });

  test("rechaza '13:00' (fuera de rango)", () => {
    const r = validarHora("1pm");
    assert.equal(r, null);
  });
});
