import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

const PASSWORD_HASH_VERSION = "v2";
const SCRYPT_COST = 16_384;
const SCRYPT_BLOCK_SIZE = 8;
const SCRYPT_PARALLELIZATION = 1;
const SCRYPT_KEY_LENGTH = 64;
const SCRYPT_MAX_MEMORY = 64 * 1024 * 1024;
const PASSWORD_MINIMUM_CHARACTERS = 15;
const PASSWORD_MAXIMUM_CHARACTERS = 128;
const PASSWORD_MAXIMUM_UTF8_BYTES = 1_024;

const COMMON_PASSWORDS = new Set([
  "123456789012345",
  "1234567890123456",
  "passwordpassword",
  "password123456",
  "qwertyuiopasdfgh",
  "toonspectrum123",
]);

export interface PasswordVerificationResult {
  readonly valid: boolean;
  readonly needsRehash: boolean;
}

function scryptAsync(
  password: string,
  salt: string | Buffer,
  keyLength = SCRYPT_KEY_LENGTH,
  options: {
    N?: number;
    r?: number;
    p?: number;
    maxmem?: number;
  } = {},
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(
      password,
      salt,
      keyLength,
      {
        N: options.N ?? SCRYPT_COST,
        r: options.r ?? SCRYPT_BLOCK_SIZE,
        p: options.p ?? SCRYPT_PARALLELIZATION,
        maxmem: options.maxmem ?? SCRYPT_MAX_MEMORY,
      },
      (error, derivedKey) => {
        if (error) reject(error);
        else resolve(derivedKey as Buffer);
      },
    );
  });
}

function passwordCharacterCount(password: string): number {
  return Array.from(password).length;
}

export function passwordPolicyError(password: string): string | null {
  const characterCount = passwordCharacterCount(password);
  if (characterCount < PASSWORD_MINIMUM_CHARACTERS) {
    return `비밀번호는 ${PASSWORD_MINIMUM_CHARACTERS}자 이상이어야 해요.`;
  }
  if (
    characterCount > PASSWORD_MAXIMUM_CHARACTERS
    || Buffer.byteLength(password, "utf8") > PASSWORD_MAXIMUM_UTF8_BYTES
  ) {
    return `비밀번호는 ${PASSWORD_MAXIMUM_CHARACTERS}자 이하로 입력해 주세요.`;
  }
  if (password.includes("\u0000")) {
    return "비밀번호에 사용할 수 없는 문자가 포함되어 있어요.";
  }
  if (COMMON_PASSWORDS.has(password.trim().toLowerCase())) {
    return "너무 자주 사용되는 비밀번호예요. 더 긴 문구를 사용해 주세요.";
  }
  return null;
}

export function isPasswordVerificationInputBounded(password: string): boolean {
  return password.length > 0
    && passwordCharacterCount(password) <= PASSWORD_MAXIMUM_CHARACTERS
    && Buffer.byteLength(password, "utf8") <= PASSWORD_MAXIMUM_UTF8_BYTES
    && !password.includes("\u0000");
}

export async function hashPassword(password: string): Promise<string> {
  if (!isPasswordVerificationInputBounded(password)) {
    throw new RangeError("password input is outside the supported bounds");
  }

  const salt = randomBytes(16);
  const hash = await scryptAsync(password, salt);
  return [
    "scrypt",
    PASSWORD_HASH_VERSION,
    String(SCRYPT_COST),
    String(SCRYPT_BLOCK_SIZE),
    String(SCRYPT_PARALLELIZATION),
    String(SCRYPT_KEY_LENGTH),
    salt.toString("base64url"),
    hash.toString("base64url"),
  ].join("$");
}

function parsePositiveInteger(value: string | undefined): number | null {
  if (!value || !/^\d+$/u.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

async function verifyVersionedPassword(
  password: string,
  stored: string,
): Promise<PasswordVerificationResult> {
  const [algorithm, version, nRaw, rRaw, pRaw, keyLengthRaw, saltRaw, hashRaw, ...rest] = stored.split("$");
  if (
    rest.length > 0
    || algorithm !== "scrypt"
    || version !== PASSWORD_HASH_VERSION
    || !saltRaw
    || !hashRaw
  ) {
    return { valid: false, needsRehash: false };
  }

  const N = parsePositiveInteger(nRaw);
  const r = parsePositiveInteger(rRaw);
  const p = parsePositiveInteger(pRaw);
  const keyLength = parsePositiveInteger(keyLengthRaw);
  if (
    N === null
    || r === null
    || p === null
    || keyLength === null
    || N > SCRYPT_COST
    || r > SCRYPT_BLOCK_SIZE
    || p > SCRYPT_PARALLELIZATION
    || keyLength > SCRYPT_KEY_LENGTH
  ) {
    return { valid: false, needsRehash: false };
  }

  let salt: Buffer;
  let expected: Buffer;
  try {
    salt = Buffer.from(saltRaw, "base64url");
    expected = Buffer.from(hashRaw, "base64url");
  } catch {
    return { valid: false, needsRehash: false };
  }
  if (salt.length < 16 || expected.length !== keyLength) {
    return { valid: false, needsRehash: false };
  }

  const actual = await scryptAsync(password, salt, keyLength, { N, r, p });
  const valid = actual.length === expected.length && timingSafeEqual(actual, expected);
  return {
    valid,
    needsRehash: valid && (
      N !== SCRYPT_COST
      || r !== SCRYPT_BLOCK_SIZE
      || p !== SCRYPT_PARALLELIZATION
      || keyLength !== SCRYPT_KEY_LENGTH
    ),
  };
}

async function verifyLegacyPassword(
  password: string,
  stored: string,
): Promise<PasswordVerificationResult> {
  const [salt, hash, ...rest] = stored.split(":");
  if (
    rest.length > 0
    || !salt
    || !hash
    || !/^[a-f0-9]{32}$/iu.test(salt)
    || !/^[a-f0-9]{128}$/iu.test(hash)
  ) {
    return { valid: false, needsRehash: false };
  }
  const expected = Buffer.from(hash, "hex");
  const actual = await scryptAsync(password, salt, expected.length);
  const valid = actual.length === expected.length && timingSafeEqual(actual, expected);
  return { valid, needsRehash: valid };
}

export async function verifyPassword(
  password: string,
  stored: string | null | undefined,
): Promise<PasswordVerificationResult> {
  if (!stored) {
    // Run the same expensive primitive for missing/social-only users so account
    // enumeration cannot rely on a cheap failure path.
    await scryptAsync(password, "toonspectrum-missing-credential-v2");
    return { valid: false, needsRehash: false };
  }
  if (stored.startsWith("scrypt$")) {
    return verifyVersionedPassword(password, stored);
  }
  return verifyLegacyPassword(password, stored);
}
