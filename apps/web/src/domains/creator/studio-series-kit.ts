export const STUDIO_SERIES_COMPONENT_KINDS = [
  "logo",
  "symbol",
  "layout",
  "effect",
  "cover",
] as const;

export type StudioSeriesComponentKind =
  (typeof STUDIO_SERIES_COMPONENT_KINDS)[number];

export interface StudioSeriesColorToken {
  readonly id: string;
  readonly label: string;
  readonly value: string;
}

export interface StudioSeriesTextStyle {
  readonly id: string;
  readonly label: string;
  readonly fontId: string;
  readonly sizePx: number;
  readonly lineHeight: number;
  readonly weight: number;
  readonly colorTokenId: string;
  readonly verticalWriting: boolean;
}

export interface StudioSeriesBalloonStyle {
  readonly id: string;
  readonly label: string;
  readonly textStyleId: string;
  readonly fillColorTokenId: string;
  readonly strokeColorTokenId: string;
  readonly strokeWidthPx: number;
  readonly paddingPx: number;
  readonly cornerRadiusPx: number;
}

export interface StudioSeriesComponent {
  readonly id: string;
  readonly label: string;
  readonly kind: StudioSeriesComponentKind;
  readonly assetId: string;
}

export interface StudioSeriesExportDefault {
  readonly targetId: string;
  readonly widthPx: number | null;
  readonly format: string;
  readonly colorSpace: string;
}

export interface StudioSeriesKit {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly projectId: string;
  readonly version: number;
  readonly name: string;
  readonly colors: readonly StudioSeriesColorToken[];
  readonly textStyles: readonly StudioSeriesTextStyle[];
  readonly balloonStyles: readonly StudioSeriesBalloonStyle[];
  readonly components: readonly StudioSeriesComponent[];
  readonly exportDefaults: readonly StudioSeriesExportDefault[];
}

export interface StudioSeriesKitIssue {
  readonly code: string;
  readonly severity: "warning" | "error";
  readonly affectedIds: readonly string[];
  readonly message: string;
}

export interface StudioResolvedTextStyle {
  readonly id: string;
  readonly fontId: string;
  readonly sizePx: number;
  readonly lineHeight: number;
  readonly weight: number;
  readonly color: string;
  readonly verticalWriting: boolean;
}

export interface StudioResolvedBalloonStyle {
  readonly id: string;
  readonly text: StudioResolvedTextStyle;
  readonly fillColor: string;
  readonly strokeColor: string;
  readonly strokeWidthPx: number;
  readonly paddingPx: number;
  readonly cornerRadiusPx: number;
}

export interface StudioSeriesKitDiff {
  readonly fromVersion: number;
  readonly toVersion: number;
  readonly changedColorIds: readonly string[];
  readonly changedTextStyleIds: readonly string[];
  readonly changedBalloonStyleIds: readonly string[];
  readonly changedComponentIds: readonly string[];
  readonly changedExportTargetIds: readonly string[];
}

const COLOR_PATTERN = /^#[0-9a-f]{6}([0-9a-f]{2})?$/iu;

function duplicateValues(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    else seen.add(value);
  }
  return [...duplicates].sort();
}

function issue(
  code: string,
  severity: StudioSeriesKitIssue["severity"],
  affectedIds: readonly string[],
  message: string,
): StudioSeriesKitIssue {
  return Object.freeze({
    code,
    severity,
    affectedIds: Object.freeze([...affectedIds]),
    message,
  });
}

function validPositive(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

export function validateStudioSeriesKit(
  kit: StudioSeriesKit,
): readonly StudioSeriesKitIssue[] {
  const issues: StudioSeriesKitIssue[] = [];
  if (!kit.id.trim() || !kit.projectId.trim() || !kit.name.trim()) {
    issues.push(issue("kit-required", "error", [kit.id], "Series Kit identity is incomplete."));
  }
  if (!Number.isSafeInteger(kit.version) || kit.version < 1) {
    issues.push(issue("kit-version", "error", [kit.id], "Series Kit version must be positive."));
  }

  for (const [code, values] of [
    ["color-id-duplicate", kit.colors.map((item) => item.id)],
    ["text-style-id-duplicate", kit.textStyles.map((item) => item.id)],
    ["balloon-style-id-duplicate", kit.balloonStyles.map((item) => item.id)],
    ["component-id-duplicate", kit.components.map((item) => item.id)],
    ["export-target-duplicate", kit.exportDefaults.map((item) => item.targetId)],
  ] as const) {
    const duplicates = duplicateValues(values);
    if (duplicates.length > 0) {
      issues.push(issue(code, "error", duplicates, "Series Kit identifiers must be unique."));
    }
  }

  const colorIds = new Set(kit.colors.map((item) => item.id));
  const textStyleIds = new Set(kit.textStyles.map((item) => item.id));
  for (const color of kit.colors) {
    if (!color.id.trim() || !color.label.trim() || !COLOR_PATTERN.test(color.value)) {
      issues.push(issue("color-invalid", "error", [color.id], "A color token is invalid."));
    }
  }
  for (const style of kit.textStyles) {
    if (
      !style.id.trim()
      || !style.label.trim()
      || !style.fontId.trim()
      || !validPositive(style.sizePx)
      || !validPositive(style.lineHeight)
      || !Number.isSafeInteger(style.weight)
      || style.weight < 100
      || style.weight > 1000
    ) {
      issues.push(issue("text-style-invalid", "error", [style.id], "A text style is invalid."));
    }
    if (!colorIds.has(style.colorTokenId)) {
      issues.push(issue(
        "text-color-missing",
        "error",
        [style.id, style.colorTokenId],
        "A text style references a missing color token.",
      ));
    }
    if (style.sizePx < 12) {
      issues.push(issue(
        "text-size-small",
        "warning",
        [style.id],
        "The text style may be difficult to read in final output.",
      ));
    }
  }
  for (const style of kit.balloonStyles) {
    if (
      !style.id.trim()
      || !style.label.trim()
      || !validPositive(style.paddingPx)
      || !Number.isFinite(style.strokeWidthPx)
      || style.strokeWidthPx < 0
      || !Number.isFinite(style.cornerRadiusPx)
      || style.cornerRadiusPx < 0
    ) {
      issues.push(issue("balloon-style-invalid", "error", [style.id], "A balloon style is invalid."));
    }
    if (!textStyleIds.has(style.textStyleId)) {
      issues.push(issue(
        "balloon-text-style-missing",
        "error",
        [style.id, style.textStyleId],
        "A balloon style references a missing text style.",
      ));
    }
    const missingColors = [style.fillColorTokenId, style.strokeColorTokenId]
      .filter((id) => !colorIds.has(id));
    if (missingColors.length > 0) {
      issues.push(issue(
        "balloon-color-missing",
        "error",
        [style.id, ...missingColors],
        "A balloon style references a missing color token.",
      ));
    }
  }
  for (const component of kit.components) {
    if (!component.id.trim() || !component.label.trim() || !component.assetId.trim()) {
      issues.push(issue("component-invalid", "error", [component.id], "A Series Kit component is invalid."));
    }
  }
  for (const target of kit.exportDefaults) {
    if (
      !target.targetId.trim()
      || !target.format.trim()
      || !target.colorSpace.trim()
      || (target.widthPx !== null && !validPositive(target.widthPx))
    ) {
      issues.push(issue("export-default-invalid", "error", [target.targetId], "An export default is invalid."));
    }
  }
  return Object.freeze(issues);
}

function validKit(kit: StudioSeriesKit): void {
  if (validateStudioSeriesKit(kit).some((item) => item.severity === "error")) {
    throw new Error("A valid Series Kit is required.");
  }
}

export function resolveStudioSeriesTextStyle(
  kit: StudioSeriesKit,
  styleId: string,
): StudioResolvedTextStyle {
  validKit(kit);
  const style = kit.textStyles.find((item) => item.id === styleId);
  if (!style) throw new Error(`Unknown Series Kit text style: ${styleId}`);
  const color = kit.colors.find((item) => item.id === style.colorTokenId);
  if (!color) throw new Error(`Unknown Series Kit color token: ${style.colorTokenId}`);
  return Object.freeze({
    id: style.id,
    fontId: style.fontId,
    sizePx: style.sizePx,
    lineHeight: style.lineHeight,
    weight: style.weight,
    color: color.value,
    verticalWriting: style.verticalWriting,
  });
}

export function resolveStudioSeriesBalloonStyle(
  kit: StudioSeriesKit,
  styleId: string,
): StudioResolvedBalloonStyle {
  validKit(kit);
  const style = kit.balloonStyles.find((item) => item.id === styleId);
  if (!style) throw new Error(`Unknown Series Kit balloon style: ${styleId}`);
  const fill = kit.colors.find((item) => item.id === style.fillColorTokenId);
  const stroke = kit.colors.find((item) => item.id === style.strokeColorTokenId);
  if (!fill || !stroke) throw new Error("Balloon colors are missing.");
  return Object.freeze({
    id: style.id,
    text: resolveStudioSeriesTextStyle(kit, style.textStyleId),
    fillColor: fill.value,
    strokeColor: stroke.value,
    strokeWidthPx: style.strokeWidthPx,
    paddingPx: style.paddingPx,
    cornerRadiusPx: style.cornerRadiusPx,
  });
}

function stableValue(value: unknown): string {
  return JSON.stringify(value);
}

function changedIds<T extends { readonly id: string }>(
  previous: readonly T[],
  next: readonly T[],
): string[] {
  const previousById = new Map(previous.map((item) => [item.id, stableValue(item)]));
  const nextById = new Map(next.map((item) => [item.id, stableValue(item)]));
  return [...new Set([...previousById.keys(), ...nextById.keys()])]
    .filter((id) => previousById.get(id) !== nextById.get(id))
    .sort();
}

export function diffStudioSeriesKits(
  previous: StudioSeriesKit,
  next: StudioSeriesKit,
): StudioSeriesKitDiff {
  validKit(previous);
  validKit(next);
  if (previous.id !== next.id || previous.projectId !== next.projectId) {
    throw new Error("Series Kit versions must belong to the same project and kit.");
  }
  return Object.freeze({
    fromVersion: previous.version,
    toVersion: next.version,
    changedColorIds: Object.freeze(changedIds(previous.colors, next.colors)),
    changedTextStyleIds: Object.freeze(changedIds(previous.textStyles, next.textStyles)),
    changedBalloonStyleIds: Object.freeze(changedIds(previous.balloonStyles, next.balloonStyles)),
    changedComponentIds: Object.freeze(changedIds(previous.components, next.components)),
    changedExportTargetIds: Object.freeze(changedIds(
      previous.exportDefaults.map((item) => ({ id: item.targetId, ...item })),
      next.exportDefaults.map((item) => ({ id: item.targetId, ...item })),
    )),
  });
}
