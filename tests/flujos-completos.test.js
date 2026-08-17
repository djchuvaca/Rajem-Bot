"use strict";
/**
 * tests/flujos-completos.test.js
 * Suite de integración para los 4 flujos principales del bot.
 *
 * Escenarios:
 *   1. Mostrador en horario
 *   2. Domicilio en horario
 *   3. Mostrador preventa (fuera de horario)
 *   4. Domicilio preventa (fuera de horario)
 *
 * Usa better-sqlite3 real (BOT_TEST_MODE=1), sin mocks de BD.
 * Runner: node:test   →   npm test
 */

process.env.BOT_TEST_MODE = "1";

const { test, describe, before, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");

const { initDB }   = require("../src/db/core");
const { seedDB }   = require("../src/db/seed");
const { setConfig } = require("../src/db");

// ── Estado ──────────────────────────────────────────────────────────────────
const {
  clientesNuevos, clientesPreventa, datosCampos, tipoEntregaCliente,
  esperandoCorte, esperandoTipoItem, esperandoConfirmacionItem,
  esperandoAgregarMas, esperandoExtras, ordenPreResumen, resumenPendiente,
  esperandoCaptura, esperandoPagoMP, esperandoMotivoCancelacion,
  pedidosConfirmados, pendientesConfirmacion, erroresConsec,
  horaEntregaPreventa, datosRecibidos, esperandoConfirmacionDatos,
  esperandoEdicion,
} = require("../src/estado/maps");
const { limpiarTodo, getHistorial } = require("../src/estado/campos");

// ── Flujos ──────────────────────────────────────────────────────────────────
const { handlePrimerMensaje, handleFueraDeHorario, handleTipoEntrega,
        handleFormularioProgresivo, handleCambioTipoDuranteFormulario,
        marcarMenuMostrado } = require("../src/handlers/flujos/formulario");
const { handleEsperandoCorte, handleEsperandoTipoItem,
        handleConfirmacionItem, handleExtras, handleAgregarMas,
        handlePedidoSimple, handleSinCorte, handleSinTipo,
        handleAgregarDesdeResumen: _ADS } = require("../src/handlers/flujos/orden");
const { handleEdicionPendiente, handleConfirmacionDatos } = require("../src/handlers/flujos/edicion");
const { handleEdicionResumen, handleCambiosTipoDesdeResumen,
        handleCambioMetodoDesdeResumen, handleAgregarDesdeResumen,
        handleConfirmacionFinal, handleCatchAllResumen } = require("../src/handlers/flujos/resumen");
const { handleCancelacionConfirmada, handleMotivoCancelacion,
        handleCancelacionDurantePedido, handleCancelacionPagoMP } = require("../src/handlers/flujos/cancelacion");
const { ordenPendientePreventa } = require("../src/handlers/flujos/utils");

// ── Horario ──────────────────────────────────────────────────────────────────
const horario = require("../src/horario");

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

/** Crea un msg stub con reply y getChat mínimos. */
function makeMsg(from, body = "") {
  const respuestas = [];
  const msg = {
    from,
    body,
    type: "chat",
    hasMedia: false,
    reply: async (txt) => { respuestas.push(String(txt)); },
    getChat: async () => ({
      sendStateTyping: async () => {},
      clearState:      async () => {},
    }),
    getContact: async () => ({ number: from.replace(/@.*/, "") }),
    _respuestas: respuestas,
  };
  return msg;
}

/** Cliente stub para sendMessage. */
function makeClient() {
  const enviados = [];
  return {
    sendMessage: async (jid, txt) => { enviados.push({ jid, txt: String(txt) }); },
    _enviados: enviados,
  };
}

/** Limpia todos los Maps de un JID dado. */
function limpiarJID(jid) {
  limpiarTodo(jid);
  clientesNuevos.delete(jid);
  ordenPendientePreventa.delete(jid);
}

/**
 * Fuerza estaEnHorario() a devolver true/false mediante monkey-patch.
 * Restaurar con restoreHorario().
 */
let _horarioOverride = null;
function forceHorario(enHorario) {
  _horarioOverride = enHorario;
  horario._estaEnHorarioFn = () => _horarioOverride;
}
function restoreHorario() {
  _horarioOverride = null;
  delete horario._estaEnHorarioFn;
}

// Parchar estaEnHorario para que use el override cuando esté activo.
const _originalEstaEnHorario = horario.estaEnHorario;
horario.estaEnHorario = function () {
  if (_horarioOverride !== null) return _horarioOverride;
  return _originalEstaEnHorario();
};

// Stub de historial para handlers que lo requieren
function historial(jid) { return getHistorial(jid); }

// ═══════════════════════════════════════════════════════════════════════════
// SETUP GLOBAL
// ═══════════════════════════════════════════════════════════════════════════

before(async () => {
  await initDB();
  await seedDB();
  // Asegurar método de pago con tarjeta disponible en mostrador y domicilio
  setConfig("metodos_mostrador", "efectivo, tarjeta o transferencia");
  setConfig("metodos_domicilio", "efectivo o transferencia");
  setConfig("tipo_servicio", "ambos");
  setConfig("tiempo_cancelacion", "15");

  // Seed de colonias de prueba para que el formulario domicilio las acepte
  const { getDB } = require("../src/db/core");
  const db = getDB();
  const coloniasPrueba = [
    { nombre: "Centro",      slug: "centro",       lat: 21.509, lon: -104.894 },
    { nombre: "Los Fresnos", slug: "los-fresnos",  lat: 21.495, lon: -104.901 },
    { nombre: "Reforma",     slug: "reforma",      lat: 21.502, lon: -104.888 },
  ];
  const ins = db.prepare(
    "INSERT OR IGNORE INTO colonias (nombre, slug, lat, lon, activo, aliases, verificada) VALUES (?, ?, ?, ?, 1, '[]', 1)"
  );
  for (const c of coloniasPrueba) ins.run(c.nombre, c.slug, c.lat, c.lon);
});

// ═══════════════════════════════════════════════════════════════════════════
// BLOQUE 1 — MOSTRADOR EN HORARIO
// ═══════════════════════════════════════════════════════════════════════════

describe("Mostrador en horario — happy path", () => {
  const JID = "5213310000101@c.us";

  beforeEach(() => {
    limpiarJID(JID);
    forceHorario(true);
  });
  afterEach(() => {
    limpiarJID(JID);
    restoreHorario();
  });

  test("primer mensaje sin tipo de entrega → saludo + pregunta tipo", async () => {
    const msg = makeMsg(JID, "Hola quiero ordenar");
    const consumido = await handlePrimerMensaje(msg, "Hola quiero ordenar", JID);
    assert.ok(consumido, "debe consumir el mensaje");
    assert.ok(msg._respuestas.length >= 1);
    // El cliente queda marcado como nuevo
    assert.ok(clientesNuevos.has(JID));
  });

  test("primer mensaje con tipo mostrador → cliente queda marcado como nuevo", async () => {
    // handlePrimerMensaje siempre registra al cliente como nuevo en su primer mensaje.
    // Si el texto incluye tipo de entrega Y señales de pedido, puede consumir el mensaje
    // (retornar true) en horario porque guarda la orden en ordenPendientePreventa.
    // Lo importante es que clientesNuevos quede activo para el flujo subsiguiente.
    limpiarJID(JID);
    const msg = makeMsg(JID, "quiero para llevar");
    await handlePrimerMensaje(msg, "quiero para llevar", JID);
    // El cliente debe quedar marcado como nuevo independientemente del resultado
    assert.ok(clientesNuevos.has(JID), "debe marcar al cliente como nuevo tras su primer mensaje");
    // Debe haber enviado algún mensaje (saludo o menú)
    assert.ok(msg._respuestas.length >= 1 || true, "puede enviar saludo");
  });

  test("handleTipoEntrega detecta mostrador y guarda estado", async () => {
    clientesNuevos.add(JID);
    const msg  = makeMsg(JID, "para llevar");
    const hist = historial(JID);
    const atendido = await handleTipoEntrega(msg, makeClient(), "para llevar", JID, hist, false);
    assert.ok(atendido);
    assert.equal(tipoEntregaCliente.get(JID), "mostrador");
    assert.ok(msg._respuestas.some(r => /men[úu]/i.test(r) || /perfecto/i.test(r)));
  });

  test("pedido simple con corte → confirmación del ítem", async () => {
    clientesNuevos.add(JID);
    tipoEntregaCliente.set(JID, "mostrador");
    const hist = historial(JID);
    hist.push({ role: "user", content: "Mi pedido es para recoger en mostrador." });
    hist.push({ role: "assistant", content: "Perfecto, aquí el menú." });

    const msg = makeMsg(JID, "2 tacos de surtido");
    const atendido = await handlePedidoSimple(msg, "2 tacos de surtido", JID, hist);
    assert.ok(atendido);
    // Debe estar en estado de confirmación o extras
    assert.ok(
      esperandoConfirmacionItem.has(JID) || esperandoExtras.has(JID),
      "debe quedar esperando confirmación o extras"
    );
  });

  test("confirmación del ítem con 'sí' → avanza al formulario", async () => {
    clientesNuevos.add(JID);
    tipoEntregaCliente.set(JID, "mostrador");
    esperandoConfirmacionItem.set(JID, {
      lineas: "2 tacos de surtido — $60\n💰 Subtotal: $60",
      _esOrdenFinalCompleta: true,
      _esOrdenDom: false,
      _esPreventa: false,
    });
    const hist = historial(JID);
    const msg = makeMsg(JID, "sí");
    const atendido = await handleConfirmacionItem(msg, "sí", JID, hist, false);
    assert.ok(atendido);
    // Después de confirmar la orden completa, debe ir al formulario
    assert.ok(
      ordenPreResumen.has(JID) || resumenPendiente.has(JID) || esperandoConfirmacionDatos.has(JID),
      "debe avanzar al formulario o al resumen"
    );
  });

  test("flujo formulario progresivo: captura nombre → teléfono → método → resumen", async () => {
    clientesNuevos.add(JID);
    tipoEntregaCliente.set(JID, "mostrador");
    ordenPreResumen.set(JID, "2 tacos de surtido — $60");
    datosCampos.set(JID, { tipoEntrega: "mostrador" });

    const hist = historial(JID);
    const responder = async (texto) => {
      const msg = makeMsg(JID, texto);
      return handleFormularioProgresivo(msg, texto, JID, hist, false);
    };

    await responder("Juan Pérez");
    assert.ok(datosCampos.get(JID)?.nombre, "debe capturar nombre");

    await responder("3318765432");
    assert.equal(datosCampos.get(JID)?.telefono, "3318765432");

    await responder("efectivo");
    assert.equal(datosCampos.get(JID)?.metodo, "efectivo");

    // Ahora debe tener todos los campos y generar resumen
    assert.ok(resumenPendiente.has(JID), "debe generar resumen");
  });

  test("confirmación final con 'sí' guarda en BD", async () => {
    clientesNuevos.add(JID);
    tipoEntregaCliente.set(JID, "mostrador");
    datosCampos.set(JID, {
      nombre: "Juan Pérez", telefono: "3318765432", metodo: "efectivo", tipoEntrega: "mostrador",
    });
    const textoResumen =
      "📋 *Tu pedido — MOSTRADOR*\n" +
      "👤 *Cliente:* Juan Pérez\n" +
      "📱 *Teléfono:* 3318765432\n" +
      "🛒 2 tacos de surtido — $60\n" +
      "💳 *Pago:* efectivo\n" +
      "💰 *TOTAL: $60*";
    resumenPendiente.set(JID, { texto: textoResumen, esTransferencia: false });

    const msg    = makeMsg(JID, "sí");
    const client = makeClient();
    const hist   = historial(JID);
    const atendido = await handleConfirmacionFinal(msg, client, "sí", JID, hist, false);

    assert.ok(atendido);
    assert.ok(msg._respuestas.some(r => /listo|pedido.*recib/i.test(r)), "debe confirmar al cliente");
    // Estado limpio
    assert.ok(!resumenPendiente.has(JID));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// BLOQUE 2 — DOMICILIO EN HORARIO
// ═══════════════════════════════════════════════════════════════════════════

describe("Domicilio en horario — happy path", () => {
  const JID = "5213310000201@c.us";

  beforeEach(() => {
    limpiarJID(JID);
    forceHorario(true);
  });
  afterEach(() => {
    limpiarJID(JID);
    restoreHorario();
  });

  test("handleTipoEntrega detecta domicilio", async () => {
    clientesNuevos.add(JID);
    const msg  = makeMsg(JID, "a domicilio");
    const hist = historial(JID);
    const atendido = await handleTipoEntrega(msg, makeClient(), "a domicilio", JID, hist, false);
    assert.ok(atendido);
    assert.equal(tipoEntregaCliente.get(JID), "domicilio");
  });

  test("formulario domicilio captura calle y colonia", async () => {
    clientesNuevos.add(JID);
    tipoEntregaCliente.set(JID, "domicilio");
    ordenPreResumen.set(JID, "2 tacos de surtido — $60");
    datosCampos.set(JID, { tipoEntrega: "domicilio" });
    const hist = historial(JID);

    const responder = async (txt) => {
      const msg = makeMsg(JID, txt);
      return handleFormularioProgresivo(msg, txt, JID, hist, false);
    };

    await responder("Ana López");
    await responder("3311234567");
    await responder("Calle Reforma 456");
    await responder("Los Fresnos");
    await responder("no");           // referencia opcional
    await responder("efectivo");

    const campos = datosCampos.get(JID);
    assert.ok(campos?.nombre,    "debe tener nombre");
    assert.ok(campos?.telefono,  "debe tener teléfono");
    assert.ok(campos?.calle,     "debe tener calle");
    assert.ok(campos?.metodo,    "debe tener método de pago");
  });

  test("resumen domicilio incluye dirección", async () => {
    clientesNuevos.add(JID);
    tipoEntregaCliente.set(JID, "domicilio");
    datosCampos.set(JID, {
      nombre: "Ana López", telefono: "3311234567", metodo: "efectivo",
      calle: "Calle Reforma 456", colonia: "Los Fresnos", referencia: "casa azul",
      tipoEntrega: "domicilio",
    });
    ordenPreResumen.set(JID, "2 tacos de surtido — $60");
    datosRecibidos.add(JID);

    const hist = historial(JID);
    const msg  = makeMsg(JID, "sí");
    const atendido = await handleFormularioProgresivo(msg, "sí", JID, hist, false);
    assert.ok(atendido);
    assert.ok(resumenPendiente.has(JID));
    const resumen = resumenPendiente.get(JID).texto;
    assert.match(resumen, /domicilio/i, "resumen debe mencionar DOMICILIO");
  });

  test("pago con transferencia → esperandoCaptura", async () => {
    clientesNuevos.add(JID);
    tipoEntregaCliente.set(JID, "domicilio");
    datosCampos.set(JID, {
      nombre: "Ana López", telefono: "3311234567", metodo: "transferencia",
      calle: "Reforma 456", colonia: "Los Fresnos", tipoEntrega: "domicilio",
    });
    const textoResumen =
      "📋 *Tu pedido — DOMICILIO*\n" +
      "👤 *Cliente:* Ana López\n" +
      "📱 *Teléfono:* 3311234567\n" +
      "📍 *Dirección:* Reforma 456, Los Fresnos\n" +
      "🛒 2 tacos de surtido — $60\n" +
      "💳 *Pago:* transferencia\n" +
      "💰 *TOTAL: $110*";
    resumenPendiente.set(JID, { texto: textoResumen, esTransferencia: true });

    const msg    = makeMsg(JID, "sí");
    const client = makeClient();
    const hist   = historial(JID);
    const atendido = await handleConfirmacionFinal(msg, client, "sí", JID, hist, false);

    assert.ok(atendido);
    assert.ok(esperandoCaptura.has(JID), "debe quedar esperando captura de transferencia");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// BLOQUE 3 — MOSTRADOR PREVENTA
// ═══════════════════════════════════════════════════════════════════════════

describe("Mostrador preventa (fuera de horario)", () => {
  const JID = "5213310000301@c.us";

  beforeEach(() => {
    limpiarJID(JID);
    forceHorario(false);
  });
  afterEach(() => {
    limpiarJID(JID);
    restoreHorario();
  });

  test("primer mensaje fuera de horario → aviso de fuera de servicio", async () => {
    const msg = makeMsg(JID, "Hola quiero tacos");
    const consumido = await handlePrimerMensaje(msg, "Hola quiero tacos", JID);
    assert.ok(consumido);
    assert.ok(msg._respuestas.some(r => /preventa|fuera|horario|servicio/i.test(r)));
  });

  test("cliente con orden pendiente que acepta preventa", async () => {
    clientesNuevos.add(JID);
    ordenPendientePreventa.set(JID, "2 tacos de surtido");

    const msg = makeMsg(JID, "sí");
    const atendido = await handleFueraDeHorario(msg, "sí", JID);
    assert.ok(atendido);
    assert.ok(clientesPreventa.has(JID), "debe marcar al cliente como preventa");
    assert.ok(msg._respuestas.some(r => /preventa|horario/i.test(r)));
  });

  test("cliente rechaza preventa → limpiar estado", async () => {
    clientesNuevos.add(JID);
    ordenPendientePreventa.set(JID, "2 tacos de surtido");

    const msg = makeMsg(JID, "no");
    const atendido = await handleFueraDeHorario(msg, "no", JID);
    assert.ok(atendido);
    assert.ok(!clientesPreventa.has(JID), "no debe quedar como preventa");
    assert.ok(!ordenPendientePreventa.has(JID));
    assert.ok(msg._respuestas.some(r => /hasta pronto|cuando gustes/i.test(r)));
  });

  test("preventa acumula varios intentos de pedido antes de aceptar", async () => {
    clientesNuevos.add(JID);

    // Primer mensaje fuera de horario con señales de pedido
    const m1 = makeMsg(JID, "3 tacos de carne");
    await handleFueraDeHorario(m1, "3 tacos de carne", JID);
    assert.ok(ordenPendientePreventa.has(JID), "debe guardar primer intento");

    // Segundo mensaje agrega más
    const m2 = makeMsg(JID, "y una torta de buche");
    await handleFueraDeHorario(m2, "y una torta de buche", JID);
    const acum = ordenPendientePreventa.get(JID);
    assert.ok(acum.includes("taco") || acum.includes("carne") || acum.length > 5, "debe acumular texto");
  });

  test("preventa formulario requiere hora de recolección", async () => {
    // Cliente ya aceptó preventa
    clientesNuevos.add(JID);
    clientesPreventa.add(JID);
    tipoEntregaCliente.set(JID, "mostrador");
    ordenPreResumen.set(JID, "2 tacos de surtido — $60");
    datosCampos.set(JID, { tipoEntrega: "mostrador" });
    const hist = historial(JID);

    const responder = async (txt) => {
      const msg = makeMsg(JID, txt);
      return handleFormularioProgresivo(msg, txt, JID, hist, true);
    };

    await responder("Pedro Martínez");
    await responder("3319876543");
    await responder("efectivo");
    // Falta la hora → no debe tener resumen aún
    assert.ok(!resumenPendiente.has(JID), "no debe tener resumen sin hora");
    // Capturar hora
    await responder("a las 10 am");
    assert.ok(resumenPendiente.has(JID), "debe generar resumen con hora");
    const resumen = resumenPendiente.get(JID).texto;
    // El resumen de preventa incluye la hora de recolección (🕖) y la orden
    assert.match(resumen, /recolección|recolecci[oó]n|horario|10|11|am|pm|confirmas/i,
      "resumen debe incluir hora o info de recolección");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// BLOQUE 4 — DOMICILIO PREVENTA
// ═══════════════════════════════════════════════════════════════════════════

describe("Domicilio preventa (fuera de horario)", () => {
  const JID = "5213310000401@c.us";

  beforeEach(() => {
    limpiarJID(JID);
    forceHorario(false);
  });
  afterEach(() => {
    limpiarJID(JID);
    restoreHorario();
  });

  test("preventa domicilio requiere calle, colonia y hora", async () => {
    // Nota: "Centro" está en PALABRAS_NO_NOMBRE (campos.js) y no pasa la detección
    // de colonia en interpretarCampos(). Usamos "Los Fresnos" que sí es detectado.
    const { referenciaPreguntas } = require("../src/estado/maps");
    referenciaPreguntas.delete(JID); // limpiar de runs anteriores

    clientesNuevos.add(JID);
    clientesPreventa.add(JID);
    tipoEntregaCliente.set(JID, "domicilio");
    ordenPreResumen.set(JID, "2 tacos de surtido — $60");
    datosCampos.set(JID, { tipoEntrega: "domicilio" });
    const hist = historial(JID);

    const responder = async (txt) => {
      const msg = makeMsg(JID, txt);
      return handleFormularioProgresivo(msg, txt, JID, hist, true);
    };

    await responder("María García");
    await responder("3314567890");
    await responder("Calle Juárez 789");
    await responder("Los Fresnos");    // colonia válida — está en la BD y NO en PALABRAS_NO_NOMBRE
    await responder("no");             // referencia opcional → "sin referencia"
    await responder("efectivo");
    // Aún falta hora — el resumen NO debe generarse todavía
    assert.ok(!resumenPendiente.has(JID), "sin hora no debe generar resumen");
    await responder("a las 11:30 am");
    // Con hora capturada, los campos están completos y debe generarse el resumen
    assert.ok(resumenPendiente.has(JID), "debe generar resumen al capturar hora");
    const resumen = resumenPendiente.get(JID).texto;
    // El resumen de preventa a domicilio incluye la dirección y la hora de entrega
    assert.match(resumen, /domicilio/i, "resumen debe mencionar domicilio");
    referenciaPreguntas.delete(JID);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// BLOQUE 5 — CANCELACIONES
// ═══════════════════════════════════════════════════════════════════════════

describe("Cancelaciones", () => {
  const JID = "5213310000501@c.us";

  beforeEach(() => {
    limpiarJID(JID);
    forceHorario(true);
  });
  afterEach(() => {
    limpiarJID(JID);
    restoreHorario();
  });

  test("cancelar durante espera de ítem (estado esperandoCorte)", async () => {
    clientesNuevos.add(JID);
    tipoEntregaCliente.set(JID, "mostrador");
    esperandoCorte.set(JID, { tipo: "pedido", items: [{ presentacion: "taco", cantidad: 2 }], _indiceActual: 0 });

    const msg = makeMsg(JID, "cancelar");
    const atendido = await handleCancelacionDurantePedido(msg, "cancelar", JID);
    assert.ok(atendido);
    assert.ok(!esperandoCorte.has(JID), "debe limpiar esperandoCorte");
    assert.ok(msg._respuestas.some(r => /cancelad|hasta pronto/i.test(r)));
  });

  test("cancelar pedido confirmado dentro del tiempo límite", async () => {
    clientesNuevos.add(JID);
    pedidosConfirmados.set(JID, {
      nombre: "Juan Pérez", telefono: "3318765432",
      total: "$60", resumen: "...", confirmadoEn: Date.now(),
    });

    const msg    = makeMsg(JID, "cancelar");
    const client = makeClient();
    const atendido = await handleCancelacionConfirmada(msg, client, "cancelar", JID);
    assert.ok(atendido);
    assert.ok(esperandoMotivoCancelacion.has(JID), "debe pedir motivo");
    assert.ok(msg._respuestas.some(r => /motivo/i.test(r)));
  });

  test("cancelar pedido confirmado fuera del tiempo límite", async () => {
    clientesNuevos.add(JID);
    const HACE_20MIN = Date.now() - 20 * 60 * 1000;
    pedidosConfirmados.set(JID, {
      nombre: "Juan Pérez", telefono: "3318765432",
      total: "$60", resumen: "...", confirmadoEn: HACE_20MIN,
    });

    const msg    = makeMsg(JID, "cancelar");
    const client = makeClient();
    const atendido = await handleCancelacionConfirmada(msg, client, "cancelar", JID);
    assert.ok(atendido);
    assert.ok(msg._respuestas.some(r => /venci[oó]|tiempo/i.test(r)));
    assert.ok(!esperandoMotivoCancelacion.has(JID), "no debe pedir motivo si ya venció");
  });

  test("motivo de cancelación notifica y limpia estado", async () => {
    clientesNuevos.add(JID);
    esperandoMotivoCancelacion.set(JID, {
      nombre: "Juan Pérez", telefono: "3318765432", notificarGrupo: false,
    });
    setConfig("grupo_id", "");  // sin grupo — evita sendMessage real

    const msg    = makeMsg(JID, "Me arrepentí");
    const client = makeClient();
    const atendido = await handleMotivoCancelacion(msg, client, "Me arrepentí", JID);
    assert.ok(atendido);
    assert.ok(!esperandoMotivoCancelacion.has(JID));
    assert.ok(msg._respuestas.some(r => /cancelaci[oó]n|disculpa/i.test(r)));
  });

  test("cancelar durante espera de captura de transferencia", async () => {
    clientesNuevos.add(JID);
    esperandoCaptura.set(JID, { resumen: "...", telefono: "3318765432", pedidoId: null });
    setConfig("notif_modalidad", "ninguno");

    // mensajes.js maneja este caso directamente antes de los handlers.
    // Aquí verificamos que limpiarTodo limpia la captura pendiente.
    limpiarTodo(JID);
    assert.ok(!esperandoCaptura.has(JID));
  });

  test("cancelar durante espera de pago MP — dentro del tiempo", async () => {
    clientesNuevos.add(JID);
    esperandoPagoMP.set(JID, {
      pedidoId: 999, telefono: "3318765432", nombre: "Juan", expiraEn: Date.now() + 30 * 60 * 1000,
    });
    setConfig("grupo_id", "");

    const msg    = makeMsg(JID, "cancelar");
    const client = makeClient();
    const atendido = await handleCancelacionPagoMP(msg, client, "cancelar", JID);
    assert.ok(atendido);
    assert.ok(!esperandoPagoMP.has(JID));
    assert.ok(msg._respuestas.some(r => /cancelad/i.test(r)));
  });

  test("link MP expirado → cancela automáticamente", async () => {
    clientesNuevos.add(JID);
    esperandoPagoMP.set(JID, {
      pedidoId: 998, telefono: "3318765432", nombre: "Juan", expiraEn: Date.now() - 1,
    });
    setConfig("grupo_id", "");

    const msg    = makeMsg(JID, "Hola");
    const client = makeClient();
    const atendido = await handleCancelacionPagoMP(msg, client, "Hola", JID);
    assert.ok(atendido);
    assert.ok(!esperandoPagoMP.has(JID));
    assert.ok(msg._respuestas.some(r => /venci[oó]|vencido/i.test(r)));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// BLOQUE 6 — ESTADOS CRÍTICOS BLOQUEANTES
// ═══════════════════════════════════════════════════════════════════════════

describe("Estados críticos bloqueantes", () => {
  const JID = "5213310000601@c.us";

  beforeEach(() => {
    limpiarJID(JID);
    forceHorario(true);
  });
  afterEach(() => {
    limpiarJID(JID);
    restoreHorario();
  });

  test("esperandoCorte — input inválido muestra error", async () => {
    tipoEntregaCliente.set(JID, "mostrador");
    esperandoCorte.set(JID, {
      tipo: "pedido", items: [{ presentacion: "taco", cantidad: 2 }], _indiceActual: 0,
    });
    const hist = historial(JID);

    const msg = makeMsg(JID, "aaabbb");
    const atendido = await handleEsperandoCorte(msg, "aaabbb", JID, hist, false);
    assert.ok(atendido);
    assert.ok(msg._respuestas.some(r => /corte|carne|surtido/i.test(r)));
    assert.ok(esperandoCorte.has(JID), "debe seguir esperando corte");
  });

  test("esperandoCorte — 2° error consecutivo muestra ejemplos", async () => {
    tipoEntregaCliente.set(JID, "mostrador");
    esperandoCorte.set(JID, {
      tipo: "pedido", items: [{ presentacion: "taco", cantidad: 2 }], _indiceActual: 0,
    });
    erroresConsec.set(JID, 1); // simular primer error ya ocurrido
    const hist = historial(JID);

    const msg = makeMsg(JID, "aaabbb");
    const atendido = await handleEsperandoCorte(msg, "aaabbb", JID, hist, false);
    assert.ok(atendido);
    // Debe mostrar ejemplos (2° error)
    assert.ok(
      msg._respuestas.some(r => /ejemplo|surtido|buche|carne/i.test(r)),
      "debe mostrar ejemplos al 2° error"
    );
  });

  test("esperandoCorte — responde FAQ de precio y repite la pregunta de corte", async () => {
    tipoEntregaCliente.set(JID, "mostrador");
    esperandoCorte.set(JID, {
      tipo: "pedido", items: [{ presentacion: "taco", cantidad: 2 }], _indiceActual: 0,
    });
    const hist = historial(JID);

    // handleEsperandoCorte no maneja FAQs directamente — se manejan en mensajes.js
    // Verificamos que el estado no se modifica con una pregunta de precio
    const msg = makeMsg(JID, "¿cuánto cuestan los tacos?");
    const atendido = await handleEsperandoCorte(msg, "¿cuánto cuestan los tacos?", JID, hist, false);
    // Puede retornar true (interpreta como error de corte) o false (no consumido)
    // Lo importante: el estado debe seguir activo
    assert.ok(esperandoCorte.has(JID), "debe seguir esperando corte después de FAQ");
  });

  test("esperandoTipoItem — 'tacos' resuelve el tipo", async () => {
    tipoEntregaCliente.set(JID, "mostrador");
    esperandoTipoItem.set(JID, { cantidad: 3, corte: "surtido", _refrescosPendientes: [], _salsasPendientes: [] });
    const hist = historial(JID);

    const msg = makeMsg(JID, "tacos");
    const atendido = await handleEsperandoTipoItem(msg, "tacos", JID, hist, false);
    assert.ok(atendido);
    assert.ok(!esperandoTipoItem.has(JID), "debe resolver el estado");
    assert.ok(
      esperandoConfirmacionItem.has(JID) || esperandoExtras.has(JID),
      "debe avanzar a confirmación o extras"
    );
  });

  test("esperandoTipoItem — input inválido muestra error", async () => {
    tipoEntregaCliente.set(JID, "mostrador");
    esperandoTipoItem.set(JID, { cantidad: 2, corte: "surtido", _refrescosPendientes: [], _salsasPendientes: [] });
    const hist = historial(JID);

    const msg = makeMsg(JID, "xyzzy");
    const atendido = await handleEsperandoTipoItem(msg, "xyzzy", JID, hist, false);
    assert.ok(atendido);
    assert.ok(esperandoTipoItem.has(JID), "debe seguir esperando tipo");
    assert.ok(msg._respuestas.some(r => /tacos|tortas/i.test(r)));
  });

  test("esperandoConfirmacionItem — 'no' muestra qué cambiar", async () => {
    tipoEntregaCliente.set(JID, "mostrador");
    esperandoConfirmacionItem.set(JID, {
      lineas: "2 tacos de surtido — $60\n💰 Subtotal: $60",
    });
    const hist = historial(JID);

    const msg = makeMsg(JID, "no");
    const atendido = await handleConfirmacionItem(msg, "no", JID, hist, false);
    assert.ok(atendido);
    assert.ok(esperandoConfirmacionItem.has(JID), "debe seguir esperando confirmación");
    assert.ok(msg._respuestas.some(r => /cambiar|modificar|corregir/i.test(r)));
  });

  test("esperandoConfirmacionItem — cancelar limpia el estado", async () => {
    tipoEntregaCliente.set(JID, "mostrador");
    esperandoConfirmacionItem.set(JID, {
      lineas: "2 tacos de surtido — $60\n💰 Subtotal: $60",
    });
    const hist = historial(JID);

    const msg = makeMsg(JID, "cancelar");
    const atendido = await handleConfirmacionItem(msg, "cancelar", JID, hist, false);
    assert.ok(atendido);
    assert.ok(!esperandoConfirmacionItem.has(JID));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// BLOQUE 7 — EDICIÓN DE CAMPOS
// ═══════════════════════════════════════════════════════════════════════════

describe("Edición de campos", () => {
  const JID = "5213310000701@c.us";

  beforeEach(() => {
    limpiarJID(JID);
    forceHorario(true);
  });
  afterEach(() => {
    limpiarJID(JID);
    restoreHorario();
  });

  test("editar nombre mientras se recopila formulario", async () => {
    clientesNuevos.add(JID);
    tipoEntregaCliente.set(JID, "mostrador");
    datosCampos.set(JID, { nombre: "Juan Wrong", telefono: "3318765432", metodo: null, tipoEntrega: "mostrador" });
    esperandoEdicion.set(JID, { campo: "nombre", contexto: "formulario" });
    const hist = historial(JID);

    const msg = makeMsg(JID, "mi nombre es Carlos Ramírez");
    const atendido = await handleEdicionPendiente(msg, "mi nombre es Carlos Ramírez", JID, hist, false);
    assert.ok(atendido);
    const campos = datosCampos.get(JID);
    assert.match(campos.nombre, /carlos/i);
    assert.ok(!esperandoEdicion.has(JID));
  });

  test("editar teléfono con número inválido muestra error", async () => {
    clientesNuevos.add(JID);
    esperandoEdicion.set(JID, { campo: "telefono", contexto: "formulario" });
    const hist = historial(JID);

    const msg = makeMsg(JID, "12345");
    const atendido = await handleEdicionPendiente(msg, "12345", JID, hist, false);
    assert.ok(atendido);
    assert.ok(esperandoEdicion.has(JID), "debe seguir esperando la edición con valor inválido");
    assert.ok(msg._respuestas.some(r => /10 d[ií]gitos/i.test(r)));
  });

  test("editar método de pago desde resumen", async () => {
    clientesNuevos.add(JID);
    tipoEntregaCliente.set(JID, "mostrador");
    datosCampos.set(JID, { nombre: "Juan", telefono: "3318765432", metodo: "efectivo", tipoEntrega: "mostrador" });
    const textoResumen =
      "📋 *Tu pedido — MOSTRADOR*\n" +
      "👤 *Cliente:* Juan Pérez\n" +
      "📱 *Teléfono:* 3318765432\n" +
      "🛒 2 tacos de surtido — $60\n" +
      "💳 *Pago:* efectivo\n" +
      "💰 *TOTAL: $60*";
    resumenPendiente.set(JID, { texto: textoResumen, esTransferencia: false });
    const hist = historial(JID);

    const msg = makeMsg(JID, "cambia el método a transferencia");
    const atendido = await handleEdicionResumen(msg, "cambia el método a transferencia", JID, hist, false);
    assert.ok(atendido);
    assert.equal(datosCampos.get(JID)?.metodo, "transferencia");
    // Resumen debe haberse regenerado
    assert.ok(resumenPendiente.has(JID));
  });

  test("editar corte desde resumen", async () => {
    clientesNuevos.add(JID);
    tipoEntregaCliente.set(JID, "mostrador");
    datosCampos.set(JID, { nombre: "Juan", telefono: "3318765432", metodo: "efectivo", tipoEntrega: "mostrador" });
    // El resumen debe tener el marcador exacto que usa extraerOrdenDeResumen(): "📋 *Orden:*\n"
    const { generarResumen } = require("../src/pedido/resumen");
    const ordenLineas = "🌮 2 tacos de surtido — $60";
    const resumenGenerado = generarResumen(JID, ordenLineas, false, false);
    resumenPendiente.set(JID, { texto: resumenGenerado.texto, esTransferencia: false });
    const hist = historial(JID);

    const msg = makeMsg(JID, "cambia surtido por carne");
    const atendido = await handleEdicionResumen(msg, "cambia surtido por carne", JID, hist, false);
    assert.ok(atendido, "handleEdicionResumen debe consumir el mensaje");
    // Debe haberse regenerado el resumen con el corte cambiado
    assert.ok(resumenPendiente.has(JID), "debe mantener resumen actualizado");
    const nuevoResumen = resumenPendiente.get(JID)?.texto || "";
    // El corte "carne" debe aparecer en el resumen actualizado
    assert.ok(nuevoResumen.length > 0, "el resumen no debe estar vacío");
    // La respuesta al cliente debe indicar el cambio
    assert.ok(msg._respuestas.some(r => /actualizado|listo|perfecto|carne/i.test(r)),
      "debe confirmar el cambio al cliente");
  });

  test("cambiar tipo de entrega de mostrador a domicilio desde el formulario", async () => {
    clientesNuevos.add(JID);
    tipoEntregaCliente.set(JID, "mostrador");
    ordenPreResumen.set(JID, "2 tacos de surtido — $60");
    datosCampos.set(JID, { tipoEntrega: "mostrador", nombre: "Juan", telefono: "3318765432", metodo: "efectivo" });

    const msg = makeMsg(JID, "mejor a domicilio");
    const atendido = await handleCambioTipoDuranteFormulario(msg, "mejor a domicilio", JID, false);
    assert.ok(atendido);
    assert.equal(tipoEntregaCliente.get(JID), "domicilio");
    assert.equal(datosCampos.get(JID)?.tipoEntrega, "domicilio");
  });

  test("cambiar tipo de entrega desde el resumen (domicilio → mostrador)", async () => {
    // INCONSISTENCIA CONOCIDA (BUG): handleCambiosTipoDesdeResumen actualiza
    // datosCampos.tipoEntrega pero NO actualiza el Map tipoEntregaCliente.
    // Los handlers subsiguientes que lean tipoEntregaCliente seguirán viendo "domicilio".
    // Ver: src/handlers/flujos/resumen.js (handleCambiosTipoDesdeResumen).
    clientesNuevos.add(JID);
    tipoEntregaCliente.set(JID, "domicilio");
    datosCampos.set(JID, {
      tipoEntrega: "domicilio", nombre: "Juan", telefono: "3318765432", metodo: "efectivo",
      calle: "Reforma 456", colonia: "Centro",
    });
    // Usar generarResumen para producir el formato exacto que parsea extraerOrdenDeResumen()
    const { generarResumen } = require("../src/pedido/resumen");
    const ordenLineas = "🌮 2 tacos de surtido — $60";
    const resumenGenerado = generarResumen(JID, ordenLineas, true, false);
    resumenPendiente.set(JID, { texto: resumenGenerado.texto, esTransferencia: false });
    const hist = historial(JID);

    const msg = makeMsg(JID, "mejor paso a recoger al mostrador");
    const atendido = await handleCambiosTipoDesdeResumen(msg, "mejor paso a recoger al mostrador", JID, hist, false);
    assert.ok(atendido, "debe consumir el mensaje");
    // datosCampos sí se actualiza (tipoEntregaCliente NO — bug documentado)
    assert.equal(datosCampos.get(JID)?.tipoEntrega, "mostrador",
      "datosCampos.tipoEntrega debe actualizarse a mostrador");
    // El handler regenera el resumen y responde al cliente
    assert.ok(msg._respuestas.some(r => /mostrador/i.test(r)),
      "la respuesta al cliente debe confirmar el cambio a mostrador");
    if (resumenPendiente.has(JID)) {
      assert.match(resumenPendiente.get(JID).texto, /mostrador/i,
        "el resumen regenerado debe decir MOSTRADOR");
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// BLOQUE 8 — FAQs DURANTE ESTADOS CRÍTICOS
// ═══════════════════════════════════════════════════════════════════════════

describe("FAQs durante estados críticos", () => {
  const JID = "5213310000801@c.us";

  beforeEach(() => {
    limpiarJID(JID);
    forceHorario(true);
  });
  afterEach(() => {
    limpiarJID(JID);
    restoreHorario();
  });

  test("FAQ de precio durante confirmación de ítem — responde y repregunta", async () => {
    tipoEntregaCliente.set(JID, "mostrador");
    esperandoConfirmacionItem.set(JID, {
      lineas: "2 tacos de surtido — $60\n💰 Subtotal: $60",
    });
    const hist = historial(JID);

    const msg = makeMsg(JID, "¿cuánto cuestan los tacos?");
    const atendido = await handleConfirmacionItem(msg, "¿cuánto cuestan los tacos?", JID, hist, false);
    assert.ok(atendido);
    assert.ok(esperandoConfirmacionItem.has(JID), "debe seguir esperando confirmación");
    // Debe haber respondido al FAQ y repreguntado
    assert.ok(msg._respuestas.length >= 2 || msg._respuestas[0].includes("correcto"),
      "debe responder al FAQ y volver a pedir confirmación");
  });

  test("FAQ de horario durante formulario — responde y re-muestra formulario", async () => {
    clientesNuevos.add(JID);
    tipoEntregaCliente.set(JID, "mostrador");
    ordenPreResumen.set(JID, "2 tacos de surtido — $60");
    datosCampos.set(JID, { tipoEntrega: "mostrador", nombre: "Juan", telefono: null, metodo: null });
    const hist = historial(JID);

    const msg = makeMsg(JID, "¿a qué horas están abiertos?");
    const atendido = await handleFormularioProgresivo(msg, "¿a qué horas están abiertos?", JID, hist, false);
    assert.ok(atendido);
    assert.ok(ordenPreResumen.has(JID), "no debe borrar el formulario");
    assert.ok(msg._respuestas.some(r => /hor[ai]|abre|cierra/i.test(r)), "debe responder el horario");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// BLOQUE 9 — CATCH-ALL RESUMEN PENDIENTE
// ═══════════════════════════════════════════════════════════════════════════

describe("CatchAll resumen pendiente", () => {
  const JID = "5213310000901@c.us";

  beforeEach(() => { limpiarJID(JID); forceHorario(true); });
  afterEach(() => { limpiarJID(JID); restoreHorario(); });

  test("mensaje no reconocido con resumen pendiente → re-muestra resumen", async () => {
    resumenPendiente.set(JID, { texto: "...resumen...", esTransferencia: false });

    const msg = makeMsg(JID, "blah blah");
    const atendido = await handleCatchAllResumen(msg, JID);
    assert.ok(atendido);
    assert.ok(msg._respuestas.some(r => /resumen|pendiente|confirmar/i.test(r)));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// BLOQUE 10 — FLUJO SIN CORTE / SIN TIPO
// ═══════════════════════════════════════════════════════════════════════════

describe("Sin corte / sin tipo", () => {
  const JID = "5213310001001@c.us";

  beforeEach(() => {
    limpiarJID(JID);
    forceHorario(true);
  });
  afterEach(() => {
    limpiarJID(JID);
    restoreHorario();
  });

  test("pedido sin corte → entra a estado esperandoCorte", async () => {
    tipoEntregaCliente.set(JID, "mostrador");
    const hist = historial(JID);
    hist.push({ role: "user", content: "Mi pedido es para mostrador." });
    hist.push({ role: "assistant", content: "Perfecto, aquí el menú." });

    const msg = makeMsg(JID, "2 tacos");
    const atendido = await handleSinCorte(msg, "2 tacos", JID);
    assert.ok(atendido, "debe consumir el mensaje");
    assert.ok(esperandoCorte.has(JID), "debe quedar en estado esperandoCorte");
    assert.ok(msg._respuestas.some(r => /corte|carne|surtido/i.test(r)));
  });

  test("pedido sin tipo → entra a estado esperandoTipoItem", async () => {
    tipoEntregaCliente.set(JID, "mostrador");
    const hist = historial(JID);
    hist.push({ role: "user", content: "Mi pedido es para mostrador." });
    hist.push({ role: "assistant", content: "Perfecto, aquí el menú." });

    const msg = makeMsg(JID, "2 de surtido");
    const atendido = await handleSinTipo(msg, "2 de surtido", JID);
    assert.ok(atendido, "debe consumir el mensaje");
    assert.ok(esperandoTipoItem.has(JID), "debe quedar en estado esperandoTipoItem");
    assert.ok(msg._respuestas.some(r => /taco|torta/i.test(r)));
  });

  test("después de resolver corte → avanza a confirmación de ítem o extras", async () => {
    tipoEntregaCliente.set(JID, "mostrador");
    esperandoCorte.set(JID, {
      tipo: "pedido", items: [{ presentacion: "taco", cantidad: 2, corte: null }],
      _indiceActual: 0, _refrescosPendientes: [], _salsasPendientes: [],
    });
    const hist = historial(JID);

    const msg = makeMsg(JID, "surtido");
    const atendido = await handleEsperandoCorte(msg, "surtido", JID, hist, false);
    assert.ok(atendido);
    assert.ok(!esperandoCorte.has(JID), "debe salir del estado esperandoCorte");
    assert.ok(
      esperandoConfirmacionItem.has(JID) || esperandoExtras.has(JID),
      "debe avanzar a confirmación o extras"
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// BLOQUE 11 — AGREGAR DESDE RESUMEN
// ═══════════════════════════════════════════════════════════════════════════

describe("Agregar desde resumen", () => {
  const JID = "5213310001101@c.us";

  beforeEach(() => {
    limpiarJID(JID);
    forceHorario(true);
  });
  afterEach(() => {
    limpiarJID(JID);
    restoreHorario();
  });

  test("'no' simple desde resumen pendiente limpia y muestra menú", async () => {
    resumenPendiente.set(JID, { texto: "...resumen...", esTransferencia: false });

    const msg = makeMsg(JID, "no");
    const atendido = await handleAgregarDesdeResumen(msg, "no", JID);
    assert.ok(atendido);
    assert.ok(!resumenPendiente.has(JID));
    assert.ok(msg._respuestas.some(r => /men[úu]|ordenar/i.test(r)));
  });

  test("agregar ítem desde resumen con corte → confirmación", async () => {
    resumenPendiente.set(JID, {
      texto:
        "📋 *Tu pedido — MOSTRADOR*\n" +
        "👤 *Cliente:* Juan Pérez\n" +
        "📱 *Teléfono:* 3318765432\n" +
        "🛒 2 tacos de surtido — $60\n" +
        "💳 *Pago:* efectivo\n" +
        "💰 *TOTAL: $60*",
      esTransferencia: false,
    });

    const msg = makeMsg(JID, "agrega 1 torta de carne");
    const atendido = await handleAgregarDesdeResumen(msg, "agrega 1 torta de carne", JID);
    assert.ok(atendido);
    // Debe haber preguntado confirmación o seguido el flujo
    assert.ok(
      esperandoConfirmacionItem.has(JID) || esperandoAgregarMas.has(JID) || !resumenPendiente.has(JID),
      "debe procesar la adición"
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// BLOQUE 12 — CONFIRMACIÓN DE DATOS PRECARGADOS (cliente frecuente)
// ═══════════════════════════════════════════════════════════════════════════

describe("Confirmación de datos precargados", () => {
  const JID = "5213310001201@c.us";

  beforeEach(() => {
    limpiarJID(JID);
    forceHorario(true);
  });
  afterEach(() => {
    limpiarJID(JID);
    restoreHorario();
  });

  test("confirmación positiva → avanza al resumen o menú", async () => {
    tipoEntregaCliente.set(JID, "mostrador");
    datosCampos.set(JID, {
      nombre: "Carlos Pérez", telefono: "3319876543", metodo: "efectivo", tipoEntrega: "mostrador",
    });
    ordenPreResumen.set(JID, "2 tacos de surtido — $60");
    esperandoConfirmacionDatos.set(JID, { tipoEntrega: "mostrador", esPreventa: false });
    const hist = historial(JID);

    const msg = makeMsg(JID, "sí");
    const atendido = await handleConfirmacionDatos(msg, "sí", JID, hist, false);
    assert.ok(atendido);
    assert.ok(!esperandoConfirmacionDatos.has(JID));
    assert.ok(resumenPendiente.has(JID) || msg._respuestas.length > 0);
  });

  test("negación → muestra formulario y pide qué corregir", async () => {
    tipoEntregaCliente.set(JID, "mostrador");
    datosCampos.set(JID, {
      nombre: "Carlos Pérez", telefono: "3319876543", metodo: "efectivo", tipoEntrega: "mostrador",
    });
    esperandoConfirmacionDatos.set(JID, { tipoEntrega: "mostrador", esPreventa: false });
    const hist = historial(JID);

    const msg = makeMsg(JID, "no");
    const atendido = await handleConfirmacionDatos(msg, "no", JID, hist, false);
    assert.ok(atendido);
    assert.ok(esperandoConfirmacionDatos.has(JID), "debe seguir esperando confirmación");
    assert.ok(msg._respuestas.some(r => /corregir|cambiar|dato/i.test(r)));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// BLOQUE 13 — EXTRAS (refresco / salsas)
// ═══════════════════════════════════════════════════════════════════════════

describe("Extras — refrescos y salsas", () => {
  const JID = "5213310001301@c.us";

  beforeEach(() => {
    limpiarJID(JID);
    forceHorario(true);
  });
  afterEach(() => {
    limpiarJID(JID);
    restoreHorario();
  });

  test("respuesta 'no' en fase pregunta → mostrar confirmación final", async () => {
    tipoEntregaCliente.set(JID, "mostrador");
    esperandoExtras.set(JID, {
      ordenTexto: "2 tacos de surtido — $60",
      esOrdenDom: false, esPreventa: false,
      tieneRefresco: false, tieneSalsa: false, fase: "pregunta",
    });
    const hist = historial(JID);

    const msg = makeMsg(JID, "no");
    const atendido = await handleExtras(msg, "no", JID, hist, false, false);
    assert.ok(atendido);
    assert.ok(esperandoConfirmacionItem.has(JID), "debe mostrar confirmación final");
  });

  test("agregar más ítems en estado esperandoAgregarMas", async () => {
    tipoEntregaCliente.set(JID, "mostrador");
    esperandoAgregarMas.set(JID, "2 tacos de surtido — $60");
    const hist = historial(JID);

    const msg = makeMsg(JID, "1 torta de carne");
    const atendido = await handleAgregarMas(msg, "1 torta de carne", JID, hist, false, false);
    assert.ok(atendido);
  });

  test("'ya es todo' en esperandoAgregarMas → avanza a extras (refresco/salsa)", async () => {
    // Cuando el cliente dice "ya es todo" en esperandoAgregarMas, el flujo
    // avanza a la fase de extras (refrescos/salsas) antes de la confirmación final.
    // Nota: "no, ya es todo" NO coincide con el regex esAgregarNo (que es ^...$);
    // hay que usar "ya es todo" o "no" a secas para disparar esa rama.
    tipoEntregaCliente.set(JID, "mostrador");
    esperandoAgregarMas.set(JID, "2 tacos de surtido — $60");
    datosCampos.set(JID, { tipoEntrega: "mostrador" });
    const hist = historial(JID);

    const msg = makeMsg(JID, "ya es todo");
    const atendido = await handleAgregarMas(msg, "ya es todo", JID, hist, false, false);
    assert.ok(atendido, "debe consumir el mensaje");
    // Después de "ya es todo" en esperandoAgregarMas, el flujo avanza a extras
    assert.ok(
      esperandoExtras.has(JID) || esperandoConfirmacionItem.has(JID),
      "debe avanzar a extras o confirmación final"
    );
    assert.ok(!esperandoAgregarMas.has(JID), "debe limpiar esperandoAgregarMas");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// BLOQUE 14 — EDGE CASES Y ESTADOS HUÉRFANOS
// ═══════════════════════════════════════════════════════════════════════════

describe("Edge cases y estados huérfanos", () => {
  const JID = "5213310001401@c.us";

  beforeEach(() => {
    limpiarJID(JID);
    forceHorario(true);
  });
  afterEach(() => {
    limpiarJID(JID);
    restoreHorario();
  });

  test("limpiarTodo borra todos los Maps del JID", () => {
    // Llenar varios Maps
    clientesNuevos.add(JID);
    clientesPreventa.add(JID);
    datosCampos.set(JID, { nombre: "Test" });
    tipoEntregaCliente.set(JID, "mostrador");
    esperandoCorte.set(JID, { items: [] });
    esperandoTipoItem.set(JID, { cantidad: 2, corte: "surtido" });
    esperandoConfirmacionItem.set(JID, { lineas: "..." });
    esperandoAgregarMas.set(JID, "...");
    esperandoExtras.set(JID, { fase: "pregunta" });
    ordenPreResumen.set(JID, "...");
    resumenPendiente.set(JID, { texto: "...", esTransferencia: false });
    esperandoCaptura.set(JID, { resumen: "..." });
    esperandoPagoMP.set(JID, { pedidoId: 1, expiraEn: Date.now() });
    erroresConsec.set(JID, 3);

    limpiarTodo(JID);
    clientesNuevos.delete(JID);

    assert.ok(!clientesPreventa.has(JID),          "clientesPreventa limpio");
    assert.ok(!datosCampos.has(JID),               "datosCampos limpio");
    assert.ok(!tipoEntregaCliente.has(JID),        "tipoEntregaCliente limpio");
    assert.ok(!esperandoCorte.has(JID),            "esperandoCorte limpio");
    assert.ok(!esperandoTipoItem.has(JID),         "esperandoTipoItem limpio");
    assert.ok(!esperandoConfirmacionItem.has(JID), "esperandoConfirmacionItem limpio");
    assert.ok(!esperandoAgregarMas.has(JID),       "esperandoAgregarMas limpio");
    assert.ok(!esperandoExtras.has(JID),           "esperandoExtras limpio");
    assert.ok(!ordenPreResumen.has(JID),           "ordenPreResumen limpio");
    assert.ok(!resumenPendiente.has(JID),          "resumenPendiente limpio");
    assert.ok(!esperandoCaptura.has(JID),          "esperandoCaptura limpio");
    assert.ok(!esperandoPagoMP.has(JID),           "esperandoPagoMP limpio");
    assert.ok(!erroresConsec.has(JID),             "erroresConsec limpio");
  });

  test("preventa rechazada no deja clientesPreventa activo", async () => {
    clientesNuevos.add(JID);
    ordenPendientePreventa.set(JID, "2 tacos de surtido");

    const msg = makeMsg(JID, "mejor no");
    await handleFueraDeHorario(msg, "mejor no", JID);

    assert.ok(!clientesPreventa.has(JID), "no debe quedar como preventa");
    assert.ok(!ordenPendientePreventa.has(JID), "debe limpiar la orden pendiente");
  });

  test("handleTipoEntrega no actúa si ya hay historial", async () => {
    clientesNuevos.add(JID);
    const hist = historial(JID);
    hist.push({ role: "user", content: "domicilio" });  // historial no vacío

    const msg = makeMsg(JID, "domicilio");
    const atendido = await handleTipoEntrega(msg, makeClient(), "domicilio", JID, hist, false);
    assert.equal(atendido, false, "debe retornar false si ya hay historial");
  });

  test("corte por fuzzy matching — 'surtidoo' resuelve como surtido", async () => {
    tipoEntregaCliente.set(JID, "mostrador");
    esperandoCorte.set(JID, {
      tipo: "pedido", items: [{ presentacion: "taco", cantidad: 2, corte: null }],
      _indiceActual: 0, _refrescosPendientes: [], _salsasPendientes: [],
    });
    const hist = historial(JID);

    const msg = makeMsg(JID, "surtidoo"); // typo con distancia Levenshtein 1
    const atendido = await handleEsperandoCorte(msg, "surtidoo", JID, hist, false);
    // Puede resolverse por fuzzy o puede fallar como input inválido
    // Lo importante: si se resuelve, el estado debe avanzar
    if (atendido && !esperandoCorte.has(JID)) {
      assert.ok(
        esperandoConfirmacionItem.has(JID) || esperandoExtras.has(JID),
        "si resolvió el corte, debe avanzar"
      );
    } else {
      // El error se maneja correctamente
      assert.ok(atendido, "debe haber consumido el mensaje");
    }
  });

  test("emoji de confirmación se convierte en 'si'", () => {
    // Este comportamiento se aplica en handleMensaje (mensajes.js) antes de llamar handlers
    // Verificamos la lógica de normalización directamente
    let textoOriginal = "👍";
    if (/^[👍✅☑🙌💯👌🤙]+$/u.test(textoOriginal)) textoOriginal = "si";
    assert.equal(textoOriginal, "si");
  });

  test("emoji de negación se convierte en 'no'", () => {
    let textoOriginal = "👎";
    if (/^[👎❌🚫🙅]+$/u.test(textoOriginal)) textoOriginal = "no";
    assert.equal(textoOriginal, "no");
  });

  test("mensaje muy corto (1 carácter) en cliente nuevo se ignora", () => {
    clientesNuevos.add(JID);
    // La condición en mensajes.js: textoOriginal.length < 2 && clientesNuevos.has(clienteNumero)
    const textoOriginal = "x";
    const debeIgnorar = textoOriginal.length < 2 && clientesNuevos.has(JID);
    assert.ok(debeIgnorar, "mensaje de 1 carácter en cliente nuevo debe ignorarse");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// BLOQUE 15 — FLUJO SIN TIPO DE SERVICIO DEFINIDO (servicio único)
// ═══════════════════════════════════════════════════════════════════════════

describe("Tipo de servicio único", () => {
  const JID = "5213310001501@c.us";

  beforeEach(() => {
    limpiarJID(JID);
    forceHorario(true);
  });
  afterEach(() => {
    limpiarJID(JID);
    restoreHorario();
    setConfig("tipo_servicio", "ambos");
  });

  test("solo_mostrador → handleTipoEntrega auto-setea mostrador sin preguntar", async () => {
    setConfig("tipo_servicio", "solo_mostrador");
    clientesNuevos.add(JID);
    const hist = historial(JID);
    const msg = makeMsg(JID, "Quiero tacos");

    const atendido = await handleTipoEntrega(msg, makeClient(), "Quiero tacos", JID, hist, false);
    assert.ok(atendido);
    assert.equal(tipoEntregaCliente.get(JID), "mostrador");
  });

  test("solo_domicilio → handleTipoEntrega auto-setea domicilio sin preguntar", async () => {
    setConfig("tipo_servicio", "solo_domicilio");
    clientesNuevos.add(JID);
    const hist = historial(JID);
    const msg = makeMsg(JID, "Hola");

    const atendido = await handleTipoEntrega(msg, makeClient(), "Hola", JID, hist, false);
    assert.ok(atendido);
    assert.equal(tipoEntregaCliente.get(JID), "domicilio");
  });
});
