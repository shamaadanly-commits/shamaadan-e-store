/**
 * Password / PIN hashing — Node crypto scrypt (PASSWORD_DEFAULT equivalent).
 * Format: scrypt$N$r$p$saltB64$hashB64
 */
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const N = 16384;
const R = 8;
const P = 1;
const KEYLEN = 64;
const SALT_LEN = 16;

/**
 * @param {string} plain
 * @returns {string}
 */
export function hashSecret(plain) {
  const salt = randomBytes(SALT_LEN);
  const hash = scryptSync(String(plain), salt, KEYLEN, { N, r: R, p: P });
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64')}$${hash.toString('base64')}`;
}

/**
 * @param {string} plain
 * @param {string} encoded
 * @returns {boolean}
 */
export function verifySecret(plain, encoded) {
  if (!plain || !encoded || typeof encoded !== 'string') return false;
  const parts = encoded.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;

  const n = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  const salt = Buffer.from(parts[4], 'base64');
  const expected = Buffer.from(parts[5], 'base64');

  if (!salt.length || !expected.length || !n || !r || !p) return false;

  try {
    const actual = scryptSync(String(plain), salt, expected.length, { N: n, r, p });
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}
