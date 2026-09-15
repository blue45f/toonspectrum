import { normalizeUserAiConfiguration, type UserAiConfiguration } from "./user-ai-types";

const ITERATIONS = 310_000;
const MAX_VAULT_BYTES = 128 * 1024;
interface VaultEnvelope { version: 1; iterations: number; salt: string; iv: string; ciphertext: string }
function encode(bytes: Uint8Array): string {
  let text = "";
  for (const byte of bytes) text += String.fromCharCode(byte);
  return btoa(text);
}
function decode(text: string): Uint8Array<ArrayBuffer> {
  if (text.length > MAX_VAULT_BYTES || !/^[A-Za-z0-9+/]*={0,2}$/u.test(text)) throw new Error("암호화 보관함을 확인할 수 없습니다.");
  return Uint8Array.from(atob(text), character => character.charCodeAt(0));
}
async function keyFor(passphrase: string, salt: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  if (passphrase.length < 12 || passphrase.length > 1024) throw new Error("보관함 비밀번호는 12자 이상 1024자 이하로 입력하세요.");
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(passphrase), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", salt, iterations: ITERATIONS, hash: "SHA-256" }, material, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}
export async function encryptUserAiVault(value: UserAiConfiguration, passphrase: string): Promise<string> {
  const clean = normalizeUserAiConfiguration(value);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await keyFor(passphrase, salt);
  const bytes = new TextEncoder().encode(JSON.stringify(clean));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: new TextEncoder().encode("toonstudio-user-ai-v1") }, key, bytes);
  bytes.fill(0);
  return JSON.stringify({ version: 1, iterations: ITERATIONS, salt: encode(salt), iv: encode(iv), ciphertext: encode(new Uint8Array(ciphertext)) } satisfies VaultEnvelope);
}
export async function decryptUserAiVault(serialized: string, passphrase: string): Promise<UserAiConfiguration> {
  if (serialized.length > MAX_VAULT_BYTES) throw new Error("암호화 보관함이 너무 큽니다.");
  const raw: unknown = JSON.parse(serialized);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("암호화 보관함 형식이 잘못되었습니다.");
  const data = raw as Partial<VaultEnvelope>;
  if (data.version !== 1 || data.iterations !== ITERATIONS || typeof data.salt !== "string" || typeof data.iv !== "string" || typeof data.ciphertext !== "string") throw new Error("지원하지 않는 보관함 형식입니다.");
  const salt = decode(data.salt);
  const iv = decode(data.iv);
  if (salt.length !== 16 || iv.length !== 12) throw new Error("보관함 암호화 매개변수가 잘못되었습니다.");
  const key = await keyFor(passphrase, salt);
  let bytes: ArrayBuffer;
  try {
    bytes = await crypto.subtle.decrypt({ name: "AES-GCM", iv, additionalData: new TextEncoder().encode("toonstudio-user-ai-v1") }, key, decode(data.ciphertext));
  } catch {
    throw new Error("비밀번호가 다르거나 보관함이 손상되었습니다. 기존 설정은 변경하지 않았습니다.");
  }
  try {
    return normalizeUserAiConfiguration(JSON.parse(new TextDecoder().decode(bytes)));
  } finally {
    new Uint8Array(bytes).fill(0);
  }
}
