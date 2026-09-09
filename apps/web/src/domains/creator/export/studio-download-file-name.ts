const CONTROL_OR_BIDI_CHARACTER = /[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/gu;
const UNSAFE_FILE_NAME_CHARACTER = /[<>:"/\\|?*]/gu;
const NON_EXTENSION_CHARACTER = /[^a-z0-9]/giu;
const WINDOWS_RESERVED_STEM = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$/iu;

export const STUDIO_DOWNLOAD_FILE_NAME_MAX_CODE_POINTS = 180;

interface StudioDownloadFileNameParts {
  stem: string;
  extension: string;
}

export interface StudioDownloadFileNameInput {
  title: string;
  fallbackTitle: string;
  extension: string;
  suffix?: string;
}

function truncateCodePoints(value: string, maximum: number): string {
  if (maximum <= 0) return "";
  return Array.from(value).slice(0, maximum).join("");
}

function splitFileName(value: string): StudioDownloadFileNameParts {
  const lastDot = value.lastIndexOf(".");
  if (lastDot <= 0 || lastDot === value.length - 1) {
    return { stem: value, extension: "" };
  }
  return {
    stem: value.slice(0, lastDot),
    extension: value.slice(lastDot + 1),
  };
}

function normalizeExtension(value: string): string {
  return truncateCodePoints(
    value.normalize("NFKC").replace(NON_EXTENSION_CHARACTER, "").toLowerCase(),
    16,
  );
}

function normalizeStem(value: string): string {
  let stem = value
    .normalize("NFKC")
    .replace(CONTROL_OR_BIDI_CHARACTER, "")
    .replace(UNSAFE_FILE_NAME_CHARACTER, "-")
    .replace(/\s+/gu, " ")
    .replace(/-{2,}/gu, "-")
    .replace(/^[. -]+|[. -]+$/gu, "")
    .trim();
  if (WINDOWS_RESERVED_STEM.test(stem)) stem = `_${stem}`;
  return stem;
}

function composeFileName(stem: string, extension: string): string {
  const extensionSuffix = extension ? `.${extension}` : "";
  const maximumStemLength = Math.max(
    1,
    STUDIO_DOWNLOAD_FILE_NAME_MAX_CODE_POINTS - Array.from(extensionSuffix).length,
  );
  const boundedStem = truncateCodePoints(stem, maximumStemLength).replace(/[. ]+$/gu, "");
  return `${boundedStem || "toonspectrum-download"}${extensionSuffix}`;
}

/**
 * Normalizes an arbitrary browser download name to a portable Windows/macOS/Linux file name.
 * Directory traversal, control/bidi characters, device names, trailing dots, and overlong names
 * are removed without discarding Korean or other Unicode title text.
 */
export function sanitizeStudioDownloadFileName(
  value: string,
  fallback = "toonspectrum-download",
): string {
  const source = splitFileName(value.normalize("NFKC").trim());
  const fallbackSource = splitFileName(fallback.normalize("NFKC").trim());
  const extension = normalizeExtension(source.extension || fallbackSource.extension);
  const fallbackStem = normalizeStem(fallbackSource.stem) || "toonspectrum-download";
  const stem = normalizeStem(source.stem) || fallbackStem;
  return composeFileName(stem, extension);
}

/** Builds one safe file name while keeping the extension and optional suffix explicit. */
export function createStudioDownloadFileName({
  title,
  fallbackTitle,
  extension,
  suffix = "",
}: StudioDownloadFileNameInput): string {
  const safeTitle = normalizeStem(title) || normalizeStem(fallbackTitle) || "toonspectrum-download";
  const safeSuffix = normalizeStem(suffix);
  const safeExtension = normalizeExtension(extension);
  const stem = safeSuffix ? `${safeTitle}-${safeSuffix}` : safeTitle;
  return composeFileName(stem, safeExtension);
}

/**
 * Makes names unique using case-insensitive keys because Windows and default macOS volumes are
 * commonly case-insensitive. Suffixes are inserted before the extension.
 */
export function dedupeStudioDownloadFileNames(fileNames: readonly string[]): string[] {
  const used = new Set<string>();
  return fileNames.map((value) => {
    const normalized = sanitizeStudioDownloadFileName(value);
    const parts = splitFileName(normalized);
    let candidate = normalized;
    let ordinal = 2;
    while (used.has(candidate.normalize("NFKC").toLowerCase())) {
      candidate = composeFileName(`${parts.stem}-${ordinal}`, parts.extension);
      ordinal += 1;
    }
    used.add(candidate.normalize("NFKC").toLowerCase());
    return candidate;
  });
}
