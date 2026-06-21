#!/usr/bin/env node
"use strict";
/**
 * Simulador de pedido completo — prueba el flujo del bot sin WhatsApp real.
 * Uso: node scripts/simular-pedido.js
 *
 * Ejecuta tres flujos en horario abierto (abre la BD temporalmente):
 *   1) Preguntas frecuentes
 *   2) Pedido en mostrador (cliente nuevo)
 *   3) Pedido a domicilio (mismo cliente, retorno)
 *
 * Las órdenes de prueba se eliminan automáticamente al terminar.
 */

// ── Cargar .env y ajustar directorio de trabajo ───────────────────────────────
const path = require("path");
process.chdir(path.join(__dirname, ".."));
require("dotenv").config();

// ── Parchear setTimeout ANTES de cargar módulos ───────────────────────────────
// Hace que los delays de rate-limiting y typing sean instantáneos.
const realSetTimeout = global.setTimeout;
global.setTimeout = (fn, _ms, ...args) => realSetTimeout(fn, 0, ...args);

// ── Módulos ───────────────────────────────────────────────────────────────────
const { initDB, run, queryOne } = require("../src/db/core");
const { seedDB }      = require("../src/db/seed");
const { handleMensaje } = require("../src/handlers/mensajes");
const { limpiarTodo } = require("../src/estado");

// ── Constantes ────────────────────────────────────────────────────────────────
const NUMERO_TEST = "5210000000000@c.us";
const LINEA       = "─".repeat(55);
const VERDE       = "\x1b[32m";
const AZUL        = "\x1b[36m";
const AMARILLO    = "\x1b[33m";
const RESET       = "\x1b[0m";

// ── Mock de cliente WhatsApp ──────────────────────────────────────────────────
const mockClient = {
  sendMessage: async (to, text) => {
    if (typeof text === "string" && to) {
      console.log(`\n${AMARILLO}  📲 GRUPO:${RESET}`);
      text.split("\n").forEach(l => console.log(`${AMARILLO}    ${l}${RESET}`));
    }
  },
};

// ── Crear mensaje mock ────────────────────────────────────────────────────────
function crearMsg(body) {
  return {
    from:     NUMERO_TEST,
    body,
    type:     "chat",
    hasMedia: false,
    reply:    async () => {},   // mensajes.js loguea [Bot]: por nosotros
    getChat:  async () => ({
      sendStateTyping: async () => {},
      clearState:      async () => {},
    }),
  };
}

// ── Paso de simulación ────────────────────────────────────────────────────────
let _paso = 0;
async function enviar(texto) {
  _paso++;
  console.log(`\n${VERDE}👤 [${_paso}]${RESET} "${texto}"`);
  await handleMensaje(crearMsg(texto), mockClient);
}

// ── Helpers BD ────────────────────────────────────────────────────────────────
function abrirHorario() {
  run("UPDATE horarios SET abierto = 1, hora_inicio = '00:00', hora_fin = '23:59'");
}

function restaurarHorario(original) {
  for (const h of original) {
    run("UPDATE horarios SET abierto = ?, hora_inicio = ?, hora_fin = ? WHERE id = ?",
      [h.abierto, h.hora_inicio, h.hora_fin, h.id]);
  }
}

function limpiarOrdenesTest() {
  try {
    const cliente = queryOne("SELECT id FROM clientes WHERE telefono = ?", ["0000000000"]);
    if (cliente) {
      const c = queryOne("SELECT COUNT(*) as n FROM pedidos WHERE cliente_id = ?", [cliente.id])?.n || 0;
      if (c > 0) run("DELETE FROM pedidos WHERE cliente_id = ?", [cliente.id]);
      run("DELETE FROM clientes WHERE id = ?", [cliente.id]);
      console.log(`\n🗑️  Cleanup: ${c} pedido(s) de prueba eliminado(s)\n`);
    }
  } catch (e) { console.log(`\n⚠️  Cleanup: ${e.message}\n`); }
}

// ── FLUJO 1: Preguntas frecuentes ─────────────────────────────────────────────
async function flujoFAQ() {
  console.log(`\n${AZUL}${LINEA}\n  FLUJO 1: Preguntas frecuentes (sin pedido activo)\n${LINEA}${RESET}`);
  limpiarTodo(NUMERO_TEST); _paso = 0;

  await enviar("¿a qué horas abren?");
  await enviar("¿cuánto cuesta el domicilio?");
  await enviar("¿cuánto cuesta el surtido?");
  await enviar("¿qué es el buche?");
}

// ── FLUJO 2: Pedido en mostrador ──────────────────────────────────────────────
// Flujo real: tipo → menú → orden → confirmar ítem → formulario → resumen → confirmar
async function flujoMostrador() {
  console.log(`\n${AZUL}${LINEA}\n  FLUJO 2: Pedido en mostrador (cliente nuevo)\n${LINEA}${RESET}`);
  limpiarTodo(NUMERO_TEST); _paso = 0;

  await enviar("hola");
  await enviar("mostrador");
  await enviar("3 tacos de surtido y 1 torta de carne"); // orden → confirma ítem
  await enviar("sí");                                    // confirma ítem → formulario
  await enviar("Juan Test Simulacion\n3311234567\nefectivo"); // datos del formulario
  await enviar("sí");                                    // confirma datos → resumen
  await enviar("sí confirmo");                           // confirma pedido
}

// ── FLUJO 3: Pedido a domicilio ───────────────────────────────────────────────
// Flujo real: tipo → menú → orden → confirmar ítem → extras → formulario domicilio → resumen → confirmar
async function flujoDomicilio() {
  console.log(`\n${AZUL}${LINEA}\n  FLUJO 3: Pedido a domicilio\n${LINEA}${RESET}`);
  limpiarTodo(NUMERO_TEST); _paso = 0;

  await enviar("quiero hacer un pedido");
  await enviar("domicilio");
  await enviar("2 tacos de buche");          // orden
  await enviar("sí");                        // confirma ítem → pregunta extras o agregar más
  await enviar("no");                        // no extras
  await enviar("no ya es todo");             // no agregar más → formulario domicilio
  // Formulario domicilio: nombre, tel, calle, colonia, referencia, pago
  await enviar("Maria Lopez\n3319876543\nefectivo");
  await enviar("Calle Morelos 55");          // calle
  await enviar("Tepic Centro");              // colonia
  await enviar("frente al Oxxo");            // referencia
  await enviar("sí");                        // confirma datos → resumen
  await enviar("sí confirmo");               // confirma pedido
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n${AZUL}${"═".repeat(55)}\n  SIMULADOR DE PEDIDO — Tacos Javier Bot\n  (respuestas del bot: [Bot]: ...)\n${"═".repeat(55)}${RESET}`);

  await initDB();
  await seedDB();

  // Guardar horario original y abrir 24/7 para la simulación
  const { queryAll } = require("../src/db/core");
  const horarioOriginal = queryAll("SELECT * FROM horarios");
  abrirHorario();

  // Silenciar notificación a grupo (no configurado en test)
  try { run("UPDATE configuracion SET valor = '' WHERE clave = 'grupo_id'"); } catch (_) {}

  try {
    await flujoFAQ();
    await flujoMostrador();
    await flujoDomicilio();
  } finally {
    restaurarHorario(horarioOriginal);
    limpiarOrdenesTest();
    limpiarTodo(NUMERO_TEST);
    global.setTimeout = realSetTimeout;
  }

  console.log(`${AZUL}${"═".repeat(55)}\n  SIMULACIÓN COMPLETADA\n${"═".repeat(55)}${RESET}\n`);
}

main().catch(err => {
  console.error("\n❌ Error en simulación:", err.message);
  console.error(err.stack);
  global.setTimeout = realSetTimeout;
  process.exit(1);
});
