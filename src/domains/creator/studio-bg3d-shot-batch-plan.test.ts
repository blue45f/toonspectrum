import { describe, expect, it } from "vitest";

import {
  STUDIO_BG3D_SHOT_BATCH_MAX_FILES,
  createStudioBg3dShotBatchPlan,
  pendingStudioBg3dShotBatchFiles,
} from "./studio-bg3d-shot-batch-plan";

const SHOTS = [
  { id: "shot-a", name: "첫 컷" },
  { id: "shot-b", name: "둘째 컷" },
  { id: "shot-c", name: "셋째 컷" },
] as const;

describe("Studio BG3D shot batch plan", () => {
  it("preserves storyboard order while planning only selected shots and canonical pass order", () => {
    const result = createStudioBg3dShotBatchPlan(SHOTS, {
      selectedShotIds: ["shot-c", "shot-a"],
      passes: ["main-line", "lt-composite", "tone"],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.passes).toEqual(["lt-composite", "tone", "main-line"]);
    expect(result.plan.shots.map(({ shotId }) => shotId)).toEqual(["shot-a", "shot-c"]);
    expect(result.plan.files.map(({ key, path }) => ({ key, path }))).toEqual([
      { key: "shot-a:lt-composite", path: "shots/001/lt-composite.png" },
      { key: "shot-a:tone", path: "shots/001/tone.png" },
      { key: "shot-a:main-line", path: "shots/001/main-line.png" },
      { key: "shot-c:lt-composite", path: "shots/002/lt-composite.png" },
      { key: "shot-c:tone", path: "shots/002/tone.png" },
      { key: "shot-c:main-line", path: "shots/002/main-line.png" },
    ]);
  });

  it("defaults to every shot and the backwards-compatible composite pass", () => {
    const result = createStudioBg3dShotBatchPlan(SHOTS);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.passes).toEqual(["lt-composite"]);
    expect(result.plan.files).toHaveLength(3);
  });

  it("creates a deterministic recovery identity sensitive to names, order, selection, and passes", () => {
    const first = createStudioBg3dShotBatchPlan(SHOTS, { passes: ["color", "main-line"] });
    const second = createStudioBg3dShotBatchPlan(SHOTS, { passes: ["main-line", "color"] });
    const renamed = createStudioBg3dShotBatchPlan(
      [{ ...SHOTS[0], name: "수정" }, SHOTS[1], SHOTS[2]],
      { passes: ["color", "main-line"] },
    );
    const reordered = createStudioBg3dShotBatchPlan(
      [SHOTS[1], SHOTS[0], SHOTS[2]],
      { passes: ["color", "main-line"] },
    );
    const revised = createStudioBg3dShotBatchPlan(SHOTS, {
      passes: ["color", "main-line"],
      sourceRevision: '{"camera":"changed"}',
    });
    const withPsd = createStudioBg3dShotBatchPlan(SHOTS, {
      passes: ["color", "main-line"],
      layeredPsd: true,
    });
    const fixedHeight = createStudioBg3dShotBatchPlan(SHOTS, {
      passes: ["color", "main-line"],
      exportHeight: 1_440,
    });
    const withContactSheet = createStudioBg3dShotBatchPlan(SHOTS, {
      passes: ["color", "main-line"],
      contactSheet: true,
    });

    expect(first.ok && second.ok && first.plan.resumeKey).toBe(
      second.ok && second.plan.resumeKey,
    );
    expect(first.ok && renamed.ok && first.plan.resumeKey).not.toBe(
      renamed.ok && renamed.plan.resumeKey,
    );
    expect(first.ok && reordered.ok && first.plan.resumeKey).not.toBe(
      reordered.ok && reordered.plan.resumeKey,
    );
    expect(first.ok && revised.ok && first.plan.resumeKey).not.toBe(
      revised.ok && revised.plan.resumeKey,
    );
    expect(first.ok && withPsd.ok && first.plan.resumeKey).not.toBe(
      withPsd.ok && withPsd.plan.resumeKey,
    );
    expect(first.ok && fixedHeight.ok && first.plan.resumeKey).not.toBe(
      fixedHeight.ok && fixedHeight.plan.resumeKey,
    );
    expect(first.ok && withContactSheet.ok && first.plan.resumeKey).not.toBe(
      withContactSheet.ok && withContactSheet.plan.resumeKey,
    );
    expect(fixedHeight.ok && fixedHeight.plan.exportHeight).toBe(1_440);
    expect(withContactSheet.ok && withContactSheet.plan.includeContactSheet).toBe(true);
  });

  it("rejects empty, duplicate, unknown, and malformed selections or passes", () => {
    expect(createStudioBg3dShotBatchPlan(SHOTS, { selectedShotIds: [] })).toMatchObject({
      ok: false,
      code: "empty-selection",
    });
    expect(createStudioBg3dShotBatchPlan(SHOTS, {
      selectedShotIds: ["shot-a", "shot-a"],
    })).toMatchObject({ ok: false, code: "duplicate-selection" });
    expect(createStudioBg3dShotBatchPlan(SHOTS, {
      selectedShotIds: ["shot-missing"],
    })).toMatchObject({ ok: false, code: "unknown-selection" });
    expect(createStudioBg3dShotBatchPlan(SHOTS, { passes: [] })).toMatchObject({
      ok: false,
      code: "empty-passes",
    });
    expect(createStudioBg3dShotBatchPlan(SHOTS, {
      passes: ["color", "color"],
    })).toMatchObject({ ok: false, code: "duplicate-pass" });
    expect(createStudioBg3dShotBatchPlan([
      SHOTS[0],
      { ...SHOTS[1], id: SHOTS[0].id },
    ])).toMatchObject({ ok: false, code: "duplicate-shot-id" });
  });

  it("plans the exact global file ceiling and filters completed recovery keys", () => {
    const shots = Array.from({ length: 64 }, (_, index) => ({
      id: `shot-${index + 1}`,
      name: `컷 ${index + 1}`,
    }));
    const result = createStudioBg3dShotBatchPlan(shots, {
      passes: [
        "beauty",
        "lt-composite",
        "color",
        "tone",
        "texture-line",
        "main-line",
        "depth",
      ],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.files).toHaveLength(STUDIO_BG3D_SHOT_BATCH_MAX_FILES);
    const completed = new Set([
      result.plan.files[0]!.key,
      result.plan.files[result.plan.files.length - 1]!.key,
      "foreign:color",
    ]);
    const pending = pendingStudioBg3dShotBatchFiles(result.plan, completed);
    expect(pending).toHaveLength(STUDIO_BG3D_SHOT_BATCH_MAX_FILES - 2);
    expect(pending.some(({ key }) => completed.has(key))).toBe(false);
  });
});
