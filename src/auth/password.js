'use strict';

const crypto = require('crypto');

// Passwort-Hashing über Node-Bordmittel (scrypt) — keine externe Abhängigkeit.
// Format: scrypt$<saltHex>$<hashHex>
const PREFIX = 'scrypt';
const KEYLEN = 64;

function isHashed(value) {
  return typeof value === 'string' && value.startsWith(PREFIX + '$');
}

function hashPassword(plain) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(plain), salt, KEYLEN);
  return `${PREFIX}$${salt.toString('hex')}$${hash.toString('hex')}`;
}

function verifyPassword(plain, stored) {
  if (!isHashed(stored)) {
    // Fallback für noch nicht migrierte Klartext-Werte.
    return String(plain) === String(stored);
  }
  const [, saltHex, hashHex] = stored.split('$');
  const salt = Buffer.from(saltHex, 'hex');
  const expected = Buffer.from(hashHex, 'hex');
  const actual = crypto.scryptSync(String(plain), salt, expected.length);
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

module.exports = { hashPassword, verifyPassword, isHashed };
