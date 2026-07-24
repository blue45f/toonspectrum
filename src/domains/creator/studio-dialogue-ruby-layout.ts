/**
 * Pure ruby (furigana / 루비) glyph-run layout for dialogue lettering.
 *
 * Engine-free: merges non-overlapping `rubySpans` into ordered base/ruby runs so Konva (or any
 * canvas) can paint stacked glyphs without a full rich-text engine. Spans that overlap, fall outside
 * the text, or carry empty readings are dropped. Uncovered ranges become base-only runs.
 *
 * Overlay helpers below estimate horizontal placements for a stacked MVP paint:
 * base stays one full string; ruby glyphs sit above base segments via glyph-width heuristics.
 * Vertical writing modes intentionally skip ruby paint at the Konva mount (base only) — this module
 * still plans runs, but mounts should not call overlay placement for vertical text.
 */

export type StudioRubyGlyphRun = {
  /** Base text slice (UTF-16 code units, matching textarea selection offsets). */
  readonly base: string;
  /** Optional reading rendered above (or beside for vertical) the base. */
  readonly ruby?: string;
  readonly start: number;
  readonly end: number;
};

export type StudioRubySpanInput = {
  readonly start: number;
  readonly end: number;
  readonly ruby: string;
};

/** Approximate Konva-local placement for one ruby reading above a base segment. */
export type StudioRubyOverlayPlacement = {
  readonly base: string;
  readonly ruby: string;
  readonly start: number;
  readonly end: number;
  /** Left edge of the base segment in the text-box coordinate system (y=0 = top of base text). */
  readonly x: number;
  /** Top of the ruby glyph (typically negative so it sits above the base). */
  readonly y: number;
  /** Estimated advance width of the base segment (center ruby with width + align="center"). */
  readonly baseWidth: number;
  readonly rubyFontSize: number;
};

export type PlanDialogueRubyOverlayOptions = {
  readonly fontSize: number;
  readonly letterSpacing?: number;
  /**
   * Text box width used for left/center/right origin. When omitted, uses the estimated full
   * advance of `text` (single-line left-aligned behaviour).
   */
  readonly textWidth?: number;
  readonly align?: "left" | "center" | "right";
  /** Ruby size as a fraction of base fontSize (default 0.45). */
  readonly rubySizeRatio?: number;
  /**
   * Top of ruby relative to the base text top. Default: `-rubyFontSize * 0.9`.
   * Multi-line wrap is not modelled — all overlays share this first-line approximation.
   */
  readonly rubyY?: number;
};

function isFiniteOffset(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * Plans ordered glyph runs covering `text` from optional ruby spans.
 *
 * - Sorts spans by start (then end)
 * - Clamps to [0, text.length]; drops empty / inverted / empty-ruby spans
 * - Skips spans that overlap a previously accepted span (first wins after sort)
 * - Fills gaps and the trailing tail with base-only runs
 * - Never mutates `text` or `spans`
 */
export function planDialogueRubyRuns(
  text: string,
  spans: readonly StudioRubySpanInput[] | undefined,
): readonly StudioRubyGlyphRun[] {
  const source = typeof text === "string" ? text : "";
  const length = source.length;

  if (!Array.isArray(spans) || spans.length === 0) {
    if (length === 0) return Object.freeze([]);
    return Object.freeze([
      Object.freeze({ base: source, start: 0, end: length }),
    ]);
  }

  type Accepted = { start: number; end: number; ruby: string };
  const accepted: Accepted[] = [];

  const ordered = [...spans].sort(
    (left, right) => left.start - right.start || left.end - right.end,
  );

  for (const span of ordered) {
    if (!span || typeof span !== "object") continue;
    if (!isFiniteOffset(span.start) || !isFiniteOffset(span.end)) continue;
    const start = Math.max(0, Math.min(length, Math.trunc(span.start)));
    const end = Math.max(0, Math.min(length, Math.trunc(span.end)));
    if (start >= end) continue;
    if (typeof span.ruby !== "string") continue;
    const ruby = span.ruby;
    // Empty readings become base-only coverage via the gap filler, not a ruby run.
    if (ruby.length === 0) continue;

    const overlaps = accepted.some(
      (prior) => start < prior.end && prior.start < end,
    );
    if (overlaps) continue;
    accepted.push({ start, end, ruby });
  }

  accepted.sort((left, right) => left.start - right.start || left.end - right.end);

  const runs: StudioRubyGlyphRun[] = [];
  let cursor = 0;
  for (const span of accepted) {
    if (span.start > cursor) {
      runs.push(
        Object.freeze({
          base: source.slice(cursor, span.start),
          start: cursor,
          end: span.start,
        }),
      );
    }
    runs.push(
      Object.freeze({
        base: source.slice(span.start, span.end),
        ruby: span.ruby,
        start: span.start,
        end: span.end,
      }),
    );
    cursor = span.end;
  }
  if (cursor < length) {
    runs.push(
      Object.freeze({
        base: source.slice(cursor),
        start: cursor,
        end: length,
      }),
    );
  }

  return Object.freeze(runs);
}

/**
 * Duck-typed reader for `rubySpans` on dialogue elements. Returns `undefined` when absent or empty
 * so mounts can keep the plain single-Text path.
 */
export function readDialogueRubySpans(
  value: unknown,
): readonly StudioRubySpanInput[] | undefined {
  if (!Array.isArray(value) || value.length === 0) return undefined;
  return value as readonly StudioRubySpanInput[];
}

/**
 * Honest CJK-biased glyph width: halfwidth / basic Latin ≈ 0.55em, everything else ≈ 1em.
 * Surrogate pairs are one visual glyph. Not a substitute for canvas measureText.
 */
export function estimateDialogueGlyphWidth(char: string, fontSize: number): number {
  if (typeof char !== "string" || char.length === 0) return 0;
  if (!(fontSize > 0) || !Number.isFinite(fontSize)) return 0;
  const code = char.codePointAt(0) ?? 0;
  // Basic Latin + Latin-1 + common halfwidth punctuation/digits.
  if (code < 0x1100) return fontSize * 0.55;
  return fontSize;
}

/**
 * Estimated horizontal advance of `text` at `fontSize`, with optional letterSpacing between
 * Unicode code points (not UTF-16 units). Pure — no DOM/canvas.
 */
export function estimateDialogueTextAdvanceWidth(
  text: string,
  fontSize: number,
  letterSpacing = 0,
): number {
  if (typeof text !== "string" || text.length === 0) return 0;
  if (!(fontSize > 0) || !Number.isFinite(fontSize)) return 0;
  const spacing =
    typeof letterSpacing === "number" && Number.isFinite(letterSpacing) ? letterSpacing : 0;

  let width = 0;
  let glyphs = 0;
  for (const char of text) {
    if (glyphs > 0) width += spacing;
    width += estimateDialogueGlyphWidth(char, fontSize);
    glyphs += 1;
  }
  return width;
}

/**
 * Cumulative advance widths keyed by UTF-16 offset: `advances[i]` = width of `text.slice(0, i)`.
 * Letter-spacing is applied between Unicode code points only.
 */
function estimateAdvancesByUtf16Offset(
  text: string,
  fontSize: number,
  letterSpacing: number,
): Float64Array {
  const advances = new Float64Array(text.length + 1);
  let width = 0;
  let index = 0;
  let glyphs = 0;
  while (index < text.length) {
    const code = text.charCodeAt(index);
    let next = index + 1;
    let char = text[index]!;
    if (code >= 0xd800 && code <= 0xdbff && index + 1 < text.length) {
      const low = text.charCodeAt(index + 1);
      if (low >= 0xdc00 && low <= 0xdfff) {
        char = text.slice(index, index + 2);
        next = index + 2;
      }
    }
    if (glyphs > 0) width += letterSpacing;
    width += estimateDialogueGlyphWidth(char, fontSize);
    glyphs += 1;
    // Fill every UTF-16 unit boundary inside a surrogate pair with the same post-glyph width so
    // slice offsets mid-pair still get a defined advance (planDialogueRubyRuns keeps pairs whole).
    for (let fill = index + 1; fill <= next; fill += 1) {
      advances[fill] = width;
    }
    index = next;
  }
  return advances;
}

/**
 * Plans stacked ruby overlays for horizontal dialogue lettering (MVP).
 *
 * - Base remains a single full-string Text at the paint mount
 * - Each accepted run with a reading gets one smaller Text centered over its base segment
 * - X uses estimated glyph advances (not canvas measureText); multi-line wrap is not modelled
 * - Returns an empty frozen array when there is nothing to overlay
 */
export function planDialogueRubyOverlayPlacements(
  text: string,
  spans: readonly StudioRubySpanInput[] | undefined,
  options: PlanDialogueRubyOverlayOptions,
): readonly StudioRubyOverlayPlacement[] {
  if (!options || !(options.fontSize > 0) || !Number.isFinite(options.fontSize)) {
    return Object.freeze([]);
  }
  const source = typeof text === "string" ? text : "";
  if (source.length === 0) return Object.freeze([]);

  const runs = planDialogueRubyRuns(source, spans);
  const withRuby = runs.filter(
    (run): run is StudioRubyGlyphRun & { ruby: string } =>
      typeof run.ruby === "string" && run.ruby.length > 0,
  );
  if (withRuby.length === 0) return Object.freeze([]);

  const fontSize = options.fontSize;
  const letterSpacing =
    typeof options.letterSpacing === "number" && Number.isFinite(options.letterSpacing)
      ? options.letterSpacing
      : 0;
  const ratio =
    typeof options.rubySizeRatio === "number"
    && Number.isFinite(options.rubySizeRatio)
    && options.rubySizeRatio > 0
      ? options.rubySizeRatio
      : 0.45;
  const rubyFontSize = Math.max(6, fontSize * ratio);
  const rubyY =
    typeof options.rubyY === "number" && Number.isFinite(options.rubyY)
      ? options.rubyY
      : -rubyFontSize * 0.9;

  const advances = estimateAdvancesByUtf16Offset(source, fontSize, letterSpacing);
  const totalAdvance = advances[source.length] ?? 0;
  const boxWidth =
    typeof options.textWidth === "number"
    && Number.isFinite(options.textWidth)
    && options.textWidth > 0
      ? options.textWidth
      : totalAdvance;
  const align = options.align === "center" || options.align === "right" ? options.align : "left";
  let originX = 0;
  if (align === "center") originX = (boxWidth - totalAdvance) / 2;
  else if (align === "right") originX = boxWidth - totalAdvance;

  const placements: StudioRubyOverlayPlacement[] = withRuby.map((run) => {
    const prefix = advances[run.start] ?? 0;
    const endAdvance = advances[run.end] ?? prefix;
    const baseWidth = Math.max(0, endAdvance - prefix);
    return Object.freeze({
      base: run.base,
      ruby: run.ruby,
      start: run.start,
      end: run.end,
      x: originX + prefix,
      y: rubyY,
      baseWidth,
      rubyFontSize,
    });
  });

  return Object.freeze(placements);
}
