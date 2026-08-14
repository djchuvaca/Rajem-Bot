"use strict";
// Tests para estado/campos.js — extraerTelefono, extraerTelefonoDeJID, interpretarCampos
// Usa better-sqlite3 en memoria (sin mocks de BD, sin tocar el archivo de producción).

const { test, describe, before } = require("node:test");
const assert = require("node:assert/strict");

const { initDB } = require("../src/db/core");
const { seedDB } = require("../src/db/seed");
const { setConfig } = require("../src/db");
const {
  extraerTelefono,
  extraerTelefonoDeJID,
  interpretarCampos,
  camposCompletos,
  siguienteCampoFaltante,
  datosCampos,
} = require("../src/estado/campos");

// datosCampos no se exporta de campos.js — lo importamos desde maps
const { datosCampos: _mapa } = require("../src/estado/maps");

before(async () => {
  await initDB();
  await seedDB();
});

// ═══════════════════════════════════════════════════════════════════════════
// extraerTelefono()
// ═══════════════════════════════════════════════════════════════════════════
describe("extraerTelefono", () => {
  test("10 dígitos consecutivos válidos", () => {
    assert.equal(extraerTelefono("mi tel es 3312345678"), "3312345678");
  });

  test("número con código de país +52", () => {
    assert.equal(extraerTelefono("+523312345678"), "3312345678");
  });

  test("número con código de país 52 y espacios", () => {
    assert.equal(extraerTelefono("52 331 234 5678"), "3312345678");
  });

  test("número con separadores guiones", () => {
    assert.equal(extraerTelefono("331-234-5678"), "3312345678");
  });

  test("número con separadores puntos", () => {
    assert.equal(extraerTelefono("331.234.5678"), "3312345678");
  });

  test("rechaza número con primer dígito 0", () => {
    assert.equal(extraerTelefono("0123456789"), null);
  });

  test("rechaza número con primer dígito 1", () => {
    assert.equal(extraerTelefono("1234567890"), null);
  });

  test("extrae número de texto largo", () => {
    assert.equal(
      extraerTelefono("Hola me llamo Juan García y mi número es 3318765432 gracias"),
      "3318765432"
    );
  });

  test("retorna null si no hay número válido", () => {
    assert.equal(extraerTelefono("hola buenos días"), null);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// extraerTelefonoDeJID()
// ═══════════════════════════════════════════════════════════════════════════
describe("extraerTelefonoDeJID", () => {
  test("JID @c.us estándar con prefijo 521", () => {
    assert.equal(extraerTelefonoDeJID("5213312345678@c.us"), "3312345678");
  });

  test("JID @c.us con prefijo 52", () => {
    assert.equal(extraerTelefonoDeJID("523312345678@c.us"), "3312345678");
  });

  test("JID con separador dos puntos (lid)", () => {
    assert.equal(extraerTelefonoDeJID("5213312345678:10@lid"), null);
  });

  test("JID sin prefijo 52 pero 10 dígitos válidos", () => {
    assert.equal(extraerTelefonoDeJID("3312345678@c.us"), "3312345678");
  });

  test("retorna null para JID inválido", () => {
    assert.equal(extraerTelefonoDeJID("abc@c.us"), null);
  });

  test("retorna null para null", () => {
    assert.equal(extraerTelefonoDeJID(null), null);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// interpretarCampos() + camposCompletos()
// ═══════════════════════════════════════════════════════════════════════════
describe("interpretarCampos — mostrador", () => {
  const NUM = "3310000001@c.us";

  test("extrae nombre de dos palabras", () => {
    const campos = interpretarCampos(NUM, "Juan García", false, false);
    assert.ok(campos.nombre, "debe haber nombre");
    assert.match(campos.nombre, /juan/i);
  });

  test("extrae teléfono", () => {
    const campos = interpretarCampos(NUM, "mi tel 3312345678", false, false);
    assert.equal(campos.telefono, "3312345678");
  });

  test("extrae método de pago — transferencia", () => {
    const campos = interpretarCampos(NUM, "pago con transferencia", false, false);
    assert.equal(campos.metodo, "transferencia");
  });

  test("extrae método de pago — efectivo", () => {
    _mapa.delete(NUM);
    const campos = interpretarCampos(NUM, "pago en efectivo", false, false);
    assert.equal(campos.metodo, "efectivo");
  });

  test("extrae método de pago — tarjeta (mostrador)", () => {
    _mapa.delete(NUM);
    const campos = interpretarCampos(NUM, "con tarjeta", false, false);
    assert.equal(campos.metodo, "tarjeta");
  });

  test("campos completos mostrador", () => {
    const NUM2 = "3310000002@c.us";
    _mapa.delete(NUM2);
    interpretarCampos(NUM2, "Ana López", false, false);
    interpretarCampos(NUM2, "3319876543", false, false);
    interpretarCampos(NUM2, "efectivo", false, false);
    interpretarCampos(NUM2, "paso a las 10:30", false, false);
    assert.ok(camposCompletos(NUM2, false, false));
    _mapa.delete(NUM2);
  });
});

describe("interpretarCampos — domicilio", () => {
  const NUM = "3310000003@c.us";

  test("extrae dirección formato col.", () => {
    _mapa.delete(NUM);
    const campos = interpretarCampos(NUM, "Av. Revolución 123 col. Centro", true, false);
    assert.ok(campos.colonia, "debe extraer colonia");
    assert.match(campos.colonia, /centro/i);
  });

  test("domicilio no acepta tarjeta como método de pago", () => {
    _mapa.delete(NUM);
    const campos = interpretarCampos(NUM, "con tarjeta", true, false);
    assert.equal(campos.metodo, null);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// siguienteCampoFaltante()
// ═══════════════════════════════════════════════════════════════════════════
describe("siguienteCampoFaltante", () => {
  const NUM = "3310000004@c.us";

  test("primero pide nombre cuando no hay nada", () => {
    _mapa.delete(NUM);
    const f = siguienteCampoFaltante(NUM, false, false);
    assert.equal(f?.campo, "nombre");
  });

  test("pide teléfono si ya hay nombre", () => {
    _mapa.delete(NUM);
    interpretarCampos(NUM, "Carlos Ramírez", false, false);
    const f = siguienteCampoFaltante(NUM, false, false);
    assert.equal(f?.campo, "telefono");
  });

  test("retorna null cuando todo está completo (mostrador)", () => {
    const NUM2 = "3310000005@c.us";
    _mapa.delete(NUM2);
    interpretarCampos(NUM2, "Luis Mora", false, false);
    interpretarCampos(NUM2, "3315551234", false, false);
    interpretarCampos(NUM2, "efectivo", false, false);
    interpretarCampos(NUM2, "a las 10:30", false, false);
    const f = siguienteCampoFaltante(NUM2, false, false);
    assert.equal(f, null);
    _mapa.delete(NUM2);
  });
});

describe("interpretarCampos — conversación natural", () => {
  test("limpia el prefijo 'me llamo' del nombre", () => {
    const numero = "3310000010@c.us";
    _mapa.delete(numero);
    const campos = interpretarCampos(numero, "Me llamo Juan Pérez", false, false);
    assert.equal(campos.nombre, "Juan Pérez");
    _mapa.delete(numero);
  });

  test("captura hora para un pedido normal, no solo preventa", () => {
    const numero = "3310000011@c.us";
    _mapa.delete(numero);
    const campos = interpretarCampos(numero, "paso a recoger a las nueve y media", false, false);
    assert.equal(campos.hora, "9:30 a.m.");
    _mapa.delete(numero);
  });

  test("captura datos completos progresivamente con lenguaje natural", () => {
    const numero = "3310000012@c.us";
    _mapa.delete(numero);
    interpretarCampos(numero, "Mi nombre es Ana López", true, false);
    interpretarCampos(numero, "311 234 5678", true, false);
    interpretarCampos(numero, "Av. México 123, Col. Centro", true, false);
    interpretarCampos(numero, "pago al recibir", true, false);
    const campos = interpretarCampos(numero, "quiero la entrega a las 11 am", true, false);
    assert.equal(campos.nombre, "Ana López");
    assert.equal(campos.telefono, "3112345678");
    assert.match(campos.calle, /México 123/i);
    assert.match(campos.colonia, /Centro/i);
    assert.equal(campos.metodo, "efectivo");
    assert.equal(campos.hora, "11:00 a.m.");
    _mapa.delete(numero);
  });

  test("respeta los métodos habilitados por el tenant", () => {
    const numero = "3310000013@c.us";
    setConfig("metodos_mostrador", "efectivo o transferencia");
    _mapa.delete(numero);
    assert.equal(interpretarCampos(numero, "pago con tarjeta", false, false).metodo, null);
    assert.equal(interpretarCampos(numero, "pago con SPEI", false, false).metodo, "transferencia");
    setConfig("metodos_mostrador", "efectivo, tarjeta o transferencia");
    _mapa.delete(numero);
  });
});
