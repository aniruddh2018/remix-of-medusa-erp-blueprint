/**
 * Web Crypto helpers for offline auth cache.
 * PIN → PBKDF2 (200k iters, SHA-256) → AES-GCM 256-bit key.
 */

const PBKDF2_ITERS = 200_000;
const KEY_LEN_BITS = 256;
const SALT_LEN = 16;
const IV_LEN = 12;

function te(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}
function td(b: ArrayBuffer) { return new TextDecoder().decode(b); }

export function randomBytes(len: number): Uint8Array {
  const a = new Uint8Array(new ArrayBuffer(len));
  crypto.getRandomValues(a);
  return a;
}

export async function deriveKey(pin: string, salt: ArrayBuffer): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey(
    "raw",
    te(pin),
    { name: "PBKDF2" },
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: PBKDF2_ITERS, hash: "SHA-256" },
    baseKey,
    { name: "AES-GCM", length: KEY_LEN_BITS },
    false,
    ["encrypt", "decrypt"]
  );
}

export async function encryptJson(key: CryptoKey, data: unknown): Promise<{ ciphertext: ArrayBuffer; iv: ArrayBuffer }> {
  const iv = randomBytes(IV_LEN);
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    key,
    te(JSON.stringify(data)) as BufferSource
  );
  return { ciphertext, iv: iv.buffer as ArrayBuffer };
}

export async function decryptJson<T>(key: CryptoKey, ciphertext: ArrayBuffer, iv: ArrayBuffer): Promise<T> {
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
  return JSON.parse(td(plain)) as T;
}

export { SALT_LEN };
