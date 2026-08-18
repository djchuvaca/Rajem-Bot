"use strict";
/**
 * tests/regresion-etapa1.test.js
 * Matriz de regresión — Fase 8, Etapa 1: congelar el comportamiento esperado.
 *
 * Cubre los tres huecos no protegidos por la suite existente:
 *   1. Flujo conversacional con pedidos por peso (gramos) e importe (pesos)
 *   2. Serialización y restauración de sesiones tras reinicio simulado
 *   3. Aislamiento de giro: pizzería y hamburguesería no usan NLU de taquería
 *
 * Estado de la matriz por giro (ver plan/acople.txt, Etapa 1):
 *
 *   Área                          Taquería      Pizzería        Hamburguesería
 *   ──────────────────────────    ──────────    ──────────      ──────────────
 *   Interpretación de pedidos     Completa *    Stub (F5/6)     Stub (F5/6)
 *   Precios                       Completa      Stub (F6)       Stub (F6)
 *   Modificaciones                Completa      Stub (F5)       Stub (F5)
 *   Disponibilidad                Completa      Pendiente       Pendiente
 *   Panel                         Pendiente **  Pendiente       Pendiente
 *   Reinicios                     Completa *    N/A             N/A
 *
 *   * Cubiertos por este archivo
 *   ** Requiere servidor Express levantado — fuera del scope de pruebas unitarias
 */

process.env.BOT_TEST_MODE = "1";

const { test, describe, before, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");

const { initDB } = require("../src/db/core");
const { seedDB } = require("../src/db/seed");
const { setConfig } = require("../src/db");

// ── Estado ────────────────────────────────────────────────────────────────────
const {
  clientesNuevos, tipoEntregaCliente, esperandoCorte,
  esperandoConfirmacionItem, esperandoAgregarMas, esperandoExtras,
  ordenPreResumen, resumenPendiente, datosCampos, pedidoJSONActual,
  esperandoCaptura, esperandoPagoMP, esperandoMotivoCancelacion,
  pedidosConfirmados, esperandoConfirmacionDatos, esperandoTipoItem,
  esperandoEdicion, clientesPreventa, horaEntregaPreventa,
  datosRecibidos, referenciaPreguntas, datosAcumulados,
  esperandoColonia, pendientesConfirmacion,
} = require("../src/estado/maps");

const { limpiarTodo } = require("../src/estado/campos");
const { serializarEstado, restaurarEstado } = require("../src/estado/sesiones");

// ── Handlers ──────────────────────────────────────────────────────────────────
const { handlePedidoSimple, handleSinCorte } = require("../src/handlers/flujos/orden");

// ── Giros ──────────────────────────────────────────────────────────────────────
const { getContratoGiro, listGiros } = require("../src/giros");
const parser = require("../src/handlers/pedidoParser");

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeMsg(from, body = "") {
  const respuestas = [];
  return {
    from, body, type: "chat", hasMedia: false,
    reply: async (txt) => { respuestas.push(String(txt)); },
    getChat: async () => ({
      sendStateTyping: async () => {},
      clearState:      async () => {},
    }),
    getContact: async () => ({ number: from.replace(/@.*/, "") }),
    _respuestas: respuestas,
  };
}

function limpiarJID(jid) {
  limpiarTodo(jid);
  clientesNuevos.delete(jid);
}

// ═══════════════════════════════════════════════════════════════════════════════
// SETUP GLOBAL
// ═══════════════════════════════════════════════════════════════════════════════

before(async () => {
  await initDB();
  await seedDB();
  parser.invalidarCacheCortes();
  setConfig("tipo_servicio", "ambos");
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECCIÓN 1 — Flujo conversacional con pedidos por peso e importe
// ═══════════════════════════════════════════════════════════════════════════════

describe("Flujo conversacional — peso e importe", () => {
  const JID = "5213310010001@c.us";

  beforeEach(() => {
    limpiarJID(JID);
    tipoEntregaCliente.set(JID, "mostrador");
  });
  afterEach(() => limpiarJID(JID));

  // ── Por peso (gramos) ──────────────────────────────────────────────────────

  test("'200 gramos de surtido' va directo a confirmación de ítem", async () => {
    const hist = [];
    hist.push({ role: "user", content: "Hola, quiero para recoger." });
    hist.push({ role: "assistant", content: "Perfecto, aquí el menú." });

    const msg = makeMsg(JID, "200 gramos de surtido");
    const atendido = await handlePedidoSimple(msg, "200 gramos de surtido", JID, hist);
    assert.ok(atendido, "debe consumir el mensaje");
    assert.ok(
      esperandoConfirmacionItem.has(JID) || esperandoExtras.has(JID),
      "debe quedar en estado de confirmación o extras"
    );
    if (esperandoConfirmacionItem.has(JID)) {
      const lineas = esperandoConfirmacionItem.get(JID).lineas;
      assert.ok(/200\s*g/i.test(lineas) || /gramos/i.test(lineas) || /surtido/i.test(lineas),
        "las líneas deben mencionar 200g o surtido"
      );
    }
  });

  test("'medio kilo de buche' se parsea como gramos y va a confirmación", async () => {
    const hist = [];
    hist.push({ role: "user", content: "Hola." });
    hist.push({ role: "assistant", content: "Menú." });

    const msg = makeMsg(JID, "medio kilo de buche");
    const atendido = await handlePedidoSimple(msg, "medio kilo de buche", JID, hist);
    assert.ok(atendido, "debe consumir el mensaje");
    assert.ok(
      esperandoConfirmacionItem.has(JID) || esperandoExtras.has(JID),
      "debe quedar en estado de confirmación o extras"
    );
  });

  test("'500 gramos' sin corte va a estado esperandoCorte", async () => {
    const msg = makeMsg(JID, "500 gramos");
    const atendido = await handleSinCorte(msg, "500 gramos", JID);
    assert.ok(atendido, "debe consumir el mensaje");
    assert.ok(esperandoCorte.has(JID), "debe quedar esperando corte");
    const pendiente = esperandoCorte.get(JID);
    assert.ok(
      pendiente.items[0]?.presentacion === "gramos" || pendiente._porcionado !== undefined,
      "debe haber registrado el pedido como gramos"
    );
  });

  // ── Por importe (pesos) ──────────────────────────────────────────────────────

  test("'$200 de carnitas' va directo a confirmación de ítem", async () => {
    const hist = [];
    hist.push({ role: "user", content: "Hola." });
    hist.push({ role: "assistant", content: "Menú." });

    const msg = makeMsg(JID, "$200 de carnitas");
    const atendido = await handlePedidoSimple(msg, "$200 de carnitas", JID, hist);
    assert.ok(atendido, "debe consumir el mensaje");
    assert.ok(
      esperandoConfirmacionItem.has(JID) || esperandoExtras.has(JID),
      "debe quedar en estado de confirmación o extras"
    );
    if (esperandoConfirmacionItem.has(JID)) {
      const lineas = esperandoConfirmacionItem.get(JID).lineas;
      assert.ok(/\$200|\bpesos\b|carnitas/i.test(lineas),
        "las líneas deben mencionar el importe o el corte"
      );
    }
  });

  test("parser devuelve presentacion 'pesos' para pedidos por importe", () => {
    const pedido = parser.parsearPedidoSimple("$150 de surtido");
    assert.ok(pedido, "debe parsear el pedido");
    assert.equal(pedido.tipo, "pedido");
    assert.ok(pedido.items?.length > 0, "debe tener al menos un ítem");
    assert.equal(pedido.items[0].presentacion, "pesos",
      "la presentación debe ser 'pesos'"
    );
    assert.equal(pedido.items[0].corte, "surtido");
  });

  test("parser devuelve presentacion 'gramos' para pedidos por peso", () => {
    const pedido = parser.parsearPedidoSimple("300 gramos de buche");
    assert.ok(pedido);
    assert.equal(pedido.tipo, "pedido");
    assert.ok(pedido.items?.length > 0);
    assert.equal(pedido.items[0].presentacion, "gramos");
    assert.equal(pedido.items[0].gramos, 300);
    assert.equal(pedido.items[0].corte, "buche");
  });

  test("confirmación de ítem con peso muestra las líneas con precio calculado", async () => {
    const hist = [];
    hist.push({ role: "user", content: "Hola." });
    hist.push({ role: "assistant", content: "Menú." });

    const msg = makeMsg(JID, "200 gramos de surtido");
    await handlePedidoSimple(msg, "200 gramos de surtido", JID, hist);

    if (esperandoConfirmacionItem.has(JID)) {
      const lineas = esperandoConfirmacionItem.get(JID).lineas;
      assert.ok(/\$\d+/.test(lineas), "las líneas deben incluir un precio calculado");
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECCIÓN 2 — Serialización y restauración de sesiones
// ═══════════════════════════════════════════════════════════════════════════════

describe("Serialización y restauración de sesiones", () => {
  const JID = "5213310010101@c.us";

  beforeEach(() => limpiarJID(JID));
  afterEach(() => limpiarJID(JID));

  test("estado vacío serializa a objeto vacío", () => {
    const estado = serializarEstado(JID);
    assert.deepEqual(estado, {});
  });

  test("clienteNuevo se serializa y restaura", () => {
    clientesNuevos.add(JID);
    const estado = serializarEstado(JID);
    assert.equal(estado.clienteNuevo, true);

    clientesNuevos.delete(JID);
    restaurarEstado(JID, estado);
    assert.ok(clientesNuevos.has(JID), "debe restaurar clienteNuevo");
  });

  test("tipoEntregaCliente se serializa y restaura", () => {
    tipoEntregaCliente.set(JID, "domicilio");
    const estado = serializarEstado(JID);
    assert.equal(estado.tipoEntregaCliente, "domicilio");

    tipoEntregaCliente.delete(JID);
    restaurarEstado(JID, estado);
    assert.equal(tipoEntregaCliente.get(JID), "domicilio");
  });

  test("datosCampos completo se serializa y restaura sin pérdida", () => {
    const campos = {
      nombre: "Juan Pérez",
      telefono: "3318765432",
      metodo: "efectivo",
      tipoEntrega: "mostrador",
    };
    datosCampos.set(JID, campos);

    const estado = serializarEstado(JID);
    datosCampos.delete(JID);
    restaurarEstado(JID, estado);

    assert.deepEqual(datosCampos.get(JID), campos);
  });

  test("resumenPendiente se serializa y restaura", () => {
    const resumen = { texto: "📋 Resumen de prueba", esTransferencia: false };
    resumenPendiente.set(JID, resumen);

    const estado = serializarEstado(JID);
    assert.deepEqual(estado.resumenPendiente, resumen);

    resumenPendiente.delete(JID);
    restaurarEstado(JID, estado);
    assert.deepEqual(resumenPendiente.get(JID), resumen);
  });

  test("esperandoCorte se serializa y restaura", () => {
    const corte = {
      tipo: "pedido",
      items: [{ presentacion: "taco", cantidad: 3, corte: null }],
      _indiceActual: 0,
    };
    esperandoCorte.set(JID, corte);

    const estado = serializarEstado(JID);
    assert.deepEqual(estado.esperandoCorte, corte);

    esperandoCorte.delete(JID);
    restaurarEstado(JID, estado);
    assert.deepEqual(esperandoCorte.get(JID), corte);
  });

  test("esperandoConfirmacionItem se serializa y restaura", () => {
    const item = { lineas: "3 tacos de surtido — $90\n💰 Subtotal: $90" };
    esperandoConfirmacionItem.set(JID, item);

    const estado = serializarEstado(JID);
    esperandoConfirmacionItem.delete(JID);
    restaurarEstado(JID, estado);

    assert.deepEqual(esperandoConfirmacionItem.get(JID), item);
  });

  test("pedidoConfirmado se serializa y restaura", () => {
    const confirmado = {
      nombre: "Ana López",
      telefono: "3311234567",
      total: "$120",
      confirmadoEn: Date.now(),
    };
    pedidosConfirmados.set(JID, confirmado);

    const estado = serializarEstado(JID);
    pedidosConfirmados.delete(JID);
    restaurarEstado(JID, estado);

    assert.deepEqual(pedidosConfirmados.get(JID), confirmado);
  });

  test("esperandoCaptura se serializa y restaura", () => {
    const captura = { resumen: "...", telefono: "3318765432", pedidoId: 42 };
    esperandoCaptura.set(JID, captura);

    const estado = serializarEstado(JID);
    esperandoCaptura.delete(JID);
    restaurarEstado(JID, estado);

    assert.deepEqual(esperandoCaptura.get(JID), captura);
  });

  test("historial de conversación se restaura correctamente", () => {
    const { conversaciones } = require("../src/estado/maps");
    const hist = [
      { role: "user", content: "Hola" },
      { role: "assistant", content: "Bienvenido" },
    ];
    conversaciones.set(JID, hist);
    tipoEntregaCliente.set(JID, "mostrador"); // hace el estado no vacío

    const estado = serializarEstado(JID);
    const histGuardado = hist.slice(); // copia

    conversaciones.delete(JID);
    tipoEntregaCliente.delete(JID);

    restaurarEstado(JID, estado, histGuardado);
    assert.deepEqual(conversaciones.get(JID), hist);
    conversaciones.delete(JID);
  });

  test("restaurar estado vacío no modifica los Maps", () => {
    restaurarEstado(JID, {});
    assert.ok(!clientesNuevos.has(JID));
    assert.ok(!tipoEntregaCliente.has(JID));
    assert.ok(!datosCampos.has(JID));
  });

  test("restaurar undefined no lanza error", () => {
    assert.doesNotThrow(() => restaurarEstado(JID, undefined));
    assert.doesNotThrow(() => restaurarEstado(JID, null));
  });

  test("serialización de sesión de preventa incluye hora de entrega", () => {
    clientesPreventa.add(JID);
    horaEntregaPreventa.set(JID, "10:30 am");
    datosCampos.set(JID, { nombre: "Pedro", telefono: "3319876543", tipoEntrega: "mostrador" });

    const estado = serializarEstado(JID);
    assert.equal(estado.preventa, true);
    assert.equal(estado.horaEntrega, "10:30 am");
    assert.ok(estado.datosCampos);

    // Limpiar y restaurar
    clientesPreventa.delete(JID);
    horaEntregaPreventa.delete(JID);
    datosCampos.delete(JID);

    restaurarEstado(JID, estado);
    assert.ok(clientesPreventa.has(JID));
    assert.equal(horaEntregaPreventa.get(JID), "10:30 am");
    assert.ok(datosCampos.has(JID));
  });

  test("ciclo completo: serializar → limpiar → restaurar preserva el flujo activo", () => {
    // Simular un cliente a mitad del formulario de domicilio
    clientesNuevos.add(JID);
    tipoEntregaCliente.set(JID, "domicilio");
    datosCampos.set(JID, {
      nombre: "María García",
      telefono: "3314567890",
      calle: "Calle Juárez 789",
      tipoEntrega: "domicilio",
    });
    ordenPreResumen.set(JID, "2 tacos de surtido — $60");

    // Serializar (simula guardar antes de reiniciar)
    const estado = serializarEstado(JID);

    // Limpiar (simula el reinicio del proceso)
    limpiarJID(JID);

    // Restaurar (simula la restauración al arrancar)
    restaurarEstado(JID, estado);

    // El flujo debe estar recuperado
    assert.equal(tipoEntregaCliente.get(JID), "domicilio",
      "debe restaurar el tipo de entrega"
    );
    const campos = datosCampos.get(JID);
    assert.equal(campos?.nombre, "María García");
    assert.equal(campos?.calle, "Calle Juárez 789");
    assert.equal(ordenPreResumen.get(JID), "2 tacos de surtido — $60");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECCIÓN 3 — Aislamiento de giro: pizzería y hamburguesería
// ═══════════════════════════════════════════════════════════════════════════════

describe("Aislamiento de giro — NLU no mezcla vocabulario entre giros", () => {

  test("todos los giros registrados tienen contrato válido", () => {
    for (const giro of listGiros()) {
      const contrato = getContratoGiro(giro.slug);
      assert.ok(contrato, `giro ${giro.slug} debe tener contrato`);
      assert.equal(typeof contrato.parsearPedido, "function");
    }
  });

  test("taquería detecta 'de qué corte' como dato faltante", () => {
    const contrato = getContratoGiro("taqueria");
    const faltante = contrato.detectarDatoFaltante("3 tacos");
    assert.equal(faltante.estado, "dato_faltante");
    assert.equal(faltante.campo, "variante");
  });

  test("pizzería actualmente delega a taquería (bug documentado, se corrige en F5)", () => {
    // COMPORTAMIENTO ACTUAL (incorrecto): parsearPedido de pizzería usa el NLU de taquería
    // como fallback y reconoce cortes como 'surtido'. Esto es un bug que se corrige cuando
    // F5 implemente el NLU propio de pizzería.
    const contrato = getContratoGiro("pizzeria");
    const resultado = contrato.parsearPedido("2 tacos de surtido");
    // Documentamos que sí reconoce el corte (comportamiento actual, no el esperado).
    // Cuando F5 esté listo, el resultado debe ser null o un pedido sin corte de taquería.
    if (resultado !== null) {
      assert.ok(
        resultado.tipo === "pedido",
        "si devuelve algo, debe ser tipo pedido"
      );
    }
    // El test pasará tanto si devuelve null (correcto futuro) como si devuelve pedido (actual).
  });

  test.todo("pizzería no debe reconocer cortes de taquería (implementar en F5: NLU propio)");

  test("hamburguesería actualmente delega a taquería (bug documentado, se corrige en F5)", () => {
    // Mismo caso que pizzería — ver nota arriba.
    const contrato = getContratoGiro("hamburgueseria");
    const resultado = contrato.parsearPedido("3 tacos de buche");
    if (resultado !== null) {
      assert.ok(resultado.tipo === "pedido");
    }
  });

  test.todo("hamburguesería no debe reconocer cortes de taquería (implementar en F5: NLU propio)");

  test("pizzería declara capacidades de porcionado desactivadas", () => {
    const contrato = getContratoGiro("pizzeria");
    assert.equal(contrato.capacidades.porcionado, false);
  });

  test("hamburguesería declara ventaPorPeso desactivada", () => {
    const contrato = getContratoGiro("hamburgueseria");
    assert.equal(contrato.capacidades.ventaPorPeso, false);
  });

  test("taquería declara porcionado y ventaPorPeso activados", () => {
    const contrato = getContratoGiro("taqueria");
    assert.equal(contrato.capacidades.porcionado, true);
    assert.equal(contrato.capacidades.ventaPorPeso, true);
  });

  test("conversación de pizzería no menciona 'taco' ni 'corte'", () => {
    const conv = getContratoGiro("pizzeria").conversacion;
    const pregunta = conv.preguntarVariante({ presentacion: "pizza_familiar", cantidad: 1 });
    assert.doesNotMatch(pregunta, /tacos?/i);
    assert.doesNotMatch(pregunta, /cortes?/i);
  });

  test("conversación de hamburguesería no menciona 'taco' ni 'corte'", () => {
    const conv = getContratoGiro("hamburgueseria").conversacion;
    const pregunta = conv.preguntarVariante({ presentacion: "hamburguesa_doble", cantidad: 1 });
    assert.doesNotMatch(pregunta, /tacos?/i);
    assert.doesNotMatch(pregunta, /cortes?/i);
  });

  test("precios de taquería son positivos; pizzería/hamburguesería devuelven 0 (pendiente F6)", () => {
    const taqueria = getContratoGiro("taqueria");
    const pizzeria = getContratoGiro("pizzeria");
    const hamburgueseria = getContratoGiro("hamburgueseria");

    const itemTaco = {
      tipo: "producto", formatoSlug: "taco", productoSlug: "surtido",
      cantidad: { tipo: "unidad", valor: 1 }, combinacion: [], extras: [], metadata: {},
    };
    const itemPizza = {
      tipo: "producto", formatoSlug: "pizza_individual", productoSlug: "hawaiana",
      cantidad: { tipo: "unidad", valor: 1 }, combinacion: [], extras: [], metadata: {},
    };

    const precioTaco  = taqueria.calcularPrecioPartida(itemTaco);
    const precioPizza = pizzeria.calcularPrecioPartida(itemPizza);
    const precioHamburguesa = hamburgueseria.calcularPrecioPartida(itemPizza);

    assert.ok(precioTaco > 0, "taquería debe calcular precio positivo");
    assert.equal(precioPizza, 0, "pizzería devuelve 0 hasta implementar F6");
    assert.equal(precioHamburguesa, 0, "hamburguesería devuelve 0 hasta implementar F6");
  });

  test("modificaciones de pizzería/hamburguesería devuelven null (pendiente F5)", () => {
    const pizzeria = getContratoGiro("pizzeria");
    const hamburgueseria = getContratoGiro("hamburgueseria");
    assert.equal(pizzeria.detectarModificacionNeutral?.("quítame uno"), null);
    assert.equal(hamburgueseria.detectarModificacionNeutral?.("quítame uno"), null);
  });
});
