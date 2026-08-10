/**
 * Human-operated CSP non-inferiority lab core.
 *
 * This module deliberately owns no image capture and cannot claim CSP parity by itself. It turns
 * a pre-registered pair corpus into deterministic, evaluator-specific blinded packets and opens
 * the gate only after a complete response set reaches the configured Wilson lower bound.
 */

export type CspBlindPreference = "A" | "tie" | "B";

export interface CspBlindTask {
  readonly id: string;
  readonly category: "inking" | "natural-media" | "comic-flow" | "animation" | "text";
  readonly toonStudioAsset: string;
  readonly cspAsset: string;
}

export interface CspBlindStudy {
  readonly studyId: string;
  readonly preregisteredAt: string;
  readonly nonInferiorityMargin: number;
  readonly minimumResponsesPerCategory: number;
  readonly tasks: readonly CspBlindTask[];
}

export interface CspBlindPacketItem {
  readonly taskId: string;
  readonly category: CspBlindTask["category"];
  readonly assetA: string;
  readonly assetB: string;
}

export interface CspBlindPacket {
  readonly studyId: string;
  readonly evaluatorId: string;
  readonly items: readonly CspBlindPacketItem[];
}

export interface CspBlindSealedKey {
  readonly studyId: string;
  readonly evaluatorId: string;
  readonly entries: readonly Readonly<{
    taskId: string;
    toonStudioSide: "A" | "B";
  }>[];
}

export interface CspBlindResponse {
  readonly evaluatorId: string;
  readonly taskId: string;
  readonly preference: CspBlindPreference;
}

export interface CspBlindCategoryResult {
  readonly category: CspBlindTask["category"] | "overall";
  readonly responses: number;
  readonly toonStudioWins: number;
  readonly ties: number;
  readonly cspWins: number;
  readonly favorableRate: number;
  readonly wilsonLower95: number;
  readonly threshold: number;
  readonly enoughResponses: boolean;
  readonly passes: boolean;
}

export interface CspBlindAnalysis {
  readonly studyId: string;
  readonly complete: boolean;
  readonly missingResponseKeys: readonly string[];
  readonly duplicateResponseKeys: readonly string[];
  readonly results: readonly CspBlindCategoryResult[];
  readonly gate: "pass" | "fail" | "insufficient-data";
}

const CATEGORY_ORDER: readonly CspBlindTask["category"][] = Object.freeze([
  "inking",
  "natural-media",
  "comic-flow",
  "animation",
  "text",
]);

function assertIdentifier(value: string, label: string): void {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/u.test(value)) {
    throw new Error(`${label} must be a stable identifier`);
  }
}

function assertStudy(study: CspBlindStudy): void {
  assertIdentifier(study.studyId, "studyId");
  if (!Number.isFinite(Date.parse(study.preregisteredAt))) {
    throw new Error("preregisteredAt must be an ISO-compatible timestamp");
  }
  if (
    !Number.isFinite(study.nonInferiorityMargin)
    || study.nonInferiorityMargin < 0
    || study.nonInferiorityMargin >= 0.5
  ) {
    throw new Error("nonInferiorityMargin must be in [0, 0.5)");
  }
  if (
    !Number.isSafeInteger(study.minimumResponsesPerCategory)
    || study.minimumResponsesPerCategory <= 0
  ) {
    throw new Error("minimumResponsesPerCategory must be a positive safe integer");
  }
  if (study.tasks.length === 0) throw new Error("blind study needs at least one task");
  const ids = new Set<string>();
  for (const task of study.tasks) {
    assertIdentifier(task.id, "task.id");
    if (ids.has(task.id)) throw new Error(`duplicate blind task id: ${task.id}`);
    ids.add(task.id);
    if (!CATEGORY_ORDER.includes(task.category)) {
      throw new Error(`unsupported blind task category: ${String(task.category)}`);
    }
    if (!task.toonStudioAsset || !task.cspAsset) {
      throw new Error(`blind task ${task.id} is missing an asset`);
    }
    if (task.toonStudioAsset === task.cspAsset) {
      throw new Error(`blind task ${task.id} must use distinct source assets`);
    }
  }
}

function fnv1a32(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash = Math.imul(hash ^ value.charCodeAt(index), 0x01000193);
  }
  return hash >>> 0;
}

function toonSide(studyId: string, evaluatorId: string, taskId: string): "A" | "B" {
  return (fnv1a32(`${studyId}\u0000${evaluatorId}\u0000${taskId}`) & 1) === 0
    ? "A"
    : "B";
}

/** Participant packet and source key must be stored separately by the lab operator. */
export function createCspBlindPacket(
  study: CspBlindStudy,
  evaluatorId: string,
): Readonly<{ packet: CspBlindPacket; sealedKey: CspBlindSealedKey }> {
  assertStudy(study);
  assertIdentifier(evaluatorId, "evaluatorId");
  const keyed = study.tasks.map((task) => ({
    task,
    sortKey: fnv1a32(`${study.studyId}\u0000${evaluatorId}\u0000order\u0000${task.id}`),
    side: toonSide(study.studyId, evaluatorId, task.id),
  })).sort((left, right) => {
    if (left.sortKey !== right.sortKey) return left.sortKey - right.sortKey;
    return left.task.id < right.task.id ? -1 : left.task.id > right.task.id ? 1 : 0;
  });
  return Object.freeze({
    packet: Object.freeze({
      studyId: study.studyId,
      evaluatorId,
      items: Object.freeze(keyed.map(({ task, side }) => Object.freeze({
        taskId: task.id,
        category: task.category,
        assetA: side === "A" ? task.toonStudioAsset : task.cspAsset,
        assetB: side === "B" ? task.toonStudioAsset : task.cspAsset,
      }))),
    }),
    sealedKey: Object.freeze({
      studyId: study.studyId,
      evaluatorId,
      entries: Object.freeze(keyed.map(({ task, side }) => Object.freeze({
        taskId: task.id,
        toonStudioSide: side,
      }))),
    }),
  });
}

function wilsonLower95(successes: number, total: number): number {
  if (total <= 0) return 0;
  const z = 1.959963984540054;
  const probability = successes / total;
  const denominator = 1 + z * z / total;
  const center = probability + z * z / (2 * total);
  const radius = z * Math.sqrt(
    (probability * (1 - probability) + z * z / (4 * total)) / total,
  );
  return Math.max(0, (center - radius) / denominator);
}

function round(value: number): number {
  return Number(value.toFixed(6));
}

export function analyzeCspBlindResponses(
  study: CspBlindStudy,
  sealedKeys: readonly CspBlindSealedKey[],
  responses: readonly CspBlindResponse[],
): CspBlindAnalysis {
  assertStudy(study);
  const taskById = new Map(study.tasks.map((task) => [task.id, task] as const));
  const sourceByResponseKey = new Map<string, "A" | "B">();
  for (const key of sealedKeys) {
    if (key.studyId !== study.studyId) throw new Error("sealed key belongs to another study");
    assertIdentifier(key.evaluatorId, "sealed evaluatorId");
    if (key.entries.length !== study.tasks.length) {
      throw new Error(`sealed key for ${key.evaluatorId} must assign every study task exactly once`);
    }
    const evaluatorTasks = new Set<string>();
    for (const entry of key.entries) {
      if (!taskById.has(entry.taskId)) throw new Error(`sealed key has unknown task ${entry.taskId}`);
      if (entry.toonStudioSide !== "A" && entry.toonStudioSide !== "B") {
        throw new Error(`sealed key has invalid side for ${entry.taskId}`);
      }
      if (evaluatorTasks.has(entry.taskId)) {
        throw new Error(`duplicate sealed assignment: ${key.evaluatorId}/${entry.taskId}`);
      }
      evaluatorTasks.add(entry.taskId);
      const responseKey = `${key.evaluatorId}\u0000${entry.taskId}`;
      if (sourceByResponseKey.has(responseKey)) {
        throw new Error(`duplicate sealed assignment: ${key.evaluatorId}/${entry.taskId}`);
      }
      sourceByResponseKey.set(responseKey, entry.toonStudioSide);
    }
  }

  const seen = new Set<string>();
  const duplicateResponseKeys: string[] = [];
  const scored: Array<Readonly<{
    category: CspBlindTask["category"];
    outcome: "toon" | "tie" | "csp";
  }>> = [];
  for (const response of responses) {
    assertIdentifier(response.evaluatorId, "response evaluatorId");
    assertIdentifier(response.taskId, "response taskId");
    if (response.preference !== "A" && response.preference !== "B" && response.preference !== "tie") {
      throw new Error(`invalid blind preference for ${response.evaluatorId}/${response.taskId}`);
    }
    const responseKey = `${response.evaluatorId}\u0000${response.taskId}`;
    if (seen.has(responseKey)) {
      duplicateResponseKeys.push(`${response.evaluatorId}/${response.taskId}`);
      continue;
    }
    seen.add(responseKey);
    const side = sourceByResponseKey.get(responseKey);
    const task = taskById.get(response.taskId);
    if (!side || !task) throw new Error(`response has no sealed assignment: ${responseKey}`);
    const outcome = response.preference === "tie"
      ? "tie"
      : response.preference === side
        ? "toon"
        : "csp";
    scored.push(Object.freeze({ category: task.category, outcome }));
  }
  duplicateResponseKeys.sort();
  const missingResponseKeys = [...sourceByResponseKey.keys()]
    .filter((key) => !seen.has(key))
    .map((key) => key.replace("\u0000", "/"))
    .sort();
  const threshold = 0.5 - study.nonInferiorityMargin;

  const categoryResult = (
    category: CspBlindTask["category"] | "overall",
  ): CspBlindCategoryResult => {
    const selected = category === "overall"
      ? scored
      : scored.filter((entry) => entry.category === category);
    const toonStudioWins = selected.filter((entry) => entry.outcome === "toon").length;
    const ties = selected.filter((entry) => entry.outcome === "tie").length;
    const cspWins = selected.filter((entry) => entry.outcome === "csp").length;
    const favorable = toonStudioWins + ties * 0.5;
    const favorableRate = selected.length === 0 ? 0 : favorable / selected.length;
    const lower = wilsonLower95(favorable, selected.length);
    const enoughResponses = category === "overall"
      ? selected.length >= study.minimumResponsesPerCategory * CATEGORY_ORDER.length
      : selected.length >= study.minimumResponsesPerCategory;
    return Object.freeze({
      category,
      responses: selected.length,
      toonStudioWins,
      ties,
      cspWins,
      favorableRate: round(favorableRate),
      wilsonLower95: round(lower),
      threshold: round(threshold),
      enoughResponses,
      passes: enoughResponses && lower >= threshold,
    });
  };

  const results = Object.freeze([
    categoryResult("overall"),
    ...CATEGORY_ORDER.map(categoryResult),
  ]);
  const complete = missingResponseKeys.length === 0 && duplicateResponseKeys.length === 0;
  const gate = !complete || results.some((result) => !result.enoughResponses)
    ? "insufficient-data"
    : results.every((result) => result.passes)
      ? "pass"
      : "fail";
  return Object.freeze({
    studyId: study.studyId,
    complete,
    missingResponseKeys: Object.freeze(missingResponseKeys),
    duplicateResponseKeys: Object.freeze(duplicateResponseKeys),
    results,
    gate,
  });
}
