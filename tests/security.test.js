'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { encrypt, decrypt, PREFIX } = require('../src/security/secrets');

test('los secretos se cifran con AES-GCM y no quedan visibles', () => {
  const secret = 'a'.repeat(64);
  const plain = JSON.stringify({ secret_key: 'sk_live_no_visible' });
  const encrypted = encrypt(plain, secret);
  assert.ok(encrypted.startsWith(PREFIX));
  assert.ok(!encrypted.includes('sk_live_no_visible'));
  assert.strictEqual(decrypt(encrypted, secret), plain);
});

test('un secreto cifrado no puede abrirse con otra clave', () => {
  const encrypted = encrypt('dato sensible', 'a'.repeat(64));
  assert.throws(() => decrypt(encrypted, 'b'.repeat(64)));
});

test('los valores históricos en texto plano siguen siendo legibles durante la migración', () => {
  assert.strictEqual(decrypt('{"legacy":true}', ''), '{"legacy":true}');
});
