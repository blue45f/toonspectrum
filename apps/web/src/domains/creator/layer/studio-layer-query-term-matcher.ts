import type { LayerGroup } from "../studio-layers";
import type { StudioLayerKind, StudioLayerNavigatorItem } from "./studio-layer-navigator";
import { searchStudioLayerHaystack } from "./studio-layer-search-index";
import { matchesStudioLayerQueryState } from "./studio-layer-query-state-matcher";
import type { StudioLayerQueryTerm } from "./studio-layer-query-types";
import {
  matchesStudioLayerSmartView,
  normalizeStudioLayerOpacity,
  normalizeStudioLayerSearchText,
} from "./studio-layer-smart-views";

function compareOpacity(
  operator: "=" | "!=" | "<" | "<=" | ">" | ">=",
  actual: number,
  expected: number
): boolean {
  const tolerance = 0.005;
  if (operator === "=") return Math.abs(actual - expected) <= tolerance;
  if (operator === "!=") return Math.abs(actual - expected) > tolerance;
  if (operator === "<") return actual < expected;
  if (operator === "<=") return actual <= expected;
  if (operator === ">") return actual > expected;
  return actual >= expected;
}

export function matchesStudioLayerQueryTerm(
  term: StudioLayerQueryTerm,
  item: StudioLayerNavigatorItem,
  kind: Exclude<StudioLayerKind, "all">,
  group: LayerGroup | null,
  effectivelyHidden: boolean,
  effectivelyLocked: boolean
): boolean {
  if (term.kind === "invalid") return false;

  let matched: boolean;
  if (term.kind === "text") {
    matched = searchStudioLayerHaystack(item, kind, group).includes(term.value);
  } else if (term.kind === "name") {
    matched = normalizeStudioLayerSearchText(item.label).includes(term.value);
  } else if (term.kind === "content") {
    matched = normalizeStudioLayerSearchText(item.textContent ?? "").includes(term.value);
  } else if (term.kind === "id") {
    matched = normalizeStudioLayerSearchText(item.id).includes(term.value);
  } else if (term.kind === "group") {
    matched = term.value === null
      ? item.groupId === undefined
      : normalizeStudioLayerSearchText(`${group?.name ?? ""} ${group?.id ?? ""}`).includes(term.value);
  } else if (term.kind === "layer-kind") {
    matched = term.values.includes(kind);
  } else if (term.kind === "role") {
    matched = term.values.some((value) => value === "none" ? item.role === undefined : item.role === value);
  } else if (term.kind === "color") {
    matched = term.values.some((value) => value === "none" ? item.color === undefined : item.color === value);
  } else if (term.kind === "state") {
    matched = term.values.some((state) =>
      matchesStudioLayerQueryState(state, item, kind, group, effectivelyHidden, effectivelyLocked)
    );
  } else if (term.kind === "smart") {
    matched = term.values.some((view) =>
      matchesStudioLayerSmartView(view, item, kind, group, effectivelyHidden, effectivelyLocked)
    );
  } else {
    matched = compareOpacity(term.operator, normalizeStudioLayerOpacity(item.opacity), term.value);
  }

  return term.negated ? !matched : matched;
}
