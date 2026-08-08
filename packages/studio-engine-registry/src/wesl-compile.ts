import { link, minimalMangle } from "wesl";

import weslBrightnessContrast from "./wesl/brightness_contrast.wesl?raw";
import weslColorBalance from "./wesl/colorbalance.wesl?raw";
import weslCommon from "./wesl/common.wesl?raw";
import weslCurves from "./wesl/curves.wesl?raw";
import weslHsl from "./wesl/hsl.wesl?raw";
import weslLevels from "./wesl/levels.wesl?raw";
import weslMain from "./wesl/main.wesl?raw";
import { composeWgslVariant, WgslVariantComposeError } from "./wgsl-variants";

import type {
  ComposedWgslVariant,
  WgslFilterOpKind,
  WgslFilterOpSpec,
  WgslVariantStageLayout,
} from "./wgsl-variants";

/**
 * WESL variant 컴파일러 (V12 lane 5 `WESL_SHADER_PLATFORM` 격리 해제 PoC).
 *
 * ADR-0011 레인 5 재개 게이트 3종(생성 표면·Naga 매트릭스·파이프라인 실측)
 * 충족 이후의 실도입 도전자다: 기존 자체 생성기(wgsl-variants.ts, 기준 진실)
 * 의 WGSL 본문을 src/wesl/ 의 연산별 WESL 모듈로 이식하고, wesl-js 0.7.28
 * `link()` 로 조건 세트(@if, 연산 키와 1:1)를 켜서 단일 WGSL 을 산출한다.
 *
 * 역할 분담(시맨틱 변경 금지):
 *  - @if 조건(불리언): 스테이지 포함/제외의 하드 게이트. 꺼진 연산의 스테이지
 *    함수는 선언 자체가 제거되므로 참조 시 링크가 명시 실패한다.
 *  - studio_schedule 가상 모듈(wesl-js `virtualLibs`): 스테이지 "순서·반복"과
 *    스테이지별 uniform 필드/LUT base 배선. 불리언 조건 컴파일은 순서 있는
 *    반복 시퀀스(예: bc.bc, hsl→bc vs bc→hsl)를 표현할 수 없다는 것이 이
 *    PoC 의 실측 소견이고, wesl-js 가 그 용도로 제공하는 API 가 virtualLibs 다.
 *
 * 산출 WGSL 은 기존 생성기와 **레이아웃 등가**다: 바인딩 0~3, workgroup 64,
 * 디스패치 행 16384, uniform 헤더 16B + 스테이지 vec4×3 블록, LUT 768/스테이지
 * — 그래서 기존 패커(packWgslVariantUniform/packWgslVariantLut/
 * patchWgslVariantPixelCount)를 그대로 재사용한다. variantKey 도 기존 규칙
 * 재사용(composeWgslVariant 위임)이라 코퍼스 35종과 1:1 대응한다.
 */

// ---------------------------------------------------------------------------
// 조건 — @if 조건명은 연산 키와 1:1(WGSL 식별자 제약으로 하이픈만 _ 치환).
// ---------------------------------------------------------------------------

/** 연산 키 → @if 조건명 (src/wesl/*.wesl 의 @if 와 반드시 일치). */
export const WESL_VARIANT_CONDITION_BY_OP: Readonly<Record<WgslFilterOpKind, string>> = {
  "brightness-contrast": "brightness_contrast",
  hsl: "hsl",
  levels: "levels",
  curves: "curves",
  "color-balance": "color_balance",
};

/** 조건이 켜지면 산출 WGSL 에 남는 루트 마커 상수(main.wesl 과 일치). */
export const WESL_VARIANT_STAGE_MARKER_BY_OP: Readonly<Record<WgslFilterOpKind, string>> = {
  "brightness-contrast": "STUDIO_WESL_STAGE_BRIGHTNESS_CONTRAST",
  hsl: "STUDIO_WESL_STAGE_HSL",
  levels: "STUDIO_WESL_STAGE_LEVELS",
  curves: "STUDIO_WESL_STAGE_CURVES",
  "color-balance": "STUDIO_WESL_STAGE_COLOR_BALANCE",
};

/** 연산 키 → 스테이지 함수명(각 연산 모듈의 @if 게이트 선언과 일치). */
export const WESL_VARIANT_STAGE_FN_BY_OP: Readonly<Record<WgslFilterOpKind, string>> = {
  "brightness-contrast": "studio_brightness_contrast_stage",
  hsl: "studio_hsl_stage",
  levels: "studio_levels_stage",
  curves: "studio_curves_stage",
  "color-balance": "studio_color_balance_stage",
};

const ALL_OPS = Object.keys(WESL_VARIANT_CONDITION_BY_OP) as WgslFilterOpKind[];

/** ops 시퀀스에서 파생한 조건 세트 — 등장 연산만 true, 나머지는 false. */
export function weslConditionsForOps(
  ops: readonly WgslFilterOpSpec[],
): Record<string, boolean> {
  const active = new Set<WgslFilterOpKind>(ops.map((spec) => spec.op));
  const conditions: Record<string, boolean> = {};
  for (const op of ALL_OPS) {
    conditions[WESL_VARIANT_CONDITION_BY_OP[op]] = active.has(op);
  }
  return conditions;
}

// ---------------------------------------------------------------------------
// 에러 — 조용한 손실 금지: 링크 실패·구조 불일치는 전부 명시 예외다.
// ---------------------------------------------------------------------------

export class WeslVariantCompileError extends WgslVariantComposeError {
  constructor(message: string) {
    super(message);
    this.name = "WeslVariantCompileError";
  }
}

// ---------------------------------------------------------------------------
// studio_schedule 가상 모듈 — ops 시퀀스(순서·반복 포함)를 WESL 로 방출.
// 레이아웃은 composeWgslVariant 의 스테이지 계획을 그대로 재사용한다.
// ---------------------------------------------------------------------------

const MODULE_BY_OP: Readonly<Record<WgslFilterOpKind, string>> = {
  "brightness-contrast": "brightness_contrast",
  hsl: "hsl",
  levels: "levels",
  curves: "curves",
  "color-balance": "colorbalance",
};

function emitScheduleParamsStruct(stages: readonly WgslVariantStageLayout[]): string {
  const lines = [
    "struct Params {",
    "  pixel_count : u32,",
    "  _pad0 : u32,",
    "  _pad1 : u32,",
    "  _pad2 : u32,",
  ];
  stages.forEach((stage, index) => {
    if (stage.op === "hsl") {
      lines.push(
        `  s${index}_row_r : vec4<f32>,`,
        `  s${index}_row_g : vec4<f32>,`,
        `  s${index}_row_b : vec4<f32>,`,
      );
    } else if (stage.op === "color-balance") {
      lines.push(
        `  s${index}_shadows : vec4<f32>,`,
        `  s${index}_midtones : vec4<f32>,`,
        `  s${index}_highlights : vec4<f32>,`,
      );
    }
  });
  lines.push("}");
  return lines.join("\n");
}

/** 산출 WGSL 에서 각 스테이지 호출을 식별하는 시그니처 스니펫(가드·테스트 공용). */
export function weslStageCallSnippet(
  stage: WgslVariantStageLayout,
  stageIndex: number,
): string {
  const fn = WESL_VARIANT_STAGE_FN_BY_OP[stage.op];
  if (stage.lutBase !== null) {
    return `${fn}(rgb, ${stage.lutBase}u)`;
  }
  if (stage.op === "hsl") {
    return `${fn}(rgb, params.s${stageIndex}_row_r, params.s${stageIndex}_row_g, params.s${stageIndex}_row_b)`;
  }
  return `${fn}(rgb, params.s${stageIndex}_shadows, params.s${stageIndex}_midtones, params.s${stageIndex}_highlights)`;
}

function emitScheduleModule(stages: readonly WgslVariantStageLayout[]): string {
  const usedOps = [...new Set(stages.map((stage) => stage.op))];
  const imports = usedOps.map(
    (op) => `import package::${MODULE_BY_OP[op]}::${WESL_VARIANT_STAGE_FN_BY_OP[op]};`,
  );
  const calls = stages.map(
    (stage, index) => `  rgb = ${weslStageCallSnippet(stage, index)};`,
  );
  return [
    "// studio_schedule — wesl-compile.ts 가 ops 시퀀스에서 생성한 가상 모듈.",
    ...imports,
    "",
    emitScheduleParamsStruct(stages),
    "",
    "@group(0) @binding(2) var<uniform> params : Params;",
    "",
    "fn studio_apply_stages(rgb_in : vec3<u32>) -> vec3<u32> {",
    "  var rgb = rgb_in;",
    ...calls,
    "  return rgb;",
    "}",
    "",
  ].join("\n");
}

// ---------------------------------------------------------------------------
// 링크 + 구조 가드
// ---------------------------------------------------------------------------

const WESL_SRC: Readonly<Record<string, string>> = {
  "./main.wesl": weslMain,
  "./common.wesl": weslCommon,
  "./brightness_contrast.wesl": weslBrightnessContrast,
  "./hsl.wesl": weslHsl,
  "./levels.wesl": weslLevels,
  "./curves.wesl": weslCurves,
  "./colorbalance.wesl": weslColorBalance,
};

export interface CompiledWeslVariant {
  /** wesl-js link 산출 단일 WGSL(기존 생성기와 레이아웃 등가). */
  readonly wgsl: string;
  /** 기존 생성기와 동일 규칙(composeWgslVariant 위임) — 코퍼스 키와 1:1. */
  readonly variantKey: string;
  /** 링크에 실제 사용된 @if 조건 세트(연산 키 1:1, 5키 전부 명시). */
  readonly conditions: Readonly<Record<string, boolean>>;
  readonly entryPoint: "main";
  /** 파이프라인 캐시 키 — 도전자 경로임을 접두사로 구분한다. */
  readonly shaderId: string;
  /** 레이아웃 메타(기존 생성기 산출과 동일 값) — 기존 패커 재사용 근거. */
  readonly bindings: ComposedWgslVariant["bindings"];
  readonly usesLut: boolean;
  readonly lutEntryCount: number;
  readonly uniformByteLength: number;
  readonly stages: readonly WgslVariantStageLayout[];
  readonly structure: string;
}

export interface CompileWeslVariantOptions {
  /**
   * 테스트 전용: @if 조건 세트를 강제로 지정한다. 누락(활성 연산의 조건
   * false)은 wesl 링크가, 과잉(비활성 연산의 조건 true)은 마커 가드가 명시
   * 실패시킨다는 계약을 검증하는 용도다. 프로덕션 경로는 항상 ops 파생값을
   * 쓴다.
   */
  readonly conditionsOverride?: Readonly<Record<string, boolean>>;
}

function assertStructuralParity(
  wgsl: string,
  variant: ComposedWgslVariant,
  conditions: Readonly<Record<string, boolean>>,
): void {
  const activeOps = new Set(variant.stages.map((stage) => stage.op));
  for (const op of ALL_OPS) {
    const active = activeOps.has(op);
    const marker = WESL_VARIANT_STAGE_MARKER_BY_OP[op];
    const stageFn = WESL_VARIANT_STAGE_FN_BY_OP[op];
    const markerPresent = wgsl.includes(marker);
    const fnPresent = wgsl.includes(`fn ${stageFn}(`);
    if (active && !markerPresent) {
      throw new WeslVariantCompileError(
        `${variant.variantKey}: active op "${op}" lost its @if marker "${marker}" — condition "${WESL_VARIANT_CONDITION_BY_OP[op]}"=${String(conditions[WESL_VARIANT_CONDITION_BY_OP[op]])} did not survive the link`,
      );
    }
    if (!active && markerPresent) {
      throw new WeslVariantCompileError(
        `${variant.variantKey}: inactive op "${op}" leaked marker "${marker}" into the output — excess @if condition "${WESL_VARIANT_CONDITION_BY_OP[op]}" was enabled`,
      );
    }
    if (active && !fnPresent) {
      throw new WeslVariantCompileError(
        `${variant.variantKey}: active op "${op}" is missing its stage function "${stageFn}" in the linked WGSL`,
      );
    }
    if (!active && fnPresent) {
      throw new WeslVariantCompileError(
        `${variant.variantKey}: inactive op "${op}" leaked stage function "${stageFn}" into the linked WGSL`,
      );
    }
  }
  // 스테이지 호출이 ops 순서 그대로(반복 포함) 존재해야 한다.
  let cursor = 0;
  variant.stages.forEach((stage, index) => {
    const snippet = weslStageCallSnippet(stage, index);
    const at = wgsl.indexOf(snippet, cursor);
    if (at < 0) {
      throw new WeslVariantCompileError(
        `${variant.variantKey}: stage ${index} call "${snippet}" is missing or out of order in the linked WGSL`,
      );
    }
    cursor = at + snippet.length;
  });
  // LUT 바인딩은 LUT 스테이지가 있을 때만(기존 생성기와 동일 레이아웃).
  const lutBindingPresent = wgsl.includes("@binding(3)");
  if (variant.usesLut && !lutBindingPresent) {
    throw new WeslVariantCompileError(
      `${variant.variantKey}: LUT stages present but @binding(3) lut buffer is missing`,
    );
  }
  if (!variant.usesLut && lutBindingPresent) {
    throw new WeslVariantCompileError(
      `${variant.variantKey}: no LUT stages but @binding(3) lut buffer leaked into the output`,
    );
  }
}

/**
 * ops 시퀀스(기존 생성기와 동일 스펙)를 WESL 경로로 컴파일해 단일 WGSL 을
 * 산출한다. 같은 ops 는 항상 같은 산출(결정성 — link 는 순수 텍스트 변환이고
 * 스케줄 모듈은 스테이지 계획의 순수 함수다)을 낳는다.
 */
export async function compileWeslVariant(
  ops: readonly WgslFilterOpSpec[],
  options: CompileWeslVariantOptions = {},
): Promise<CompiledWeslVariant> {
  // 구조 검증·스테이지 계획·variantKey 는 기준 진실(기존 생성기)에 위임한다.
  const variant = composeWgslVariant(ops);
  const conditions = options.conditionsOverride ?? weslConditionsForOps(ops);
  const scheduleSource = emitScheduleModule(variant.stages);
  let wgsl: string;
  try {
    const linked = await link({
      weslSrc: { ...WESL_SRC },
      rootModuleName: "main",
      conditions: { ...conditions },
      virtualLibs: { studio_schedule: () => scheduleSource },
      mangler: minimalMangle,
    });
    wgsl = linked.dest;
  } catch (error) {
    throw new WeslVariantCompileError(
      `${variant.variantKey}: wesl link failed — ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  assertStructuralParity(wgsl, variant, conditions);
  return {
    wgsl,
    variantKey: variant.variantKey,
    conditions,
    entryPoint: "main",
    shaderId: `wesl-variant/${variant.variantKey}`,
    bindings: variant.bindings,
    usesLut: variant.usesLut,
    lutEntryCount: variant.lutEntryCount,
    uniformByteLength: variant.uniformByteLength,
    stages: variant.stages,
    structure: variant.structure,
  };
}
