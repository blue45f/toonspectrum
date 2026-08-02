export const STUDIO_UX_TASK_BENCHMARK_SCHEMA_VERSION = 1 as const;

export const STUDIO_UX_BENCHMARK_DIMENSIONS = [
  "discoverability",
  "pointerEfficiency",
  "keyboardPath",
  "stateFeedback",
  "flowContinuity",
  "reversibility",
  "panelFlexibility",
  "mobileErgonomics",
  "errorRecovery",
] as const;

export type StudioUxBenchmarkDimension =
  (typeof STUDIO_UX_BENCHMARK_DIMENSIONS)[number];

export type StudioUxTaskSourceKind = "native-document" | "import-compatibility";

export type StudioUxEvidenceKind =
  | "automated-browser"
  | "manual-observation"
  | "official-document-trace";

export interface StudioUxNativeDocumentFixture {
  readonly importedImageCount: number;
  readonly nativeBrushStrokeCount: number;
  readonly nativeLineObjectCount: number;
}

export interface StudioUxTaskBudget {
  readonly maxDiscoveryMs: number;
  readonly maxWrongTurns: number;
  readonly maxPointerTaps: number;
  readonly maxPointerDrags: number;
  readonly maxKeyboardChords: number;
  readonly minCanvasOccupancyRatio?: number;
}

export interface StudioUxTaskDefinition {
  readonly id: string;
  readonly title: string;
  readonly sourceKind: StudioUxTaskSourceKind;
  readonly intent: string;
  readonly fixture: StudioUxNativeDocumentFixture;
  readonly terminalState: readonly string[];
  readonly budgets: StudioUxTaskBudget;
  readonly requiredFeedback: readonly (keyof StudioUxStateFeedback)[];
  readonly requireKeyboardPath: boolean;
  readonly requireEntryContinuity: boolean;
  readonly requireUndo: boolean;
  readonly requireCancel: boolean;
  readonly requirePanelFlexibility: boolean;
  readonly requireMobileEvidence: boolean;
  readonly requireErrorRecovery: boolean;
}

export interface StudioUxDiscoveryEvidence {
  readonly elapsedMs: number;
  readonly wrongTurns: number;
  readonly labelledAtStart: boolean;
  readonly shortcutShown: boolean;
  readonly contextualHelpAvailable: boolean;
}

export interface StudioUxActionEvidence {
  /** Mouse clicks or touch taps. A drag is counted separately, never twice. */
  readonly pointerTaps: number;
  readonly pointerDrags: number;
  /** One chord, such as Shift+T, counts as one keyboard action. */
  readonly keyboardChords: number;
  readonly keyboardPathAvailable: boolean;
}

export interface StudioUxStateFeedback {
  readonly toolSelected: boolean;
  readonly targetIdentified: boolean;
  readonly previewVisible: boolean;
  readonly progressIndicated: boolean;
  readonly commitConfirmed: boolean;
  readonly errorExplained: boolean;
}

export interface StudioUxEntryContinuityEvidence {
  /** The unavailable feature explains the prerequisite instead of only disabling itself. */
  readonly prerequisiteExplained: boolean;
  /** A visible action can move the editor toward satisfying that prerequisite. */
  readonly prerequisiteCtaAvailable: boolean;
  /** Activating the CTA actually changes the relevant editor state. */
  readonly ctaChangedState: boolean;
  /** The user can select or create the required native target in the new state. */
  readonly targetSelectableAfterCta: boolean;
  /** The original feature entry remains visible or automatically reappears after selection. */
  readonly entryVisibleAfterTargetSelection: boolean;
}

export interface StudioUxReversibilityEvidence {
  readonly cancelBeforeCommit: boolean;
  readonly undoAvailable: boolean;
  readonly undoRestored: boolean;
  readonly redoAvailable: boolean;
  readonly redoRestored: boolean;
}

export interface StudioUxPanelEvidence {
  readonly measured: boolean;
  readonly resizable: boolean;
  readonly collapsible: boolean;
  readonly reopenPreservedState: boolean;
  readonly noCriticalOverlap: boolean;
}

export interface StudioUxMobileEvidence {
  readonly viewportWidth: number;
  readonly viewportHeight: number;
  readonly minimumCriticalTargetPx: number;
  readonly horizontalOverflowPx: number;
  readonly safeAreaClearancePx: number;
  readonly canvasAreaPx: number;
  readonly viewportAreaPx: number;
}

export interface StudioUxErrorRecoveryEvidence {
  readonly failureInjected: boolean;
  readonly actionableMessage: boolean;
  readonly retryAvailable: boolean;
  readonly workPreserved: boolean;
  readonly recovered: boolean;
  readonly recoveryActions: number;
}

export interface StudioUxObservationEvidence {
  readonly kind: StudioUxEvidenceKind;
  readonly observedAt: string;
  readonly sourceUrls: readonly string[];
  readonly artifactPaths: readonly string[];
  readonly notes: readonly string[];
}

export interface StudioUxTaskObservation {
  readonly schemaVersion: typeof STUDIO_UX_TASK_BENCHMARK_SCHEMA_VERSION;
  readonly productId: string;
  readonly taskId: string;
  readonly surface: "desktop" | "mobile";
  readonly completed: boolean;
  readonly fixture: StudioUxNativeDocumentFixture;
  readonly discovery: StudioUxDiscoveryEvidence;
  readonly actions: StudioUxActionEvidence;
  readonly feedback: StudioUxStateFeedback;
  readonly entryContinuity: StudioUxEntryContinuityEvidence;
  readonly reversibility: StudioUxReversibilityEvidence;
  readonly panels: StudioUxPanelEvidence;
  readonly mobile: StudioUxMobileEvidence | null;
  readonly recovery: StudioUxErrorRecoveryEvidence;
  readonly evidence: StudioUxObservationEvidence;
}

export interface StudioUxBenchmarkFinding {
  readonly level: "warning" | "error";
  readonly code:
    | "task-incomplete"
    | "fixture-import-leak"
    | "fixture-native-stroke-missing"
    | "fixture-native-line-missing"
    | "discovery-budget"
    | "wrong-turn-budget"
    | "pointer-tap-budget"
    | "pointer-drag-budget"
    | "keyboard-path-missing"
    | "keyboard-budget"
    | "state-feedback-missing"
    | "entry-ui-dead-end"
    | "cancel-missing"
    | "undo-missing"
    | "panel-flexibility-missing"
    | "mobile-evidence-missing"
    | "mobile-target-too-small"
    | "mobile-horizontal-overflow"
    | "mobile-safe-area-overlap"
    | "mobile-canvas-occupancy"
    | "error-recovery-missing"
    | "evidence-envelope-incomplete"
    | "aggregate-score";
  readonly message: string;
}

export interface StudioUxTaskScore {
  readonly ok: boolean;
  readonly score: number;
  readonly dimensions: Readonly<Partial<Record<StudioUxBenchmarkDimension, number>>>;
  readonly metrics: Readonly<{
    pointerTaps: number;
    pointerDrags: number;
    keyboardChords: number;
    discoverMs: number;
    wrongTurns: number;
    feedbackSignals: number;
    entryContinuityCheckpoints: number;
    canvasOccupancyRatio: number | null;
  }>;
  readonly findings: readonly StudioUxBenchmarkFinding[];
}

export interface StudioUxBenchmarkSummary {
  readonly score: number;
  readonly taskCount: number;
  readonly passedTaskCount: number;
  readonly failedTaskCount: number;
  readonly nativeTaskCount: number;
  readonly compatibilityTaskCount: number;
  readonly dimensions: Readonly<Partial<Record<StudioUxBenchmarkDimension, number>>>;
}

const DIMENSION_WEIGHTS: Readonly<Record<StudioUxBenchmarkDimension, number>> = {
  discoverability: 20,
  pointerEfficiency: 15,
  keyboardPath: 10,
  stateFeedback: 15,
  flowContinuity: 15,
  reversibility: 15,
  panelFlexibility: 10,
  mobileErgonomics: 10,
  errorRecovery: 5,
};

function clampScore(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

function lowerIsBetterScore(actual: number, budget: number): number {
  if (!Number.isFinite(actual) || actual < 0 || !Number.isFinite(budget) || budget < 0) {
    return 0;
  }
  if (actual <= budget) return 100;
  const tolerance = Math.max(1, budget);
  return clampScore(100 - ((actual - budget) / tolerance) * 100);
}

function ratioScore(met: number, total: number): number {
  return total <= 0 ? 100 : clampScore((met / total) * 100);
}

function average(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function roundScore(value: number): number {
  return Math.round(value * 10) / 10;
}

function enabledDimensions(
  task: StudioUxTaskDefinition,
): readonly StudioUxBenchmarkDimension[] {
  return STUDIO_UX_BENCHMARK_DIMENSIONS.filter((dimension) => {
    if (dimension === "keyboardPath") return task.requireKeyboardPath;
    if (dimension === "flowContinuity") return task.requireEntryContinuity;
    if (dimension === "panelFlexibility") return task.requirePanelFlexibility;
    if (dimension === "mobileErgonomics") return task.requireMobileEvidence;
    if (dimension === "errorRecovery") return task.requireErrorRecovery;
    return true;
  });
}

function feedbackSignalCount(feedback: StudioUxStateFeedback): number {
  return Object.values(feedback).filter(Boolean).length;
}

function mobileCanvasOccupancy(mobile: StudioUxMobileEvidence | null): number | null {
  if (!mobile || mobile.viewportAreaPx <= 0 || mobile.canvasAreaPx < 0) return null;
  return mobile.canvasAreaPx / mobile.viewportAreaPx;
}

export function evaluateStudioUxTaskObservation(
  task: StudioUxTaskDefinition,
  observation: StudioUxTaskObservation,
): StudioUxTaskScore {
  const findings: StudioUxBenchmarkFinding[] = [];
  const dimensions: Partial<Record<StudioUxBenchmarkDimension, number>> = {};

  if (!observation.completed) {
    findings.push({
      level: "error",
      code: "task-incomplete",
      message: `${task.id}: terminal state was not reached`,
    });
  }

  if (task.sourceKind === "native-document") {
    if (observation.fixture.importedImageCount > 0) {
      findings.push({
        level: "error",
        code: "fixture-import-leak",
        message: `${task.id}: native task used an imported image`,
      });
    }
    if (observation.fixture.nativeBrushStrokeCount < task.fixture.nativeBrushStrokeCount) {
      findings.push({
        level: "error",
        code: "fixture-native-stroke-missing",
        message: `${task.id}: native brush-stroke fixture is incomplete`,
      });
    }
    if (observation.fixture.nativeLineObjectCount < task.fixture.nativeLineObjectCount) {
      findings.push({
        level: "error",
        code: "fixture-native-line-missing",
        message: `${task.id}: native line-object fixture is incomplete`,
      });
    }
  }

  const discoveryScores = [
    lowerIsBetterScore(observation.discovery.elapsedMs, task.budgets.maxDiscoveryMs),
    lowerIsBetterScore(observation.discovery.wrongTurns, task.budgets.maxWrongTurns),
    observation.discovery.labelledAtStart ? 100 : 0,
    observation.discovery.contextualHelpAvailable ? 100 : 50,
  ];
  dimensions.discoverability = roundScore(average(discoveryScores));
  if (observation.discovery.elapsedMs > task.budgets.maxDiscoveryMs) {
    findings.push({
      level: "warning",
      code: "discovery-budget",
      message: `${task.id}: discovery took ${observation.discovery.elapsedMs}ms (budget ${task.budgets.maxDiscoveryMs}ms)`,
    });
  }
  if (observation.discovery.wrongTurns > task.budgets.maxWrongTurns) {
    findings.push({
      level: "warning",
      code: "wrong-turn-budget",
      message: `${task.id}: ${observation.discovery.wrongTurns} wrong turns exceeded budget ${task.budgets.maxWrongTurns}`,
    });
  }

  dimensions.pointerEfficiency = roundScore(average([
    lowerIsBetterScore(observation.actions.pointerTaps, task.budgets.maxPointerTaps),
    lowerIsBetterScore(observation.actions.pointerDrags, task.budgets.maxPointerDrags),
  ]));
  if (observation.actions.pointerTaps > task.budgets.maxPointerTaps) {
    findings.push({
      level: "warning",
      code: "pointer-tap-budget",
      message: `${task.id}: ${observation.actions.pointerTaps} taps exceeded budget ${task.budgets.maxPointerTaps}`,
    });
  }
  if (observation.actions.pointerDrags > task.budgets.maxPointerDrags) {
    findings.push({
      level: "warning",
      code: "pointer-drag-budget",
      message: `${task.id}: ${observation.actions.pointerDrags} drags exceeded budget ${task.budgets.maxPointerDrags}`,
    });
  }

  if (task.requireKeyboardPath) {
    dimensions.keyboardPath = roundScore(average([
      observation.actions.keyboardPathAvailable ? 100 : 0,
      lowerIsBetterScore(observation.actions.keyboardChords, task.budgets.maxKeyboardChords),
      observation.discovery.shortcutShown ? 100 : 0,
    ]));
    if (!observation.actions.keyboardPathAvailable) {
      findings.push({
        level: "error",
        code: "keyboard-path-missing",
        message: `${task.id}: no keyboard path was available`,
      });
    }
    if (observation.actions.keyboardChords > task.budgets.maxKeyboardChords) {
      findings.push({
        level: "warning",
        code: "keyboard-budget",
        message: `${task.id}: keyboard path used ${observation.actions.keyboardChords} chords`,
      });
    }
  }

  const requiredFeedbackMet = task.requiredFeedback.filter(
    (key) => observation.feedback[key],
  ).length;
  dimensions.stateFeedback = roundScore(
    ratioScore(requiredFeedbackMet, task.requiredFeedback.length),
  );
  if (requiredFeedbackMet < task.requiredFeedback.length) {
    const missing = task.requiredFeedback.filter((key) => !observation.feedback[key]);
    findings.push({
      level: "error",
      code: "state-feedback-missing",
      message: `${task.id}: missing feedback signals: ${missing.join(", ")}`,
    });
  }

  const continuityChecks = Object.values(observation.entryContinuity);
  if (task.requireEntryContinuity) {
    const continuityCheckpoints = continuityChecks.filter(Boolean).length;
    dimensions.flowContinuity = roundScore(
      ratioScore(continuityCheckpoints, continuityChecks.length),
    );
    if (continuityCheckpoints < continuityChecks.length) {
      findings.push({
        level: "error",
        code: "entry-ui-dead-end",
        message: `${task.id}: prerequisite CTA flow lost the feature entry after state transition or target selection`,
      });
    }
  }

  const reversibilityChecks = [
    ...(task.requireCancel ? [observation.reversibility.cancelBeforeCommit] : []),
    ...(task.requireUndo
      ? [
          observation.reversibility.undoAvailable,
          observation.reversibility.undoRestored,
          observation.reversibility.redoAvailable,
          observation.reversibility.redoRestored,
        ]
      : []),
  ];
  dimensions.reversibility = roundScore(
    ratioScore(reversibilityChecks.filter(Boolean).length, reversibilityChecks.length),
  );
  if (task.requireCancel && !observation.reversibility.cancelBeforeCommit) {
    findings.push({
      level: "error",
      code: "cancel-missing",
      message: `${task.id}: transient operation could not be cancelled`,
    });
  }
  if (
    task.requireUndo
    && (!observation.reversibility.undoAvailable
      || !observation.reversibility.undoRestored
      || !observation.reversibility.redoAvailable
      || !observation.reversibility.redoRestored)
  ) {
    findings.push({
      level: "error",
      code: "undo-missing",
      message: `${task.id}: undo/redo did not round-trip the task result`,
    });
  }

  if (task.requirePanelFlexibility) {
    const panelChecks = [
      observation.panels.measured,
      observation.panels.resizable,
      observation.panels.collapsible,
      observation.panels.reopenPreservedState,
      observation.panels.noCriticalOverlap,
    ];
    dimensions.panelFlexibility = roundScore(
      ratioScore(panelChecks.filter(Boolean).length, panelChecks.length),
    );
    if (panelChecks.some((met) => !met)) {
      findings.push({
        level: "error",
        code: "panel-flexibility-missing",
        message: `${task.id}: panel resize/collapse/reopen/overlap contract is incomplete`,
      });
    }
  }

  const occupancy = mobileCanvasOccupancy(observation.mobile);
  if (task.requireMobileEvidence) {
    const mobile = observation.mobile;
    const minimumOccupancy = task.budgets.minCanvasOccupancyRatio ?? 0.55;
    if (!mobile || occupancy === null) {
      dimensions.mobileErgonomics = 0;
      findings.push({
        level: "error",
        code: "mobile-evidence-missing",
        message: `${task.id}: mobile geometry evidence is missing`,
      });
    } else {
      const mobileChecks = [
        mobile.minimumCriticalTargetPx >= 44,
        mobile.horizontalOverflowPx <= 1,
        mobile.safeAreaClearancePx >= 0,
        occupancy >= minimumOccupancy,
      ];
      dimensions.mobileErgonomics = roundScore(
        ratioScore(mobileChecks.filter(Boolean).length, mobileChecks.length),
      );
      if (mobile.minimumCriticalTargetPx < 44) {
        findings.push({
          level: "error",
          code: "mobile-target-too-small",
          message: `${task.id}: minimum touch target was ${mobile.minimumCriticalTargetPx}px`,
        });
      }
      if (mobile.horizontalOverflowPx > 1) {
        findings.push({
          level: "error",
          code: "mobile-horizontal-overflow",
          message: `${task.id}: horizontal overflow was ${mobile.horizontalOverflowPx}px`,
        });
      }
      if (mobile.safeAreaClearancePx < 0) {
        findings.push({
          level: "error",
          code: "mobile-safe-area-overlap",
          message: `${task.id}: controls overlapped the safe area by ${Math.abs(mobile.safeAreaClearancePx)}px`,
        });
      }
      if (occupancy < minimumOccupancy) {
        findings.push({
          level: "error",
          code: "mobile-canvas-occupancy",
          message: `${task.id}: canvas occupancy ${(occupancy * 100).toFixed(1)}% was below ${(minimumOccupancy * 100).toFixed(1)}%`,
        });
      }
    }
  }

  if (task.requireErrorRecovery) {
    const recoveryChecks = [
      observation.recovery.failureInjected,
      observation.recovery.actionableMessage,
      observation.recovery.retryAvailable,
      observation.recovery.workPreserved,
      observation.recovery.recovered,
    ];
    dimensions.errorRecovery = roundScore(
      ratioScore(recoveryChecks.filter(Boolean).length, recoveryChecks.length),
    );
    if (recoveryChecks.some((met) => !met)) {
      findings.push({
        level: "error",
        code: "error-recovery-missing",
        message: `${task.id}: injected failure did not recover with work preserved`,
      });
    }
  }

  const evidenceTimestamp = Date.parse(observation.evidence.observedAt);
  const evidenceComplete =
    Number.isFinite(evidenceTimestamp)
    && (observation.evidence.kind !== "official-document-trace"
      || observation.evidence.sourceUrls.length > 0)
    && (observation.evidence.kind !== "automated-browser"
      || observation.evidence.artifactPaths.length > 0);
  if (!evidenceComplete) {
    findings.push({
      level: "error",
      code: "evidence-envelope-incomplete",
      message: `${task.id}: evidence timestamp, source URL, or browser artifact is missing`,
    });
  }

  const activeDimensions = enabledDimensions(task);
  const weightedScore = activeDimensions.reduce((sum, dimension) => {
    return sum + (dimensions[dimension] ?? 0) * DIMENSION_WEIGHTS[dimension];
  }, 0);
  const activeWeight = activeDimensions.reduce(
    (sum, dimension) => sum + DIMENSION_WEIGHTS[dimension],
    0,
  );
  const score = roundScore(activeWeight > 0 ? weightedScore / activeWeight : 0);
  if (score < 70) {
    findings.push({
      level: "error",
      code: "aggregate-score",
      message: `${task.id}: weighted UX score ${score} is below 70`,
    });
  }

  return {
    ok: findings.every((finding) => finding.level !== "error"),
    score,
    dimensions,
    metrics: {
      pointerTaps: observation.actions.pointerTaps,
      pointerDrags: observation.actions.pointerDrags,
      keyboardChords: observation.actions.keyboardChords,
      discoverMs: observation.discovery.elapsedMs,
      wrongTurns: observation.discovery.wrongTurns,
      feedbackSignals: feedbackSignalCount(observation.feedback),
      entryContinuityCheckpoints: continuityChecks.filter(Boolean).length,
      canvasOccupancyRatio: occupancy,
    },
    findings,
  };
}

export function summarizeStudioUxTaskBenchmark(
  tasks: readonly StudioUxTaskDefinition[],
  observations: readonly StudioUxTaskObservation[],
): StudioUxBenchmarkSummary {
  const taskById = new Map(tasks.map((task) => [task.id, task]));
  const evaluated = observations.map((observation) => {
    const task = taskById.get(observation.taskId);
    if (!task) throw new Error(`Unknown UX benchmark task: ${observation.taskId}`);
    return { task, result: evaluateStudioUxTaskObservation(task, observation) };
  });
  const dimensionValues = new Map<StudioUxBenchmarkDimension, number[]>();
  for (const { result } of evaluated) {
    for (const dimension of STUDIO_UX_BENCHMARK_DIMENSIONS) {
      const value = result.dimensions[dimension];
      if (value === undefined) continue;
      const values = dimensionValues.get(dimension) ?? [];
      values.push(value);
      dimensionValues.set(dimension, values);
    }
  }

  const dimensions: Partial<Record<StudioUxBenchmarkDimension, number>> = {};
  for (const [dimension, values] of dimensionValues) {
    dimensions[dimension] = roundScore(average(values));
  }
  return {
    score: roundScore(average(evaluated.map(({ result }) => result.score))),
    taskCount: evaluated.length,
    passedTaskCount: evaluated.filter(({ result }) => result.ok).length,
    failedTaskCount: evaluated.filter(({ result }) => !result.ok).length,
    nativeTaskCount: evaluated.filter(({ task }) => task.sourceKind === "native-document").length,
    compatibilityTaskCount: evaluated.filter(
      ({ task }) => task.sourceKind === "import-compatibility",
    ).length,
    dimensions,
  };
}
