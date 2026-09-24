export interface PublicCollectionSnapshot {
  readonly version: 1;
  readonly name: string;
  readonly emoji: string;
  readonly description: string;
  readonly titleIds: readonly string[];
  readonly createdAt: string;
}

const TOKEN_LIMIT = 16_384;
const MAX_TITLES = 200;

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  }
  return globalThis.btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = globalThis.atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function canonicalSnapshot(value: PublicCollectionSnapshot): PublicCollectionSnapshot {
  const name = value.name.trim().slice(0, 80);
  const emoji = value.emoji.trim().slice(0, 40);
  const description = value.description.trim().slice(0, 500);
  const createdAt = Number.isFinite(Date.parse(value.createdAt))
    ? value.createdAt
    : new Date(0).toISOString();
  const titleIds = [...new Set(value.titleIds
    .filter((titleId): titleId is string => typeof titleId === "string")
    .map((titleId) => titleId.trim())
    .filter((titleId) => titleId.length > 0 && titleId.length <= 120))]
    .slice(0, MAX_TITLES);
  if (!name || titleIds.length === 0) throw new Error("공개 리스트에는 이름과 작품이 필요합니다.");
  return { version: 1, name, emoji, description, titleIds, createdAt };
}

export function encodePublicCollectionSnapshot(value: PublicCollectionSnapshot): string {
  const canonical = canonicalSnapshot(value);
  const base64 = bytesToBase64(new TextEncoder().encode(JSON.stringify(canonical)));
  const token = base64.replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
  if (token.length > TOKEN_LIMIT) throw new Error("공개 리스트 링크가 너무 큽니다.");
  return token;
}

export function decodePublicCollectionSnapshot(token: string): PublicCollectionSnapshot {
  if (!token || token.length > TOKEN_LIMIT || !/^[A-Za-z0-9_-]+$/u.test(token)) {
    throw new Error("공개 리스트 링크가 올바르지 않습니다.");
  }
  const padded = token.replaceAll("-", "+").replaceAll("_", "/")
    .padEnd(Math.ceil(token.length / 4) * 4, "=");
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(base64ToBytes(padded)));
  } catch {
    throw new Error("공개 리스트 링크를 읽을 수 없습니다.");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("공개 리스트 데이터가 올바르지 않습니다.");
  }
  const candidate = parsed as Partial<PublicCollectionSnapshot>;
  if (
    candidate.version !== 1
    || typeof candidate.name !== "string"
    || typeof candidate.emoji !== "string"
    || typeof candidate.description !== "string"
    || typeof candidate.createdAt !== "string"
    || !Array.isArray(candidate.titleIds)
  ) {
    throw new Error("지원하지 않는 공개 리스트 형식입니다.");
  }
  return canonicalSnapshot(candidate as PublicCollectionSnapshot);
}

export function publicCollectionSlug(name: string): string {
  const normalized = name.normalize("NFKC").trim().toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 60);
  return normalized || "collection";
}
