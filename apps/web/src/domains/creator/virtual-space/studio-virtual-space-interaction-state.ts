export type StudioSpatialInteractionPhase =
  | "idle"
  | "nearby"
  | "choosing"
  | "checking-authority"
  | "confirming"
  | "running"
  | "completed"
  | "failed";

export interface StudioSpatialInteractionState {
  readonly phase: StudioSpatialInteractionPhase;
  readonly interactionId: string | null;
  readonly actionId: string | null;
  readonly error: string | null;
  readonly revision: number;
}

export type StudioSpatialInteractionEvent =
  | { readonly type: "nearby"; readonly interactionId: string }
  | { readonly type: "leave" }
  | { readonly type: "choose"; readonly interactionId: string }
  | { readonly type: "select-action"; readonly actionId: string; readonly authority: boolean }
  | { readonly type: "confirm" }
  | { readonly type: "run" }
  | { readonly type: "complete" }
  | { readonly type: "fail"; readonly error: string }
  | { readonly type: "close" };
const TOKEN = /^[a-z0-9][a-z0-9:_-]{0,127}$/iu;

export const EMPTY_STUDIO_SPATIAL_INTERACTION_STATE: StudioSpatialInteractionState = Object.freeze({
  phase: "idle",
  interactionId: null,
  actionId: null,
  error: null,
  revision: 0,
});

function cleanToken(value: string): string | null {
  return TOKEN.test(value) ? value : null;
}

function next(
  current: StudioSpatialInteractionState,
  patch: Partial<Omit<StudioSpatialInteractionState, "revision">>,
): StudioSpatialInteractionState {
  return Object.freeze({
    ...current,
    ...patch,
    revision: current.revision + 1,
  });
}

export function reduceStudioSpatialInteraction(
  current: StudioSpatialInteractionState,
  event: StudioSpatialInteractionEvent,
): StudioSpatialInteractionState {
  if (event.type === "nearby") {
    const interactionId = cleanToken(event.interactionId);
    if (!interactionId || current.phase === "choosing" || current.phase === "running") return current;
    return next(current, { phase: "nearby", interactionId, actionId: null, error: null });
  }
  if (event.type === "leave") {
    if (["choosing", "checking-authority", "confirming", "running"].includes(current.phase)) return current;
    return next(current, { phase: "idle", interactionId: null, actionId: null, error: null });
  }
  if (event.type === "choose") {
    const interactionId = cleanToken(event.interactionId);
    return interactionId
      ? next(current, { phase: "choosing", interactionId, actionId: null, error: null })
      : current;
  }
  if (event.type === "select-action") {
    const actionId = cleanToken(event.actionId);
    if (!actionId || current.phase !== "choosing") return current;
    return next(current, {
      phase: event.authority ? "checking-authority" : "running",
      actionId,
      error: null,
    });
  }
  if (event.type === "confirm") {
    return current.phase === "checking-authority" ? next(current, { phase: "confirming" }) : current;
  }
  if (event.type === "run") {
    return ["checking-authority", "confirming"].includes(current.phase)
      ? next(current, { phase: "running" }) : current;
  }
  if (event.type === "complete") {
    return current.phase === "running" ? next(current, { phase: "completed", error: null }) : current;
  }
  if (event.type === "fail") {
    const error = event.error.normalize("NFC").replace(/[\p{Cc}\p{Cf}]/gu, " ").trim().slice(0, 160);
    return next(current, { phase: "failed", error: error || "interaction-failed" });
  }
  if (event.type === "close") {
    return next(current, { phase: "idle", interactionId: null, actionId: null, error: null });
  }
  return current;
}

export function studioSpatialInteractionBusy(state: StudioSpatialInteractionState): boolean {
  return ["checking-authority", "confirming", "running"].includes(state.phase);
}
