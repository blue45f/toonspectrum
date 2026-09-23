/**
 * Unify offered grade Studio3dHistory (past/future) with the production BG3D
 * history command adapter. Editor undo/redo then undoes grade-routed mutations
 * because both stacks share the same StudioBg3dSceneDocument identity.
 *
 * Hosts should:
 * 1. Keep one `gradeHistoryRef` for the session.
 * 2. Call `commitGradeRoutedHistoryTransition` when applying offered commands
 *    that also mutate the live scene (place/remove/light/camera/background).
 * 3. Call `stepUnifiedStudio3dHistory` from the production undo/redo path so
 *    the grade stack stays aligned with the adapter restore.
 */

import type { BgCustomModelInstance } from "../studio-background-3d-model";
import type { BgPrimitive } from "../studio-background-3d-primitives";

import {
  createStudioBg3dHistorySnapshot,
  type StudioBg3dHistorySnapshot,
} from "./studio-bg3d-editor-derivations";
import {
  applyStudio3dCommand,
  createStudio3dHistory,
  listOfferedStudio3dCommands,
  redoStudio3d,
  undoStudio3d,
  type Studio3dCommand,
  type Studio3dHistory,
  type Studio3dOfferedCommandId,
  type Studio3dScene,
} from "./studio-bg3d-grade-plates";
import {
  commitStudioBg3dHistoryTransition,
  stepStudioBg3dCommandHistory,
  type StudioBg3dHistoryCommandRefs,
  type StudioBg3dHistoryTransitionReceipt,
} from "./studio-bg3d-history-command-adapter";

export function ensureStudio3dGradeHistory(
  current: Studio3dHistory | null | undefined,
  scene: Studio3dScene,
): Studio3dHistory {
  return current ?? createStudio3dHistory(scene);
}

/** Push one offered command onto the pure grade past/future stack. */
export function pushStudio3dGradeCommand(
  history: Studio3dHistory,
  command: Studio3dCommand,
): Studio3dHistory {
  return applyStudio3dCommand(history, command);
}

export function labelForStudio3dGradeCommand(commandId: Studio3dOfferedCommandId): string {
  return listOfferedStudio3dCommands().find((entry) => entry.id === commandId)?.label ?? commandId;
}

export interface CommitGradeRoutedHistoryInput {
  readonly grade: Studio3dHistory;
  readonly refs: StudioBg3dHistoryCommandRefs;
  readonly before: StudioBg3dHistorySnapshot;
  readonly after: StudioBg3dHistorySnapshot;
  /** Offered command id(s) that produced `after` — first id names the adapter entry. */
  readonly commandIds: readonly Studio3dOfferedCommandId[];
  readonly label?: string;
  readonly source?: "canvas" | "inspector" | "keyboard" | "menu" | "palette" | "system";
}

export interface CommitGradeRoutedHistoryResult {
  readonly grade: Studio3dHistory;
  readonly receipt: StudioBg3dHistoryTransitionReceipt;
}

/**
 * Dual-write: advance grade past/future to `after.document` and commit the same
 * before→after snapshots into the production adapter under `bg3d.grade.*`.
 */
export function commitGradeRoutedHistoryTransition(
  input: CommitGradeRoutedHistoryInput,
): CommitGradeRoutedHistoryResult {
  const primaryId = input.commandIds[0] ?? "place-prop";
  const grade: Studio3dHistory = {
    scene: input.after.document,
    past: [...input.grade.past, input.grade.scene],
    future: [],
  };
  const receipt = commitStudioBg3dHistoryTransition(input.refs, {
    before: input.before,
    after: input.after,
    commandId: `bg3d.grade.${primaryId}`,
    label: input.label ?? labelForStudio3dGradeCommand(primaryId),
    source: input.source ?? "inspector",
  });
  return { grade, receipt };
}

/**
 * Apply an offered command to grade history, then commit production adapter using
 * the live primitives/models with the grade document as the after-document.
 * Use when the command only mutates the scene document (light/camera/background).
 */
export function applyAndCommitStudio3dGradeCommand(input: {
  readonly grade: Studio3dHistory;
  readonly refs: StudioBg3dHistoryCommandRefs;
  readonly primitives: readonly BgPrimitive[];
  readonly customModels: readonly BgCustomModelInstance[];
  readonly command: Studio3dCommand;
  readonly label?: string;
  readonly source?: CommitGradeRoutedHistoryInput["source"];
}): CommitGradeRoutedHistoryResult & { readonly scene: Studio3dScene } {
  const nextGrade = pushStudio3dGradeCommand(input.grade, input.command);
  const before = createStudioBg3dHistorySnapshot({
    primitives: input.primitives,
    customModels: input.customModels,
    document: input.grade.scene,
  });
  const after = createStudioBg3dHistorySnapshot({
    primitives: input.primitives,
    customModels: input.customModels,
    document: nextGrade.scene,
  });
  const committed = commitGradeRoutedHistoryTransition({
    grade: input.grade,
    refs: input.refs,
    before,
    after,
    commandIds: [input.command.id],
    label: input.label,
    source: input.source,
  });
  return { ...committed, scene: nextGrade.scene };
}

export interface StepUnifiedStudio3dHistoryResult {
  readonly grade: Studio3dHistory;
  /** Adapter snapshot when the production timeline stepped; null if only grade stepped. */
  readonly snapshot: StudioBg3dHistorySnapshot | null;
  readonly via: "adapter" | "grade-only";
}

/**
 * Prefer the production adapter step (authoritative live scene), then align the
 * grade past/future pointer to the restored document. Falls back to pure
 * undoStudio3d / redoStudio3d when the adapter has nothing to step.
 */
export function stepUnifiedStudio3dHistory(
  refs: StudioBg3dHistoryCommandRefs,
  grade: Studio3dHistory,
  direction: "undo" | "redo",
): StepUnifiedStudio3dHistoryResult {
  const receipt = stepStudioBg3dCommandHistory(refs, direction);
  if (!receipt || receipt.status !== "applied") {
    const next = direction === "undo" ? undoStudio3d(grade) : redoStudio3d(grade);
    return { grade: next, snapshot: null, via: "grade-only" };
  }
  const stepped = direction === "undo" ? undoStudio3d(grade) : redoStudio3d(grade);
  // Adapter document wins; keep grade stacks advanced so a later grade-only fallback stays coherent.
  return {
    grade: { ...stepped, scene: receipt.state.document },
    snapshot: receipt.state,
    via: "adapter",
  };
}

/** Rebase grade current scene after an external restore without inventing past entries. */
export function alignStudio3dGradeHistoryToDocument(
  grade: Studio3dHistory,
  document: Studio3dScene,
): Studio3dHistory {
  if (grade.scene === document) return grade;
  return { ...grade, scene: document };
}
