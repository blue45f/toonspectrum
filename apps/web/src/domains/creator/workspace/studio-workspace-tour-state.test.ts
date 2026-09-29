// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import {
  WORKSPACE_TOUR_STEPS,
  createWorkspaceTourState,
  readWorkspaceTourCompleted,
  workspaceTourReducer,
  workspaceTourStep,
  workspaceTourTargetSelector,
  writeWorkspaceTourCompleted,
} from "./studio-workspace-tour-state";

function throwingStorage(): Pick<Storage, "getItem"> {
  return { getItem: () => { throw new Error("denied"); } };
}

describe("studio workspace spotlight tour state machine", () => {
  it("starts pending for first-time visitors and done for returning visitors", () => {
    expect(createWorkspaceTourState(false)).toEqual({ status: "pending", stepIndex: 0 });
    expect(createWorkspaceTourState(true)).toEqual({ status: "done", stepIndex: 0 });
  });

  it("walks 이어하기 → 빠른 작업 → 도구 메뉴 in order, then completes", () => {
    let state = createWorkspaceTourState(false);
    state = workspaceTourReducer(state, { type: "start" });
    expect(state).toEqual({ status: "active", stepIndex: 0 });
    expect(workspaceTourStep(state)).toBe("continue");

    state = workspaceTourReducer(state, { type: "next" });
    expect(workspaceTourStep(state)).toBe("quick-actions");
    state = workspaceTourReducer(state, { type: "back" });
    expect(workspaceTourStep(state)).toBe("continue");
    state = workspaceTourReducer(state, { type: "next" });
    state = workspaceTourReducer(state, { type: "next" });
    expect(workspaceTourStep(state)).toBe("tools");
    expect(WORKSPACE_TOUR_STEPS).toHaveLength(3);

    state = workspaceTourReducer(state, { type: "next" });
    expect(state.status).toBe("done");
  });

  it("treats skip as done without touching other state", () => {
    const active = { status: "active", stepIndex: 1 } as const;
    expect(workspaceTourReducer(active, { type: "skip" })).toEqual({ status: "done", stepIndex: 1 });
  });

  it("ignores navigation actions once done or before start", () => {
    const done = { status: "done", stepIndex: 0 } as const;
    expect(workspaceTourReducer(done, { type: "next" })).toBe(done);
    const pending = { status: "pending", stepIndex: 0 } as const;
    expect(workspaceTourReducer(pending, { type: "next" })).toBe(pending);
    expect(workspaceTourReducer(pending, { type: "back" })).toBe(pending);
  });

  it("keeps back() on the first step", () => {
    const first = workspaceTourReducer(createWorkspaceTourState(false), { type: "start" });
    expect(workspaceTourReducer(first, { type: "back" })).toEqual({ status: "active", stepIndex: 0 });
  });

  it("maps steps to data-tour-target selectors", () => {
    expect(workspaceTourTargetSelector("continue")).toBe('[data-tour-target="continue"]');
    expect(workspaceTourTargetSelector("quick-actions")).toBe('[data-tour-target="quick-actions"]');
    expect(workspaceTourTargetSelector("tools")).toBe('[data-tour-target="tools"]');
  });

  it("reads the completion flag tolerantly", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
    };
    expect(readWorkspaceTourCompleted(storage)).toBe(false);
    writeWorkspaceTourCompleted(storage);
    expect(readWorkspaceTourCompleted(storage)).toBe(true);
    values.set("toonstudio:workspace-tour:v1:home", "TRUE");
    expect(readWorkspaceTourCompleted(storage)).toBe(true);
    expect(readWorkspaceTourCompleted(null)).toBe(false);
    expect(readWorkspaceTourCompleted(throwingStorage())).toBe(false);
  });

  it("never throws when persisting the completion flag", () => {
    expect(() => writeWorkspaceTourCompleted(null)).not.toThrow();
    expect(() => writeWorkspaceTourCompleted({
      setItem: () => { throw new Error("denied"); },
    })).not.toThrow();
  });
});
