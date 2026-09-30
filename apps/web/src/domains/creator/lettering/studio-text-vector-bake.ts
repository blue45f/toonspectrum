/**
 * studio-text-vector-bake.ts
 *
 * 식자(말풍선 대사·효과음) 텍스트를 벡터 패스로 베이크하는 어댑터.
 *
 * 왜 필요한가:
 * - 폰트 의존 렌더링은 폰트가 없는 환경(다른 기기·내보내기)에서 깨진다.
 * - 텍스트를 벡터 패스로 베이크하면 확대해도 깨지지 않고, 외곽선·그라데이션 등
 *   벡터 효과를 자유롭게 걸 수 있다 (웹툰 효과음 타이틀에 필수).
 *
 * 설계:
 * - opentype.js (MIT) 를 dynamic import 로 lazy-load. 메인 번들에 포함되지 않는다.
 * - opentype Path commands → SVG path data 로의 변환은 이 모듈이 직접 제어한다.
 *   (결정적 출력, 좌표 정밀도 고정, 한도 검증)
 * - 결과 pathData 는 Paper.js provider(`studio-engine-vector-geometry-provider`)나
 *   Konva <Path data=...> 에 그대로 넣을 수 있다.
 * - 폰트 로딩 실패 시 호출자가 폴백(일반 텍스트 렌더링)할 수 있도록 Result 타입 반환.
 *
 * 순수 로직 + 얇은 비동기 경계. DOM(Canvas)에 의존하지 않는다.
 */

export interface StudioTextBakeCommand {
  readonly type: "M" | "L" | "Q" | "C" | "Z";
  readonly x?: number;
  readonly y?: number;
  readonly x1?: number;
  readonly y1?: number;
  readonly x2?: number;
  readonly y2?: number;
}

export interface StudioTextBakeOptions {
  /** 폰트 크기(px). 기본 32. */
  readonly fontSize?: number;
  /** 자간(px). 기본 0. */
  readonly tracking?: number;
  /** 행간 배율. 기본 1.2. */
  readonly lineHeight?: number;
  /** 좌표 소수점 자릿수. 기본 2. */
  readonly precision?: number;
  /** 최대 문자 수. 기본 500. */
  readonly maxChars?: number;
  /** 출력 pathData 최대 길이. 기본 1_048_576. */
  readonly maxPathDataLength?: number;
}

export interface StudioTextBakeBounds {
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
  readonly width: number;
  readonly height: number;
}

export interface StudioTextBakeResult {
  readonly ok: boolean;
  /** SVG path data (y-down, SVG 좌표계). */
  readonly pathData: string;
  readonly bounds: StudioTextBakeBounds;
  /** 베이크된 문자 수. */
  readonly charCount: number;
  /** 실패 시 사유. */
  readonly error?: string;
}

export const STUDIO_TEXT_BAKE_DEFAULTS = Object.freeze({
  fontSize: 32,
  tracking: 0,
  lineHeight: 1.2,
  precision: 2,
  maxChars: 500,
  maxPathDataLength: 1_048_576,
} as const);

/** opentype.js Font 의 최소 인터페이스 (테스트 더블 주입용). */
export interface StudioVectorFontLike {
  getPath(
    text: string,
    x: number,
    y: number,
    fontSize: number,
    options?: { kerning?: boolean },
  ): {
    commands: readonly StudioTextBakeCommand[];
    getBoundingBox(): { x1: number; y1: number; x2: number; y2: number };
  };
  getAdvanceWidth(text: string, fontSize: number): number;
}

type OpentypeModule = typeof import("opentype.js");

let cachedOpentype: OpentypeModule | null = null;
let loadPromise: Promise<OpentypeModule> | null = null;

/**
 * opentype.js 를 lazy-load 한다. import 실패 시 null 을 반환하고,
 * 호출자는 일반 텍스트 렌더링으로 폴백해야 한다.
 */
export async function loadOpentypeRuntime(): Promise<OpentypeModule | null> {
  if (cachedOpentype) return cachedOpentype;
  if (loadPromise) return loadPromise;
  // opentype.js는 선택적 의존성: 설치되지 않은 환경에서도 앱이 동작해야 하므로
  // dynamic import 실패 시 null을 반환하고 호출자가 폴백한다.
  // eslint-disable-next-line import-x/no-unresolved -- optional peer, resolved at runtime
  loadPromise = import("opentype.js")
    .then((mod) => {
      cachedOpentype = mod;
      return mod;
    })
    .catch(() => {
      loadPromise = null;
      return null as unknown as OpentypeModule;
    });
  const mod = await loadPromise;
  return mod ?? null;
}

/** 테스트용: 캐시된 런타임을 주입한다. */
export function injectOpentypeRuntimeForTest(mod: OpentypeModule | null): void {
  cachedOpentype = mod;
  loadPromise = mod ? Promise.resolve(mod) : null;
}

function round(n: number, precision: number): number {
  const factor = 10 ** precision;
  return Math.round(n * factor) / factor;
}

/**
 * opentype Path commands → SVG path data.
 * opentype 내부 좌표계는 y-up 이므로 SVG(y-down)로 뒤집는다.
 * 뒤집기 기준선은 bounds.y1 (베이스라인이 아닌 바운딩 박스 기준) — 호출자가
 * bakeTextToVectorPath 를 통하면 자동으로 처리된다.
 */
export function commandsToSvgPathData(
  commands: readonly StudioTextBakeCommand[],
  options?: { readonly precision?: number; readonly flipY?: boolean; readonly flipBaseY?: number },
): string {
  const precision = options?.precision ?? STUDIO_TEXT_BAKE_DEFAULTS.precision;
  const flipY = options?.flipY ?? true;
  const flipBaseY = options?.flipBaseY ?? 0;
  const fy = (y: number): number => (flipY ? flipBaseY - y : y);
  const n = (v: number): string => String(round(v, precision));

  const parts: string[] = [];
  for (const cmd of commands) {
    switch (cmd.type) {
      case "M":
        parts.push(`M${n(cmd.x ?? 0)} ${n(fy(cmd.y ?? 0))}`);
        break;
      case "L":
        parts.push(`L${n(cmd.x ?? 0)} ${n(fy(cmd.y ?? 0))}`);
        break;
      case "Q":
        parts.push(
          `Q${n(cmd.x1 ?? 0)} ${n(fy(cmd.y1 ?? 0))} ${n(cmd.x ?? 0)} ${n(fy(cmd.y ?? 0))}`,
        );
        break;
      case "C":
        parts.push(
          `C${n(cmd.x1 ?? 0)} ${n(fy(cmd.y1 ?? 0))} ${n(cmd.x2 ?? 0)} ${n(fy(cmd.y2 ?? 0))} ${n(cmd.x ?? 0)} ${n(fy(cmd.y ?? 0))}`,
        );
        break;
      case "Z":
        parts.push("Z");
        break;
    }
  }
  return parts.join("");
}

/** 빈 베이크 결과 (성공/실패 공용). */
function emptyBakeResult(error?: string): StudioTextBakeResult {
  return {
    ok: error === undefined,
    pathData: "",
    bounds: { x1: 0, y1: 0, x2: 0, y2: 0, width: 0, height: 0 },
    charCount: 0,
    ...(error === undefined ? {} : { error }),
  };
}

interface ResolvedBakeOptions {
  readonly fontSize: number;
  readonly tracking: number;
  readonly lineHeight: number;
  readonly precision: number;
  readonly maxChars: number;
  readonly maxPathDataLength: number;
}

function resolveBakeOptions(options: StudioTextBakeOptions): ResolvedBakeOptions {
  return {
    fontSize: options.fontSize ?? STUDIO_TEXT_BAKE_DEFAULTS.fontSize,
    tracking: options.tracking ?? STUDIO_TEXT_BAKE_DEFAULTS.tracking,
    lineHeight: options.lineHeight ?? STUDIO_TEXT_BAKE_DEFAULTS.lineHeight,
    precision: options.precision ?? STUDIO_TEXT_BAKE_DEFAULTS.precision,
    maxChars: options.maxChars ?? STUDIO_TEXT_BAKE_DEFAULTS.maxChars,
    maxPathDataLength:
      options.maxPathDataLength ?? STUDIO_TEXT_BAKE_DEFAULTS.maxPathDataLength,
  };
}

/** 입력 검증. 문제없으면 null. */
function validateBakeInput(
  text: string,
  opts: ResolvedBakeOptions,
): string | null {
  if (text.length > opts.maxChars) {
    return `텍스트가 최대 문자 수(${opts.maxChars})를 초과했습니다`;
  }
  if (!Number.isFinite(opts.fontSize) || opts.fontSize <= 0) {
    return "폰트 크기가 유효하지 않습니다";
  }
  return null;
}

interface BakedLine {
  readonly pathParts: string[];
  readonly charCount: number;
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

/** 한 줄을 베이크한다. 좌표계는 y-down(SVG)으로 변환된 상태. */
function bakeSingleLine(
  font: StudioVectorFontLike,
  line: string,
  baselineY: number,
  opts: ResolvedBakeOptions,
): BakedLine {
  const pathParts: string[] = [];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let charCount = 0;
  let cursorX = 0;

  for (const ch of line) {
    charCount += 1;
    const glyphPath = font.getPath(ch, cursorX, baselineY, opts.fontSize, {
      kerning: true,
    });
    // y-up → y-down 뒤집기: flipBaseY = 0 (베이스라인 기준)
    pathParts.push(
      commandsToSvgPathData(glyphPath.commands, {
        precision: opts.precision,
        flipY: true,
        flipBaseY: 0,
      }),
    );
    const bb = glyphPath.getBoundingBox();
    minX = Math.min(minX, bb.x1);
    minY = Math.min(minY, -bb.y2);
    maxX = Math.max(maxX, bb.x2);
    maxY = Math.max(maxY, -bb.y1);
    cursorX += font.getAdvanceWidth(ch, opts.fontSize) + opts.tracking;
  }

  return { pathParts, charCount, minX, minY, maxX, maxY };
}

/**
 * 텍스트 한 줄을 벡터 패스로 베이크한다.
 * 여러 줄(\n)은 lineHeight 간격으로 아래로 쌓는다.
 */
export function bakeTextLineToVectorPath(
  font: StudioVectorFontLike,
  text: string,
  options: StudioTextBakeOptions = {},
): StudioTextBakeResult {
  const opts = resolveBakeOptions(options);

  if (!text) return emptyBakeResult();

  const inputError = validateBakeInput(text, opts);
  if (inputError) return emptyBakeResult(inputError);

  const lines = text.split("\n");
  const lineAdvance = opts.fontSize * opts.lineHeight;
  const allParts: string[] = [];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let charCount = 0;

  for (let li = 0; li < lines.length; li += 1) {
    // opentype y-up 기준: 첫 줄 베이스라인 y=0, 다음 줄은 -lineAdvance
    const baked = bakeSingleLine(font, lines[li], -li * lineAdvance, opts);
    allParts.push(...baked.pathParts);
    charCount += baked.charCount;
    minX = Math.min(minX, baked.minX);
    minY = Math.min(minY, baked.minY);
    maxX = Math.max(maxX, baked.maxX);
    maxY = Math.max(maxY, baked.maxY);
  }

  const pathData = allParts.join("");
  if (pathData.length > opts.maxPathDataLength) {
    return emptyBakeResult(
      `베이크 결과가 최대 길이(${opts.maxPathDataLength})를 초과했습니다`,
    );
  }

  if (charCount === 0 || !Number.isFinite(minX)) {
    return emptyBakeResult();
  }

  return {
    ok: true,
    pathData,
    bounds: {
      x1: round(minX, opts.precision),
      y1: round(minY, opts.precision),
      x2: round(maxX, opts.precision),
      y2: round(maxY, opts.precision),
      width: round(maxX - minX, opts.precision),
      height: round(maxY - minY, opts.precision),
    },
    charCount,
  };
}

/** 폰트 바이너리(ArrayBuffer) → StudioVectorFontLike. */
export async function parseVectorFont(
  fontData: ArrayBuffer,
): Promise<StudioVectorFontLike | null> {
  const runtime = await loadOpentypeRuntime();
  if (!runtime) return null;
  try {
    const font = runtime.parse(fontData);
    return font as unknown as StudioVectorFontLike;
  } catch {
    return null;
  }
}

/** 폰트 URL → StudioVectorFontLike. */
export async function loadVectorFontFromUrl(
  url: string,
): Promise<StudioVectorFontLike | null> {
  const runtime = await loadOpentypeRuntime();
  if (!runtime) return null;
  try {
    const font = await runtime.load(url);
    return font as unknown as StudioVectorFontLike;
  } catch {
    return null;
  }
}
