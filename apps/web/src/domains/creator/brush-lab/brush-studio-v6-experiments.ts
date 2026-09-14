import {
  normalizeBrushStudioV6Program,
  patchBrushStudioV6Tuning,
  type BrushStudioV6Program,
  type BrushStudioV6Tuning,
} from "./brush-studio-v6-engine";
import { brushStudioV6MaterialActiveTuningKeys } from "./brush-studio-v6-material-engine";

export type BrushStudioV6NumericTuning = Exclude<keyof BrushStudioV6Tuning, "primaryColor" | "secondaryColor">;

export interface BrushStudioV6ExperimentField {
  readonly key: BrushStudioV6NumericTuning;
  readonly label: string;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly description: string;
}

/** Only parameters with a corresponding mark source belong in the controlled experiment. */
export const BRUSH_STUDIO_V6_EXPERIMENT_FIELDS: readonly BrushStudioV6ExperimentField[] = [
  { key: "size", label: "촉 크기", min: 1, max: 240, step: 1, description: "같은 손동작에서 접촉 폭이 어떻게 달라지는지 비교합니다." },
  { key: "flow", label: "도포 유량", min: 0.01, max: 1, step: 0.01, description: "안료를 덜 묻히거나 충분히 실었을 때의 획을 비교합니다." },
  { key: "spacing", label: "다브 간격", min: 0.01, max: 4, step: 0.01, description: "접촉 자국의 밀도와 끊어짐을 같은 궤적에서 비교합니다." },
  { key: "surfaceTooth", label: "종이 요철", min: 0, max: 1, step: 0.01, description: "종이에 닿는 부분과 비어 있는 부분의 대비를 비교합니다." },
  { key: "granulation", label: "안료 과립", min: 0, max: 1, step: 0.01, description: "안료 알갱이가 남기는 거친 질감의 강도를 비교합니다." },
  { key: "wetness", label: "수분", min: 0, max: 1, step: 0.01, description: "수분에 따른 젖은 가장자리와 번짐을 비교합니다." },
  { key: "bristleStrands", label: "강모 수", min: 8, max: 128, step: 8, description: "개별 털이 남기는 홈과 붓의 밀도를 비교합니다." },
  { key: "particleCount", label: "입자 수", min: 16, max: 3240, step: 16, description: "같은 시드의 흩뿌림을 사용해 입자의 밀도를 비교합니다." },
  { key: "patternDensity", label: "문양 밀도", min: 0, max: 1, step: 0.01, description: "문양의 크기와 개수에 따른 반복의 느낌을 비교합니다." },
  { key: "patternJitter", label: "흩어짐", min: 0, max: 1, step: 0.01, description: "문양과 입자의 방향·배치가 흐트러지는 정도를 비교합니다." },
];

export function brushStudioV6ExperimentFields(program: BrushStudioV6Program) {
  const active = brushStudioV6MaterialActiveTuningKeys(program);
  return BRUSH_STUDIO_V6_EXPERIMENT_FIELDS.filter((field) => active.has(field.key));
}

export interface BrushStudioV6ExperimentSample {
  readonly label: string;
  readonly value: number;
  readonly program: BrushStudioV6Program;
}

/** Keep path, seed and all unrelated settings fixed; change exactly one physical quantity. */
export function createBrushStudioV6ExperimentSamples(
  program: BrushStudioV6Program,
  field: BrushStudioV6ExperimentField,
): readonly BrushStudioV6ExperimentSample[] {
  const current = program.tuning[field.key];
  const offset = Math.max(field.step, (field.max - field.min) * 0.18);
  const snap = (value: number) => Math.min(field.max, Math.max(field.min,
    Number((Math.round(value / field.step) * field.step).toFixed(4))));
  const values = [snap(current - offset), current, snap(current + offset)];
  const labels = ["낮게", "현재", "높게"];
  return values.map((value, index) => ({
    label: labels[index]!,
    value,
    program: patchBrushStudioV6Tuning(program, { [field.key]: value }),
  }));
}

export interface BrushStudioV6EditHistory {
  readonly past: readonly BrushStudioV6Program[];
  readonly present: BrushStudioV6Program;
  readonly future: readonly BrushStudioV6Program[];
  readonly group: string | null;
}

export type BrushStudioV6EditAction =
  | { readonly type: "edit"; readonly program: BrushStudioV6Program; readonly group?: string }
  | { readonly type: "undo" }
  | { readonly type: "redo" }
  | { readonly type: "end-group" };

const HISTORY_LIMIT = 60;

export function createBrushStudioV6EditHistory(program: BrushStudioV6Program): BrushStudioV6EditHistory {
  return { past: [], present: normalizeBrushStudioV6Program(program), future: [], group: null };
}

/** Coalesce one slider gesture without discarding undo across distinct gestures. */
export function reduceBrushStudioV6EditHistory(
  history: BrushStudioV6EditHistory,
  action: BrushStudioV6EditAction,
): BrushStudioV6EditHistory {
  if (action.type === "end-group") return history.group === null ? history : { ...history, group: null };
  if (action.type === "undo") {
    const previous = history.past.at(-1);
    return previous ? {
      past: history.past.slice(0, -1), present: previous,
      future: [history.present, ...history.future], group: null,
    } : history;
  }
  if (action.type === "redo") {
    const next = history.future[0];
    return next ? {
      past: [...history.past, history.present].slice(-HISTORY_LIMIT),
      present: next, future: history.future.slice(1), group: null,
    } : history;
  }
  const next = normalizeBrushStudioV6Program(action.program);
  if (JSON.stringify(next) === JSON.stringify(history.present)) return history;
  return {
    past: action.group && action.group === history.group
      ? history.past : [...history.past, history.present].slice(-HISTORY_LIMIT),
    present: next, future: [], group: action.group ?? null,
  };
}

export interface BrushStudioV6ProgramDifference {
  readonly path: string;
  readonly before: string;
  readonly after: string;
}

/** Include metadata and proofs so a reference restore is a complete program restore. */
export function compareBrushStudioV6Programs(
  reference: BrushStudioV6Program,
  current: BrushStudioV6Program,
): readonly BrushStudioV6ProgramDifference[] {
  const flatten = (value: unknown, prefix = ""): Record<string, string> => {
    if (Array.isArray(value)) return { [prefix]: value.join(", ") || "—" };
    if (value !== null && typeof value === "object") return Object.fromEntries(
      Object.entries(value).flatMap(([key, entry]) => Object.entries(flatten(entry, prefix ? `${prefix}.${key}` : key))),
    );
    return { [prefix]: String(value) };
  };
  const before = flatten(reference);
  const after = flatten(current);
  return Object.keys(before).filter((path) => before[path] !== after[path])
    .map((path) => ({ path, before: before[path]!, after: after[path]! }));
}

/** Refuse unrelated/future files before normalization can replace the user's work with defaults. */
export function parseBrushStudioV6Import(serialized: string): BrushStudioV6Program {
  const parsed: unknown = JSON.parse(serialized);
  const source = parsed && typeof parsed === "object" && "program" in parsed ? parsed.program : parsed;
  if (!source || typeof source !== "object" || !("schemaVersion" in source) || source.schemaVersion !== 6
    || !("slots" in source) || !source.slots || typeof source.slots !== "object"
    || !("tuning" in source) || !source.tuning || typeof source.tuning !== "object") {
    throw new Error("V6 브러시 파일이 아닙니다. 현재 브러시 설정은 유지됩니다.");
  }
  return normalizeBrushStudioV6Program(source);
}
