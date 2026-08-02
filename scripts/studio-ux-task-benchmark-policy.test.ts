import { describe, expect, it } from "vitest";

import {
  STUDIO_UX_REFERENCE_PRODUCT_IDS,
  STUDIO_UX_REFERENCE_PRODUCTS,
  STUDIO_UX_REFERENCE_TASK_ROUTES,
  STUDIO_UX_TASK_FIXTURES,
} from "./studio-ux-task-benchmark-fixture";
import {
  STUDIO_UX_TASK_BENCHMARK_SCHEMA_VERSION,
  evaluateStudioUxTaskObservation,
  summarizeStudioUxTaskBenchmark,
  type StudioUxTaskDefinition,
  type StudioUxTaskObservation,
} from "./studio-ux-task-benchmark-policy";

function healthyObservation(
  task: StudioUxTaskDefinition,
): StudioUxTaskObservation {
  const mobile = task.requireMobileEvidence
    ? {
        viewportWidth: 390,
        viewportHeight: 844,
        minimumCriticalTargetPx: 44,
        horizontalOverflowPx: 0,
        safeAreaClearancePx: 8,
        canvasAreaPx: 390 * 844 * 0.62,
        viewportAreaPx: 390 * 844,
      }
    : null;
  return {
    schemaVersion: STUDIO_UX_TASK_BENCHMARK_SCHEMA_VERSION,
    productId: "toonspectrum",
    taskId: task.id,
    surface: task.requireMobileEvidence ? "mobile" : "desktop",
    completed: true,
    fixture: task.fixture,
    discovery: {
      elapsedMs: Math.max(1, task.budgets.maxDiscoveryMs - 500),
      wrongTurns: 0,
      labelledAtStart: true,
      shortcutShown: task.requireKeyboardPath,
      contextualHelpAvailable: true,
    },
    actions: {
      pointerTaps: task.budgets.maxPointerTaps,
      pointerDrags: task.budgets.maxPointerDrags,
      keyboardChords: task.requireKeyboardPath ? task.budgets.maxKeyboardChords : 0,
      keyboardPathAvailable: task.requireKeyboardPath,
    },
    feedback: {
      toolSelected: true,
      targetIdentified: true,
      previewVisible: true,
      progressIndicated: true,
      commitConfirmed: true,
      errorExplained: true,
    },
    entryContinuity: {
      prerequisiteExplained: true,
      prerequisiteCtaAvailable: true,
      ctaChangedState: true,
      targetSelectableAfterCta: true,
      entryVisibleAfterTargetSelection: true,
    },
    reversibility: {
      cancelBeforeCommit: true,
      undoAvailable: true,
      undoRestored: true,
      redoAvailable: true,
      redoRestored: true,
    },
    panels: {
      measured: true,
      resizable: true,
      collapsible: true,
      reopenPreservedState: true,
      noCriticalOverlap: true,
    },
    mobile,
    recovery: {
      failureInjected: true,
      actionableMessage: true,
      retryAvailable: true,
      workPreserved: true,
      recovered: true,
      recoveryActions: 1,
    },
    evidence: {
      kind: "automated-browser",
      observedAt: "2026-08-03T00:00:00.000Z",
      sourceUrls: [],
      artifactPaths: [`/tmp/toonspectrum-ux/${task.id}.json`],
      notes: [],
    },
  };
}

describe("Studio task-based UX benchmark fixture", () => {
  it("starts every core workflow from native strokes and a line object", () => {
    const nativeTasks = STUDIO_UX_TASK_FIXTURES.filter(
      (task) => task.sourceKind === "native-document",
    );
    expect(nativeTasks.length).toBeGreaterThanOrEqual(7);
    for (const task of nativeTasks) {
      expect(task.fixture).toEqual(expect.objectContaining({
        importedImageCount: 0,
        nativeBrushStrokeCount: 3,
        nativeLineObjectCount: 1,
      }));
    }
    expect(nativeTasks.map((task) => task.id)).toEqual(expect.arrayContaining([
      "native-area-selection",
      "native-selection-filter",
      "native-retouch",
      "native-transform",
    ]));
  });

  it("keeps image upload as one separately scored compatibility task", () => {
    const compatibility = STUDIO_UX_TASK_FIXTURES.filter(
      (task) => task.sourceKind === "import-compatibility",
    );
    expect(compatibility).toHaveLength(1);
    expect(compatibility[0]).toMatchObject({
      id: "imported-image-filter-compatibility",
      fixture: {
        importedImageCount: 1,
        nativeBrushStrokeCount: 0,
        nativeLineObjectCount: 0,
      },
    });
  });

  it("covers the six requested references without presenting inferred routes as timed trials", () => {
    expect(STUDIO_UX_REFERENCE_PRODUCTS.map((product) => product.id)).toEqual(
      STUDIO_UX_REFERENCE_PRODUCT_IDS,
    );
    expect(STUDIO_UX_REFERENCE_TASK_ROUTES).toHaveLength(
      STUDIO_UX_REFERENCE_PRODUCT_IDS.length,
    );

    const nativeTaskIds = STUDIO_UX_TASK_FIXTURES
      .filter((task) => task.sourceKind === "native-document")
      .map((task) => task.id)
      .sort();
    for (const product of STUDIO_UX_REFERENCE_PRODUCTS) {
      expect(product.sourceUrls.length).toBeGreaterThan(0);
      expect(product.sourceUrls.every((url) => url.startsWith("https://"))).toBe(true);
      const route = STUDIO_UX_REFERENCE_TASK_ROUTES.find(
        (candidate) => candidate.productId === product.id,
      );
      expect(route?.taskIds.toSorted()).toEqual(nativeTaskIds);
      expect(route?.notes.length).toBeGreaterThan(24);
    }
  });
});

describe("Studio task-based UX benchmark policy", () => {
  it("scores a complete native workflow and reports raw action metrics", () => {
    const task = STUDIO_UX_TASK_FIXTURES.find(
      (candidate) => candidate.id === "native-transform",
    );
    expect(task).toBeDefined();
    const result = evaluateStudioUxTaskObservation(task!, healthyObservation(task!));
    expect(result.ok).toBe(true);
    expect(result.score).toBe(100);
    expect(result.metrics).toMatchObject({
      pointerTaps: 3,
      pointerDrags: 2,
      keyboardChords: 1,
      wrongTurns: 0,
    });
    expect(result.findings).toEqual([]);
  });

  it("rejects an imported-image shortcut in a native filter task", () => {
    const task = STUDIO_UX_TASK_FIXTURES.find(
      (candidate) => candidate.id === "native-selection-filter",
    )!;
    const baseline = healthyObservation(task);
    const result = evaluateStudioUxTaskObservation(task, {
      ...baseline,
      fixture: {
        importedImageCount: 1,
        nativeBrushStrokeCount: 0,
        nativeLineObjectCount: 0,
      },
    });
    expect(result.ok).toBe(false);
    expect(new Set(result.findings.map((finding) => finding.code))).toEqual(new Set([
      "fixture-import-leak",
      "fixture-native-stroke-missing",
      "fixture-native-line-missing",
    ]));
  });

  it("quantifies discovery, action-count, feedback and recovery gaps independently", () => {
    const task = STUDIO_UX_TASK_FIXTURES.find(
      (candidate) => candidate.id === "native-selection-filter",
    )!;
    const baseline = healthyObservation(task);
    const result = evaluateStudioUxTaskObservation(task, {
      ...baseline,
      completed: false,
      discovery: {
        ...baseline.discovery,
        elapsedMs: 15_000,
        wrongTurns: 3,
        labelledAtStart: false,
      },
      actions: {
        pointerTaps: 9,
        pointerDrags: 3,
        keyboardChords: 0,
        keyboardPathAvailable: false,
      },
      feedback: {
        ...baseline.feedback,
        targetIdentified: false,
        previewVisible: false,
        progressIndicated: false,
      },
      recovery: {
        ...baseline.recovery,
        retryAvailable: false,
        workPreserved: false,
        recovered: false,
      },
    });
    const codes = new Set(result.findings.map((finding) => finding.code));
    expect(codes).toEqual(expect.objectContaining(new Set([
      "task-incomplete",
      "discovery-budget",
      "wrong-turn-budget",
      "pointer-tap-budget",
      "pointer-drag-budget",
      "keyboard-path-missing",
      "state-feedback-missing",
      "error-recovery-missing",
      "aggregate-score",
    ])));
    expect(result.dimensions.discoverability).toBeLessThan(30);
    expect(result.dimensions.pointerEfficiency).toBe(0);
    expect(result.dimensions.errorRecovery).toBe(40);
  });

  it("treats a disappearing conditional feature entry as a P0 dead-end", () => {
    const task = STUDIO_UX_TASK_FIXTURES.find(
      (candidate) => candidate.id === "conditional-native-media-entry",
    )!;
    const baseline = healthyObservation(task);
    const result = evaluateStudioUxTaskObservation(task, {
      ...baseline,
      entryContinuity: {
        ...baseline.entryContinuity,
        entryVisibleAfterTargetSelection: false,
      },
    });
    expect(result.ok).toBe(false);
    expect(result.metrics.entryContinuityCheckpoints).toBe(4);
    expect(result.dimensions.flowContinuity).toBe(80);
    expect(result.findings).toContainEqual(expect.objectContaining({
      level: "error",
      code: "entry-ui-dead-end",
    }));
  });

  it("fails each mobile geometry contract with its measured value", () => {
    const task = STUDIO_UX_TASK_FIXTURES.find(
      (candidate) => candidate.id === "mobile-native-edit",
    )!;
    const baseline = healthyObservation(task);
    const result = evaluateStudioUxTaskObservation(task, {
      ...baseline,
      mobile: {
        viewportWidth: 320,
        viewportHeight: 844,
        minimumCriticalTargetPx: 41,
        horizontalOverflowPx: 3,
        safeAreaClearancePx: -6,
        canvasAreaPx: 320 * 844 * 0.42,
        viewportAreaPx: 320 * 844,
      },
    });
    expect(result.ok).toBe(false);
    expect(result.metrics.canvasOccupancyRatio).toBeCloseTo(0.42, 5);
    expect(new Set(result.findings.map((finding) => finding.code))).toEqual(new Set([
      "mobile-target-too-small",
      "mobile-horizontal-overflow",
      "mobile-safe-area-overlap",
      "mobile-canvas-occupancy",
    ]));
  });

  it("summarizes native and upload compatibility results separately", () => {
    const observations = STUDIO_UX_TASK_FIXTURES.map(healthyObservation);
    const summary = summarizeStudioUxTaskBenchmark(
      STUDIO_UX_TASK_FIXTURES,
      observations,
    );
    expect(summary).toMatchObject({
      score: 100,
      taskCount: STUDIO_UX_TASK_FIXTURES.length,
      passedTaskCount: STUDIO_UX_TASK_FIXTURES.length,
      failedTaskCount: 0,
      nativeTaskCount: STUDIO_UX_TASK_FIXTURES.length - 1,
      compatibilityTaskCount: 1,
    });
    expect(summary.dimensions.mobileErgonomics).toBe(100);
    expect(summary.dimensions.panelFlexibility).toBe(100);
  });
});
