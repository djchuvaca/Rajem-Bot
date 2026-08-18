'use strict';

const { test, before } = require('node:test');
const assert            = require('node:assert/strict');
const { initDB }        = require('../src/db/core');
const { seedDB }        = require('../src/db/seed');
const { setConfig }     = require('../src/db/config');
const { enrutarComando, resolverEsAdmin } = require('../src/handlers/comandos/router');
const { obtenerComandos, _resetearRegistro } = require('../src/handlers/comandos/registro');
const { CONTEXTO, PERMISO } = require('../src/handlers/comandos/tipos');

// ── Helpers de test ───────────────────────────────────────────────────────────

const GRUPO_ADMIN = '120363000000000001@g.us';

function mkMsg(overrides = {}) {
  const respuestas = [];
  return {
    body:   overrides.body   || '',
    from:   overrides.from   || GRUPO_ADMIN,
    author: overrides.author || '5213110000000@c.us',
    fromMe: overrides.fromMe || false,
    getChat: overrides.getChat || (async () => ({
      participants: [{ id: { _serialized: '5213110000000@c.us' }, isAdmin: true }],
    })),
    reply: async texto => respuestas.push(texto),
    _respuestas: respuestas,
  };
}

function esAdminSiempre() { return Promise.resolve(true); }
function esAdminNunca()   { return Promise.resolve(false); }

function ctx(msgOverrides = {}, clientOverrides = {}, adminFn = esAdminSiempre) {
  const msg = mkMsg(msgOverrides);
  return {
    msg,
    client: { sendMessage: async () => {}, info: { wid: '5213110000000@c.us' }, ...clientOverrides },
    esAdminFn: adminFn,
    _respuestas: msg._respuestas,
  };
}

before(async () => {
  await initDB();
  await seedDB();
  setConfig('grupo_id', GRUPO_ADMIN);
  _resetearRegistro(); // fuerza re-carga con la BD recién creada
});

// ─────────────────────────────────────────────────────────────────────────────
// SECCIÓN 1 — Registro de comandos
// ─────────────────────────────────────────────────────────────────────────────

test('registro — contiene comandos de todos los grupos', () => {
  const nombres = obtenerComandos().map(c => c.nombre);
  // Generales
  assert.ok(nombres.includes('ayuda'),    'falta ayuda');
  assert.ok(nombres.includes('pausar'),   'falta pausar');
  assert.ok(nombres.includes('reanudar'), 'falta reanudar');
  assert.ok(nombres.includes('estado'),   'falta estado');
  // Pedidos
  assert.ok(nombres.includes('pedidos'),    'falta pedidos');
  assert.ok(nombres.includes('pendientes'), 'falta pendientes');
  // Gestión
  assert.ok(nombres.includes('confirmar'), 'falta confirmar');
  assert.ok(nombres.includes('cancelar'),  'falta cancelar');
  // Clientes
  assert.ok(nombres.includes('cliente'), 'falta cliente');
  assert.ok(nombres.includes('buscar'),  'falta buscar');
  // Sesiones
  assert.ok(nombres.includes('sesiones'), 'falta sesiones');
  assert.ok(nombres.includes('limpiar'),  'falta limpiar');
  // Reportes
  assert.ok(nombres.includes('stats'),    'falta stats');
  assert.ok(nombres.includes('ingresos'), 'falta ingresos');
  // Negocio
  assert.ok(nombres.includes('cerrar'), 'falta cerrar');
  assert.ok(nombres.includes('abrir'),  'falta abrir');
});

test('registro — comandos de taquería presentes (giro activo es taquería)', () => {
  const nombres = obtenerComandos().map(c => c.nombre);
  assert.ok(nombres.includes('cortes'),     'falta cortes');
  assert.ok(nombres.includes('precios'),    'falta precios');
  assert.ok(nombres.includes('precio'),     'falta precio');
  assert.ok(nombres.includes('agotado'),    'falta agotado');
  assert.ok(nombres.includes('disponible'), 'falta disponible');
});

test('registro — todas las definiciones tienen los campos obligatorios', () => {
  for (const cmd of obtenerComandos()) {
    assert.ok(cmd.patron instanceof RegExp, `${cmd.nombre}: patron debe ser RegExp`);
    assert.ok(typeof cmd.nombre   === 'string', `${cmd.nombre}: nombre debe ser string`);
    assert.ok(typeof cmd.ayuda    === 'string', `${cmd.nombre}: ayuda debe ser string`);
    assert.ok(typeof cmd.ejecutar === 'function', `${cmd.nombre}: ejecutar debe ser function`);
    assert.ok(Object.values(CONTEXTO).includes(cmd.contexto), `${cmd.nombre}: contexto inválido`);
    assert.ok(Object.values(PERMISO).includes(cmd.permisos),  `${cmd.nombre}: permisos inválido`);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// SECCIÓN 2 — Enrutamiento básico
// ─────────────────────────────────────────────────────────────────────────────

test('router — !ayuda es atendido y responde la lista de comandos', async () => {
  const c = ctx({ body: '!ayuda' });
  const atendido = await enrutarComando('!ayuda', c);
  assert.equal(atendido, true);
  assert.equal(c._respuestas.length, 1);
  assert.match(c._respuestas[0], /COMANDOS DISPONIBLES/i);
});

test('router — !estado responde uptime y estado del bot', async () => {
  const c = ctx({ body: '!estado' });
  const atendido = await enrutarComando('!estado', c);
  assert.equal(atendido, true);
  assert.match(c._respuestas[0], /uptime/i);
});

test('router — texto sin ! no es atendido', async () => {
  const c = ctx({ body: 'hola qué tal' });
  assert.equal(await enrutarComando('hola qué tal', c), false);
  assert.equal(c._respuestas.length, 0);
});

test('router — comando desconocido !xyz retorna false', async () => {
  const c = ctx({ body: '!xyz' });
  assert.equal(await enrutarComando('!xyz', c), false);
  assert.equal(c._respuestas.length, 0);
});

test('router — !pedidos retorna true y responde aunque no haya pedidos', async () => {
  const c = ctx({ body: '!pedidos' });
  const atendido = await enrutarComando('!pedidos', c);
  assert.equal(atendido, true);
  assert.equal(c._respuestas.length, 1);
});

test('router — !stats retorna true y responde', async () => {
  const c = ctx({ body: '!stats' });
  assert.equal(await enrutarComando('!stats', c), true);
  assert.match(c._respuestas[0], /RESUMEN DEL DÍA/i);
});

// ─────────────────────────────────────────────────────────────────────────────
// SECCIÓN 3 — Validación de contexto
// ─────────────────────────────────────────────────────────────────────────────

test('router — comando de grupo rechazado en chat privado', async () => {
  // Algunos comandos son CONTEXTO.GRUPO; en chat privado retornan mensaje de error o false
  const c = ctx({ body: '!ayuda', from: '5213110000000@c.us' });
  const atendido = await enrutarComando('!ayuda', c);
  // El comando es de grupo; al recibirlo en privado el router debería indicarlo
  // (puede retornar true con mensaje de error, o false)
  if (atendido) {
    assert.match(c._respuestas[0], /grupo/i);
  } else {
    assert.equal(c._respuestas.length, 0);
  }
});

test('router — !jid funciona en cualquier grupo (no solo el admin)', async () => {
  const c = ctx({ body: '!jid', from: '120363999999999999@g.us' });
  const atendido = await enrutarComando('!jid', c);
  assert.equal(atendido, true);
  assert.match(c._respuestas[0], /JID de este grupo/i);
  assert.match(c._respuestas[0], /120363999999999999@g\.us/);
});

test('router — !jid no responde fuera de un grupo', async () => {
  const c = ctx({ body: '!jid', from: '5213110000000@c.us' });
  const atendido = await enrutarComando('!jid', c);
  assert.equal(atendido, false);
  assert.equal(c._respuestas.length, 0);
});

test('router — comando de otro grupo rechazado con mensaje', async () => {
  setConfig('grupo_id', GRUPO_ADMIN);
  const c = ctx({ body: '!confirmar 3310000000', from: '120363999999999999@g.us' });
  const atendido = await enrutarComando('!confirmar 3310000000', c);
  assert.equal(atendido, false);
  assert.match(c._respuestas[0], /grupo configurado/i);
});

// ─────────────────────────────────────────────────────────────────────────────
// SECCIÓN 4 — Validación de permisos
// ─────────────────────────────────────────────────────────────────────────────

test('router — admin puede usar !confirmar', async () => {
  const c = ctx({ body: '!confirmar' }, {}, esAdminSiempre);
  const atendido = await enrutarComando('!confirmar', c);
  assert.equal(atendido, true);
  // No hay pedido pendiente → debe responder "No encontré ese pedido"
  assert.match(c._respuestas[0], /No encontré ese pedido/i);
});

test('router — no admin es rechazado en !confirmar', async () => {
  const c = ctx({ body: '!confirmar' }, {}, esAdminNunca);
  const atendido = await enrutarComando('!confirmar', c);
  assert.equal(atendido, true);
  assert.match(c._respuestas[0], /administradores/i);
});

test('router — no admin es rechazado en !pausar', async () => {
  const c = ctx({ body: '!pausar' }, {}, esAdminNunca);
  await enrutarComando('!pausar', c);
  assert.match(c._respuestas[0], /administradores/i);
});

test('router — no admin puede usar !pedidos (permiso CUALQUIERA)', async () => {
  const c = ctx({ body: '!pedidos' }, {}, esAdminNunca);
  const atendido = await enrutarComando('!pedidos', c);
  assert.equal(atendido, true);
  assert.equal(c._respuestas.length, 1);
});

test('router — no admin puede usar !stats (permiso CUALQUIERA)', async () => {
  const c = ctx({ body: '!stats' }, {}, esAdminNunca);
  const atendido = await enrutarComando('!stats', c);
  assert.equal(atendido, true);
  assert.match(c._respuestas[0], /RESUMEN/i);
});

// ─────────────────────────────────────────────────────────────────────────────
// SECCIÓN 5 — Validación de Giro
// ─────────────────────────────────────────────────────────────────────────────

test('router — !cortes es atendido cuando el giro activo es taquería', async () => {
  const c = ctx({ body: '!cortes' });
  const atendido = await enrutarComando('!cortes', c);
  assert.equal(atendido, true);
});

test('router — !precios muestra el menú de taquería', async () => {
  const c = ctx({ body: '!precios' });
  const atendido = await enrutarComando('!precios', c);
  assert.equal(atendido, true);
  // Puede responder vacío (no hay items) o mostrar el menú
  assert.ok(c._respuestas.length >= 1);
});

// ─────────────────────────────────────────────────────────────────────────────
// SECCIÓN 6 — resolverEsAdmin (mismas garantías que la versión legacy)
// ─────────────────────────────────────────────────────────────────────────────

test('resolverEsAdmin — reconoce admin con JID serializado', async () => {
  const msg  = { author: { _serialized: '5213110000000@c.us' } };
  const chat = { participants: [{ id: { _serialized: '5213110000000@c.us' }, isAdmin: true }] };
  msg.getChat = async () => chat;
  assert.equal(await resolverEsAdmin(msg, {}), true);
});

test('resolverEsAdmin — reconoce admin con JID $1', async () => {
  const msg  = { author: { $1: '5213110000000@c.us' } };
  const chat = { participants: [{ id: { $1: '5213110000000@c.us' }, isAdmin: true }] };
  msg.getChat = async () => chat;
  assert.equal(await resolverEsAdmin(msg, {}), true);
});

test('resolverEsAdmin — reconoce admin con JID user/server', async () => {
  const msg  = { author: { user: '5213110000000', server: 'c.us' } };
  const chat = { participants: [{ id: { user: '5213110000000', server: 'c.us' }, isAdmin: true }] };
  msg.getChat = async () => chat;
  assert.equal(await resolverEsAdmin(msg, {}), true);
});

test('resolverEsAdmin — reconoce mensaje saliente del bot como admin', async () => {
  const msg  = { fromMe: true };
  const chat = { participants: [{ id: { $1: '5213110000000@c.us' }, isAdmin: true }] };
  const client = { info: { wid: { $1: '5213110000000@c.us' } } };
  msg.getChat = async () => chat;
  assert.equal(await resolverEsAdmin(msg, client), true);
});

test('resolverEsAdmin — resuelve JID @lid contra teléfono del admin', async () => {
  const msg  = { author: '123456789@lid' };
  const chat = { participants: [{ id: { _serialized: '5213110000000@c.us' }, isSuperAdmin: true }] };
  const client = { getContactLidAndPhone: async () => [{ pn: '5213110000000@c.us' }] };
  msg.getChat = async () => chat;
  assert.equal(await resolverEsAdmin(msg, client), true);
});

test('resolverEsAdmin — retorna false si getChat lanza el error interno r', async () => {
  const msg = { author: '5213110000000@c.us', getChat: async () => { throw new Error('r'); } };
  assert.equal(await resolverEsAdmin(msg, {}), false);
});

test('resolverEsAdmin — retorna false si el usuario no es admin', async () => {
  const msg  = { author: '5213110000000@c.us' };
  const chat = { participants: [{ id: { _serialized: '5213110000000@c.us' }, isAdmin: false }] };
  msg.getChat = async () => chat;
  assert.equal(await resolverEsAdmin(msg, {}), false);
});

// ─────────────────────────────────────────────────────────────────────────────
// SECCIÓN 7 — Comandos específicos (smoke tests de argumentos y respuestas)
// ─────────────────────────────────────────────────────────────────────────────

test('!cancelar sin teléfono pide especificarlo', async () => {
  const c = ctx({ body: '!cancelar' });
  await enrutarComando('!cancelar', c);
  // No hay pendientes → debe pedir teléfono o decir que no encontró el pedido
  assert.ok(c._respuestas.length >= 1);
});

test('!buscar sin término pide el argumento', async () => {
  const c = ctx({ body: '!buscar' });
  await enrutarComando('!buscar', c);
  assert.match(c._respuestas[0], /Uso|buscar/i);
});

test('!historial sin teléfono pide el argumento', async () => {
  const c = ctx({ body: '!historial' });
  await enrutarComando('!historial', c);
  assert.match(c._respuestas[0], /Uso|teléfono/i);
});

test('!pedido sin teléfono pide el argumento', async () => {
  const c = ctx({ body: '!pedido' });
  await enrutarComando('!pedido', c);
  assert.match(c._respuestas[0], /Uso|teléfono/i);
});

test('!listo sin teléfono pide el argumento', async () => {
  const c = ctx({ body: '!listo' });
  await enrutarComando('!listo', c);
  assert.match(c._respuestas[0], /Especifica/i);
});

test('!en_camino sin ID pide el argumento', async () => {
  const c = ctx({ body: '!en_camino' });
  await enrutarComando('!en_camino', c);
  assert.match(c._respuestas[0], /ID|Especifica/i);
});

test('!precio sin argumentos suficientes muestra uso', async () => {
  const c = ctx({ body: '!precio buche' });
  await enrutarComando('!precio buche', c);
  assert.match(c._respuestas[0], /Uso|precio/i);
});

test('!reporte ayer responde aunque no haya pedidos de ayer', async () => {
  const c = ctx({ body: '!reporte ayer' });
  const atendido = await enrutarComando('!reporte ayer', c);
  assert.equal(atendido, true);
  assert.ok(c._respuestas.length >= 1);
});

// ─────────────────────────────────────────────────────────────────────────────
// SECCIÓN 8 — Compat legacy (handleComandos sigue siendo el handler activo)
// ─────────────────────────────────────────────────────────────────────────────

test('legacy handleComandos sigue funcionando en paralelo con el nuevo router', async () => {
  const { handleComandos } = require('../src/handlers/comandos');
  const respuestas = [];
  const msg = {
    body:   '!estado',
    from:   GRUPO_ADMIN,
    author: '5213110000000@c.us',
    getChat: async () => ({}),
    reply: async texto => respuestas.push(texto),
  };
  await handleComandos(msg, {});
  // legacy maneja !estado igual — responde con el estado del bot
  assert.ok(respuestas.length >= 1);
});
