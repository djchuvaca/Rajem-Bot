/**
 * scripts/test-taqueria-flujo.js
 * Pruebas de toma de orden y modificaciones — Taquería de Carnitas
 * Uso: BOT_TEST_MODE=1 node scripts/test-taqueria-flujo.js
 */
'use strict';

process.env.BOT_TEST_MODE = '1';
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const { initDB } = require('../src/db/core');
initDB();
const { seedDB } = require('../src/db/seed');

(async () => {
await seedDB();

const {
  parsearPedidoSimple, detectarSinCorte, detectarSinTipo, detectarModificacion,
  getCortes, buscarCorteFuzzy, normalizar, detectarTipoItemDesdeTexto,
  detectarPreguntaFrecuente,
} = require('../src/handlers/pedidoParser');

// ─── Mini runner ─────────────────────────────────────────────────────────────
let pass = 0, fail = 0;
const bugs = [];

function ok(desc, cond, detalle = '') {
  if (cond) {
    console.log(`  ✅ ${desc}`);
    pass++;
  } else {
    const msg = `${desc}${detalle ? '  →  ' + detalle : ''}`;
    console.log(`  ❌ ${msg}`);
    fail++;
    bugs.push(msg);
  }
}

function sec(t) {
  console.log(`\n${'─'.repeat(70)}\n  ${t}\n${'─'.repeat(70)}`);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function parsear(t) { return parsearPedidoSimple(t); }
function items(t)   { return parsear(t)?.items ?? []; }
function item0(t)   { return items(t)[0] ?? null; }

// Regex exportados de orden.js (se prueban directamente)
const PAT_ITEM_CORTE = /(?:(?:la|el|los|las)\s+)?(\w+)\s+cambia(?:me(?:la|lo)?|la|lo|le|n)?(?:\s+de\s+\w+)?\s+por\s+(\w+)|cambia(?:me|le)?\s+(?:la|el|los|las)\s+(\w+)\s+por\s+(\w+)/i;
const PAT_CAMBIO_TIPO = /cambia(?:me|le)?\s+(?:(?:la|el|los|las)\s+)?(\w+)(?:\s+de\s+(\w+))?\s+por\s+(?:un[ao]?\s+)?(\w+)(?:\s+de\s+(\w+))?/i;
const PAT_CANCEL      = /\b(cancel[ae](?:me|la|lo|r(?:\s+(?:mi\s+)?pedido)?)?|ya\s+no\s+quiero|borra(?:lo|la|me)?|elimina(?:lo|la|r)?|no\s+quiero\s+nada|olvida(?:lo|la|r)?|d[eé]jalo?\s+as[ií]|no\s+importa)\b/i;
const PAT_NO_VAR      = /^(no|nel|nop|nope|incorrecto|error|no\s+es\s+correcto|no\s+est[aá]\s+bien)$/i;
const PAT_CONFIRMACION = /^(s[ií]|si|sip|sips|dale|va|órale|orale|correcto|exacto|eso|así|claro|perfecto|ándale|andale|de\s+una|sale|listo)$/i;

// ═════════════════════════════════════════════════════════════════════════════
sec('1. DETECCIÓN DE TIPOS DE ÍTEM');
// ═════════════════════════════════════════════════════════════════════════════

const casos_tipos = [
  ['taco',         'taco'],
  ['tacos',        'taco'],   // plural
  ['taquito',      'taco'],   // alias
  ['torta',        'torta'],
  ['tortas',       'torta'],
  ['sándwich',     'torta'],  // alias
  ['quesadilla',   'quesadilla'],
  ['quesadillas',  'quesadilla'],
  ['quesa',        'quesadilla'], // alias
  ['vampiro',      'vampiro'],
  ['vampiros',     'vampiro'],
  ['burrito',      'burrito'],
  ['burritos',     'burrito'],
  ['gramos',       'gramos'],
];

for (const [input, esperado] of casos_tipos) {
  const r = detectarTipoItemDesdeTexto(input);
  ok(`"${input}" → slug ${esperado}`, r?.slug === esperado, `obtenido: ${r?.slug}`);
}

const no_tipos = ['buche', 'carne', 'cuero', 'lengua', 'surtido', 'costilla', 'pizza', 'tamal'];
for (const w of no_tipos) {
  ok(`"${w}" NO es tipo ítem`, !detectarTipoItemDesdeTexto(w), `detectó: ${detectarTipoItemDesdeTexto(w)?.slug}`);
}

// ═════════════════════════════════════════════════════════════════════════════
sec('2. CORTES ACTIVOS — getCortes()');
// ═════════════════════════════════════════════════════════════════════════════

const cortesMap = getCortes();
console.log('  Cortes activos: ' + [...new Set(Object.values(cortesMap))].join(', '));

const cortes_requeridos = [
  ['buche',     'buche'],
  ['cuero',     'cuero'],
  ['cueritos',  'cuero'],
  ['lengua',    'lengua'],
  ['surtido',   'surtido'],
  ['costilla',  'costilla'],
];
for (const [alias, slug] of cortes_requeridos) {
  ok(`"${alias}" → slug ${slug}`, cortesMap[alias] === slug, `obtenido: ${cortesMap[alias]}`);
}

// Carne/Maciza puede estar bajo "carne" o "maciza"
ok('"carne" o "maciza" activo',
  !!(cortesMap['carne'] || cortesMap['maciza']),
  `carne=${cortesMap['carne']} maciza=${cortesMap['maciza']}`);

// ═════════════════════════════════════════════════════════════════════════════
sec('3. FUZZY — typos y falsos positivos');
// ═════════════════════════════════════════════════════════════════════════════

ok('"buese" → buche (distancia 2)',    buscarCorteFuzzy('buese') === 'buche',   buscarCorteFuzzy('buese'));
ok('"buchee" → buche',                buscarCorteFuzzy('buchee') === 'buche',  buscarCorteFuzzy('buchee'));
ok('"cueros" → cuero',                buscarCorteFuzzy('cueros') === 'cuero',  buscarCorteFuzzy('cueros'));
ok('"lenguita" → lengua',             buscarCorteFuzzy('lenguita') === 'lengua', buscarCorteFuzzy('lenguita'));

// Falsos positivos — item types NO deben resolverse como corte
ok('"taco" NO fuzzy-mapea a corte',       !buscarCorteFuzzy('taco'),       `obtenido: ${buscarCorteFuzzy('taco')}`);
ok('"torta" NO fuzzy-mapea a corte',      !buscarCorteFuzzy('torta'),      `obtenido: ${buscarCorteFuzzy('torta')}`);
ok('"burritos" NO → cuero (bug histórico)',!buscarCorteFuzzy('burritos'),  `obtenido: ${buscarCorteFuzzy('burritos')}`);
ok('"quesadilla" NO es corte',            !buscarCorteFuzzy('quesadilla'),`obtenido: ${buscarCorteFuzzy('quesadilla')}`);
ok('"vampiro" NO es corte',               !buscarCorteFuzzy('vampiro'),    `obtenido: ${buscarCorteFuzzy('vampiro')}`);

// ═════════════════════════════════════════════════════════════════════════════
sec('4. PARSING BÁSICO — órdenes simples');
// ═════════════════════════════════════════════════════════════════════════════

{
  const r = item0('3 tacos de buche');
  ok('3 tacos de buche → pres=taco cnt=3 corte=buche',
    r?.presentacion === 'taco' && r?.cantidad === 3 && r?.corte === 'buche', JSON.stringify(r));
}
{
  const r = item0('dos tortas de cuero');
  ok('dos tortas de cuero → pres=torta cnt=2 corte=cuero',
    r?.presentacion === 'torta' && r?.cantidad === 2 && r?.corte === 'cuero', JSON.stringify(r));
}
{
  const r = item0('una quesadilla de costilla');
  ok('una quesadilla de costilla → quesadilla/1/costilla',
    r?.presentacion === 'quesadilla' && r?.cantidad === 1 && r?.corte === 'costilla', JSON.stringify(r));
}
{
  const r = item0('dame un taco de lengua');
  ok('dame un taco de lengua → taco/1/lengua',
    r?.presentacion === 'taco' && r?.cantidad === 1 && r?.corte === 'lengua', JSON.stringify(r));
}
{
  const r = item0('quiero 4 tortas de surtido');
  ok('4 tortas de surtido → torta/4/surtido',
    r?.presentacion === 'torta' && r?.cantidad === 4 && r?.corte === 'surtido', JSON.stringify(r));
}
{
  const r = item0('2 quesadillas de carne');
  ok('2 quesadillas de carne → quesadilla/2/carne',
    r?.presentacion === 'quesadilla' && r?.cantidad === 2 && !!(r?.corte), JSON.stringify(r));
}
{
  const r = item0('taco de surtido especial');
  ok('taco de surtido especial → corte surtido o surtido_especial',
    r?.presentacion === 'taco' && !!(r?.corte), JSON.stringify(r));
}

// ═════════════════════════════════════════════════════════════════════════════
sec('5. PARSING POR GRAMOS Y PESOS');
// ═════════════════════════════════════════════════════════════════════════════

{
  const r = item0('200 gramos de buche');
  // presentacion='gramos', cantidad=200 (campo cantidad, no gramos), corte='buche'
  ok('200 gramos de buche → gramos/200/buche',
    r?.presentacion === 'gramos' && (r?.cantidad === 200 || r?.gramos === 200) && r?.corte === 'buche', JSON.stringify(r));
}
{
  const r = item0('100gr de cuero');
  ok('100gr de cuero → gramos con corte cuero',
    r?.presentacion === 'gramos' && r?.corte === 'cuero', JSON.stringify(r));
}
{
  const r = item0('medio kilo de surtido');
  ok('medio kilo de surtido → gramos/500/surtido',
    r?.presentacion === 'gramos' && r?.corte === 'surtido', JSON.stringify(r));
}
{
  const r = item0('$150 de carne');
  // presentacion puede ser 'por_pesos' o 'pesos' según runtime
  ok('$150 de carne → pesos/150',
    (r?.presentacion === 'por_pesos' || r?.presentacion === 'pesos') && r?.monto === 150, JSON.stringify(r));
}
{
  const r = item0('dame 200 de carne');
  ok('"200 de carne" parsea algo (no null)', r !== null, JSON.stringify(r));
  if (r) ok('"200 de carne" tiene corte', !!(r?.corte), JSON.stringify(r));
}
{
  const r = item0('ponme para 100 de buche');
  ok('"ponme para 100 de buche" → pesos con buche',
    r && (r?.presentacion === 'por_pesos' || r?.presentacion === 'pesos') && r?.corte === 'buche', JSON.stringify(r));
}

// ═════════════════════════════════════════════════════════════════════════════
sec('6. MULTI-ÍTEM Y HERENCIA DE TIPO');
// ═════════════════════════════════════════════════════════════════════════════

{
  const r = items('3 tacos de buche y 2 tortas de cuero');
  ok('3 tacos buche + 2 tortas cuero → 2 ítems', r.length === 2, `length=${r.length}`);
  ok('  ítem 0: taco/3/buche', r[0]?.presentacion === 'taco' && r[0]?.cantidad === 3 && r[0]?.corte === 'buche', JSON.stringify(r[0]));
  ok('  ítem 1: torta/2/cuero', r[1]?.presentacion === 'torta' && r[1]?.cantidad === 2 && r[1]?.corte === 'cuero', JSON.stringify(r[1]));
}
{
  const r = items('3 tortas de buche 2 de surtido una quesadilla de costilla');
  ok('tortas buche + surtido + quesadilla costilla → 3 ítems', r.length === 3, `items=${JSON.stringify(r.map(i => `${i.cantidad} ${i.presentacion} ${i.corte}`))}`);
  ok('  herencia tipo: 2° ítem es torta de surtido',
    r[1]?.presentacion === 'torta' && r[1]?.corte === 'surtido', JSON.stringify(r[1]));
}
{
  // "y aparte" debe limpiarse como conector (no confundir con bebida)
  const r = items('2 tacos de buche y aparte uno de cuero');
  ok('"y aparte" → al menos 1 ítem (no rompe parser)', r.length >= 1, `items=${r.length}`);
}
{
  // Orden texto numérico compuesto
  const r = items('dame treinta y dos tacos de surtido');
  ok('"treinta y dos tacos" → cantidad 32', item0('dame treinta y dos tacos de surtido')?.cantidad === 32,
    `cantidad=${item0('dame treinta y dos tacos de surtido')?.cantidad}`);
}

// ═════════════════════════════════════════════════════════════════════════════
sec('7. SIN CORTE / SIN TIPO');
// ═════════════════════════════════════════════════════════════════════════════

ok('"3 tacos" → sinCorte true',
  !!detectarSinCorte('3 tacos'),          detectarSinCorte('3 tacos'));
ok('"dame un taco" → sinCorte true',
  !!detectarSinCorte('dame un taco'),     detectarSinCorte('dame un taco'));
ok('"quiero tortas" → sinCorte true',
  !!detectarSinCorte('quiero tortas'),    detectarSinCorte('quiero tortas'));
ok('"3 tacos de buche" → sinCorte false',
  !detectarSinCorte('3 tacos de buche'), detectarSinCorte('3 tacos de buche'));

ok('"dame 3 de buche" → sinTipo detectado',
  !!detectarSinTipo('dame 3 de buche'),  detectarSinTipo('dame 3 de buche'));
ok('"dame 3 de buche" NO es sinCorte (tiene corte)',
  !detectarSinCorte('dame 3 de buche'), detectarSinCorte('dame 3 de buche'));

// ═════════════════════════════════════════════════════════════════════════════
sec('8. detectarModificacion');
// ═════════════════════════════════════════════════════════════════════════════

{
  const m = detectarModificacion('cambia el surtido por buche');
  ok('"cambia el surtido por buche" → cambiar_corte', m?.tipo === 'cambiar_corte', JSON.stringify(m));
  ok('  de=surtido',  m?.de  === 'surtido', `de=${m?.de}`);
  ok('  por=buche',   m?.por === 'buche',   `por=${m?.por}`);
}
{
  const m = detectarModificacion('mejor buche que cuero');
  ok('"mejor buche que cuero" → cambiar_corte', m?.tipo === 'cambiar_corte', JSON.stringify(m));
}
{
  const m = detectarModificacion('en lugar de cuero ponme lengua');
  ok('"en lugar de cuero ponme lengua" → cambiar_corte', m?.tipo === 'cambiar_corte', JSON.stringify(m));
}
{
  const m = detectarModificacion('quita uno');
  ok('"quita uno" → quitar_uno', m?.tipo === 'quitar_uno', JSON.stringify(m));
}
{
  const m = detectarModificacion('agrega 2 más');
  ok('"agrega 2 más" → agregar_mas/2', m?.tipo === 'agregar_mas' && m?.cantidad === 2, JSON.stringify(m));
}
{
  const m = detectarModificacion('ponme 3 más');
  ok('"ponme 3 más" → agregar_mas/3', m?.tipo === 'agregar_mas' && m?.cantidad === 3, JSON.stringify(m));
}
{
  const m = detectarModificacion('súmame uno más');
  ok('"súmame uno más" → agregar_mas/1', m?.tipo === 'agregar_mas', JSON.stringify(m));
}
{
  const m = detectarModificacion('quita el de cuero');
  ok('"quita el de cuero" → quitar_uno con corte cuero',
    m?.tipo === 'quitar_uno' && (m?.corte === 'cuero' || !m?.corte), JSON.stringify(m));
}

// ═════════════════════════════════════════════════════════════════════════════
sec('9. PATRONES DE MODIFICACIÓN EN CONFIRMACIÓN (regex)');
// ═════════════════════════════════════════════════════════════════════════════

// 9a. mItemCorte — "la [tipo] cambiala/cambiame por [corte]"
{
  const m = 'la quesadilla cambiala por cuero'.match(PAT_ITEM_CORTE);
  ok('"la quesadilla cambiala por cuero" → mItemCorte captura', !!m, String(m?.slice(1)));
  if (m) {
    const rawItem  = normalizar(m[1] || m[3] || '');
    const rawCorte = normalizar(m[2] || m[4] || '');
    const tipoItem = detectarTipoItemDesdeTexto(rawItem);
    ok('  tipoItem=quesadilla', tipoItem?.slug === 'quesadilla', rawItem);
    ok('  corteNuevo=cuero activo', !!cortesMap[rawCorte], rawCorte);
  }
}
{
  const m = 'la torta cambiamela por costilla'.match(PAT_ITEM_CORTE);
  ok('"la torta cambiamela por costilla" → mItemCorte captura', !!m, String(m?.slice(1)));
}
{
  // "cambia la torta por una quesadilla" — mItemCorte captura g4="una" que NO es corte
  // → debe pasar graciosamente al mCambioTipo
  const m = 'cambia la torta por una quesadilla'.match(PAT_ITEM_CORTE);
  if (m) {
    const rawCorte = normalizar(m[2] || m[4] || '');
    ok('"cambia la torta por una quesadilla" → mItemCorte captura "una" (no es corte → pasa a mCambioTipo)',
      !cortesMap[rawCorte] && !buscarCorteFuzzy(rawCorte), `rawCorte="${rawCorte}"`);
  } else {
    ok('"cambia la torta por una quesadilla" → mItemCorte no aplica', true);
  }
}

// 9b. mCambioTipo — swap de tipo de ítem
const casosTipoSwap = [
  // [input, g1_esperado, g2_esperado, g3_esperado]
  ['cambia la torta por una quesadilla',         'torta',      null,       'quesadilla'],
  ['cambia la quesadilla de costilla por torta', 'quesadilla', 'costilla', 'torta'],
  ['cambia la torta de buche por una quesadilla','torta',      'buche',    'quesadilla'],
  ['cambiame el taco por una torta',             'taco',       null,       'torta'],
];

for (const [input, g1, g2, g3] of casosTipoSwap) {
  const m = input.match(PAT_CAMBIO_TIPO);
  ok(`"${input}" → mCambioTipo captura`, !!m, 'null');
  if (m) {
    ok(`  g1=${g1}`, normalizar(m[1]) === g1, m[1]);
    if (g2) ok(`  g2=${g2}`, normalizar(m[2] || '') === g2, m[2]);
    ok(`  g3=${g3}`, normalizar(m[3]) === g3, m[3]);
    const tv = detectarTipoItemDesdeTexto(normalizar(m[1]));
    const tn = detectarTipoItemDesdeTexto(normalizar(m[3]));
    ok(`  tipoViejo=${g1} detectado`, !!tv, JSON.stringify(tv));
    ok(`  tipoNuevo=${g3} detectado`, !!tn, JSON.stringify(tn));
  }
}

// 9c. "cambia la torta de buche por cuero" — Caso B: tipoViejo detectado, rawNuevo es corte
{
  const input = 'cambia la torta de buche por cuero';
  const mCT = input.match(PAT_CAMBIO_TIPO);
  ok(`"${input}" → mCambioTipo captura`, !!mCT, 'null');
  if (mCT) {
    const tipoViejo = detectarTipoItemDesdeTexto(normalizar(mCT[1] || ''));
    const tipoNuevo = detectarTipoItemDesdeTexto(normalizar(mCT[3] || ''));
    const corteNuevo = cortesMap[normalizar(mCT[3] || '')] || buscarCorteFuzzy(normalizar(mCT[3] || ''));
    ok(`  tipoViejo=torta detectado`, !!tipoViejo, JSON.stringify(tipoViejo));
    ok(`  tipoNuevo=null (cuero es corte)`, !tipoNuevo, JSON.stringify(tipoNuevo));
    ok(`  corteNuevo=cuero activo (Caso B cubre esto)`, !!corteNuevo, `corteNuevo=${corteNuevo}`);
  }
}

// 9d. "cambia la torta cambiamela" — ahora mItemCorte captura "cambiamela"
{
  const m = 'la torta cambiamela por costilla'.match(PAT_ITEM_CORTE);
  ok('"la torta cambiamela por costilla" → mItemCorte captura', !!m, String(m?.slice(1)));
}

// 9e. "súmame uno más" — detectarModificacion con textoANumero
{
  const m = detectarModificacion('súmame uno más');
  ok('"súmame uno más" → agregar_mas', m?.tipo === 'agregar_mas', JSON.stringify(m));
  ok('  cantidad=1', m?.cantidad === 1, `cantidad=${m?.cantidad}`);
}

// ═════════════════════════════════════════════════════════════════════════════
sec('10. CANCEL vs NOVARIANTE vs CONFIRMACIÓN');
// ═════════════════════════════════════════════════════════════════════════════

// En el código real, esCancel y esNoVariante se prueban contra normalizar(textoOriginal)
// (sin acentos), por eso los tests también normalizan.
const n = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

const cancelSi = ['cancela', 'cancélame', 'cancela mi pedido', 'ya no quiero', 'bórralo', 'borralo', 'no quiero nada', 'olvídalo', 'olvídalo todo'];
const cancelNo = ['no', 'nel', 'nope', 'incorrecto'];
const noVar    = ['no', 'nel', 'nop', 'nope', 'incorrecto', 'error', 'no está bien', 'no es correcto'];
const noNoVar  = ['cancela', 'ya no quiero', 'sí', 'dale'];
const confSi   = ['sí', 'si', 'sip', 'dale', 'va', 'órale', 'correcto', 'exacto', 'listo', 'de una', 'sale'];
const confNo   = ['no', 'nel', 'cancela', 'espera'];

for (const w of cancelSi) {
  ok(`esCancel("${w}") = true`, PAT_CANCEL.test(n(w)), `PAT_CANCEL no detectó "${n(w)}"`);
}
for (const w of cancelNo) {
  ok(`esCancel("${w}") = false (es NoVariante)`, !PAT_CANCEL.test(n(w)), `PAT_CANCEL detectó "${n(w)}" como cancel`);
}
for (const w of noVar) {
  ok(`esNoVariante("${w}") = true`, PAT_NO_VAR.test(n(w)), `PAT_NO_VAR no detectó "${n(w)}"`);
}
for (const w of noNoVar) {
  ok(`esNoVariante("${w}") = false`, !PAT_NO_VAR.test(n(w)), `PAT_NO_VAR detectó "${n(w)}"`);
}
for (const w of confSi) {
  ok(`confirmación("${w}") = true`, PAT_CONFIRMACION.test(w.trim()), `PAT_CONF no detectó "${w}"`);
}
for (const w of confNo) {
  ok(`confirmación("${w}") = false`, !PAT_CONFIRMACION.test(w.trim()), `PAT_CONF detectó "${w}"`);
}

// ═════════════════════════════════════════════════════════════════════════════
sec('11. FAQs DURANTE FLUJO DE PEDIDO');
// ═════════════════════════════════════════════════════════════════════════════

const faqCasos = [
  ['¿cuánto cuesta el taco?',      'precio'],
  ['¿a qué hora abren?',           'horario'],
  ['¿hacen domicilio?',            'domicilio'],
  ['¿cuánto es el envío?',         'domicilio'],
  ['¿cuál es el menú?',            'menu'],
  ['¿dónde están?',                'ubicacion'],
  ['¿cómo pago?',                  'metodos_pago'],
  ['¿ya está listo mi pedido?',    'pedido_listo'],
  ['¿ya van en camino?',           'ya_en_camino'],
  ['¿cuánto llevo?',               'total_parcial'],
  ['gracias, hasta luego',         'despedida'],
];

for (const [pregunta, intentoEsperado] of faqCasos) {
  const r = detectarPreguntaFrecuente(pregunta);
  ok(`FAQ: "${pregunta}" → ${intentoEsperado}`, r?.tipo === intentoEsperado, `obtenido: ${r?.tipo}`);
}

// "pedido_listo" debe detectarse ANTES que "horario"
{
  const r1 = detectarPreguntaFrecuente('¿ya están listos?');
  const r2 = detectarPreguntaFrecuente('¿ya están?');
  ok('"¿ya están listos?" NO es horario', r1?.tipo !== 'horario', `tipo=${r1?.tipo}`);
  ok('"¿ya están listos?" es pedido_listo', r1?.tipo === 'pedido_listo', `tipo=${r1?.tipo}`);
}

// ═════════════════════════════════════════════════════════════════════════════
sec('12. EDGE CASES Y FRASES ESPECIALES');
// ═════════════════════════════════════════════════════════════════════════════

// "de todos/de todo/cualquiera" → surtido en esperandoCorte
// Se verifica indirectamente: "surtido" está en cortesMap
ok('"de todos" alias de surtido activo',
  !!(cortesMap['de todo'] || cortesMap['todos los cortes'] || cortesMap['surtido']),
  `surtido=${cortesMap['surtido']}`);

// Plural de "tortas" en línea de pedido — detectarTipoItemDesdeTexto en contexto de línea
{
  const lineaConPlural = '🥖 2 tortas de buche — $90';
  const tipo = detectarTipoItemDesdeTexto('tortas');
  const nombrePlural = tipo?.nombre_plural ?? '';
  const regex = new RegExp(`\\b(${normalizar(tipo?.nombre ?? '')}|${tipo?.slug ?? ''}|${normalizar(nombrePlural)})\\b`, 'i');
  ok('regex con nombre_plural encuentra "tortas" en línea de pedido',
    regex.test(normalizar(lineaConPlural)), `tipo=${JSON.stringify(tipo?.nombre_plural)}`);
}

// Texto numérico compuesto — con tipo de ítem explícito
{
  const r = item0('veinte y uno tacos de buche');
  ok('"veinte y uno tacos de buche" → cantidad 21',
    r?.cantidad === 21 && r?.presentacion === 'taco' && r?.corte === 'buche', JSON.stringify(r));
}
// Sin tipo: "veinte y uno de buche" → null es comportamiento correcto (sinTipo)
{
  const r = item0('veinte y uno de buche');
  ok('"veinte y uno de buche" sin tipo → null (sinTipo, comportamiento correcto)', r === null, JSON.stringify(r));
}

// Acento opcional en esNoVariante ("está")
ok('"no esta bien" → esNoVariante',  PAT_NO_VAR.test('no esta bien'),  'sin acento en "esta"');
ok('"no está bien" → esNoVariante',  PAT_NO_VAR.test('no está bien'),  'con acento en "está"');

// "no importa" — ¿es cancel o neutral?
ok('"no importa" es esCancel', PAT_CANCEL.test('no importa'), 'si es intención de cancelar');

// Surtido especial — slug con espacio
{
  const r = item0('un taco de surtido especial');
  ok('"surtido especial" parsea con corte', r?.corte !== null && r?.corte !== undefined, JSON.stringify(r));
}

// ═════════════════════════════════════════════════════════════════════════════
// RESUMEN
// ═════════════════════════════════════════════════════════════════════════════
console.log(`\n${'═'.repeat(70)}`);
console.log(`  RESULTADO: ${pass} ✅ pasaron  |  ${fail} ❌ fallaron  |  ${pass + fail} total`);
if (bugs.length) {
  console.log('\n  BUGS / FALLOS DETECTADOS:');
  bugs.forEach((b, i) => console.log(`    ${i + 1}. ${b}`));
}
console.log('═'.repeat(70) + '\n');

})().catch(e => { console.error('Error inicializando:', e.message); process.exit(1); });
