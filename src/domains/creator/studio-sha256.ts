/**
 * Dependency-free SHA-256 fallback for runtimes without Web Crypto.
 *
 * The implementation processes the input in fixed 64-byte blocks, so the fallback does not
 * allocate a second copy of a potentially large Studio document. All arithmetic is explicitly
 * reduced to unsigned 32-bit words as required by FIPS 180-4.
 */

const SHA256_INITIAL_STATE = Object.freeze([
  0x6a09e667,
  0xbb67ae85,
  0x3c6ef372,
  0xa54ff53a,
  0x510e527f,
  0x9b05688c,
  0x1f83d9ab,
  0x5be0cd19,
]);

const SHA256_ROUND_CONSTANTS = Object.freeze([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5,
  0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc,
  0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7,
  0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3,
  0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5,
  0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

function rotateRight(value: number, count: number): number {
  return (value >>> count) | (value << (32 - count));
}

function compressSha256Block(
  state: number[],
  block: Uint8Array,
  offset: number,
  words: Uint32Array
): void {
  for (let index = 0; index < 16; index += 1) {
    const byteOffset = offset + index * 4;
    words[index] =
      ((block[byteOffset] ?? 0) << 24) |
      ((block[byteOffset + 1] ?? 0) << 16) |
      ((block[byteOffset + 2] ?? 0) << 8) |
      (block[byteOffset + 3] ?? 0);
  }
  for (let index = 16; index < 64; index += 1) {
    const previous15 = words[index - 15];
    const previous2 = words[index - 2];
    const sigma0 =
      rotateRight(previous15, 7) ^
      rotateRight(previous15, 18) ^
      (previous15 >>> 3);
    const sigma1 =
      rotateRight(previous2, 17) ^
      rotateRight(previous2, 19) ^
      (previous2 >>> 10);
    words[index] =
      (words[index - 16] + sigma0 + words[index - 7] + sigma1) >>> 0;
  }

  let a = state[0];
  let b = state[1];
  let c = state[2];
  let d = state[3];
  let e = state[4];
  let f = state[5];
  let g = state[6];
  let h = state[7];

  for (let index = 0; index < 64; index += 1) {
    const sum1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
    const choose = (e & f) ^ (~e & g);
    const temporary1 =
      (h + sum1 + choose + SHA256_ROUND_CONSTANTS[index] + words[index]) >>> 0;
    const sum0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
    const majority = (a & b) ^ (a & c) ^ (b & c);
    const temporary2 = (sum0 + majority) >>> 0;

    h = g;
    g = f;
    f = e;
    e = (d + temporary1) >>> 0;
    d = c;
    c = b;
    b = a;
    a = (temporary1 + temporary2) >>> 0;
  }

  state[0] = (state[0] + a) >>> 0;
  state[1] = (state[1] + b) >>> 0;
  state[2] = (state[2] + c) >>> 0;
  state[3] = (state[3] + d) >>> 0;
  state[4] = (state[4] + e) >>> 0;
  state[5] = (state[5] + f) >>> 0;
  state[6] = (state[6] + g) >>> 0;
  state[7] = (state[7] + h) >>> 0;
}

function writeUint64BitLength(target: Uint8Array, byteLength: number): void {
  const bitLength = byteLength * 8;
  const high = Math.floor(bitLength / 0x1_0000_0000);
  const low = bitLength >>> 0;
  const offset = target.length - 8;
  target[offset] = high >>> 24;
  target[offset + 1] = high >>> 16;
  target[offset + 2] = high >>> 8;
  target[offset + 3] = high;
  target[offset + 4] = low >>> 24;
  target[offset + 5] = low >>> 16;
  target[offset + 6] = low >>> 8;
  target[offset + 7] = low;
}

/**
 * Returns a deterministic lowercase hexadecimal SHA-256 digest.
 *
 * This is intentionally synchronous: it is used only when native `crypto.subtle` is absent or
 * rejects SHA-256. Native Web Crypto remains the preferred path for normal browsers.
 */
export function sha256HexPortable(bytes: Uint8Array): string {
  const state = [...SHA256_INITIAL_STATE];
  const words = new Uint32Array(64);
  let offset = 0;
  while (offset + 64 <= bytes.byteLength) {
    compressSha256Block(state, bytes, offset, words);
    offset += 64;
  }

  const remaining = bytes.byteLength - offset;
  const tail = new Uint8Array(remaining < 56 ? 64 : 128);
  tail.set(bytes.subarray(offset));
  tail[remaining] = 0x80;
  writeUint64BitLength(tail, bytes.byteLength);
  for (let tailOffset = 0; tailOffset < tail.byteLength; tailOffset += 64) {
    compressSha256Block(state, tail, tailOffset, words);
  }

  return state
    .map((word) => word.toString(16).padStart(8, "0"))
    .join("");
}
