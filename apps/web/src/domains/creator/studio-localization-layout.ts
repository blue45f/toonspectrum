export interface StudioLocalizationLayoutInput {
  readonly id: string;
  readonly locale: string;
  readonly text: string;
  readonly boxWidthPx: number;
  readonly boxHeightPx: number;
  readonly paddingPx: number;
  readonly fontSizePx: number;
  readonly minimumFontSizePx: number;
  readonly lineHeight: number;
  readonly verticalWriting: boolean;
  readonly unsupportedCharacters: readonly string[];
}

export interface StudioLocalizationLayoutResult {
  readonly id: string;
  readonly status: "fit" | "adjust" | "overflow" | "blocked";
  readonly recommendedFontSizePx: number;
  readonly estimatedLineCount: number;
  readonly estimatedColumns: number;
  readonly utilization: number;
  readonly issues: readonly string[];
}

function isCjk(character: string): boolean {
  const code = character.codePointAt(0) ?? 0;
  return (
    (code >= 0x3040 && code <= 0x30ff)
    || (code >= 0x3400 && code <= 0x9fff)
    || (code >= 0xac00 && code <= 0xd7af)
  );
}

function characterAdvance(character: string): number {
  if (/\s/u.test(character)) return 0.35;
  if (isCjk(character)) return 1;
  if (/[A-Z0-9]/u.test(character)) return 0.62;
  return 0.54;
}

function measure(
  input: StudioLocalizationLayoutInput,
  fontSizePx: number,
): { lineCount: number; columns: number; utilization: number; fits: boolean } {
  const availableWidth = input.boxWidthPx - input.paddingPx * 2;
  const availableHeight = input.boxHeightPx - input.paddingPx * 2;
  const advances = [...input.text].map(characterAdvance);
  if (input.verticalWriting) {
    const charactersPerColumn = Math.max(1, Math.floor(availableHeight / (fontSizePx * input.lineHeight)));
    const columns = Math.max(1, Math.ceil(advances.length / charactersPerColumn));
    const usedWidth = columns * fontSizePx * input.lineHeight;
    return {
      lineCount: charactersPerColumn,
      columns,
      utilization: usedWidth / Math.max(1, availableWidth),
      fits: usedWidth <= availableWidth,
    };
  }
  const lineCapacity = Math.max(0.1, availableWidth / fontSizePx);
  let lines = 1;
  let current = 0;
  for (const advance of advances) {
    if (current > 0 && current + advance > lineCapacity) {
      lines += 1;
      current = advance;
    } else {
      current += advance;
    }
  }
  const usedHeight = lines * fontSizePx * input.lineHeight;
  return {
    lineCount: lines,
    columns: 1,
    utilization: usedHeight / Math.max(1, availableHeight),
    fits: usedHeight <= availableHeight,
  };
}

export function evaluateStudioLocalizationLayout(
  input: StudioLocalizationLayoutInput,
): StudioLocalizationLayoutResult {
  if (
    !input.id.trim()
    || !input.locale.trim()
    || !input.text.trim()
    || !Number.isFinite(input.boxWidthPx)
    || !Number.isFinite(input.boxHeightPx)
    || !Number.isFinite(input.paddingPx)
    || !Number.isFinite(input.fontSizePx)
    || !Number.isFinite(input.minimumFontSizePx)
    || !Number.isFinite(input.lineHeight)
    || input.boxWidthPx <= 0
    || input.boxHeightPx <= 0
    || input.paddingPx < 0
    || input.fontSizePx <= 0
    || input.minimumFontSizePx <= 0
    || input.minimumFontSizePx > input.fontSizePx
    || input.lineHeight <= 0
    || input.boxWidthPx <= input.paddingPx * 2
    || input.boxHeightPx <= input.paddingPx * 2
  ) {
    throw new Error("Localization layout input is invalid.");
  }
  const unsupportedCharacters = [...new Set(input.unsupportedCharacters.filter(Boolean))];
  if (unsupportedCharacters.length > 0) {
    const measured = measure(input, input.fontSizePx);
    return Object.freeze({
      id: input.id,
      status: "blocked",
      recommendedFontSizePx: input.fontSizePx,
      estimatedLineCount: measured.lineCount,
      estimatedColumns: measured.columns,
      utilization: measured.utilization,
      issues: Object.freeze(["unsupported-glyphs"]),
    });
  }

  const original = measure(input, input.fontSizePx);
  if (original.fits) {
    return Object.freeze({
      id: input.id,
      status: "fit",
      recommendedFontSizePx: input.fontSizePx,
      estimatedLineCount: original.lineCount,
      estimatedColumns: original.columns,
      utilization: original.utilization,
      issues: Object.freeze([]),
    });
  }
  for (let size = Math.floor(input.fontSizePx - 1); size >= input.minimumFontSizePx; size -= 1) {
    const candidate = measure(input, size);
    if (candidate.fits) {
      return Object.freeze({
        id: input.id,
        status: "adjust",
        recommendedFontSizePx: size,
        estimatedLineCount: candidate.lineCount,
        estimatedColumns: candidate.columns,
        utilization: candidate.utilization,
        issues: Object.freeze(["font-size-reduced"]),
      });
    }
  }
  const smallest = measure(input, input.minimumFontSizePx);
  return Object.freeze({
    id: input.id,
    status: "overflow",
    recommendedFontSizePx: input.minimumFontSizePx,
    estimatedLineCount: smallest.lineCount,
    estimatedColumns: smallest.columns,
    utilization: smallest.utilization,
    issues: Object.freeze(["balloon-overflow", "resize-or-reletter"]),
  });
}
