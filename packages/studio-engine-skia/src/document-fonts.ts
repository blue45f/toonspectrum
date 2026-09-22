import type {
  SkiaDocumentFontSource,
  SkiaDocumentItem,
  SkiaDocumentText,
} from "./document-contract";
import type {
  Canvas,
  CanvasKit,
  Paragraph,
  TypefaceFontProvider,
} from "canvaskit-wasm";

export const SKIA_DOCUMENT_FONT_BYTE_BUDGET = 64 * 1024 * 1024;
export const SKIA_DOCUMENT_FONT_PREPARATION_TIMEOUT_MS = 15_000;

export class SkiaDocumentFontAdmissionError extends Error {
  override readonly name = "SkiaDocumentFontAdmissionError";
}

export type SkiaDocumentFontDataLoader = (
  font: SkiaDocumentFontSource,
  signal: AbortSignal,
) => Promise<readonly Uint8Array[]>;

interface FontEntry {
  readonly provider: TypefaceFontProvider;
  readonly bytes: number;
  readonly family: string;
}

function align(ck: CanvasKit, value: SkiaDocumentText["align"]) {
  if (value === "center") return ck.TextAlign.Center;
  if (value === "right") return ck.TextAlign.Right;
  return ck.TextAlign.Left;
}

function safeDelete(value: { delete(): void } | null | undefined): void {
  try { value?.delete(); } catch { /* native resource may already be abandoned */ }
}

async function loadFontDataWithTimeout(
  loader: SkiaDocumentFontDataLoader,
  font: SkiaDocumentFontSource,
  parentSignal: AbortSignal,
  timeoutMs: number,
): Promise<readonly Uint8Array[]> {
  parentSignal.throwIfAborted();
  const controller = new AbortController();
  const forwardAbort = () => controller.abort(parentSignal.reason);
  let abortListener: (() => void) | null = null;
  parentSignal.addEventListener("abort", forwardAbort, { once: true });
  if (parentSignal.aborted) forwardAbort();
  const timer = setTimeout(
    () => controller.abort(new Error("GPU font preparation timed out")),
    timeoutMs,
  );
  const loading = Promise.resolve().then(
    () => loader(font, controller.signal),
  );
  const aborted = new Promise<never>((_, reject) => {
    abortListener = () => reject(
      controller.signal.reason ?? new Error("GPU font preparation aborted"),
    );
    if (controller.signal.aborted) {
      abortListener();
      return;
    }
    controller.signal.addEventListener("abort", abortListener, { once: true });
  });
  try {
    return await Promise.race([loading, aborted]);
  } finally {
    clearTimeout(timer);
    parentSignal.removeEventListener("abort", forwardAbort);
    if (abortListener) {
      controller.signal.removeEventListener("abort", abortListener);
    }
  }
}

export function createSkiaDocumentFontCache(
  ck: CanvasKit,
  loader: SkiaDocumentFontDataLoader,
  preparationTimeoutMs = SKIA_DOCUMENT_FONT_PREPARATION_TIMEOUT_MS,
) {
  if (!Number.isFinite(preparationTimeoutMs) || preparationTimeoutMs <= 0) {
    throw new Error("Invalid GPU font preparation timeout");
  }
  const entries = new Map<string, FontEntry>();
  let disposed = false;
  const byteSize = () => [...entries.values()].reduce(
    (sum, entry) => sum + entry.bytes,
    0,
  );

  return {
    get size() { return entries.size; },
    get bytes() { return byteSize(); },

    async prepare(
      items: readonly SkiaDocumentItem[],
      signal: AbortSignal,
    ): Promise<void> {
      const wanted = new Map<string, SkiaDocumentFontSource>();
      for (const item of items) {
        if (item.text) wanted.set(item.text.font.key, item.text.font);
      }
      for (const font of wanted.values()) {
        signal.throwIfAborted();
        if (disposed) throw new Error("GPU font cache is disposed");
        if (entries.has(font.key)) continue;
        let sources: readonly Uint8Array[];
        try {
          sources = await loadFontDataWithTimeout(
            loader,
            font,
            signal,
            preparationTimeoutMs,
          );
        } catch (cause) {
          if (signal.aborted || disposed) throw cause;
          throw new SkiaDocumentFontAdmissionError(
            cause instanceof Error ? cause.message : String(cause),
          );
        }
        signal.throwIfAborted();
        if (disposed) throw new Error("GPU font cache is disposed");
        if (sources.length === 0 || sources.some(
          (source) => !(source instanceof Uint8Array) || source.byteLength === 0,
        )) {
          throw new SkiaDocumentFontAdmissionError(
            `GPU text font bytes are unavailable: ${font.family}`,
          );
        }
        const bytes = sources.reduce((sum, source) => sum + source.byteLength, 0);
        if (!Number.isSafeInteger(bytes)
          || bytes > SKIA_DOCUMENT_FONT_BYTE_BUDGET
          || byteSize() + bytes > SKIA_DOCUMENT_FONT_BYTE_BUDGET) {
          throw new SkiaDocumentFontAdmissionError(
            "GPU text font byte budget exceeded; original document preserved",
          );
        }
        const provider = ck.TypefaceFontProvider.Make();
        try {
          for (const source of sources) {
            signal.throwIfAborted();
            provider.registerFont(Uint8Array.from(source), font.family);
          }
          entries.set(font.key, { provider, bytes, family: font.family });
        } catch (cause) {
          safeDelete(provider);
          if (signal.aborted || disposed) throw cause;
          throw new SkiaDocumentFontAdmissionError(
            cause instanceof Error
              ? `GPU text font registration failed: ${cause.message}`
              : "GPU text font registration failed",
          );
        }
      }
    },

    draw(
      target: Canvas,
      text: SkiaDocumentText,
    ): void {
      const entry = entries.get(text.font.key);
      if (!entry) throw new Error("GPU text font is not ready");
      const textStyle = new ck.TextStyle({
        color: [
          text.color.r,
          text.color.g,
          text.color.b,
          text.color.a * text.opacity,
        ],
        fontFamilies: [entry.family],
        fontSize: text.fontSize,
        fontStyle: {
          weight: text.weight === 700
            ? ck.FontWeight.Bold
            : ck.FontWeight.Normal,
          width: ck.FontWidth.Normal,
          slant: text.italic
            ? ck.FontSlant.Italic
            : ck.FontSlant.Upright,
        },
        heightMultiplier: text.lineHeight,
        halfLeading: false,
        letterSpacing: text.letterSpacing,
        locale: "ko-KR",
      });
      const paragraphStyle = new ck.ParagraphStyle({
        disableHinting: false,
        textAlign: align(ck, text.align),
        textDirection: ck.TextDirection.LTR,
        textStyle,
      });
      const builder = ck.ParagraphBuilder.MakeFromFontProvider(
        paragraphStyle,
        entry.provider,
      );
      let paragraph: Paragraph | null = null;
      try {
        builder.addText(text.text);
        paragraph = builder.build();
        paragraph.layout(text.width);
        if (paragraph.unresolvedCodepoints().length > 0) {
          throw new SkiaDocumentFontAdmissionError(
            `GPU text font is missing glyphs: ${text.font.family}`,
          );
        }
        target.save();
        try {
          target.translate(text.x, text.y);
          target.rotate(text.rotation, 0, 0);
          target.drawParagraph(paragraph, 0, 0);
        } finally {
          target.restore();
        }
      } finally {
        safeDelete(paragraph);
        safeDelete(builder);
      }
    },

    retain(items: readonly SkiaDocumentItem[]): void {
      const wanted = new Set(items.flatMap(
        (item) => item.text ? [item.text.font.key] : [],
      ));
      for (const [key, entry] of entries) {
        if (wanted.has(key)) continue;
        safeDelete(entry.provider);
        entries.delete(key);
      }
    },

    dispose(): void {
      if (disposed) return;
      disposed = true;
      for (const entry of entries.values()) safeDelete(entry.provider);
      entries.clear();
    },
  };
}
