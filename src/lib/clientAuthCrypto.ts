const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_DK_LEN = 64;

function bytesToHex(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i].toString(16).padStart(2, '0');
  }
  return out;
}

function hexToBytes(hex: string): Uint8Array | null {
  if (!hex || hex.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(hex)) {
    return null;
  }
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function constantTimeEqualBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}

function rotl32(v: number, c: number): number {
  return ((v << c) | (v >>> (32 - c))) >>> 0;
}

function salsa208(b: Uint32Array, bOffset: number): void {
  const x = new Uint32Array(16);
  for (let i = 0; i < 16; i++) {
    x[i] = b[bOffset + i];
  }
  for (let i = 8; i > 0; i -= 2) {
    x[4] ^= rotl32((x[0] + x[12]) >>> 0, 7);
    x[8] ^= rotl32((x[4] + x[0]) >>> 0, 9);
    x[12] ^= rotl32((x[8] + x[4]) >>> 0, 13);
    x[0] ^= rotl32((x[12] + x[8]) >>> 0, 18);

    x[9] ^= rotl32((x[5] + x[1]) >>> 0, 7);
    x[13] ^= rotl32((x[9] + x[5]) >>> 0, 9);
    x[1] ^= rotl32((x[13] + x[9]) >>> 0, 13);
    x[5] ^= rotl32((x[1] + x[13]) >>> 0, 18);

    x[14] ^= rotl32((x[10] + x[6]) >>> 0, 7);
    x[2] ^= rotl32((x[14] + x[10]) >>> 0, 9);
    x[6] ^= rotl32((x[2] + x[14]) >>> 0, 13);
    x[10] ^= rotl32((x[6] + x[2]) >>> 0, 18);

    x[3] ^= rotl32((x[15] + x[11]) >>> 0, 7);
    x[7] ^= rotl32((x[3] + x[15]) >>> 0, 9);
    x[11] ^= rotl32((x[7] + x[3]) >>> 0, 13);
    x[15] ^= rotl32((x[11] + x[7]) >>> 0, 18);

    x[1] ^= rotl32((x[0] + x[3]) >>> 0, 7);
    x[2] ^= rotl32((x[1] + x[0]) >>> 0, 9);
    x[3] ^= rotl32((x[2] + x[1]) >>> 0, 13);
    x[0] ^= rotl32((x[3] + x[2]) >>> 0, 18);

    x[6] ^= rotl32((x[5] + x[4]) >>> 0, 7);
    x[7] ^= rotl32((x[6] + x[5]) >>> 0, 9);
    x[4] ^= rotl32((x[7] + x[6]) >>> 0, 13);
    x[5] ^= rotl32((x[4] + x[7]) >>> 0, 18);

    x[11] ^= rotl32((x[10] + x[9]) >>> 0, 7);
    x[8] ^= rotl32((x[11] + x[10]) >>> 0, 9);
    x[9] ^= rotl32((x[8] + x[11]) >>> 0, 13);
    x[10] ^= rotl32((x[9] + x[8]) >>> 0, 18);

    x[12] ^= rotl32((x[15] + x[14]) >>> 0, 7);
    x[13] ^= rotl32((x[12] + x[15]) >>> 0, 9);
    x[14] ^= rotl32((x[13] + x[12]) >>> 0, 13);
    x[15] ^= rotl32((x[14] + x[13]) >>> 0, 18);
  }
  for (let i = 0; i < 16; i++) {
    b[bOffset + i] = (b[bOffset + i] + x[i]) >>> 0;
  }
}

function blockMix(b: Uint32Array, bOffset: number, y: Uint32Array, r: number): void {
  const x = new Uint32Array(16);
  const lastBlockOffset = bOffset + (2 * r - 1) * 16;
  x.set(b.subarray(lastBlockOffset, lastBlockOffset + 16));

  for (let i = 0; i < 2 * r; i++) {
    const srcOffset = bOffset + i * 16;
    for (let k = 0; k < 16; k++) {
      x[k] ^= b[srcOffset + k];
    }
    salsa208(x, 0);
    const dstOffset = (i % 2 === 0 ? i / 2 : r + Math.floor(i / 2)) * 16;
    y.set(x, dstOffset);
  }

  b.set(y.subarray(0, 32 * r), bOffset);
}

function roMix(b: Uint32Array, bOffset: number, r: number, n: number): void {
  const blockWords = 32 * r;
  const x = new Uint32Array(blockWords);
  const y = new Uint32Array(blockWords);
  const v = new Uint32Array(n * blockWords);

  x.set(b.subarray(bOffset, bOffset + blockWords));

  for (let i = 0; i < n; i++) {
    v.set(x, i * blockWords);
    blockMix(x, 0, y, r);
  }

  for (let i = 0; i < n; i++) {
    const j = x[(2 * r - 1) * 16] & (n - 1);
    const vOffset = j * blockWords;
    for (let k = 0; k < blockWords; k++) {
      x[k] ^= v[vOffset + k];
    }
    blockMix(x, 0, y, r);
  }

  b.set(x, bOffset);
}

async function pbkdf2Sha256(
  passwordBytes: Uint8Array,
  saltBytes: Uint8Array,
  keyLengthBytes: number
): Promise<Uint8Array> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error('El navegador no soporta WebCrypto (crypto.subtle) para verificar credenciales.');
  }
  const keyMaterial = await subtle.importKey(
    'raw',
    new Uint8Array(passwordBytes),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const bits = await subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: new Uint8Array(saltBytes),
      iterations: 1,
      hash: 'SHA-256',
    },
    keyMaterial,
    keyLengthBytes * 8
  );
  return new Uint8Array(bits);
}

async function deriveScrypt(password: string, salt: string): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  const pwBytes = encoder.encode(password);
  const saltBytes = encoder.encode(salt);
  const blockBytes = 128 * SCRYPT_R;

  const bRaw = await pbkdf2Sha256(pwBytes, saltBytes, SCRYPT_P * blockBytes);
  const bWords = new Uint32Array(bRaw.length / 4);
  const bView = new DataView(bRaw.buffer, bRaw.byteOffset, bRaw.byteLength);
  for (let i = 0; i < bWords.length; i++) {
    bWords[i] = bView.getUint32(i * 4, true);
  }

  for (let i = 0; i < SCRYPT_P; i++) {
    roMix(bWords, i * 32 * SCRYPT_R, SCRYPT_R, SCRYPT_N);
  }

  const outRaw = new Uint8Array(bRaw.length);
  const outView = new DataView(outRaw.buffer);
  for (let i = 0; i < bWords.length; i++) {
    outView.setUint32(i * 4, bWords[i], true);
  }

  return pbkdf2Sha256(pwBytes, outRaw, SCRYPT_DK_LEN);
}

export async function hashPasswordBrowser(password: string): Promise<string> {
  const saltBytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(saltBytes);
  const salt = bytesToHex(saltBytes);
  const derived = await deriveScrypt(password, salt);
  return `scrypt$${salt}$${bytesToHex(derived)}`;
}

export async function verifyPasswordBrowser(
  password: string,
  stored: string
): Promise<{ valid: boolean; needsMigration: boolean }> {
  if (!stored) return { valid: false, needsMigration: false };

  if (stored.startsWith('scrypt$')) {
    const parts = stored.split('$');
    if (parts.length !== 3) return { valid: false, needsMigration: false };
    const [, salt, hexHash] = parts;
    const expected = hexToBytes(hexHash);
    if (!expected) return { valid: false, needsMigration: false };
    const derived = await deriveScrypt(password, salt);
    return { valid: constantTimeEqualBytes(derived, expected), needsMigration: false };
  }

  const encoder = new TextEncoder();
  const a = encoder.encode(password);
  const b = encoder.encode(stored);
  return { valid: constantTimeEqualBytes(a, b), needsMigration: true };
}
