/**
 * Spotlight onboarding tour state machine for the studio workspace home.
 * Pure and storage-agnostic so it stays unit-testable; the component wires
 * it to localStorage and the DOM.
 */

export const WORKSPACE_TOUR_STORAGE_KEY = "toonstudio:workspace-tour:v1:home";

export const WORKSPACE_TOUR_STEPS = ["continue", "quick-actions", "tools"] as const;
export type WorkspaceTourStep = (typeof WORKSPACE_TOUR_STEPS)[number];

export type WorkspaceTourStatus = "pending" | "active" | "done";

export interface WorkspaceTourState {
  readonly status: WorkspaceTourStatus;
  readonly stepIndex: number;
}

export type WorkspaceTourAction =
  | { readonly type: "start" }
  | { readonly type: "next" }
  | { readonly type: "back" }
  | { readonly type: "skip" };

type TourStorageReader = Pick<Storage, "getItem"> | null | undefined;
type TourStorageWriter = Pick<Storage, "setItem"> | null | undefined;

const COMPLETED_VALUES = new Set(["1", "true", "done"]);

/** True when the user already finished or skipped the tour. Storage failures mean "not done". */
export function readWorkspaceTourCompleted(storage: TourStorageReader): boolean {
  try {
    const value = storage?.getItem(WORKSPACE_TOUR_STORAGE_KEY);
    return typeof value === "string" && COMPLETED_VALUES.has(value.trim().toLowerCase());
  } catch {
    return false;
  }
}

/** Persists the "tour completed" flag. Never throws: a failed write just shows the tour again. */
export function writeWorkspaceTourCompleted(storage: TourStorageWriter): void {
  try {
    storage?.setItem(WORKSPACE_TOUR_STORAGE_KEY, "done");
  } catch {
    /* storage unavailable: the tour may reappear once, which is the safe fallback */
  }
}

export function createWorkspaceTourState(completed: boolean): WorkspaceTourState {
  return completed ? { status: "done", stepIndex: 0 } : { status: "pending", stepIndex: 0 };
}

export function workspaceTourReducer(
  state: WorkspaceTourState,
  action: WorkspaceTourAction,
): WorkspaceTourState {
  if (state.status === "done") return state;
  switch (action.type) {
    case "start":
      return state.status === "pending" ? { status: "active", stepIndex: 0 } : state;
    case "next":
      if (state.status !== "active") return state;
      return state.stepIndex + 1 >= WORKSPACE_TOUR_STEPS.length
        ? { status: "done", stepIndex: state.stepIndex }
        : { status: "active", stepIndex: state.stepIndex + 1 };
    case "back":
      return state.status !== "active"
        ? state
        : { status: "active", stepIndex: Math.max(0, state.stepIndex - 1) };
    case "skip":
      return { status: "done", stepIndex: state.stepIndex };
  }
}

export function workspaceTourStep(state: WorkspaceTourState): WorkspaceTourStep {
  return WORKSPACE_TOUR_STEPS[state.stepIndex] ?? WORKSPACE_TOUR_STEPS[0];
}

export function workspaceTourTargetSelector(step: WorkspaceTourStep): string {
  return `[data-tour-target="${step}"]`;
}
