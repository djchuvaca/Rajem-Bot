'use strict';

const crypto = require('crypto');
const PREFIX = 'enc:v1:';

function _key(secret) {
  if (typeof secret !== 'string' || secret.length < 32) throw new Error('Se requiere un secreto de cifrado de al menos 32 caracteres');
  return crypto.createHash('sha256').update(secret).digest();
}

function encrypt(value, secret) {
  const plain = String(value ?? '');
  if (plain.startsWith(PREFIX)) return plain;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', _key(secret), iv);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`;
}

function decrypt(value, secret) {
  const stored = String(value ?? '');
  if (!stored.startsWith(PREFIX)) return stored;
  const [iv64, tag64, data64] = stored.slice(PREFIX.length).split(':');
  if (!iv64 || !tag64 || !data64) throw new Error('Secreto cifrado inválido');
  const decipher = crypto.createDecipheriv('aes-256-gcm', _key(secret), Buffer.from(iv64, 'base64'));
  decipher.setAuthTag(Buffer.from(tag64, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(data64, 'base64')), decipher.final()]).toString('utf8');
}

module.exports = { encrypt, decrypt, PREFIX };
