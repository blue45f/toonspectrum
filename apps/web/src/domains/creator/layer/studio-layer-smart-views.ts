import type { LayerGroup } from "../studio-layers";
import type {
  StudioLayerKind,
  StudioLayerNavigatorItem,
} from "./studio-layer-navigator";

export const STUDIO_LAYER_SMART_VIEWS = [
  "all",
  "editable",
  "attention",
  "output",
  "unclassified",
  "advanced",
] as const;

export const STUDIO_LAYER_QUALITY_ISSUES = [
  "default-name",
  "unknown-kind",
  "disabled-mask",
  "zero-opacity",
  "orphan-group",
] as const;

export type StudioLayerSmartView = (typeof STUDIO_LAYER_SMART_VIEWS)[number];
export type StudioLayerQualityIssue = (typeof STUDIO_LAYER_QUALITY_ISSUES)[number];

export const STUDIO_LAYER_SMART_VIEW_LABELS: Record<StudioLayerSmartView, string> = {
  all: "전체",
  editable: "바로 편집 가능",
  attention: "확인 필요",
  output: "출력 후보",
  unclassified: "분류 미완료",
  advanced: "합성·모션",
};

export const STUDIO_LAYER_SMART_VIEW_DESCRIPTIONS: Record<StudioLayerSmartView, string> = {
  all: "모든 레이어를 표시합니다.",
  editable: "실제로 보이고 잠기지 않은 레이어만 표시합니다.",
  attention: "기본 이름, 비활성 마스크, 0% 불투명도, 손상된 그룹 참조 등 검수가 필요한 레이어입니다.",
  output: "표시 중이고 불투명도가 0%보다 높으며 콘티·밑그림·참고 역할이 아닌 최종 출력 후보입니다.",
  unclassified: "작업 역할 또는 색 라벨이 아직 지정되지 않은 레이어입니다.",
  advanced: "마스크, 클리핑, 채우기 참조, 알파 락, AI, 애니메이션 또는 불투명도 조정이 있는 레이어입니다.",
};

export const STUDIO_LAYER_QUALITY_ISSUE_LABELS: Record<StudioLayerQualityIssue, string> = {
  "default-name": "기본 이름",
  "unknown-kind": "알 수 없는 레이어 종류",
  "disabled-mask": "비활성 마스크",
  "zero-opacity": "표시는 켜졌지만 불투명도 0%",
  "orphan-group": "존재하지 않는 그룹 참조",
};

export function normalizeStudioLayerSearchText(value: string): string {
  return value.normalize("NFKC").trim().toLocaleLowerCase("ko-KR").replace(/\s+/g, " ");
}

export function normalizeStudioLayerOpacity(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 1;
  return Math.max(0, Math.min(1, value));
}

const DEFAULT_LAYER_NAME_PATTERN = /^(?:layer|new layer|untitled|레이어|새 레이어|무제)(?:[\s_-]*\d+)?$/iu;

export function inspectStudioLayerQuality(
  item: StudioLayerNavigatorItem,
  context: {
    kind: Exclude<StudioLayerKind, "all">;
    group: LayerGroup | null;
    effectivelyHidden: boolean;
  }
): readonly StudioLayerQualityIssue[] {
  const issues: StudioLayerQualityIssue[] = [];
  const label = normalizeStudioLayerSearchText(item.label);
  if (!label || DEFAULT_LAYER_NAME_PATTERN.test(label)) issues.push("default-name");
  if (context.kind === "other") issues.push("unknown-kind");
  if (item.masked === true && item.maskEnabled === false) issues.push("disabled-mask");
  if (!context.effectivelyHidden && normalizeStudioLayerOpacity(item.opacity) <= 0.005) issues.push("zero-opacity");
  if (item.groupId !== undefined && context.group === null) issues.push("orphan-group");
  return issues;
}

export function matchesStudioLayerSmartView(
  view: StudioLayerSmartView,
  item: StudioLayerNavigatorItem,
  kind: Exclude<StudioLayerKind, "all">,
  group: LayerGroup | null,
  effectivelyHidden: boolean,
  effectivelyLocked: boolean
): boolean {
  if (view === "all") return true;
  if (view === "editable") return !effectivelyHidden && !effectivelyLocked;
  if (view === "attention") {
    return inspectStudioLayerQuality(item, { kind, group, effectivelyHidden }).length > 0;
  }
  if (view === "output") {
    return (
      !effectivelyHidden &&
      normalizeStudioLayerOpacity(item.opacity) > 0.005 &&
      item.role !== "storyboard" &&
      item.role !== "rough" &&
      item.role !== "reference"
    );
  }
  if (view === "unclassified") return item.role === undefined || item.color === undefined;
  return (
    item.masked === true ||
    item.clipBelow === true ||
    item.animated === true ||
    item.aiGenerated === true ||
    item.alphaLocked === true ||
    item.fillReference === true ||
    normalizeStudioLayerOpacity(item.opacity) < 0.999
  );
}
