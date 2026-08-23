/**
 * 브러시 엔진 믹서 — 서로 다른 브러시 엔진(캐리어)의 특성을 한 스냅샷으로 조합한다.
 *
 * CSP의 브러시 엔진이 캔버스·촉·질감·동적 반응을 자유롭게 조합하듯, 이 모듈은 이미 제품에
 * 존재하는 검증된 조각들만 조합한다:
 * - 캐리어(렌더 패밀리)는 베이스 브러시 id가 결정하고, 프로그램 핀과 deposit 파이프라인은
 *   베이스의 정규 설정을 그대로 유지한다(캐리어 선택 로직이 깨지지 않도록).
 * - 믹서가 바꾸는 것은 섹션 단위의 특성(펜촉·듀얼 팁·질감·동적 반응)뿐이고, 결과는 항상
 *   `normalizeStudioBrushDynamicsSettings`를 통과하므로 저장·재생·내보내기와 동일한
 *   검증 경로를 공유한다.
 *
 * 순수 로직만 있다 — DOM, React, 저장소 없음. UI는 `StudioBrushEngineMixer.tsx`.
 */

import { resolveStudioBrushRenderFamily, type StudioBrushRenderFamily } from "../studio-brush";

import {
  normalizeStudioBrushDynamicsSettings,
  type NormalizedStudioBrushDynamicsSettings,
} from "./studio-brush-dynamics";
import {
  STUDIO_BRUSH_OIL_PROGRAM_KEYS,
  studioOilProgramSetForBrush,
  type StudioBrushEngineProgramSet,
} from "./studio-brush-engine-program-set";

/** 믹서가 다른 브러시에서 가져와 조합할 수 있는 특성 섹션. */
export type StudioBrushMixTraitSectionId = "tip" | "dual-tip" | "grain" | "response";

export interface StudioBrushMixTraitSection {
  readonly id: StudioBrushMixTraitSectionId;
  readonly label: string;
  readonly description: string;
}

export const STUDIO_BRUSH_MIX_TRAIT_SECTIONS: readonly StudioBrushMixTraitSection[] =
  Object.freeze([
    {
      id: "tip",
      label: "펜촉",
      description: "촉 형상·굳기·각도·원형도를 가져옵니다.",
    },
    {
      id: "dual-tip",
      label: "듀얼 팁 · 팁 레이어",
      description: "보조 팁과 겹쳐 찍는 레이어 구성을 가져옵니다.",
    },
    {
      id: "grain",
      label: "질감 · 색상 변화",
      description: "그레인 텍스처와 색상 흔들림 규칙을 가져옵니다.",
    },
    {
      id: "response",
      label: "동적 반응",
      description: "필압·속도 매핑과 테이퍼 반응 곡선을 가져옵니다.",
    },
  ]);

export function isStudioBrushMixTraitSectionId(value: unknown): value is StudioBrushMixTraitSectionId {
  return STUDIO_BRUSH_MIX_TRAIT_SECTIONS.some((section) => section.id === value);
}

/**
 * 한 섹션의 특성을 소스 브러시 설정에서 현재 설정으로 덮어쓴다.
 *
 * 캐리어 결정에 관여하는 값(`depositPipeline`, 프로그램 핀, `presetId`, `seed`)은 의도적으로
 * 복사하지 않는다 — 펜 캐리어 위에 드라이 미디어의 커널 핀을 얹으면 렌더러가 실패 닫힘으로
 * 다른 엔진으로 떨어져 예상과 다르게 그려진다. 섹션 특성만 바꿔도 조합은 충분히 새롭고,
 * 결과는 항상 현재 캐리어 위에서 검증된 경로로 재생된다.
 */
export function mergeStudioBrushMixTraitSection(
  sectionId: StudioBrushMixTraitSectionId,
  current: NormalizedStudioBrushDynamicsSettings,
  source: NormalizedStudioBrushDynamicsSettings,
): NormalizedStudioBrushDynamicsSettings {
  let patch: Partial<NormalizedStudioBrushDynamicsSettings>;
  switch (sectionId) {
    case "tip":
      patch = { tip: source.tip };
      break;
    case "dual-tip":
      patch = { tipLayers: source.tipLayers, dualBrush: source.dualBrush };
      break;
    case "grain":
      patch = { grain: source.grain, colorDynamics: source.colorDynamics };
      break;
    case "response":
      patch = {
        width: source.width,
        opacity: source.opacity,
        flow: source.flow,
        spacing: source.spacing,
        scatter: source.scatter,
        angle: source.angle,
        roundness: source.roundness,
        taper: source.taper,
      };
      break;
  }
  return normalizeStudioBrushDynamicsSettings({ ...current, ...patch });
}

const STUDIO_BRUSH_ENGINE_FAMILY_LABELS: Readonly<Record<StudioBrushRenderFamily, string>> =
  Object.freeze({
    pen: "펜 · 잉크",
    gpen: "G펜 · 만화 펜",
    calligraphy: "캘리그래피",
    perfect: "퍼펙트 아웃라인",
    marker: "마커",
    highlighter: "형광펜",
    neon: "네온",
    glow: "글로우",
    glitter: "글리터",
    brush: "붓 · 브러시",
    watercolor: "수채",
    oil: "유화 · 아크릴",
    pastel: "파스텔",
    "ink-particle": "잉크 입자",
    airbrush: "에어브러시",
    "dry-media": "드라이 미디어",
    pencil: "연필",
    screentone: "스크린톤",
    stamp: "도장 스탬프",
    pixel: "픽셀",
  });

export function studioBrushEngineFamilyLabel(brushId: string): string {
  return STUDIO_BRUSH_ENGINE_FAMILY_LABELS[resolveStudioBrushRenderFamily(brushId)] ?? "펜 · 잉크";
}

export interface StudioBrushEngineStackEntry {
  readonly id: string;
  readonly label: string;
  /** 이 패스가 현재 설정에서 실제로 켜져 있는지. 꺼진 항목은 참고용으로만 노출한다. */
  readonly active: boolean;
}

/**
 * 현재 스냅샷이 그리기 위해 실행할 엔진 패스 목록. 토글·핀의 실제 소비 규칙(패밀리 게이트,
 * 프리스틴 조건)은 각 렌더러가 소유하고, 여기서는 설정에 "적혀 있는" 상태를 충실히 읽어
 * 아티스트에게 보여준다 — UI가 렌더러의 내부 규칙을 재구현해 거짓말하지 않도록.
 */
export function describeStudioBrushEngineStack(
  brushId: string,
  settings: NormalizedStudioBrushDynamicsSettings,
  enginePrograms?: StudioBrushEngineProgramSet | null,
): readonly StudioBrushEngineStackEntry[] {
  const entries: StudioBrushEngineStackEntry[] = [
    {
      id: "carrier",
      label: studioBrushEngineFamilyLabel(brushId),
      active: true,
    },
  ];
  if (settings.depositPipeline) {
    entries.push({
      id: "deposit-pipeline",
      label: settings.depositPipeline === "causal-deposit-v3-segmented"
        ? "인과 도포 v3 (세그먼트)"
        : "인과 도포 v2",
      active: true,
    });
  }
  if (settings.dryMediaKernelProgram) {
    entries.push({ id: "dry-media-kernel", label: "드라이 미디어 전용 커널", active: true });
  }
  if (settings.softFalloffLinearProgram) {
    entries.push({ id: "soft-falloff", label: "소프트 폴오프 선형 누적", active: true });
  }
  if (settings.causalStampGridRule) {
    entries.push({ id: "stamp-grid", label: "인과 스탬프 그리드 v2", active: true });
  }
  if (resolveStudioBrushRenderFamily(brushId) === "oil") {
    const baseline = studioOilProgramSetForBrush(brushId);
    const oil = enginePrograms?.oil ?? baseline;
    const oilLabels: Record<(typeof STUDIO_BRUSH_OIL_PROGRAM_KEYS)[number], string> = {
      bristlePhysics: "붓털 물리",
      bristleLoadDynamics: "물감 소모 (갈필)",
      impastoRelief: "임파스토 릴리프",
    };
    for (const key of STUDIO_BRUSH_OIL_PROGRAM_KEYS) {
      entries.push({ id: `oil-${key}`, label: oilLabels[key], active: oil[key] });
    }
  }
  return entries;
}

/**
 * 저장 제안 이름 — 소스 프리셋 이름 뒤에 조합 접미사를 붙여 라이브러리에서 식별 가능하게.
 * 라이브러리 저장 경로가 이름을 정규화하므로 여기서는 힌트만 만든다.
 */
export function suggestStudioBrushMixName(baseBrushName: string): string {
  const base = baseBrushName.trim() || "커스텀 브러시";
  return `${base} 조합`;
}
