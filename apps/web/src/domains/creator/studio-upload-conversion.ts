export interface StudioUploadImageSourceMetadata {
  readonly width: number;
  readonly height: number;
  readonly byteLength: number;
  readonly format: "jpeg" | "png" | "webp";
}

export interface StudioUploadImageOutputMetadata {
  readonly width: number;
  readonly height: number;
  readonly byteLength: number | null;
  readonly format: "webp" | "stored";
}

export interface StudioUploadConversionPage {
  readonly source?: StudioUploadImageSourceMetadata | null;
  readonly output: StudioUploadImageOutputMetadata;
}

export interface StudioUploadConversionSummary {
  readonly pageCount: number;
  readonly transformedPageCount: number;
  readonly sourceByteLength: number | null;
  readonly outputByteLength: number | null;
  readonly maximumOutputWidth: number;
  readonly maximumOutputHeight: number;
}

/** Returns the decoded payload size without allocating another copy of a data URL. */
export function studioDataUrlByteLength(value: string): number | null {
  const commaIndex = value.indexOf(",");
  if (commaIndex < 5) return null;
  const metadata = value.slice(0, commaIndex).toLowerCase();
  const payload = value.slice(commaIndex + 1);
  if (metadata.includes(";base64")) {
    const compact = payload.replace(/[\r\n\t ]+/gu, "");
    if (!compact || compact.length % 4 !== 0) return null;
    const padding = compact.endsWith("==") ? 2 : compact.endsWith("=") ? 1 : 0;
    return Math.max(0, (compact.length / 4) * 3 - padding);
  }
  try {
    return new TextEncoder().encode(decodeURIComponent(payload)).byteLength;
  } catch {
    return null;
  }
}

export function summarizeStudioUploadConversion(
  pages: readonly StudioUploadConversionPage[],
): StudioUploadConversionSummary {
  let transformedPageCount = 0;
  let sourceByteLength = 0;
  let outputByteLength = 0;
  let sourceBytesComplete = true;
  let outputBytesComplete = true;
  let maximumOutputWidth = 0;
  let maximumOutputHeight = 0;

  for (const page of pages) {
    const { source, output } = page;
    maximumOutputWidth = Math.max(maximumOutputWidth, output.width);
    maximumOutputHeight = Math.max(maximumOutputHeight, output.height);
    if (source) {
      sourceByteLength += source.byteLength;
      if (
        source.width !== output.width
        || source.height !== output.height
        || (output.format === "webp" && source.format !== output.format)
      ) {
        transformedPageCount += 1;
      }
    } else {
      sourceBytesComplete = false;
    }
    if (output.byteLength === null) {
      outputBytesComplete = false;
    } else {
      outputByteLength += output.byteLength;
    }
  }

  return {
    pageCount: pages.length,
    transformedPageCount,
    sourceByteLength: sourceBytesComplete ? sourceByteLength : null,
    outputByteLength: outputBytesComplete ? outputByteLength : null,
    maximumOutputWidth,
    maximumOutputHeight,
  };
}

export function formatStudioUploadBytes(value: number | null): string {
  if (value === null) return "계산 불가";
  if (value < 1_024) return `${value}B`;
  const kibibytes = value / 1_024;
  if (kibibytes < 1_024) return `${kibibytes.toFixed(kibibytes >= 100 ? 0 : 1)}KB`;
  const mebibytes = kibibytes / 1_024;
  return `${mebibytes.toFixed(mebibytes >= 100 ? 0 : 1)}MB`;
}
