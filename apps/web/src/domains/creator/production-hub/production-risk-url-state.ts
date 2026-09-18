import type {
  ProductionRiskCategory,
  ProductionRiskSeverity,
  ProductionRiskStatus,
} from "@toonspectrum/core/production";

export type ProductionRiskViewMode = "priority" | "episode" | "matrix";
export type ProductionRiskDetailTab = "overview" | "evidence" | "impact" | "response" | "history";

export interface ProductionRiskMatrixCell {
  readonly probability: 1 | 2 | 3 | 4 | 5;
  readonly impact: 1 | 2 | 3 | 4 | 5;
}

export interface ProductionRiskUrlState {
  readonly search: string;
  readonly severities: readonly ProductionRiskSeverity[];
  readonly statuses: readonly ProductionRiskStatus[];
  readonly categories: readonly ProductionRiskCategory[];
  readonly source: "manual" | "automatic" | null;
  readonly episodeIds: readonly string[];
  readonly ownerAssignmentIds: readonly string[];
  readonly ruleKeys: readonly string[];
  readonly view: ProductionRiskViewMode;
  readonly selectedRiskId: string | null;
  readonly detailTab: ProductionRiskDetailTab;
  readonly matrixCell: ProductionRiskMatrixCell | null;
}

export interface ProductionRiskUrlOptions {
  readonly episodeIds: readonly string[];
  readonly ownerAssignmentIds: readonly string[];
  readonly ruleKeys: readonly string[];
  readonly riskIds: readonly string[];
}

const SEVERITIES: readonly ProductionRiskSeverity[] = ["watch", "warning", "high", "critical"];
const STATUSES: readonly ProductionRiskStatus[] = [
  "open", "monitoring", "mitigating", "occurred", "accepted", "resolved", "dismissed", "closed",
];
const CATEGORIES: readonly ProductionRiskCategory[] = [
  "story", "visual", "schedule", "capacity", "review", "asset", "budget", "rights", "contract",
  "platform", "health", "security", "communication", "technical",
];
const VIEWS: readonly ProductionRiskViewMode[] = ["priority", "episode", "matrix"];
const TABS: readonly ProductionRiskDetailTab[] = ["overview", "evidence", "impact", "response", "history"];
const KNOWN_KEYS = ["q", "severity", "status", "category", "source", "episode", "owner", "rule", "view", "risk", "tab", "matrix"] as const;

function values(value: string | null): readonly string[] {
  return [...new Set((value ?? "").split(",").map((entry) => entry.trim()).filter(Boolean))];
}

function enumValues<T extends string>(value: string | null, allowed: readonly T[]): readonly T[] {
  const allowedValues = new Set<string>(allowed);
  return values(value).filter((entry): entry is T => allowedValues.has(entry));
}

function selectedValues(value: string | null, allowed: ReadonlySet<string>): readonly string[] {
  return values(value).filter((entry) => allowed.has(entry));
}

function matrixCell(value: string | null): ProductionRiskMatrixCell | null {
  const match = /^([1-5])-([1-5])$/u.exec(value ?? "");
  if (!match) return null;
  return {
    probability: Number(match[1]) as ProductionRiskMatrixCell["probability"],
    impact: Number(match[2]) as ProductionRiskMatrixCell["impact"],
  };
}

export function parseProductionRiskUrlState(
  params: URLSearchParams,
  options: ProductionRiskUrlOptions,
): ProductionRiskUrlState {
  const episodeIds = new Set(["project", ...options.episodeIds]);
  const ownerAssignmentIds = new Set(["unassigned", ...options.ownerAssignmentIds]);
  const riskIds = new Set(options.riskIds);
  const ruleKeys = new Set(options.ruleKeys);
  const view = enumValues(params.get("view"), VIEWS)[0] ?? "priority";
  const selectedRiskId = riskIds.has(params.get("risk") ?? "") ? params.get("risk") : null;
  return Object.freeze({
    search: (params.get("q") ?? "").trim().slice(0, 240),
    severities: Object.freeze(enumValues(params.get("severity"), SEVERITIES)),
    statuses: Object.freeze(enumValues(params.get("status"), STATUSES)),
    categories: Object.freeze(enumValues(params.get("category"), CATEGORIES)),
    source: enumValues(params.get("source"), ["manual", "automatic"] as const)[0] ?? null,
    episodeIds: Object.freeze(selectedValues(params.get("episode"), episodeIds)),
    ownerAssignmentIds: Object.freeze(selectedValues(params.get("owner"), ownerAssignmentIds)),
    ruleKeys: Object.freeze(selectedValues(params.get("rule"), ruleKeys)),
    view,
    selectedRiskId,
    detailTab: selectedRiskId ? enumValues(params.get("tab"), TABS)[0] ?? "overview" : "overview",
    matrixCell: view === "matrix" ? matrixCell(params.get("matrix")) : null,
  });
}

function setList(params: URLSearchParams, key: string, entries: readonly string[]): void {
  if (entries.length > 0) params.set(key, entries.join(","));
}

export function serializeProductionRiskUrlState(
  state: ProductionRiskUrlState,
  current?: URLSearchParams,
): URLSearchParams {
  const params = new URLSearchParams(current);
  for (const key of KNOWN_KEYS) params.delete(key);
  if (state.search) params.set("q", state.search);
  setList(params, "severity", state.severities);
  setList(params, "status", state.statuses);
  setList(params, "category", state.categories);
  if (state.source) params.set("source", state.source);
  setList(params, "episode", state.episodeIds);
  setList(params, "owner", state.ownerAssignmentIds);
  setList(params, "rule", state.ruleKeys);
  if (state.view !== "priority") params.set("view", state.view);
  if (state.selectedRiskId) {
    params.set("risk", state.selectedRiskId);
    if (state.detailTab !== "overview") params.set("tab", state.detailTab);
  }
  if (state.view === "matrix" && state.matrixCell) {
    params.set("matrix", `${state.matrixCell.probability}-${state.matrixCell.impact}`);
  }
  return params;
}

export function normalizeProductionRiskSearchParams(
  params: URLSearchParams,
  options: ProductionRiskUrlOptions,
): URLSearchParams {
  return serializeProductionRiskUrlState(parseProductionRiskUrlState(params, options), params);
}
