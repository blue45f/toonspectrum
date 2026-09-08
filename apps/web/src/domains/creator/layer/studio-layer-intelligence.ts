import type { LayerGroup } from "../studio-layers";
import type {
  StudioLayerKind,
  StudioLayerNavigatorItem,
} from "./studio-layer-navigator";
import { matchesStudioLayerQueryTerm } from "./studio-layer-query-term-matcher";
import type { StudioLayerQueryPlan as QueryPlan } from "./studio-layer-query-types";

export { parseStudioLayerQuery } from "./studio-layer-query-parser";
export {
  STUDIO_LAYER_QUALITY_ISSUES,
  STUDIO_LAYER_QUALITY_ISSUE_LABELS,
  STUDIO_LAYER_SMART_VIEWS,
  STUDIO_LAYER_SMART_VIEW_DESCRIPTIONS,
  STUDIO_LAYER_SMART_VIEW_LABELS,
  inspectStudioLayerQuality,
  matchesStudioLayerSmartView,
  normalizeStudioLayerOpacity,
  normalizeStudioLayerSearchText,
} from "./studio-layer-smart-views";
export type {
  StudioLayerQualityIssue,
  StudioLayerSmartView,
} from "./studio-layer-smart-views";
export type {
  StudioLayerQueryDiagnostic,
  StudioLayerQueryPlan,
  StudioLayerQueryState,
  StudioLayerQueryTerm,
} from "./studio-layer-query-types";

/**
 * Public query matcher kept at the layer-intelligence boundary so callers do not
 * depend on the internal parser/index/matcher module layout.
 */
export function matchesStudioLayerQuery(
  plan: QueryPlan,
  item: StudioLayerNavigatorItem,
  kind: Exclude<StudioLayerKind, "all">,
  group: LayerGroup | null,
  effectivelyHidden: boolean,
  effectivelyLocked: boolean
): boolean {
  return plan.terms.every((term) =>
    matchesStudioLayerQueryTerm(
      term,
      item,
      kind,
      group,
      effectivelyHidden,
      effectivelyLocked
    )
  );
}
