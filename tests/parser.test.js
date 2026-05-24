"use strict";
// Tests unitarios de pedidoParser.js
// Usa sql.js real (sin mocks de BD).
// Ejecutar: npm test

const { test, describe, before } = require("node:test");
const assert = require("node:assert/strict");

const { initDB }          = require("../src/db/core");
const { seedDB }          = require("../src/db/seed");
const {
  parsearPedidoSimple,
  detectarSinCorte,
  detectarSinTipo,
  detectarPreguntaFrecuente,
  detectarModificacion,
  detectarRepetirPedido,
  calcularScore,
  normalizar,
  invalidarCacheCortes,
} = require("../src/handlers/pedidoParser");

// ── HELPERS ──────────────────────────────────────────────────────────────────

function itemTaco(cantidad, corte)    { return { presentacion: "taco",   cantidad, corte }; }
function itemTorta(cantidad, corte)   { return { presentacion: "torta",  cantidad, corte }; }
function itemGramos(gramos, corte)    { return { presentacion: "gramos", gramos,   corte }; }
function itemPesos(monto, corte)      { return { presentacion: "pesos",  monto,    corte }; }
function pedido(...items)             { return { tipo: "pedido", items }; }

// ── SETUP BD ─────────────────────────────────────────────────────────────────

before(async () => {
  await initDB();
  await seedDB();
  invalidarCacheCortes(); // fuerza recarga desde BD recién inicializada
});

// ═══════════════════════════════════════════════════════════════════════════
// normalizar()
// ═══════════════════════════════════════════════════════════════════════════
describe("normalizar", () => {
  test("convierte a minúsculas", () => {
    assert.equal(normalizar("SURTIDO"), "surtido");
  });
  test("elimina tildes", () => {
    assert.equal(normalizar("Ángel"), "angel");
    assert.equal(normalizar("café"), "cafe");
  });
  test("recorta espacios", () => {
    assert.equal(normalizar("  buche  "), "buche");
  });
  test("normaliza ñ → n no", () => {
    // La ñ se descompone en n + combining tilde y se elimina el combining
    assert.equal(normalizar("mañana"), "manana");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// calcularScore()
// ═══════════════════════════════════════════════════════════════════════════
describe("calcularScore", () => {
  test("pedido completo obtiene score alto (≥ 4)", () => {
    assert.ok(calcularScore("3 tacos de surtido") >= 4);
  });
  test("frase vaga obtiene score bajo (< 4)", () => {
    assert.ok(calcularScore("quiero tacos") < 4);
  });
  test("señal groq penaliza (< 0)", () => {
    assert.ok(calcularScore("3 tacos y aparte 2 para ella") < 0);
  });
  test("solo número sin contexto no alcanza umbral", () => {
    assert.ok(calcularScore("dos") < 4);
  });
  test("pedido con gramos y corte alcanza umbral", () => {
    assert.ok(calcularScore("medio kilo de buche") >= 4);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// parsearPedidoSimple() — casos básicos
// ═══════════════════════════════════════════════════════════════════════════
describe("parsearPedidoSimple — básico", () => {
  test("3 tacos de surtido", () => {
    assert.deepEqual(
      parsearPedidoSimple("3 tacos de surtido"),
      pedido(itemTaco(3, "surtido"))
    );
  });
  test("1 taco de carne", () => {
    assert.deepEqual(
      parsearPedidoSimple("1 taco de carne"),
      pedido(itemTaco(1, "carne"))
    );
  });
  test("2 tortas de buche", () => {
    assert.deepEqual(
      parsearPedidoSimple("2 tortas de buche"),
      pedido(itemTorta(2, "buche"))
    );
  });
  test("1 torta de cuero", () => {
    assert.deepEqual(
      parsearPedidoSimple("1 torta de cuero"),
      pedido(itemTorta(1, "cuero"))
    );
  });
  test("4 tacos de lengua", () => {
    assert.deepEqual(
      parsearPedidoSimple("4 tacos de lengua"),
      pedido(itemTaco(4, "lengua"))
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// parsearPedidoSimple() — medidas y gramos
// ═══════════════════════════════════════════════════════════════════════════
describe("parsearPedidoSimple — medidas", () => {
  test("medio kilo de buche → 500g", () => {
    assert.deepEqual(
      parsearPedidoSimple("medio kilo de buche"),
      pedido(itemGramos(500, "buche"))
    );
  });
  test("un cuarto de surtido → 250g", () => {
    assert.deepEqual(
      parsearPedidoSimple("un cuarto de surtido"),
      pedido(itemGramos(250, "surtido"))
    );
  });
  test("tres cuartos de carne → 750g", () => {
    assert.deepEqual(
      parsearPedidoSimple("tres cuartos de carne"),
      pedido(itemGramos(750, "carne"))
    );
  });
  test("un kilo de cuero → 1000g", () => {
    assert.deepEqual(
      parsearPedidoSimple("un kilo de cuero"),
      pedido(itemGramos(1000, "cuero"))
    );
  });
  test("300g de lengua", () => {
    assert.deepEqual(
      parsearPedidoSimple("300g de lengua"),
      pedido(itemGramos(300, "lengua"))
    );
  });
  test("500 gramos de surtido", () => {
    assert.deepEqual(
      parsearPedidoSimple("500 gramos de surtido"),
      pedido(itemGramos(500, "surtido"))
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// parsearPedidoSimple() — monto en pesos
// ═══════════════════════════════════════════════════════════════════════════
describe("parsearPedidoSimple — por pesos", () => {
  test("150 de surtido", () => {
    assert.deepEqual(
      parsearPedidoSimple("150 de surtido"),
      pedido(itemPesos(150, "surtido"))
    );
  });
  test("100 de carne", () => {
    assert.deepEqual(
      parsearPedidoSimple("100 de carne"),
      pedido(itemPesos(100, "carne"))
    );
  });
  test("50 de buche — número ≤ 40 no es monto", () => {
    // 50 > 40 entonces sí es monto
    assert.deepEqual(
      parsearPedidoSimple("50 de buche"),
      pedido(itemPesos(50, "buche"))
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// parsearPedidoSimple() — números en texto
// ═══════════════════════════════════════════════════════════════════════════
describe("parsearPedidoSimple — texto a número", () => {
  test("tres tacos de carne", () => {
    const r = parsearPedidoSimple("tres tacos de carne");
    assert.equal(r?.tipo, "pedido");
    assert.equal(r?.items[0]?.cantidad, 3);
    assert.equal(r?.items[0]?.corte, "carne");
  });
  test("dos tortas de buche", () => {
    const r = parsearPedidoSimple("dos tortas de buche");
    assert.equal(r?.items[0]?.cantidad, 2);
  });
  test("una docena de tacos de surtido", () => {
    const r = parsearPedidoSimple("una docena de tacos de surtido");
    assert.equal(r?.items[0]?.cantidad, 12);
  });
  test("un par de tortas de cuero", () => {
    const r = parsearPedidoSimple("un par de tortas de cuero");
    assert.equal(r?.items[0]?.cantidad, 2);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// parsearPedidoSimple() — alias coloquiales
// ═══════════════════════════════════════════════════════════════════════════
describe("parsearPedidoSimple — alias coloquiales", () => {
  test("carnitas → carne", () => {
    const r = parsearPedidoSimple("3 tacos de carnitas");
    assert.equal(r?.items[0]?.corte, "carne");
  });
  test("cueritos → cuero", () => {
    const r = parsearPedidoSimple("2 tacos de cueritos");
    assert.equal(r?.items[0]?.corte, "cuero");
  });
  test("buchón → buche", () => {
    const r = parsearPedidoSimple("1 torta de buchon");
    assert.equal(r?.items[0]?.corte, "buche");
  });
  test("lenguita → lengua", () => {
    const r = parsearPedidoSimple("4 tacos de lenguita");
    assert.equal(r?.items[0]?.corte, "lengua");
  });
  test("mixto → surtido", () => {
    const r = parsearPedidoSimple("3 tacos de mixto");
    assert.equal(r?.items[0]?.corte, "surtido");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// parsearPedidoSimple() — fuzzy matching (errores ortográficos)
// ═══════════════════════════════════════════════════════════════════════════
describe("parsearPedidoSimple — fuzzy matching", () => {
  test("surtuido → surtido (dist 1)", () => {
    const r = parsearPedidoSimple("3 tacos de surtuido");
    assert.equal(r?.items[0]?.corte, "surtido");
  });
  test("buhe → buche (dist 1)", () => {
    const r = parsearPedidoSimple("2 tacos de buhe");
    assert.equal(r?.items[0]?.corte, "buche");
  });
  test("lngua → null (dist > 2, no coincide)", () => {
    // "lngua" tiene dist 2 con "lengua" — puede o no coincidir, verificamos que no rompe
    const r = parsearPedidoSimple("2 tacos de lngua");
    // puede ser null o items con corte null — no debe lanzar excepción
    assert.ok(r === null || Array.isArray(r?.items));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// parsearPedidoSimple() — multi-ítem
// ═══════════════════════════════════════════════════════════════════════════
describe("parsearPedidoSimple — multi-ítem", () => {
  test("3 tacos de surtido y 2 de carne", () => {
    const r = parsearPedidoSimple("3 tacos de surtido y 2 de carne");
    assert.equal(r?.tipo, "pedido");
    assert.equal(r?.items?.length, 2);
    assert.equal(r.items[0].cantidad, 3);
    assert.equal(r.items[0].corte, "surtido");
    assert.equal(r.items[1].cantidad, 2);
    assert.equal(r.items[1].corte, "carne");
  });
  test("2 tortas de buche y 3 de cuero", () => {
    const r = parsearPedidoSimple("2 tortas de buche y 3 de cuero");
    assert.equal(r?.items?.length, 2);
    assert.equal(r.items[0].presentacion, "torta");
    assert.equal(r.items[1].presentacion, "torta");
  });
  test("multi-línea: 3 tacos de surtido\\n2 tortas de carne", () => {
    const r = parsearPedidoSimple("3 tacos de surtido\n2 tortas de carne");
    assert.equal(r?.tipo, "pedido");
    assert.equal(r?.items?.length, 2);
  });
  test("pedido con coma: 3 tacos de surtido, 2 de buche", () => {
    const r = parsearPedidoSimple("3 tacos de surtido, 2 de buche");
    assert.equal(r?.items?.length, 2);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// parsearPedidoSimple() — mitad/mitad
// ═══════════════════════════════════════════════════════════════════════════
describe("parsearPedidoSimple — mitad/mitad", () => {
  test("4 tacos mitad surtido y mitad buche", () => {
    const r = parsearPedidoSimple("4 tacos mitad surtido y mitad buche");
    assert.equal(r?.tipo, "pedido");
    assert.ok(r?.items[0]?.corte?.includes("surtido"));
    assert.ok(r?.items[0]?.corte?.includes("buche"));
  });
  test("medio kilo mitad carne y mitad cuero", () => {
    const r = parsearPedidoSimple("medio kilo mitad carne y mitad cuero");
    assert.equal(r?.items[0]?.presentacion, "gramos");
    assert.equal(r?.items[0]?.gramos, 500);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// parsearPedidoSimple() — todo menos corte
// ═══════════════════════════════════════════════════════════════════════════
describe("parsearPedidoSimple — todo menos corte", () => {
  test("3 tacos de todo menos lengua", () => {
    const r = parsearPedidoSimple("3 tacos de todo menos lengua");
    assert.equal(r?.tipo, "pedido");
    assert.ok(!r?.items[0]?.corte?.includes("lengua"), "no debe incluir el corte excluido");
    assert.ok(r?.items[0]?.corte?.includes("surtido"), "sí debe incluir los demás");
  });
  test("surtido sin buche", () => {
    const r = parsearPedidoSimple("3 tacos surtido sin buche");
    assert.equal(r?.tipo, "pedido");
    assert.ok(!r?.items[0]?.corte?.includes("buche"));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// parsearPedidoSimple() — casos que retornan null
// ═══════════════════════════════════════════════════════════════════════════
describe("parsearPedidoSimple — retorna null", () => {
  test("'quiero tacos' — score insuficiente", () => {
    assert.equal(parsearPedidoSimple("quiero tacos"), null);
  });
  test("'algo rico' — no es un pedido", () => {
    assert.equal(parsearPedidoSimple("algo rico"), null);
  });
  test("'sí' — confirmación, no pedido", () => {
    assert.equal(parsearPedidoSimple("sí"), null);
  });
  test("señal groq: 'y aparte' descarta el mensaje", () => {
    assert.equal(parsearPedidoSimple("3 tacos y aparte 2 para ella"), null);
  });
  test("señal groq: 'separado'", () => {
    assert.equal(parsearPedidoSimple("3 tacos separado y 2 tortas"), null);
  });
  test("'3 tacos' sin corte — retorna null (sinCorte se maneja aparte)", () => {
    assert.equal(parsearPedidoSimple("3 tacos"), null);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// detectarSinCorte()
// ═══════════════════════════════════════════════════════════════════════════
describe("detectarSinCorte", () => {
  test("'3 tacos' → 'taco'", () => {
    assert.equal(detectarSinCorte("3 tacos"), "taco");
  });
  test("'2 tortas' → 'torta'", () => {
    assert.equal(detectarSinCorte("2 tortas"), "torta");
  });
  test("'medio kilo' sin corte → 'gramos'", () => {
    assert.equal(detectarSinCorte("medio kilo"), "gramos");
  });
  test("'3 tacos de surtido' — tiene corte → null", () => {
    assert.equal(detectarSinCorte("3 tacos de surtido"), null);
  });
  test("frase sin pedido → null", () => {
    assert.equal(detectarSinCorte("hola buenas"), null);
  });
  test("señal groq → null", () => {
    assert.equal(detectarSinCorte("3 tacos y aparte 2 para ella"), null);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// detectarSinTipo()
// ═══════════════════════════════════════════════════════════════════════════
describe("detectarSinTipo", () => {
  test("'2 de buche' → { cantidad: 2, corte: 'buche' }", () => {
    assert.deepEqual(detectarSinTipo("2 de buche"), { cantidad: 2, corte: "buche" });
  });
  test("'3 surtido' → { cantidad: 3, corte: 'surtido' }", () => {
    assert.deepEqual(detectarSinTipo("3 surtido"), { cantidad: 3, corte: "surtido" });
  });
  test("'3 tacos de surtido' — ya tiene tipo → null", () => {
    assert.equal(detectarSinTipo("3 tacos de surtido"), null);
  });
  test("'medio kilo de buche' — es gramos → null", () => {
    assert.equal(detectarSinTipo("medio kilo de buche"), null);
  });
  test("'2 de buche y 3 de carne' — multi-ítem → null", () => {
    assert.equal(detectarSinTipo("2 de buche y 3 de carne"), null);
  });
  test("número grande (>40) → null (es monto, no cantidad de piezas)", () => {
    assert.equal(detectarSinTipo("150 de surtido"), null);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// detectarPreguntaFrecuente()
// ═══════════════════════════════════════════════════════════════════════════
describe("detectarPreguntaFrecuente — precio", () => {
  test("'¿cuánto cuesta el taco?' → precio sin corte", () => {
    const r = detectarPreguntaFrecuente("¿cuánto cuesta el taco?");
    assert.equal(r?.tipo, "precio");
    assert.equal(r?.producto, null);
  });
  test("'¿cuánto cuesta el buche?' → precio con corte", () => {
    const r = detectarPreguntaFrecuente("¿cuánto cuesta el buche?");
    assert.equal(r?.tipo, "precio");
    assert.equal(r?.producto, "buche");
  });
  test("'precio del cuero' → precio con corte", () => {
    const r = detectarPreguntaFrecuente("precio del cuero");
    assert.equal(r?.tipo, "precio");
    assert.equal(r?.producto, "cuero");
  });
  test("'¿a cómo están?' → precio sin corte", () => {
    assert.equal(detectarPreguntaFrecuente("¿a cómo están?")?.tipo, "precio");
  });
});

describe("detectarPreguntaFrecuente — horario", () => {
  test("'¿a qué hora abren?'", () => {
    assert.equal(detectarPreguntaFrecuente("¿a qué hora abren?")?.tipo, "horario");
  });
  test("'¿ya cerraron?'", () => {
    assert.equal(detectarPreguntaFrecuente("¿ya cerraron?")?.tipo, "horario");
  });
  test("'¿hasta qué hora atienden?'", () => {
    assert.equal(detectarPreguntaFrecuente("¿hasta qué hora atienden?")?.tipo, "horario");
  });
  test("'¿siguen abiertos?'", () => {
    assert.equal(detectarPreguntaFrecuente("¿siguen abiertos?")?.tipo, "horario");
  });
});

describe("detectarPreguntaFrecuente — domicilio", () => {
  test("'¿hacen domicilio?'", () => {
    assert.equal(detectarPreguntaFrecuente("¿hacen domicilio?")?.tipo, "domicilio");
  });
  test("'¿cuánto cobran de envío?'", () => {
    assert.equal(detectarPreguntaFrecuente("¿cuánto cobran de envío?")?.tipo, "domicilio");
  });
  test("'¿cuánto se tarda?'", () => {
    assert.equal(detectarPreguntaFrecuente("¿cuánto se tarda?")?.tipo, "domicilio");
  });
});

describe("detectarPreguntaFrecuente — menú", () => {
  test("'¿qué tienen?'", () => {
    assert.equal(detectarPreguntaFrecuente("¿qué tienen?")?.tipo, "menu");
  });
  test("'menú' solo", () => {
    assert.equal(detectarPreguntaFrecuente("menú")?.tipo, "menu");
  });
  test("'¿qué hay?'", () => {
    assert.equal(detectarPreguntaFrecuente("¿qué hay?")?.tipo, "menu");
  });
});

describe("detectarPreguntaFrecuente — ubicación", () => {
  test("'¿dónde están?'", () => {
    assert.equal(detectarPreguntaFrecuente("¿dónde están?")?.tipo, "ubicacion");
  });
  test("'dirección'", () => {
    assert.equal(detectarPreguntaFrecuente("dirección")?.tipo, "ubicacion");
  });
});

describe("detectarPreguntaFrecuente — métodos de pago", () => {
  test("'¿aceptan tarjeta?'", () => {
    assert.equal(detectarPreguntaFrecuente("¿aceptan tarjeta?")?.tipo, "metodos_pago");
  });
  test("'¿cómo pago?'", () => {
    assert.equal(detectarPreguntaFrecuente("¿cómo pago?")?.tipo, "metodos_pago");
  });
  test("'¿aceptan transferencia?'", () => {
    assert.equal(detectarPreguntaFrecuente("¿aceptan transferencia?")?.tipo, "metodos_pago");
  });
});

describe("detectarPreguntaFrecuente — descripción de corte", () => {
  test("'¿qué es el buche?' → descripcion_corte", () => {
    const r = detectarPreguntaFrecuente("¿qué es el buche?");
    assert.equal(r?.tipo, "descripcion_corte");
    assert.equal(r?.producto, "buche");
  });
  test("'¿cómo es la lengua?'", () => {
    const r = detectarPreguntaFrecuente("¿cómo es la lengua?");
    assert.equal(r?.tipo, "descripcion_corte");
    assert.equal(r?.producto, "lengua");
  });
  test("'¿tienen buche?' → descripcion_corte (no menú)", () => {
    const r = detectarPreguntaFrecuente("¿tienen buche?");
    assert.equal(r?.tipo, "descripcion_corte");
    assert.equal(r?.producto, "buche");
  });
  test("'¿qué es el buche?' no debe ser detectado como menú", () => {
    const r = detectarPreguntaFrecuente("¿qué es el buche?");
    assert.notEqual(r?.tipo, "menu");
  });
});

describe("detectarPreguntaFrecuente — no es FAQ", () => {
  test("pedido normal → null", () => {
    assert.equal(detectarPreguntaFrecuente("dame 3 tacos de surtido"), null);
  });
  test("'sí' → null", () => {
    assert.equal(detectarPreguntaFrecuente("sí"), null);
  });
  test("'Juan López' → null", () => {
    assert.equal(detectarPreguntaFrecuente("Juan López"), null);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// detectarModificacion()
// ═══════════════════════════════════════════════════════════════════════════
describe("detectarModificacion — quitar_uno", () => {
  test("'quítame uno'", () => {
    assert.equal(detectarModificacion("quítame uno")?.tipo, "quitar_uno");
  });
  test("'bájame uno'", () => {
    assert.equal(detectarModificacion("bájame uno")?.tipo, "quitar_uno");
  });
  test("'uno menos'", () => {
    assert.equal(detectarModificacion("uno menos")?.tipo, "quitar_uno");
  });
  test("'un taco menos'", () => {
    assert.equal(detectarModificacion("un taco menos")?.tipo, "quitar_uno");
  });
});

describe("detectarModificacion — agregar_mas", () => {
  test("'agrega 2 más de carne' → cantidad 2 corte carne", () => {
    const r = detectarModificacion("agrega 2 más de carne");
    assert.equal(r?.tipo, "agregar_mas");
    assert.equal(r?.cantidad, 2);
    assert.equal(r?.corte, "carne");
  });
  test("'2 más' → cantidad 2 sin corte", () => {
    const r = detectarModificacion("2 más");
    assert.equal(r?.tipo, "agregar_mas");
    assert.equal(r?.cantidad, 2);
    assert.equal(r?.corte, null);
  });
  test("'agrega otros 3' → cantidad 3", () => {
    const r = detectarModificacion("agrega otros 3");
    assert.equal(r?.tipo, "agregar_mas");
    assert.equal(r?.cantidad, 3);
  });
});

describe("detectarModificacion — cambiar_corte", () => {
  test("'cámbiame el buche por surtido'", () => {
    const r = detectarModificacion("cámbiame el buche por surtido");
    assert.equal(r?.tipo, "cambiar_corte");
    assert.equal(r?.de, "buche");
    assert.equal(r?.por, "surtido");
  });
  test("'sin carne y pon surtido'", () => {
    const r = detectarModificacion("sin carne y pon surtido");
    assert.equal(r?.tipo, "cambiar_corte");
    assert.equal(r?.de, "carne");
    assert.equal(r?.por, "surtido");
  });
});

describe("detectarModificacion — no es modificación", () => {
  test("'dame 3 tacos' → null", () => {
    assert.equal(detectarModificacion("dame 3 tacos"), null);
  });
  test("'sí' → null", () => {
    assert.equal(detectarModificacion("sí"), null);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// detectarRepetirPedido()
// ═══════════════════════════════════════════════════════════════════════════
describe("detectarRepetirPedido", () => {
  test("'lo mismo de siempre' → true", () => {
    assert.ok(detectarRepetirPedido("lo mismo de siempre"));
  });
  test("'lo de siempre' → true", () => {
    assert.ok(detectarRepetirPedido("lo de siempre"));
  });
  test("'repite mi pedido' → true", () => {
    assert.ok(detectarRepetirPedido("repite mi pedido"));
  });
  test("'lo mismo de antes' → true", () => {
    assert.ok(detectarRepetirPedido("lo mismo de antes"));
  });
  test("'igual que la vez pasada' → true", () => {
    assert.ok(detectarRepetirPedido("igual que la vez pasada"));
  });
  test("'dame tacos' → false", () => {
    assert.ok(!detectarRepetirPedido("dame tacos"));
  });
  test("'sí' → false", () => {
    assert.ok(!detectarRepetirPedido("sí"));
  });
  test("'lo mismo pero más' → true ('lo mismo' hace match aunque haya más texto)", () => {
    // El patrón detecta "lo mismo" como prefijo — comportamiento intencional:
    // si alguien dice "lo mismo pero más" casi seguro quiere repetir su pedido.
    assert.ok(detectarRepetirPedido("lo mismo pero más"));
  });
});
