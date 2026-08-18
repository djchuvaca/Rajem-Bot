"use strict";
/**
 * tests/legacy-tracker.test.js
 * Fase 8 — Etapa 4: verificar que la instrumentación de rutas antiguas funciona.
 *
 * Objetivos:
 *   - Confirmar que el tracker detecta llamadas a código legacy.
 *   - Verificar que el contador aumenta con cada llamada.
 *   - Verificar que el buffer registra contexto.
 *   - Confirmar que al migrar (no llamar la ruta legacy), el contador queda en 0.
 *   - Verificar que getPrecios() y calcularPrecioItem() están instrumentados.
 */

process.env.BOT_TEST_MODE = "1";

const { test, describe, before, beforeEach } = require("node:test");
const assert = require("node:assert/strict");

const tracker = require("../src/migration/legacy-tracker");
const { initDB } = require("../src/db/core");
const { seedDB } = require("../src/db/seed");

before(async () => {
  await initDB();
  await seedDB();
});

beforeEach(() => {
  tracker.resetearContadores();
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECCIÓN 1 — El tracker funciona por sí mismo
// ═══════════════════════════════════════════════════════════════════════════════

describe("Legacy tracker — comportamiento base", () => {
  test("contador empieza en 0 para cualquier nombre", () => {
    assert.equal(tracker.obtenerContador("cualquierFuncion"), 0);
  });

  test("registrar() incrementa el contador", () => {
    tracker.registrar("miFuncionLegacy");
    assert.equal(tracker.obtenerContador("miFuncionLegacy"), 1);
    tracker.registrar("miFuncionLegacy");
    assert.equal(tracker.obtenerContador("miFuncionLegacy"), 2);
  });

  test("contadores son independientes por nombre", () => {
    tracker.registrar("funcA");
    tracker.registrar("funcA");
    tracker.registrar("funcB");
    assert.equal(tracker.obtenerContador("funcA"), 2);
    assert.equal(tracker.obtenerContador("funcB"), 1);
    assert.equal(tracker.obtenerContador("funcC"), 0);
  });

  test("obtenerContadores() devuelve todos los activos", () => {
    tracker.registrar("alfa");
    tracker.registrar("beta");
    tracker.registrar("alfa");
    const todos = tracker.obtenerContadores();
    assert.equal(todos.alfa, 2);
    assert.equal(todos.beta, 1);
    assert.ok(!("gamma" in todos));
  });

  test("resetearContadores() limpia todo", () => {
    tracker.registrar("X");
    tracker.registrar("Y");
    tracker.resetearContadores();
    assert.deepEqual(tracker.obtenerContadores(), {});
    assert.deepEqual(tracker.obtenerBuffer(), []);
  });

  test("el buffer registra las llamadas con timestamp", () => {
    const antes = Date.now();
    tracker.registrar("miFunc");
    const buf = tracker.obtenerBuffer(1);
    assert.equal(buf.length, 1);
    assert.equal(buf[0].nombre, "miFunc");
    assert.ok(buf[0].ts >= antes);
  });

  test("el buffer acepta contexto adicional (sin datos sensibles)", () => {
    tracker.registrar("getPrecios", { origen: "orden.js", linea: 117 });
    const buf = tracker.obtenerBuffer(1);
    assert.equal(buf[0].ctx?.origen, "orden.js");
  });

  test("el buffer no supera BUFFER_MAX (500) entradas", () => {
    for (let i = 0; i < 600; i++) tracker.registrar("spam");
    assert.ok(tracker.obtenerBuffer(1000).length <= 500);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECCIÓN 2 — getPrecios() y calcularPrecioItem() están instrumentados
// ═══════════════════════════════════════════════════════════════════════════════

describe("Instrumentación de rutas legacy de precios", () => {
  test("getPrecios() incrementa el contador 'getPrecios'", () => {
    const { getPrecios } = require("../src/pedido/precios");
    tracker.resetearContadores();
    getPrecios();
    assert.equal(tracker.obtenerContador("getPrecios"), 1,
      "getPrecios() debe registrar una llamada legacy"
    );
    getPrecios();
    assert.equal(tracker.obtenerContador("getPrecios"), 2);
  });

  test("calcularPrecioItem() incrementa el contador 'calcularPrecioItem'", () => {
    const { getPrecios, calcularPrecioItem } = require("../src/pedido/precios");
    tracker.resetearContadores();
    const precios = getPrecios();
    tracker.resetearContadores(); // resetear después de getPrecios para aislar
    calcularPrecioItem({ presentacion: "taco", corte: "surtido", cantidad: 2 }, precios);
    assert.equal(tracker.obtenerContador("calcularPrecioItem"), 1);
  });

  test("el motor neutral del Giro NO incrementa el contador legacy", () => {
    const { getContratoGiro } = require("../src/giros");
    tracker.resetearContadores();

    const contrato = getContratoGiro("taqueria");
    const partida = {
      tipo: "producto", formatoSlug: "taco", productoSlug: "surtido",
      cantidad: { tipo: "unidad", valor: 3 }, combinacion: [], extras: [], metadata: {},
    };
    contrato.calcularPrecioPartida(partida);

    // El motor neutral no debe tocar el API legacy
    assert.equal(tracker.obtenerContador("getPrecios"), 0,
      "el motor de precios del Giro no debe llamar a getPrecios()"
    );
    assert.equal(tracker.obtenerContador("calcularPrecioItem"), 0,
      "el motor de precios del Giro no debe llamar a calcularPrecioItem()"
    );
  });

  test("el contrato del Giro calcula precios sin pasar por la ruta legacy", () => {
    const { getContratoGiro } = require("../src/giros");
    const { getPrecios, calcularPrecioItem } = require("../src/pedido/precios");
    tracker.resetearContadores();

    // Calcular via legacy
    const precios = getPrecios();
    const pLegacy = calcularPrecioItem({ presentacion: "taco", corte: "surtido", cantidad: 2 }, precios);
    const contadoresLegacy = { ...tracker.obtenerContadores() };

    tracker.resetearContadores();

    // Calcular via contrato neutral
    const contrato = getContratoGiro("taqueria");
    const partida = {
      tipo: "producto", formatoSlug: "taco", productoSlug: "surtido",
      cantidad: { tipo: "unidad", valor: 2 }, combinacion: [], extras: [], metadata: {},
    };
    const pNeutral = contrato.calcularPrecioPartida(partida);
    const contadoresNeutral = tracker.obtenerContadores();

    // Los precios deben coincidir
    assert.equal(pLegacy, pNeutral, "los precios calculados deben ser equivalentes");

    // La ruta neutral no debe tocar el tracker
    assert.equal(contadoresNeutral.getPrecios || 0, 0);
    assert.equal(contadoresNeutral.calcularPrecioItem || 0, 0);

    // La ruta legacy sí lo toca
    assert.ok(contadoresLegacy.getPrecios > 0);
    assert.ok(contadoresLegacy.calcularPrecioItem > 0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECCIÓN 3 — Periodo de observación: ausencia de uso = candidato a eliminar
// ═══════════════════════════════════════════════════════════════════════════════

describe("Periodo de observación — semántica del tracker", () => {
  test("contador en 0 después de un ciclo = ruta no utilizada (candidata a eliminar)", () => {
    // Simular una operación completa usando solo el motor neutral
    const { getContratoGiro } = require("../src/giros");
    tracker.resetearContadores();

    const contrato = getContratoGiro("taqueria");
    contrato.calcularPrecioPartida({
      tipo: "producto", formatoSlug: "taco", productoSlug: "surtido",
      cantidad: { tipo: "unidad", valor: 1 }, combinacion: [], extras: [], metadata: {},
    });

    const contadores = tracker.obtenerContadores();
    // Si en el futuro los contadores son todos 0 tras un ciclo completo,
    // las rutas legacy son candidatas a eliminar.
    assert.equal(contadores.getPrecios || 0, 0,
      "ruta getPrecios no utilizada en este ciclo — candidata a eliminar en Etapa 10"
    );
  });

  test("obtenerBuffer muestra el nombre de cada función legacy llamada", () => {
    const { getPrecios } = require("../src/pedido/precios");
    tracker.resetearContadores();
    getPrecios();
    const buf = tracker.obtenerBuffer();
    assert.ok(buf.some(e => e.nombre === "getPrecios"),
      "el buffer debe registrar 'getPrecios'"
    );
  });
});
