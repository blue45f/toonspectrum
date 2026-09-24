import { createHash } from "node:crypto";

export const CREATOR_WORK_MEDIA_MAX_BYTES = 32 * 1024 * 1024;

export const CREATOR_WORK_MEDIA_TYPES = [
  "image/avif",
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export type CreatorWorkMediaType = (typeof CREATOR_WORK_MEDIA_TYPES)[number];
export type CreatorWorkMediaTarget =
  | { kind: "cover" }
  | { kind: "page"; pageIndex: number };

export interface CreatorWorkMediaPayload {
  readonly bytes: Buffer;
  readonly byteLength: number;
  readonly mediaType: CreatorWorkMediaType;
  readonly sha256: string;
}

const DATA_IMAGE_PATTERN = /^data:(image\/(?:avif|gif|jpeg|png|webp));base64,([A-Za-z0-9+/=\r\n\t ]+)$/u;
const BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u;
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;

function canonicalBase64(value: string): string | null {
  const compact = value.replace(/[\r\n\t ]+/gu, "");
  if (!compact || compact.length % 4 !== 0 || !BASE64_PATTERN.test(compact)) return null;
  return compact;
}

export function decodeCreatorWorkDataImage(
  value: unknown,
  maximumBytes = CREATOR_WORK_MEDIA_MAX_BYTES,
): CreatorWorkMediaPayload | null {
  if (typeof value !== "string") return null;
  const match = DATA_IMAGE_PATTERN.exec(value.trim());
  if (!match) return null;
  const mediaType = match[1] as CreatorWorkMediaType;
  const encoded = canonicalBase64(match[2] ?? "");
  if (!encoded) return null;

  const bytes = Buffer.from(encoded, "base64");
  if (bytes.byteLength === 0 || bytes.byteLength > maximumBytes) return null;
  const roundTrip = bytes.toString("base64").replace(/=+$/u, "");
  if (roundTrip !== encoded.replace(/=+$/u, "")) return null;

  return {
    bytes,
    byteLength: bytes.byteLength,
    mediaType,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

export function isCreatorWorkMediaDigest(value: unknown): value is string {
  return typeof value === "string" && SHA256_PATTERN.test(value);
}

export function creatorWorkMediaPath(
  workId: string,
  target: CreatorWorkMediaTarget,
  sha256: string,
): string {
  const prefix = `/api/creator/works/${encodeURIComponent(workId)}/media`;
  return target.kind === "cover"
    ? `${prefix}/cover/${sha256}`
    : `${prefix}/pages/${target.pageIndex}/${sha256}`;
}

export function projectCreatorWorkMediaValue(
  workId: string,
  target: CreatorWorkMediaTarget,
  value: string,
): string {
  const media = decodeCreatorWorkDataImage(value);
  if (media) return creatorWorkMediaPath(workId, target, media.sha256);
  return value.trimStart().startsWith("data:") ? "" : value;
}

export function projectCreatorWorkSummaryMedia<Work extends { id: string; cover: string }>(
  work: Work,
): Work {
  const cover = projectCreatorWorkMediaValue(work.id, { kind: "cover" }, work.cover);
  return cover === work.cover ? work : { ...work, cover };
}

export function projectCreatorWorkDetailMedia<
  Work extends { id: string; cover: string; pages: string[] },
>(work: Work): Work {
  const projected = projectCreatorWorkSummaryMedia(work);
  let changed = projected !== work;
  const pages = work.pages.map((page, pageIndex) => {
    const next = projectCreatorWorkMediaValue(work.id, { kind: "page", pageIndex }, page);
    if (next !== page) changed = true;
    return next;
  });
  return changed ? { ...projected, pages } : work;
}
