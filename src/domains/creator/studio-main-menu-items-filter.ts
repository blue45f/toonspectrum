/**
 * §15.3 Filter group.
 *
 * Unchanged by the §15.3 regroup — it already was its own group — but split into
 * its own module so the 33 filter rows cannot crowd the rest of the catalogue.
 */

import {
  Aperture,
  Blend,
  Contrast,
  Copy,
  Droplet,
  Droplets,
  Eraser,
  Focus,
  GanttChartSquare,
  Grid2x2,
  Grid3x3,
  History as HistoryIcon,
  Layers,
  Maximize2,
  Paintbrush,
  Palette,
  RotateCw,
  ScanLine,
  SlidersHorizontal,
  Sparkles,
  Spline,
  Sun,
  Tv,
  Wind,
  Zap,
} from "lucide-react";

import type { StudioFilterKind } from "./studio-filter-menu";
import type { StudioMainMenuItemContext } from "./studio-main-menu-contract";
import type { StudioMainMenuItem } from "./studio-main-menu-model";

export function buildStudioFilterMenuItems({
  state,
  editor,
  ui,
}: StudioMainMenuItemContext): StudioMainMenuItem[] {
  const filterUnavailableReason = state.filterDisabled
    ? state.filterUnavailableReason ?? "현재 편집 상태에서는 필터를 적용할 수 없습니다."
    : undefined;

  return [
    {
      id: "last-filter",
      commandId: "filter.last",
      label: state.lastFilterDraft ? "마지막 필터 다시 열기" : "마지막 필터…",
      icon: HistoryIcon,
      disabled: !state.lastFilterDraft || state.filterDisabled,
      unavailableReason: state.filterDisabled
        ? filterUnavailableReason
        : !state.lastFilterDraft
          ? "아직 다시 열 수 있는 필터 설정이 없습니다."
          : undefined,
      separatorAfter: true,
      onSelect: () => {
        if (state.lastFilterDraft) {
          editor.openStudioFilter(state.lastFilterDraft.kind, state.lastFilterDraft);
        }
      },
    },
    {
      id: "gaussian-blur",
      commandId: "filter.gaussian-blur",
      label: "가우시안 블러",
      icon: Droplets,
      shortcut: "⌘⇧1",
      disabled: state.filterDisabled,
      unavailableReason: filterUnavailableReason,
      onSelect: () => {
        editor.openStudioFilter("gaussian-blur");
      },
    },
    {
      id: "motion-blur",
      commandId: "filter.motion-blur",
      label: "모션 블러",
      icon: Wind,
      shortcut: "⌘⇧2",
      disabled: state.filterDisabled,
      unavailableReason: filterUnavailableReason,
      onSelect: () => {
        editor.openStudioFilter("motion-blur");
      },
    },
    {
      id: "hue-saturation-brightness",
      commandId: "filter.hue-saturation-brightness",
      label: "색조 / 채도 / 밝기",
      icon: Palette,
      shortcut: "⌘⇧3",
      disabled: state.filterDisabled,
      unavailableReason: filterUnavailableReason,
      onSelect: () => {
        editor.openStudioFilter("hue-saturation-brightness");
      },
    },
    {
      id: "brightness-contrast",
      commandId: "filter.brightness-contrast",
      label: "명도 / 대비",
      icon: SlidersHorizontal,
      shortcut: "⌘⇧4",
      disabled: state.filterDisabled,
      unavailableReason: filterUnavailableReason,
      onSelect: () => {
        editor.openStudioFilter("brightness-contrast");
      },
    },
    {
      id: "color-curves",
      commandId: "filter.color-curves",
      label: "색상 커브",
      icon: GanttChartSquare,
      shortcut: "⌘⇧5",
      disabled: state.filterDisabled,
      unavailableReason: filterUnavailableReason,
      onSelect: () => {
        editor.openStudioFilter("color-curves");
      },
    },
    // §15.3 Filter ▸ Adjustment Layer. 위 항목들과 달리 픽셀을 굽지 않고 선택 레이어의
    // 보정 파라미터를 편집한다 — 인스펙터 보정 패널이 실제 편집면이고, 메뉴는 그 문이다.
    // (감사 §2.2: 레벨·커브 둘 다 메뉴·팔레트·검색 어디에도 없어 3동작을 넘겼다.)
    ...([
      { id: "levels", commandId: "filter.levels", label: "레이어 보정 · 레벨", icon: SlidersHorizontal },
      {
        id: "tone-curve",
        commandId: "filter.tone-curve",
        label: "레이어 보정 · 톤 커브",
        icon: Spline,
        separatorAfter: true,
      },
    ] as const).map(({ id, commandId, label, icon, ...rest }) => ({
      id,
      commandId,
      label,
      icon,
      ...("separatorAfter" in rest && rest.separatorAfter ? { separatorAfter: true } : {}),
      disabled: !state.imageLayerSelected,
      unavailableReason: state.imageLayerSelected
        ? undefined
        : "보정할 이미지 레이어를 먼저 선택하세요.",
      onSelect: () => {
        ui.openImageAdjustments();
      },
    })),
    // 자주 쓰는 필터 팩 — 라벨은 다이얼로그(STUDIO_FILTER_PACK_DEFS)와 동일 문구를 하드코딩한다.
    // (value import 시 필터 엔진 체인이 첫 청크에 딸려오므로 기존 5개 항목과 같은 방식.)
    ...([
      { id: "mosaic", label: "모자이크 / 픽셀화", icon: Grid3x3 },
      { id: "radial-blur", label: "방사형 블러", icon: RotateCw },
      { id: "zoom-blur", label: "줌 블러", icon: Maximize2 },
      { id: "chromatic-aberration", label: "색수차", icon: Copy },
      { id: "glitch", label: "글리치", icon: Zap },
      { id: "scanline", label: "스캔라인 (CRT)", icon: Tv },
      { id: "vignette", label: "비네트", icon: Focus, separatorAfter: true },
      { id: "lens-flare", label: "렌즈 플레어", icon: Sun },
      { id: "emboss", label: "엠보스", icon: Layers },
      { id: "solarize", label: "솔라라이즈", icon: Contrast },
      { id: "threshold", label: "한계값 (흑백 2값)", icon: SlidersHorizontal },
      { id: "oil-paint", label: "유화", icon: Paintbrush },
      { id: "surface-blur", label: "표면 블러", icon: Droplets },
      { id: "lens-blur", label: "렌즈 블러", icon: Aperture },
      { id: "field-iris-blur", label: "필드 아이리스 블러", icon: Focus },
      { id: "tilt-shift-blur", label: "틸트 시프트 블러", icon: ScanLine },
      { id: "selective-gaussian-blur", label: "선택적 가우시안 블러", icon: Blend },
      { id: "tileable-blur", label: "타일러블 블러", icon: Grid3x3 },
      { id: "line-cleanup", label: "스케치 선화 정리", icon: ScanLine },
      { id: "screentone-removal", label: "스크린톤 제거", icon: Grid2x2 },
      { id: "jpeg-artifact-reduction", label: "JPEG 아티팩트 감소", icon: Eraser },
      { id: "edge-aware-denoise", label: "엣지 보존 노이즈 감소", icon: Sparkles },
      { id: "dust-scratches", label: "먼지와 스크래치 제거", icon: Eraser },
      { id: "difference-of-gaussians", label: "가우시안 차분 선화", icon: ScanLine },
      { id: "color-to-alpha", label: "색상 투명화", icon: Blend },
      { id: "duotone", label: "세피아 / 듀오톤", icon: Palette, separatorAfter: true },
      { id: "noise-add", label: "노이즈 추가", icon: Droplet },
    ] as const).map(({ id, label, icon, ...rest }) => ({
      id,
      commandId: `filter.${id}`,
      label,
      icon,
      ...("separatorAfter" in rest && rest.separatorAfter ? { separatorAfter: true } : {}),
      disabled: state.filterDisabled,
      unavailableReason: filterUnavailableReason,
      onSelect: () => {
        editor.openStudioFilter(id as StudioFilterKind);
      },
    })),
  ];
}
