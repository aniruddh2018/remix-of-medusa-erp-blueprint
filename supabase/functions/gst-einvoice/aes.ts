// Pure AES (Rijndael) block cipher — ECB mode, PKCS7 padding.
//
// The NIC e-Invoice / e-Way Bill API requires AES-256 in ECB mode with
// PKCS5/PKCS7 padding for encrypting request bodies (and decrypting
// responses) with the session key returned by /auth. Deno's Web Crypto
// (SubtleCrypto) does not expose raw ECB as an operation mode — browsers
// and Deno intentionally dropped it — so this module implements the AES
// block cipher directly (encrypt + decrypt, 128/192/256-bit keys) and
// applies ECB chaining (i.e. no chaining: every block is independent) and
// PKCS7 padding itself.
//
// S-box / inverse S-box are *computed* at module load from the GF(2^8)
// multiplicative inverse + affine transform defined by FIPS-197, rather
// than hand-transcribed as a 256-entry hex table, to avoid a single wrong
// digit silently breaking every 16th byte of every request.

function gfMul(aIn: number, bIn: number): number {
  let a = aIn, b = bIn, p = 0;
  for (let i = 0; i < 8; i++) {
    if (b & 1) p ^= a;
    const hi = a & 0x80;
    a = (a << 1) & 0xff;
    if (hi) a ^= 0x1b;
    b >>= 1;
  }
  return p & 0xff;
}

function gfInverse(a: number): number {
  if (a === 0) return 0;
  for (let b = 1; b < 256; b++) if (gfMul(a, b) === 1) return b;
  return 0; // unreachable
}

function rotl8(x: number, n: number): number {
  return ((x << n) | (x >>> (8 - n))) & 0xff;
}

function buildSBox(): { sbox: Uint8Array; inv: Uint8Array } {
  const sbox = new Uint8Array(256);
  for (let i = 0; i < 256; i++) {
    const x = gfInverse(i);
    sbox[i] = (x ^ rotl8(x, 1) ^ rotl8(x, 2) ^ rotl8(x, 3) ^ rotl8(x, 4) ^ 0x63) & 0xff;
  }
  const inv = new Uint8Array(256);
  for (let i = 0; i < 256; i++) inv[sbox[i]] = i;
  return { sbox, inv };
}

const { sbox: SBOX, inv: INV_SBOX } = buildSBox();

function xtime(a: number): number {
  return gfMul(a, 2);
}

// FIPS-197 Rcon: Rcon[i] = [rc_i, 0, 0, 0], rc_1 = 1, rc_i = xtime(rc_{i-1})
function buildRcon(count: number): number[] {
  const rcon: number[] = [0]; // unused index 0
  let rc = 1;
  for (let i = 1; i <= count; i++) {
    rcon.push(rc);
    rc = xtime(rc);
  }
  return rcon;
}

/** Key expansion for AES-128/192/256 per FIPS-197 §5.2. */
function keyExpansion(key: Uint8Array): Uint8Array[] {
  const Nk = key.length / 4; // 4, 6, or 8
  const Nr = Nk + 6; // 10, 12, or 14
  const Nb = 4;
  const totalWords = Nb * (Nr + 1);
  const rcon = buildRcon(Math.ceil(totalWords / Nk) + 1);
  const w: Uint8Array[] = [];
  for (let i = 0; i < Nk; i++) {
    w.push(key.slice(i * 4, i * 4 + 4));
  }
  for (let i = Nk; i < totalWords; i++) {
    let temp = w[i - 1].slice();
    if (i % Nk === 0) {
      // RotWord + SubWord + Rcon
      temp = Uint8Array.from([temp[1], temp[2], temp[3], temp[0]]);
      temp = Uint8Array.from([SBOX[temp[0]], SBOX[temp[1]], SBOX[temp[2]], SBOX[temp[3]]]);
      temp[0] ^= rcon[i / Nk];
    } else if (Nk > 6 && i % Nk === 4) {
      temp = Uint8Array.from([SBOX[temp[0]], SBOX[temp[1]], SBOX[temp[2]], SBOX[temp[3]]]);
    }
    const prev = w[i - Nk];
    w.push(Uint8Array.from([prev[0] ^ temp[0], prev[1] ^ temp[1], prev[2] ^ temp[2], prev[3] ^ temp[3]]));
  }
  return w;
}

function addRoundKey(state: Uint8Array, w: Uint8Array[], round: number) {
  for (let c = 0; c < 4; c++) {
    const word = w[round * 4 + c];
    for (let r = 0; r < 4; r++) state[r + c * 4] ^= word[r];
  }
}

function subBytes(state: Uint8Array, table: Uint8Array) {
  for (let i = 0; i < 16; i++) state[i] = table[state[i]];
}

function shiftRows(state: Uint8Array) {
  // state is column-major: state[r + 4c]. Row r is shifted left by r.
  const s = state.slice();
  for (let r = 1; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      state[r + 4 * c] = s[r + 4 * ((c + r) % 4)];
    }
  }
}

function invShiftRows(state: Uint8Array) {
  const s = state.slice();
  for (let r = 1; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      state[r + 4 * c] = s[r + 4 * ((c - r + 4) % 4)];
    }
  }
}

function mixColumns(state: Uint8Array) {
  for (let c = 0; c < 4; c++) {
    const a0 = state[0 + 4 * c], a1 = state[1 + 4 * c], a2 = state[2 + 4 * c], a3 = state[3 + 4 * c];
    state[0 + 4 * c] = xtime(a0) ^ (xtime(a1) ^ a1) ^ a2 ^ a3;
    state[1 + 4 * c] = a0 ^ xtime(a1) ^ (xtime(a2) ^ a2) ^ a3;
    state[2 + 4 * c] = a0 ^ a1 ^ xtime(a2) ^ (xtime(a3) ^ a3);
    state[3 + 4 * c] = (xtime(a0) ^ a0) ^ a1 ^ a2 ^ xtime(a3);
  }
}

function invMixColumns(state: Uint8Array) {
  for (let c = 0; c < 4; c++) {
    const a0 = state[0 + 4 * c], a1 = state[1 + 4 * c], a2 = state[2 + 4 * c], a3 = state[3 + 4 * c];
    state[0 + 4 * c] = gfMul(a0, 14) ^ gfMul(a1, 11) ^ gfMul(a2, 13) ^ gfMul(a3, 9);
    state[1 + 4 * c] = gfMul(a0, 9) ^ gfMul(a1, 14) ^ gfMul(a2, 11) ^ gfMul(a3, 13);
    state[2 + 4 * c] = gfMul(a0, 13) ^ gfMul(a1, 9) ^ gfMul(a2, 14) ^ gfMul(a3, 11);
    state[3 + 4 * c] = gfMul(a0, 11) ^ gfMul(a1, 13) ^ gfMul(a2, 9) ^ gfMul(a3, 14);
  }
}

function encryptBlock(block: Uint8Array, w: Uint8Array[], Nr: number): Uint8Array {
  const state = block.slice();
  addRoundKey(state, w, 0);
  for (let round = 1; round < Nr; round++) {
    subBytes(state, SBOX);
    shiftRows(state);
    mixColumns(state);
    addRoundKey(state, w, round);
  }
  subBytes(state, SBOX);
  shiftRows(state);
  addRoundKey(state, w, Nr);
  return state;
}

function decryptBlock(block: Uint8Array, w: Uint8Array[], Nr: number): Uint8Array {
  const state = block.slice();
  addRoundKey(state, w, Nr);
  for (let round = Nr - 1; round >= 1; round--) {
    invShiftRows(state);
    subBytes(state, INV_SBOX);
    addRoundKey(state, w, round);
    invMixColumns(state);
  }
  invShiftRows(state);
  subBytes(state, INV_SBOX);
  addRoundKey(state, w, 0);
  return state;
}

function pkcs7Pad(data: Uint8Array, blockSize = 16): Uint8Array {
  const padLen = blockSize - (data.length % blockSize);
  const out = new Uint8Array(data.length + padLen);
  out.set(data);
  out.fill(padLen, data.length);
  return out;
}

function pkcs7Unpad(data: Uint8Array): Uint8Array {
  if (data.length === 0) return data;
  const padLen = data[data.length - 1];
  if (padLen < 1 || padLen > 16 || padLen > data.length) {
    throw new Error("Invalid PKCS7 padding");
  }
  for (let i = data.length - padLen; i < data.length; i++) {
    if (data[i] !== padLen) throw new Error("Invalid PKCS7 padding");
  }
  return data.slice(0, data.length - padLen);
}

/** AES-ECB encrypt with PKCS7 padding. `key` must be 16/24/32 bytes. */
export function aesEcbEncrypt(key: Uint8Array, plaintext: Uint8Array): Uint8Array {
  const Nr = key.length / 4 + 6;
  const w = keyExpansion(key);
  const padded = pkcs7Pad(plaintext);
  const out = new Uint8Array(padded.length);
  for (let off = 0; off < padded.length; off += 16) {
    out.set(encryptBlock(padded.subarray(off, off + 16), w, Nr), off);
  }
  return out;
}

/** AES-ECB decrypt, removing PKCS7 padding. `key` must be 16/24/32 bytes. */
export function aesEcbDecrypt(key: Uint8Array, ciphertext: Uint8Array): Uint8Array {
  if (ciphertext.length % 16 !== 0) throw new Error("Ciphertext length must be a multiple of 16 bytes");
  const Nr = key.length / 4 + 6;
  const w = keyExpansion(key);
  const out = new Uint8Array(ciphertext.length);
  for (let off = 0; off < ciphertext.length; off += 16) {
    out.set(decryptBlock(ciphertext.subarray(off, off + 16), w, Nr), off);
  }
  return pkcs7Unpad(out);
}
