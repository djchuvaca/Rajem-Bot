'use strict';
// Verifica que quesadillas, burritos y vampiros parseen con el módulo Taquería.
// Ejecutar: node scripts/check-nuevos-tipos.js

process.env.BOT_TEST_MODE = '1';

const { initDB }   = require('../src/db/core');
const { seedDB }   = require('../src/db/seed');
const { run }      = require('../src/db/core');
const { parsearPedidoSimple, detectarSinCorte, detectarSinTipo, invalidarCacheCortes, listaItemTypes } = require('../src/handlers/pedidoParser');

async function main() {
  await initDB();
  await seedDB();

  // Activar los tres item_types nuevos en la BD de prueba
  run("UPDATE item_types SET activo = 1 WHERE slug IN ('quesadilla','burrito','vampiro')");
  invalidarCacheCortes();

  let ok = 0, fail = 0;

  function check(label, resultado, esperado) {
    const pass = JSON.stringify(resultado) === JSON.stringify(esperado);
    if (pass) {
      console.log(`  ✅ ${label}`);
      ok++;
    } else {
      console.log(`  ❌ ${label}`);
      console.log(`     Esperado:  ${JSON.stringify(esperado)}`);
      console.log(`     Obtenido:  ${JSON.stringify(resultado)}`);
      fail++;
    }
  }

  function checkNotNull(label, resultado) {
    if (resultado !== null && resultado !== undefined) {
      console.log(`  ✅ ${label} → ${JSON.stringify(resultado)}`);
      ok++;
    } else {
      console.log(`  ❌ ${label} → null/undefined`);
      fail++;
    }
  }

  function checkNull(label, resultado) {
    if (resultado === null || resultado === undefined) {
      console.log(`  ✅ ${label} → null (correcto)`);
      ok++;
    } else {
      console.log(`  ❌ ${label} → debería ser null, fue: ${JSON.stringify(resultado)}`);
      fail++;
    }
  }

  // ── listaItemTypes ────────────────────────────────────────────────────────
  console.log('\n── listaItemTypes ──');
  const lista = listaItemTypes();
  const listaSolo = listaItemTypes(true);
  console.log(`  listaItemTypes()      = "${lista}"`);
  console.log(`  listaItemTypes(true)  = "${listaSolo}"`);
  const incluyeQue = lista.includes('quesadilla') || lista.includes('quesa');
  const soloSinGramos = !listaSolo.includes('100gr') && !listaSolo.includes('cantidad');
  if (incluyeQue) { console.log('  ✅ quesadilla aparece en lista completa'); ok++; }
  else             { console.log('  ❌ quesadilla NO aparece en lista completa'); fail++; }
  if (soloSinGramos) { console.log('  ✅ listaItemTypes(true) excluye gramos/pesos'); ok++; }
  else                { console.log('  ❌ listaItemTypes(true) sigue incluyendo gramos/pesos'); fail++; }

  // ── QUESADILLAS — ítem simple con corte ──────────────────────────────────
  console.log('\n── Quesadillas (parsearPedidoSimple) ──');
  check('2 quesadillas de carne',
    parsearPedidoSimple('2 quesadillas de carne'),
    { tipo: 'pedido', items: [{ presentacion: 'quesadilla', cantidad: 2, corte: 'carne' }] }
  );
  check('3 quesadillas de surtido',
    parsearPedidoSimple('3 quesadillas de surtido'),
    { tipo: 'pedido', items: [{ presentacion: 'quesadilla', cantidad: 3, corte: 'surtido' }] }
  );
  check('una quesadilla de buche',
    parsearPedidoSimple('1 quesadilla de buche'),
    { tipo: 'pedido', items: [{ presentacion: 'quesadilla', cantidad: 1, corte: 'buche' }] }
  );

  // ── BURRITOS ──────────────────────────────────────────────────────────────
  console.log('\n── Burritos (parsearPedidoSimple) ──');
  check('2 burritos de carne',
    parsearPedidoSimple('2 burritos de carne'),
    { tipo: 'pedido', items: [{ presentacion: 'burrito', cantidad: 2, corte: 'carne' }] }
  );
  check('1 burrito de surtido',
    parsearPedidoSimple('1 burrito de surtido'),
    { tipo: 'pedido', items: [{ presentacion: 'burrito', cantidad: 1, corte: 'surtido' }] }
  );
  check('3 burritos de lengua',
    parsearPedidoSimple('3 burritos de lengua'),
    { tipo: 'pedido', items: [{ presentacion: 'burrito', cantidad: 3, corte: 'lengua' }] }
  );
  // Alias "burrita"
  check('2 burritas de carne (alias)',
    parsearPedidoSimple('2 burritas de carne'),
    { tipo: 'pedido', items: [{ presentacion: 'burrito', cantidad: 2, corte: 'carne' }] }
  );

  // ── VAMPIROS ──────────────────────────────────────────────────────────────
  console.log('\n── Vampiros (parsearPedidoSimple) ──');
  check('2 vampiros de carne',
    parsearPedidoSimple('2 vampiros de carne'),
    { tipo: 'pedido', items: [{ presentacion: 'vampiro', cantidad: 2, corte: 'carne' }] }
  );
  check('4 vampiros de surtido',
    parsearPedidoSimple('4 vampiros de surtido'),
    { tipo: 'pedido', items: [{ presentacion: 'vampiro', cantidad: 4, corte: 'surtido' }] }
  );
  check('1 vampiro de buche',
    parsearPedidoSimple('1 vampiro de buche'),
    { tipo: 'pedido', items: [{ presentacion: 'vampiro', cantidad: 1, corte: 'buche' }] }
  );

  // ── SIN CORTE — detectarSinCorte ─────────────────────────────────────────
  console.log('\n── Sin corte (detectarSinCorte) ──');
  check('detectarSinCorte("2 quesadillas") → quesadilla',
    detectarSinCorte('2 quesadillas'), 'quesadilla'
  );
  check('detectarSinCorte("3 burritos") → burrito',
    detectarSinCorte('3 burritos'), 'burrito'
  );
  check('detectarSinCorte("2 vampiros") → vampiro',
    detectarSinCorte('2 vampiros'), 'vampiro'
  );

  // ── SIN TIPO — detectarSinTipo ────────────────────────────────────────────
  console.log('\n── Sin tipo (detectarSinTipo) ──');
  checkNotNull('detectarSinTipo("3 de carne") → no null', detectarSinTipo('3 de carne'));
  checkNull('detectarSinTipo("3 quesadillas de carne") → null (ya tiene tipo)',
    detectarSinTipo('3 quesadillas de carne')
  );

  // ── MULTI-ÍTEM — herencia ultimoTipo ──────────────────────────────────────
  console.log('\n── Multi-ítem (herencia ultimoTipo) ──');
  checkNotNull('2 quesadillas de carne, 2 de surtido',
    parsearPedidoSimple('2 quesadillas de carne, 2 de surtido')
  );
  const multiQ = parsearPedidoSimple('2 quesadillas de carne, 2 de surtido');
  if (multiQ) {
    const [it1, it2] = multiQ.items;
    check('ítem 1: quesadilla/carne', it1, { presentacion: 'quesadilla', cantidad: 2, corte: 'carne' });
    check('ítem 2 hereda quesadilla/surtido', it2, { presentacion: 'quesadilla', cantidad: 2, corte: 'surtido' });
  }
  checkNotNull('2 burritos de buche, 1 de lengua',
    parsearPedidoSimple('2 burritos de buche, 1 de lengua')
  );

  // ── MEZCLA DE TIPOS ───────────────────────────────────────────────────────
  console.log('\n── Mezcla de tipos ──');
  checkNotNull('2 tacos de carne y 1 quesadilla de buche',
    parsearPedidoSimple('2 tacos de carne y 1 quesadilla de buche')
  );

  // ── GRAMOS Y PESOS siguen funcionando ────────────────────────────────────
  console.log('\n── Gramos y pesos (sin regresión) ──');
  check('medio kilo de carne → gramos 500',
    parsearPedidoSimple('medio kilo de carne'),
    { tipo: 'pedido', items: [{ presentacion: 'gramos', gramos: 500, corte: 'carne' }] }
  );
  check('300g de buche → gramos 300',
    parsearPedidoSimple('300g de buche'),
    { tipo: 'pedido', items: [{ presentacion: 'gramos', gramos: 300, corte: 'buche' }] }
  );
  check('$100 de carne → pesos 100',
    parsearPedidoSimple('$100 de carne'),
    { tipo: 'pedido', items: [{ presentacion: 'pesos', monto: 100, corte: 'carne' }] }
  );

  // ── TACOS Y TORTAS sin regresión ──────────────────────────────────────────
  console.log('\n── Tacos y tortas (sin regresión) ──');
  check('3 tacos de surtido',
    parsearPedidoSimple('3 tacos de surtido'),
    { tipo: 'pedido', items: [{ presentacion: 'taco', cantidad: 3, corte: 'surtido' }] }
  );
  check('2 tortas de carne',
    parsearPedidoSimple('2 tortas de carne'),
    { tipo: 'pedido', items: [{ presentacion: 'torta', cantidad: 2, corte: 'carne' }] }
  );

  // ── RESUMEN ───────────────────────────────────────────────────────────────
  console.log(`\n${'─'.repeat(50)}`);
  console.log(`Resultado: ${ok} ✅  ${fail} ❌  (total ${ok + fail})`);
  if (fail > 0) process.exit(1);
}

main().catch(e => { console.error(e); process.exit(1); });
