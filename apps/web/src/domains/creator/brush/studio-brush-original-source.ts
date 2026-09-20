import { fromUint8Array, toUint8Array } from "js-base64";
import { sha256HexPortable } from "@/shared/lib/sha256-portable";
import { STUDIO_BRUSH_PROGRAM_MAX_BYTES } from "./studio-brush-pack-format";

/** Library provenance only, not executable settings or a per-stroke payload. */
export interface StudioBrushOriginalSource {
  readonly version: 1;
  readonly format: "myb" | "kpp";
  readonly fileName: string;
  readonly encoding: "base64";
  readonly byteLength: number;
  readonly sha256: string;
  readonly base64: string;
}
export const BRUSH_SOURCE_ARCHIVE_KIND = "toonspectrum-studio-brush-source-archive";
export const BRUSH_SOURCE_SETTINGS_MAX_CHARACTERS = 2 * 1024 * 1024;
export const BRUSH_SOURCE_ARCHIVE_MAX_CHARACTERS =
  Math.ceil(STUDIO_BRUSH_PROGRAM_MAX_BYTES / 3) * 4 + BRUSH_SOURCE_SETTINGS_MAX_CHARACTERS + 4096;
export const BRUSH_SOURCE_ARCHIVE_MAX_BYTES = BRUSH_SOURCE_ARCHIVE_MAX_CHARACTERS;
const verified = new WeakSet<object>();
const KEYS = ["version", "format", "fileName", "encoding", "byteLength", "sha256", "base64"];

export class StudioBrushOriginalSourceError extends Error {
  constructor() {
    super("브러시 원본의 형식·크기·해시가 일치하지 않습니다. 원본을 버린 채 저장하거나 가져오지 않았습니다.");
    this.name = "StudioBrushOriginalSourceError";
  }
}

function safeName(name: string, format: StudioBrushOriginalSource["format"]): string {
  const basename = name.split(/[\\/]/u).at(-1) ?? "brush";
  const clean = Array.from(basename).filter((char) => {
    const code = char.codePointAt(0)!;
    return code > 31 && code !== 127 && !':*?"<>|'.includes(char)
      && !(code >= 0x202a && code <= 0x202e) && !(code >= 0x2066 && code <= 0x2069);
  }).join("").replace(/\.[^.]*$/u, "").trim();
  return `${Array.from(clean).slice(0, 180).join("") || "brush"}.${format}`;
}

export function createStudioBrushOriginalSource(bytes: Uint8Array, fileName: string,
  format: StudioBrushOriginalSource["format"]): StudioBrushOriginalSource {
  if (!bytes.byteLength || bytes.byteLength > STUDIO_BRUSH_PROGRAM_MAX_BYTES
    || typeof fileName !== "string" || (format !== "myb" && format !== "kpp")) {
    throw new StudioBrushOriginalSourceError();
  }
  const copy = new Uint8Array(bytes);
  const source: StudioBrushOriginalSource = Object.freeze({ version: 1, format,
    fileName: safeName(fileName, format), encoding: "base64", byteLength: copy.byteLength,
    sha256: sha256HexPortable(copy), base64: fromUint8Array(copy) });
  verified.add(source);
  return source;
}

/** Validate before accepting; only immutable returned copies are cached. */
export function requireStudioBrushOriginalSource(raw: unknown): StudioBrushOriginalSource {
  if (raw && typeof raw === "object" && verified.has(raw)) return raw as StudioBrushOriginalSource;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new StudioBrushOriginalSourceError();
  const prototype = Object.getPrototypeOf(raw);
  if (prototype !== Object.prototype && prototype !== null) throw new StudioBrushOriginalSourceError();
  const fields = Object.getOwnPropertyDescriptors(raw);
  if (Reflect.ownKeys(raw).length !== KEYS.length || KEYS.some((key) =>
    !fields[key] || !("value" in fields[key]!) || !fields[key]!.enumerable)) throw new StudioBrushOriginalSourceError();
  const source = raw as StudioBrushOriginalSource;
  if (source.version !== 1 || (source.format !== "myb" && source.format !== "kpp")
    || source.encoding !== "base64" || typeof source.fileName !== "string" || source.fileName.length > 365
    || source.fileName !== safeName(source.fileName, source.format)
    || !Number.isSafeInteger(source.byteLength) || source.byteLength < 1
    || source.byteLength > STUDIO_BRUSH_PROGRAM_MAX_BYTES
    || typeof source.sha256 !== "string" || !/^[0-9a-f]{64}$/u.test(source.sha256)
    || typeof source.base64 !== "string" || source.base64.length !== Math.ceil(source.byteLength / 3) * 4) {
    throw new StudioBrushOriginalSourceError();
  }
  let bytes: Uint8Array;
  try { bytes = toUint8Array(source.base64); } catch { throw new StudioBrushOriginalSourceError(); }
  if (bytes.byteLength !== source.byteLength || fromUint8Array(bytes) !== source.base64
    || sha256HexPortable(bytes) !== source.sha256) throw new StudioBrushOriginalSourceError();
  const result = Object.freeze({ ...source });
  verified.add(result);
  return result;
}

/** Hash detects corruption, not authorship. Returned bytes are detached. */
export function decodeStudioBrushOriginalSource(raw: unknown): Uint8Array<ArrayBuffer> {
  return new Uint8Array(toUint8Array(requireStudioBrushOriginalSource(raw).base64));
}
