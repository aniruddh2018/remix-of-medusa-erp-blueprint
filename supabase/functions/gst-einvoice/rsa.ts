// RSA PKCS#1 v1.5 encryption (RFC 8017 §7.2.1), implemented from scratch.
//
// The NIC e-Invoice /auth call requires the (Password || AppKey) fields to
// be encrypted with "RSA/ECB/PKCS1Padding" using the public key NIC
// publishes for the sandbox/production e-Invoice system. Web Crypto
// (SubtleCrypto) only exposes RSA-OAEP for encryption — RSAES-PKCS1-v1_5
// was deliberately removed from the browser/Deno crypto API — so this
// module parses the RSA modulus/exponent out of the supplied SPKI public
// key (via SubtleCrypto import → JWK export, which works for any RSA key
// regardless of the target algorithm) and does the padding + modular
// exponentiation itself using BigInt.

function pemToBytes(pem: string): Uint8Array {
  const b64 = pem
    .replace(/-----BEGIN [^-]+-----/, "")
    .replace(/-----END [^-]+-----/, "")
    .replace(/\s+/g, "");
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function base64UrlToBigInt(b64url: string): bigint {
  const pad = (4 - (b64url.length % 4)) % 4;
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat(pad);
  const bin = atob(b64);
  let hex = "";
  for (let i = 0; i < bin.length; i++) hex += bin.charCodeAt(i).toString(16).padStart(2, "0");
  return hex ? BigInt("0x" + hex) : 0n;
}

function bigIntToBytes(n: bigint, length: number): Uint8Array {
  let hex = n.toString(16);
  if (hex.length % 2) hex = "0" + hex;
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  if (bytes.length >= length) return bytes.slice(bytes.length - length);
  const out = new Uint8Array(length);
  out.set(bytes, length - bytes.length);
  return out;
}

function modPow(baseIn: bigint, expIn: bigint, mod: bigint): bigint {
  let result = 1n;
  let base = baseIn % mod;
  let exp = expIn;
  while (exp > 0n) {
    if (exp & 1n) result = (result * base) % mod;
    exp >>= 1n;
    base = (base * base) % mod;
  }
  return result;
}

export interface RsaPublicKey {
  n: bigint;
  e: bigint;
  /** modulus size in bytes ("k" in RFC 8017) */
  k: number;
}

/** Parse an SPKI PEM (`-----BEGIN PUBLIC KEY-----`) RSA public key. */
export async function parseSpkiPublicKey(pem: string): Promise<RsaPublicKey> {
  const der = pemToBytes(pem);
  // Any RSA algorithm works here purely to get SubtleCrypto to parse the
  // DER structure for us; we only ever use it via exportKey("jwk").
  const key = await crypto.subtle.importKey(
    "spki",
    der.buffer as ArrayBuffer,
    { name: "RSA-OAEP", hash: "SHA-256" },
    true,
    ["encrypt"],
  );
  const jwk = await crypto.subtle.exportKey("jwk", key);
  const n = base64UrlToBigInt(jwk.n!);
  const e = base64UrlToBigInt(jwk.e!);
  const k = Math.ceil(n.toString(2).length / 8);
  return { n, e, k };
}

/**
 * RSAES-PKCS1-v1_5 encrypt (RFC 8017 §7.2.1).
 *   EM = 0x00 || 0x02 || PS (k-mLen-3 random *nonzero* bytes) || 0x00 || M
 */
export function rsaPkcs1v15Encrypt(pub: RsaPublicKey, message: Uint8Array): Uint8Array {
  const k = pub.k;
  if (message.length > k - 11) {
    throw new Error(`RSA PKCS1 message too long: ${message.length} bytes for a ${k}-byte key`);
  }
  const psLen = k - message.length - 3;
  const ps = new Uint8Array(psLen);
  crypto.getRandomValues(ps);
  for (let i = 0; i < ps.length; i++) {
    while (ps[i] === 0) ps[i] = crypto.getRandomValues(new Uint8Array(1))[0];
  }
  const em = new Uint8Array(k);
  em[0] = 0x00;
  em[1] = 0x02;
  em.set(ps, 2);
  em[2 + psLen] = 0x00;
  em.set(message, 3 + psLen);

  let hex = "";
  for (const b of em) hex += b.toString(16).padStart(2, "0");
  const m = BigInt("0x" + hex);
  const c = modPow(m, pub.e, pub.n);
  return bigIntToBytes(c, k);
}

/** Base64-encode bytes (Deno/edge runtime has no Buffer). */
export function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}
