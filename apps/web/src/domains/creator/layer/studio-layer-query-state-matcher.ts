import type { LayerGroup } from "../studio-layers";
import type { StudioLayerKind, StudioLayerNavigatorItem } from "./studio-layer-navigator";
import type { StudioLayerQueryState } from "./studio-layer-query-types";
import {
  inspectStudioLayerQuality,
  matchesStudioLayerSmartView,
  normalizeStudioLayerSearchText,
} from "./studio-layer-smart-views";

export function matchesStudioLayerQueryState(
  state: StudioLayerQueryState,
  item: StudioLayerNavigatorItem,
  kind: Exclude<StudioLayerKind, "all">,
  group: LayerGroup | null,
  effectivelyHidden: boolean,
  effectivelyLocked: boolean
): boolean {
  if (state === "visible") return !effectivelyHidden;
  if (state === "hidden") return effectivelyHidden;
  if (state === "locked") return effectivelyLocked;
  if (state === "unlocked") return !effectivelyLocked;
  if (state === "masked") return item.masked === true;
  if (state === "unmasked") return item.masked !== true;
  if (state === "mask-enabled") return item.masked === true && item.maskEnabled !== false;
  if (state === "mask-disabled") return item.masked === true && item.maskEnabled === false;
  if (state === "reference") return item.fillReference === true;
  if (state === "alpha-locked") return item.alphaLocked === true;
  if (state === "ai") return item.aiGenerated === true;
  if (state === "clipped") return item.clipBelow === true;
  if (state === "animated") return item.animated === true;
  if (state === "grouped") return group !== null;
  if (state === "ungrouped") return item.groupId === undefined;
  if (state === "role") return item.role !== undefined;
  if (state === "no-role") return item.role === undefined;
  if (state === "color") return item.color !== undefined;
  if (state === "no-color") return item.color === undefined;
  if (state === "text") return Boolean(normalizeStudioLayerSearchText(item.textContent ?? ""));
  if (state === "no-text") return !normalizeStudioLayerSearchText(item.textContent ?? "");
  if (state === "default-name") {
    return inspectStudioLayerQuality(item, { kind, group, effectivelyHidden }).includes("default-name");
  }
  if (state === "unknown-kind") return kind === "other";
  if (state === "zero-opacity") {
    return inspectStudioLayerQuality(item, { kind, group, effectivelyHidden }).includes("zero-opacity");
  }
  if (state === "orphan-group") return item.groupId !== undefined && group === null;
  return matchesStudioLayerSmartView(
    state,
    item,
    kind,
    group,
    effectivelyHidden,
    effectivelyLocked
  );
}
