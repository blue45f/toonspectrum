import { fromUint8Array, toUint8Array } from "js-base64";
import { sha256HexPortable } from "@/shared/lib/sha256-portable";
import { STUDIO_BRUSH_PROGRAM_MAX_BYTES } from "./studio-brush-pack-format";

interface OriginalMetadata {
  readonly version: 1;
  readonly format: "myb" | "kpp";
  readonly fileName: string;
  readonly byteLength: number;
  readonly sha256: string;
}
/** Only archives/temporary sessions carry base64; SQLite stores a compact CAS reference. */
export type StudioBrushOriginalSource = OriginalMetadata & (
  | { readonly encoding: "base64"; readonly base64: string }
  | { readonly encoding: "opfs-cas" }
);
export const BRUSH_SOURCE_ARCHIVE_KIND = "toonspectrum-studio-brush-source-archive";
export const BRUSH_SOURCE_SETTINGS_MAX_CHARACTERS = 2 * 1024 * 1024;
export const BRUSH_SOURCE_ARCHIVE_MAX_CHARACTERS =
  Math.ceil(STUDIO_BRUSH_PROGRAM_MAX_BYTES / 3) * 4 + BRUSH_SOURCE_SETTINGS_MAX_CHARACTERS + 4096;
export const BRUSH_SOURCE_ARCHIVE_MAX_BYTES =
  BRUSH_SOURCE_ARCHIVE_MAX_CHARACTERS + BRUSH_SOURCE_SETTINGS_MAX_CHARACTERS * 3;
const verified = new WeakSet<object>();
const KEYS = ["version", "format", "fileName", "encoding", "byteLength", "sha256"];
export class StudioBrushOriginalSourceError extends Error {
  constructor() {
    super("브러시 원본의 형식·크기·해시가 일치하지 않습니다. 원본을 버린 채 저장하거나 가져오지 않았습니다.");
    this.name = "StudioBrushOriginalSourceError";
  }
}

function safeName(name: string, format: OriginalMetadata["format"]): string {
  const basename = name.split(/[\\/]/u).at(-1) ?? "brush";
  const clean = Array.from(basename).filter((char) => {
    const code = char.codePointAt(0)!;
    return code > 31 && code !== 127 && !':*?"<>|'.includes(char)
      && !(code >= 0x202a && code <= 0x202e) && !(code >= 0x2066 && code <= 0x2069);
  }).join("").replace(/\.[^.]*$/u, "").trim();
  return `${Array.from(clean).slice(0, 180).join("") || "brush"}.${format}`;
}

/** Keep actual input bytes, including whitespace, XML and embedded thumbnails. */
export function createStudioBrushOriginalSource(bytes: Uint8Array, fileName: string,
  format: OriginalMetadata["format"]): StudioBrushOriginalSource {
  if (!bytes.byteLength || bytes.byteLength > STUDIO_BRUSH_PROGRAM_MAX_BYTES
    || typeof fileName !== "string" || (format !== "myb" && format !== "kpp")) {
    throw new StudioBrushOriginalSourceError();
  }
  const stableBytes = new Uint8Array(bytes);
  const source: StudioBrushOriginalSource = Object.freeze({ version: 1, format,
    fileName: safeName(fileName, format), encoding: "base64", byteLength: stableBytes.byteLength,
    sha256: sha256HexPortable(stableBytes), base64: fromUint8Array(stableBytes) });
  verified.add(source);
  return source;
}

/** Caller-owned objects never enter the verified fast path. */
export function requireStudioBrushOriginalSource(raw: unknown): StudioBrushOriginalSource {
  if (raw && typeof raw === "object" && verified.has(raw)) return raw as StudioBrushOriginalSource;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new StudioBrushOriginalSourceError();
  const prototype = Object.getPrototypeOf(raw);
  if (prototype !== Object.prototype && prototype !== null) throw new StudioBrushOriginalSourceError();
  const fields = Object.getOwnPropertyDescriptors(raw);
  const keys = fields.encoding?.value === "base64" ? [...KEYS, "base64"] : KEYS;
  if (Reflect.ownKeys(raw).length !== keys.length || keys.some((key) =>
    !fields[key] || !("value" in fields[key]!) || !fields[key]!.enumerable)) throw new StudioBrushOriginalSourceError();
  const source = raw as StudioBrushOriginalSource;
  if (source.version !== 1 || (source.format !== "myb" && source.format !== "kpp")
    || (source.encoding !== "base64" && source.encoding !== "opfs-cas")
    || typeof source.fileName !== "string" || source.fileName.length > 365
    || source.fileName !== safeName(source.fileName, source.format)
    || !Number.isSafeInteger(source.byteLength) || source.byteLength < 1
    || source.byteLength > STUDIO_BRUSH_PROGRAM_MAX_BYTES
    || typeof source.sha256 !== "string" || !/^[0-9a-f]{64}$/u.test(source.sha256)
    || (source.encoding === "base64" && (typeof source.base64 !== "string"
      || source.base64.length !== Math.ceil(source.byteLength / 3) * 4))) {
    throw new StudioBrushOriginalSourceError();
  }
  if (source.encoding === "base64") {
    let bytes: Uint8Array;
    try { bytes = toUint8Array(source.base64); } catch { throw new StudioBrushOriginalSourceError(); }
    if (bytes.byteLength !== source.byteLength || fromUint8Array(bytes) !== source.base64
      || sha256HexPortable(bytes) !== source.sha256) throw new StudioBrushOriginalSourceError();
  }
  const result = Object.freeze({ ...source });
  verified.add(result);
  return result;
}

/** A portable archive must contain its bytes, never a reference to this browser's storage. */
export function requireEmbeddedStudioBrushOriginalSource(raw: unknown) {
  const source = requireStudioBrushOriginalSource(raw);
  if (source.encoding !== "base64") throw new Error("원본 바이트를 OPFS에서 검증해 불러와야 합니다.");
  return source;
}

/** Hash detects corruption, not authorship. Returned bytes are detached. */
export function decodeStudioBrushOriginalSource(raw: unknown): Uint8Array<ArrayBuffer> {
  return new Uint8Array(toUint8Array(requireEmbeddedStudioBrushOriginalSource(raw).base64));
}
