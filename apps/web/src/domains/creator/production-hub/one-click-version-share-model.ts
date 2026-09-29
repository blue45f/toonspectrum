/**
 * 원클릭 버전 공유 — 링크 발급·보관 모델.
 *
 * 크레코식 "원클릭 버전 생성 → 링크 공유" 동선을 로컬 우선으로 재해석한 저장소다.
 * 링크 자체는 클라이언트에서 발급하는 공유 토큰이며, 실제 권한 검증은 서버
 * 어댑터의 후속 작업에서 처리한다. 토큰은 추측 불가능한 난수로 만든다.
 */

export type VersionSharePermission = "view" | "comment" | "edit";

export interface VersionShareSettings {
  readonly permission: VersionSharePermission;
  /** 만료 일수. 0이면 만료 없음. */
  readonly expiresInDays: number;
  readonly watermark: boolean;
  /** 선택 비밀번호. 빈 문자열이면 비밀번호 없음. */
  readonly password: string;
}

export interface VersionShareLink {
  readonly id: string;
  readonly artifactId: string;
  readonly snapshotId: string;
  readonly snapshotName: string;
  readonly token: string;
  readonly url: string;
  readonly settings: VersionShareSettings;
  readonly createdAt: string;
  readonly expiresAt: string | null;
  readonly revoked: boolean;
}

export const DEFAULT_VERSION_SHARE_SETTINGS: VersionShareSettings = Object.freeze({
  permission: "comment",
  expiresInDays: 7,
  watermark: true,
  password: "",
});

export const VERSION_SHARE_EXPIRY_OPTIONS = [1, 3, 7, 14, 30] as const;

const STORAGE_KEY = "toonstudio.version-share-links.v1";
const TOKEN_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
const TOKEN_LENGTH = 24;

function storageAvailable(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function newToken(pick?: (index: number) => number): string {
  const choose = pick ?? ((index: number): number => {
    void index;
    try {
      const values = new Uint32Array(1);
      globalThis.crypto.getRandomValues(values);
      return (values[0] as number) % TOKEN_ALPHABET.length;
    } catch {
      return Math.floor(Math.random() * TOKEN_ALPHABET.length);
    }
  });
  let token = "";
  for (let i = 0; i < TOKEN_LENGTH; i += 1) {
    token += TOKEN_ALPHABET[choose(i) % TOKEN_ALPHABET.length];
  }
  return token;
}

function newLinkId(): string {
  const random = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID().replace(/-/gu, "").slice(0, 12)
    : Math.random().toString(36).slice(2, 14);
  return `version-share-${Date.now().toString(36)}-${random}`;
}

/** 공유 URL을 만든다. origin을 주입하면 테스트에서 결정적으로 검증할 수 있다. */
export function buildVersionShareUrl(token: string, origin?: string): string {
  const base = origin
    ?? (typeof window !== "undefined" && window.location?.origin
      ? window.location.origin
      : "https://www.toonstudio.cloud");
  return `${base.replace(/\/+$/u, "")}/share/version/${token}`;
}

type LinkTable = Record<string, readonly VersionShareLink[]>;

function readTable(): LinkTable {
  if (!storageAvailable()) return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const table: LinkTable = {};
    for (const [artifactId, entries] of Object.entries(parsed as Record<string, unknown>)) {
      if (!Array.isArray(entries)) continue;
      const links = entries.filter((entry): entry is VersionShareLink =>
        Boolean(entry)
        && typeof entry === "object"
        && typeof (entry as { id?: unknown }).id === "string"
        && typeof (entry as { token?: unknown }).token === "string"
        && typeof (entry as { url?: unknown }).url === "string"
        && typeof (entry as { createdAt?: unknown }).createdAt === "string");
      if (links.length > 0) table[artifactId] = Object.freeze(links);
    }
    return table;
  } catch {
    return {};
  }
}

function writeTable(table: LinkTable): void {
  if (!storageAvailable()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(table));
  } catch {
    // 저장 공간 부족 등에서는 조용히 무시한다.
  }
}

function normalizeSettings(settings: Partial<VersionShareSettings>): VersionShareSettings {
  const permission: VersionSharePermission =
    settings.permission === "view" || settings.permission === "edit" ? settings.permission : "comment";
  const expiresInDays = Number.isSafeInteger(settings.expiresInDays) && (settings.expiresInDays ?? 0) >= 0
    ? Math.min(settings.expiresInDays ?? 7, 365)
    : 7;
  return {
    permission,
    expiresInDays,
    watermark: settings.watermark !== false,
    password: (settings.password ?? "").slice(0, 64),
  };
}

export interface VersionShareLinkSource {
  readonly snapshotId: string;
  readonly snapshotName: string;
}

/**
 * 스냅샷에 대한 공유 링크를 발급한다. 같은 스냅샷에 여러 링크를 만들 수 있다
 * (예: 편집부용/외주용으로 권한을 다르게).
 */
export function createVersionShareLink(
  artifactId: string,
  source: VersionShareLinkSource,
  settings: Partial<VersionShareSettings> = {},
  overrides?: { readonly token?: string; readonly origin?: string; readonly now?: string },
): VersionShareLink | null {
  if (!artifactId || !source.snapshotId) return null;
  const normalized = normalizeSettings(settings);
  const token = overrides?.token ?? newToken();
  const createdAt = overrides?.now ?? new Date().toISOString();
  const expiresAt = normalized.expiresInDays > 0
    ? new Date(new Date(createdAt).getTime() + normalized.expiresInDays * 24 * 60 * 60 * 1000).toISOString()
    : null;
  const link: VersionShareLink = Object.freeze({
    id: newLinkId(),
    artifactId,
    snapshotId: source.snapshotId,
    snapshotName: source.snapshotName,
    token,
    url: buildVersionShareUrl(token, overrides?.origin),
    settings: normalized,
    createdAt,
    expiresAt,
    revoked: false,
  });
  const table = readTable();
  const next = [link, ...(table[artifactId] ?? [])].slice(0, 60);
  writeTable({ ...table, [artifactId]: Object.freeze(next) });
  return link;
}

export function listVersionShareLinks(artifactId: string): readonly VersionShareLink[] {
  return Object.freeze([...(readTable()[artifactId] ?? [])].sort(
    (left, right) => right.createdAt.localeCompare(left.createdAt),
  ));
}

/** 링크를 회수한다. URL 자체는 무효화 표시만 하며 기록은 남긴다. */
export function revokeVersionShareLink(artifactId: string, linkId: string): readonly VersionShareLink[] {
  const table = readTable();
  const current = table[artifactId] ?? [];
  const next = current.map((link) => link.id === linkId ? { ...link, revoked: true } : link);
  writeTable({ ...table, [artifactId]: Object.freeze(next) });
  return listVersionShareLinks(artifactId);
}

export function isVersionShareLinkExpired(link: VersionShareLink, now?: string): boolean {
  if (link.revoked) return true;
  if (!link.expiresAt) return false;
  const at = now ?? new Date().toISOString();
  return link.expiresAt <= at;
}

/** ProductionExternalReviewWizard 권한 프리셋으로 매핑한다. */
export function toExternalReviewPermission(
  permission: VersionSharePermission,
): "viewer" | "commenter" | "approver" {
  if (permission === "view") return "viewer";
  if (permission === "edit") return "approver";
  return "commenter";
}
