import { describe, expect, it } from "vitest";

import {
  encodeStudioWorkspaceInterchange,
  type StudioWorkspaceInterchangeWorkspace,
} from "./studio-workspace-interchange";
import {
  STUDIO_WORKSPACE_CURRENT_EXPORT_KEY,
  applyStudioWorkspaceInterchangePlanToState,
  createStudioWorkspaceInterchangeTargetState,
  encodeStudioWorkspaceInterchangeSelection,
  listStudioWorkspaceInterchangeExportCandidates,
  planStudioWorkspaceInterchangeForState,
  studioWorkspaceLayoutToInterchangePresentation,
} from "./studio-workspace-interchange-runtime";
import {
  DEFAULT_STUDIO_WORKSPACE_STATE,
  normalizeStudioWorkspaceLayout,
  saveStudioWorkspace,
} from "./studio-workspaces";

function importedWorkspace(
  id: string,
  name: string,
  primary: "properties" | "layers" = "layers",
): StudioWorkspaceInterchangeWorkspace {
  const layout = normalizeStudioWorkspaceLayout({
    ...DEFAULT_STUDIO_WORKSPACE_STATE.liveLayout,
    inspector: {
      ...DEFAULT_STUDIO_WORKSPACE_STATE.liveLayout.inspector,
      primary,
    },
    desktop: {
      ...DEFAULT_STUDIO_WORKSPACE_STATE.liveLayout.desktop,
      leftPanelOpen: false,
      rightPanelWidth: 360,
    },
    deviceOverrides: {},
  });
  return {
    id,
    name,
    presentation: studioWorkspaceLayoutToInterchangePresentation(layout),
  };
}

function encoded(workspaces: readonly StudioWorkspaceInterchangeWorkspace[]): string {
  const result = encodeStudioWorkspaceInterchange(workspaces);
  if (!result.ok) throw new Error(result.reason);
  return result.text;
}

describe("Studio workspace interchange runtime adapter", () => {
  it("exports the live snapshot and a saved workspace with collision-free portable names and ids", () => {
    const state = saveStudioWorkspace(
      DEFAULT_STUDIO_WORKSPACE_STATE,
      "스토리보드",
      DEFAULT_STUDIO_WORKSPACE_STATE.liveLayout,
    );
    const savedId = state.customWorkspaces[0]?.id;
    expect(savedId).toBeTruthy();
    const candidates = listStudioWorkspaceInterchangeExportCandidates(
      state,
      state.liveLayout,
    );

    expect(candidates[0]).toMatchObject({
      key: STUDIO_WORKSPACE_CURRENT_EXPORT_KEY,
      source: "current",
    });
    const result = encodeStudioWorkspaceInterchangeSelection(
      state,
      state.liveLayout,
      [STUDIO_WORKSPACE_CURRENT_EXPORT_KEY, savedId ?? ""],
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.workspaces).toHaveLength(2);
    expect(new Set(result.document.workspaces.map(({ id }) => id)).size).toBe(2);
    expect(new Set(result.document.workspaces.map(({ name }) => name)).size).toBe(2);
    expect(result.text).not.toContain("project");
    expect(result.text).not.toContain("token");
  });

  it("creates the planner target from custom workspaces and the authoritative live layout", () => {
    const state = saveStudioWorkspace(
      DEFAULT_STUDIO_WORKSPACE_STATE,
      "검수 배치",
      DEFAULT_STUDIO_WORKSPACE_STATE.liveLayout,
    );
    const liveLayout = normalizeStudioWorkspaceLayout({
      ...state.liveLayout,
      inspector: { ...state.liveLayout.inspector, primary: "layers" },
    });

    const target = createStudioWorkspaceInterchangeTargetState(state, liveLayout);

    expect(target.workspaces).toHaveLength(1);
    expect(target.livePresentation.panels.inspector.primary).toBe("layers");
    expect(target.workspaces[0]?.presentation.panels.inspector.primary).toBe(
      state.customWorkspaces[0]?.layout.inspector.primary,
    );
  });

  it("adds and applies an imported workspace without copying local device overrides", () => {
    const raw = encoded([importedWorkspace("portable-layout", "가져온 선화")]);
    const planned = planStudioWorkspaceInterchangeForState(
      DEFAULT_STUDIO_WORKSPACE_STATE,
      DEFAULT_STUDIO_WORKSPACE_STATE.liveLayout,
      raw,
      {
        action: "add-and-apply",
        applyWorkspaceId: "portable-layout",
        scopes: ["panels", "drawingPalettes", "quickAccess"],
      },
    );

    expect(planned.ok).toBe(true);
    if (!planned.ok) return;
    const next = applyStudioWorkspaceInterchangePlanToState(
      DEFAULT_STUDIO_WORKSPACE_STATE,
      DEFAULT_STUDIO_WORKSPACE_STATE.liveLayout,
      planned.plan,
    );

    expect(next.activeWorkspaceId).toBe("portable-layout");
    expect(next.liveLayout.inspector.primary).toBe("layers");
    expect(next.liveLayout.desktop.leftPanelOpen).toBe(false);
    expect(next.liveLayout.deviceOverrides).toEqual({});
  });

  it("preserves device-specific overrides when replacing a same-name saved workspace", () => {
    const existingLayout = normalizeStudioWorkspaceLayout({
      ...DEFAULT_STUDIO_WORKSPACE_STATE.liveLayout,
      deviceOverrides: {
        mobile: {
          desktop: {
            leftPanelOpen: false,
            rightPanelOpen: false,
            leftPanelWidth: 180,
            rightPanelWidth: 280,
          },
          controlSide: "left",
        },
      },
    });
    const state = saveStudioWorkspace(
      DEFAULT_STUDIO_WORKSPACE_STATE,
      "교체 대상",
      existingLayout,
    );
    const raw = encoded([importedWorkspace("external-layout", "교체 대상")]);
    const planned = planStudioWorkspaceInterchangeForState(
      state,
      state.liveLayout,
      raw,
      {
        action: "replace-same-name",
        scopes: ["panels"],
      },
    );

    expect(planned.ok).toBe(true);
    if (!planned.ok) return;
    const next = applyStudioWorkspaceInterchangePlanToState(
      state,
      state.liveLayout,
      planned.plan,
    );
    const replaced = next.customWorkspaces.find(({ name }) => name === "교체 대상");

    expect(replaced?.layout.inspector.primary).toBe("layers");
    expect(replaced?.layout.deviceOverrides).toEqual(
      state.customWorkspaces[0]?.layout.deviceOverrides,
    );
    expect(next.liveLayout).toEqual(state.liveLayout);
  });

  it("keeps legacy duplicate display names stable while planning and replacing deterministically", () => {
    let state = saveStudioWorkspace(
      DEFAULT_STUDIO_WORKSPACE_STATE,
      "중복 작업공간",
      DEFAULT_STUDIO_WORKSPACE_STATE.liveLayout,
    );
    state = saveStudioWorkspace(
      state,
      "중복 작업공간",
      state.liveLayout,
    );
    const target = createStudioWorkspaceInterchangeTargetState(state, state.liveLayout);

    expect(target.workspaces.map(({ name }) => name)).toEqual([
      "중복 작업공간",
      "중복 작업공간 2",
    ]);

    const raw = encoded([importedWorkspace("external-duplicate", "중복 작업공간")]);
    const planned = planStudioWorkspaceInterchangeForState(
      state,
      state.liveLayout,
      raw,
      { action: "replace-same-name", scopes: ["panels"] },
    );

    expect(planned.ok).toBe(true);
    if (!planned.ok) return;
    expect(planned.plan.operations[0]).toMatchObject({
      kind: "replace",
      targetWorkspaceId: state.customWorkspaces[0]?.id,
    });

    const next = applyStudioWorkspaceInterchangePlanToState(
      state,
      state.liveLayout,
      planned.plan,
    );
    expect(next.customWorkspaces.map(({ name }) => name)).toEqual([
      "중복 작업공간",
      "중복 작업공간",
    ]);
    expect(next.customWorkspaces[0]?.layout.inspector.primary).toBe("layers");
  });

  it("strips standalone Quick Access sets instead of claiming a workspace-scoped commit", () => {
    const portable = importedWorkspace("portable-with-global-set", "전역 세트 포함");
    const raw = encoded([
      {
        ...portable,
        presentation: {
          ...portable.presentation,
          quickAccess: {
            version: 1,
            sets: [{ id: "set-1", name: "공유 세트", commandIds: ["undo", "redo"] }],
            activeSetId: "set-1",
            displayMode: "tiles",
            density: "comfortable",
          },
        },
      },
    ]);
    const planned = planStudioWorkspaceInterchangeForState(
      DEFAULT_STUDIO_WORKSPACE_STATE,
      DEFAULT_STUDIO_WORKSPACE_STATE.liveLayout,
      raw,
      { action: "add", scopes: ["quickAccess"] },
    );

    expect(planned.ok).toBe(true);
    if (!planned.ok) return;
    const presentation = planned.plan.operations[0]?.workspace.presentation;
    expect(presentation?.quickAccess).toBeUndefined();
    expect(presentation?.quickActions).toBeDefined();
    expect(presentation?.commandBar).toBeDefined();
  });

  it("remaps a newly-added built-in id that the v1 codec did not yet reserve", () => {
    const raw = encoded([importedWorkspace("quick-sketch", "외부 빠른 스케치")]);
    const planned = planStudioWorkspaceInterchangeForState(
      DEFAULT_STUDIO_WORKSPACE_STATE,
      DEFAULT_STUDIO_WORKSPACE_STATE.liveLayout,
      raw,
      { action: "add" },
    );

    expect(planned.ok).toBe(true);
    if (!planned.ok) return;
    expect(planned.plan.operations[0]?.targetWorkspaceId).not.toBe("quick-sketch");
    const next = applyStudioWorkspaceInterchangePlanToState(
      DEFAULT_STUDIO_WORKSPACE_STATE,
      DEFAULT_STUDIO_WORKSPACE_STATE.liveLayout,
      planned.plan,
    );
    expect(next.customWorkspaces[0]?.id).not.toBe("quick-sketch");
    expect(next.customWorkspaces[0]?.name).toBe("외부 빠른 스케치");
  });
});
