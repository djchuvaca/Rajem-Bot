"use strict";
// Tests para horario.js — estaEnHorario, getRangoHorario, validarHora (utils.js)
// Usa better-sqlite3 en memoria (sin mocks de BD, sin tocar el archivo de producción).

const { test, describe, before } = require("node:test");
const assert = require("node:assert/strict");

const { initDB } = require("../src/db/core");
const { seedDB } = require("../src/db/seed");
const { run }    = require("../src/db/core");
const { estaEnHorario, getRangoHorario, mensajeFueraDeHorario } = require("../src/horario");
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

// ═══════════════════════════════════════════════════════════════════════════
// mensajeFueraDeHorario() — mensajes configurables desde mensajes_bot
// ═══════════════════════════════════════════════════════════════════════════
describe("mensajeFueraDeHorario — mensajes configurables", () => {
  const DIA_HOY = new Date().getDay();

  test("retorna string no vacío siempre", () => {
    const r = mensajeFueraDeHorario();
    assert.ok(typeof r === "string" && r.length > 0);
  });

  test("fuera_horario_lunes: no contiene 'lunes' ni 'martes' hardcodeados (default genérico)", () => {
    // Marcar hoy como día cerrado para activar el mensaje de descanso
    run(`UPDATE horarios SET abierto = 0 WHERE dia = ${DIA_HOY}`);
    try {
      const r = mensajeFueraDeHorario();
      // El default nuevo NO debe hardcodear "lunes" o "martes"
      assert.doesNotMatch(r, /\blos lunes\b/i);
      assert.doesNotMatch(r, /\bel martes\b/i);
      // Pero sí debe ser un mensaje coherente de descanso
      assert.match(r, /descanso|fuera de servicio|descansamos/i);
    } finally {
      run(`UPDATE horarios SET abierto = 1 WHERE dia = ${DIA_HOY}`);
    }
  });

  test("fuera_horario_lunes: interpola {hora_inicio} con la hora del siguiente día abierto", () => {
    run(`UPDATE horarios SET abierto = 0 WHERE dia = ${DIA_HOY}`);
    // Asegurar que el mensaje contiene la variable para poder verificar interpolación
    run("UPDATE mensajes_bot SET valor = 'Hoy descansamos. Abrimos mañana a las {hora_inicio}.' WHERE clave = 'fuera_horario_lunes'");
    try {
      const r = mensajeFueraDeHorario();
      // {hora_inicio} debe haberse reemplazado — no puede quedar el placeholder
      assert.doesNotMatch(r, /\{hora_inicio\}/);
      // Debe contener una hora en formato HH:MM
      assert.match(r, /\d{1,2}:\d{2}/);
    } finally {
      run(`UPDATE horarios SET abierto = 1 WHERE dia = ${DIA_HOY}`);
      run("UPDATE mensajes_bot SET valor = '⏰ Por el momento nos encontramos fuera de servicio.\nHoy es nuestro día de descanso 😴\n\nRetomamos el servicio mañana a las *{hora_inicio}* 🌮\n\n¿Te gustaría hacer un pedido en *preventa* para cuando abramos?' WHERE clave = 'fuera_horario_lunes'");
    }
  });

  test("fuera_horario_lunes: texto personalizado desde BD se respeta", () => {
    run(`UPDATE horarios SET abierto = 0 WHERE dia = ${DIA_HOY}`);
    run("UPDATE mensajes_bot SET valor = 'Hoy no atendemos. Nos vemos mañana 🌮' WHERE clave = 'fuera_horario_lunes'");
    try {
      const r = mensajeFueraDeHorario();
      assert.match(r, /Hoy no atendemos/);
    } finally {
      run(`UPDATE horarios SET abierto = 1 WHERE dia = ${DIA_HOY}`);
      run("UPDATE mensajes_bot SET valor = '⏰ Por el momento nos encontramos fuera de servicio.\nHoy es nuestro día de descanso 😴\n\nRetomamos el servicio mañana a las *{hora_inicio}* 🌮\n\n¿Te gustaría hacer un pedido en *preventa* para cuando abramos?' WHERE clave = 'fuera_horario_lunes'");
    }
  });

  test("fuera_horario_antes: contiene la hora de apertura del día", () => {
    // Poner apertura 3h en el futuro para garantizar que "ahora" es antes
    const ahora  = new Date();
    const hFutura = `${String((ahora.getHours() + 3) % 24).padStart(2, "0")}:00`;
    run(`UPDATE horarios SET abierto = 1, hora_inicio = '${hFutura}', hora_fin = '23:59' WHERE dia = ${DIA_HOY}`);
    try {
      const r = mensajeFueraDeHorario();
      assert.doesNotMatch(r, /\{hora_inicio\}/);
      // Debe mencionar la hora configurada
      assert.match(r, new RegExp(hFutura.replace(":", ":")));
    } finally {
      run(`UPDATE horarios SET hora_inicio = '07:00', hora_fin = '12:30' WHERE dia = ${DIA_HOY}`);
    }
  });
});
