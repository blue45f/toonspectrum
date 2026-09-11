import { createSecureRandomUuid } from "@/shared/lib/secure-random-id";

import type { StudioImportFormat } from "./studio-import-compatibility";

export const STUDIO_IMPORT_HANDOFF_QUERY_KEY = "importHandoff";
export const STUDIO_IMPORT_HANDOFF_ACCEPT =
  ".json,.psd,.ora,.cbz,.abr,.myb,.kpp,image/*,.tif,.tiff";

export type StudioImportHandoffTarget =
  | "brush-pack"
  | "image"
  | "interchange"
  | "project-json"
  | "psd";

export interface StudioImportHandoff {
  readonly token: string;
  readonly target: StudioImportHandoffTarget;
  readonly file: File;
  readonly createdAt: number;
  readonly expiresAt: number;
}

const HANDOFF_TTL_MS = 5 * 60 * 1000;
const handoffs = new Map<string, StudioImportHandoff>();

function pruneExpired(now: number): void {
  for (const [token, handoff] of handoffs) {
    if (handoff.expiresAt <= now) handoffs.delete(token);
  }
}

export function studioImportHandoffTargetForFormat(
  format: StudioImportFormat,
): StudioImportHandoffTarget | null {
  if (format === "json") return "project-json";
  if (format === "psd") return "psd";
  if (format === "ora" || format === "cbz") return "interchange";
  if (format === "abr" || format === "myb" || format === "kpp") return "brush-pack";
  if (
    format === "png"
    || format === "jpg"
    || format === "jpeg"
    || format === "webp"
    || format === "avif"
    || format === "tif"
    || format === "tiff"
    || format === "svg"
    || format === "gif"
  ) {
    return "image";
  }
  return null;
}

export function registerStudioImportHandoff(
  file: File,
  format: StudioImportFormat,
  now = Date.now(),
): StudioImportHandoff {
  if (!(file instanceof File) || file.size <= 0 || !file.name.trim()) {
    throw new Error("A non-empty browser File is required for Studio import handoff.");
  }
  const target = studioImportHandoffTargetForFormat(format);
  if (!target) throw new Error(`Studio import has no operational handoff for ${format}.`);
  pruneExpired(now);
  const token = createSecureRandomUuid(
    "이 브라우저에서는 안전한 Studio 가져오기 전달 ID를 만들 수 없습니다.",
  );
  const handoff = Object.freeze({
    token,
    target,
    file,
    createdAt: now,
    expiresAt: now + HANDOFF_TTL_MS,
  });
  handoffs.set(token, handoff);
  return handoff;
}

export function peekStudioImportHandoff(
  token: string,
  now = Date.now(),
): StudioImportHandoff | null {
  pruneExpired(now);
  return handoffs.get(token) ?? null;
}

export function consumeStudioImportHandoff(
  token: string,
  now = Date.now(),
): StudioImportHandoff | null {
  const handoff = peekStudioImportHandoff(token, now);
  if (!handoff) return null;
  handoffs.delete(token);
  return handoff;
}

export function studioImportHandoffHref(handoff: Pick<StudioImportHandoff, "token">): string {
  const params = new URLSearchParams({ [STUDIO_IMPORT_HANDOFF_QUERY_KEY]: handoff.token });
  return `/studio/canvas?${params.toString()}`;
}

export function clearStudioImportHandoffsForTests(): void {
  handoffs.clear();
}
