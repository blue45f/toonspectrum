// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { Group } from "three";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useCharacterShaperBinding } from "../../character-shaper/useCharacterShaperBinding";
import { useCharacterPlatformWorkbench } from "./use-character-platform-workbench";

import type { StudioVrmPoserHost } from "../../vrm/StudioVrmPoserHost";

vi.mock("../../studio-local-database-runtime", () => ({
  acquireStudioLocalDatabase: async () => ({ asAsyncKeyValueStore: () => ({ get: async () => null, set: async () => {}, delete: async () => {} }) }),
}));

afterEach(cleanup);

describe("workbench grounding handoff", () => {
  it.each([0.3, -0.2])("passes the absolute root height for feet at %s through the host command", async (footY) => {
    const apply = vi.fn(() => true);
    const host = { activeModelId: "grounding-test", status: "ready", libraryItems: [], savedFullStates: {}, customColors: {},
      customBones: { hips: { rotation: [0.1, 0, 0] } }, customYOffset: 0.4, handlePhotoPoseApply: apply,
      vrm: { scene: new Group(), humanoid: { getNormalizedBoneNode: () => ({ getWorldPosition: (target: { set: (x: number, y: number, z: number) => unknown }) => target.set(0, footY, 0) }) } },
    } as unknown as StudioVrmPoserHost;
    const hook = renderHook(() => useCharacterPlatformWorkbench(host, useCharacterShaperBinding(host)));
    await waitFor(() => expect(hook.result.current.canonicalError).toBeNull());
    act(() => { expect(hook.result.current.stabilizeCurrentPose()).toBe(true); });
    expect(apply).toHaveBeenCalledOnce();
    expect(apply.mock.calls[0]).toEqual([expect.objectContaining({ yOffset: 0.4 - footY, bones: expect.objectContaining({ hips: expect.any(Array) }) })]);
    expect(hook.result.current.notice).toContain("적용");
    hook.unmount();
  });

  it("does not report success when the guarded host rejects the pose", () => {
    const host = { activeModelId: "grounding-blocked", status: "ready", libraryItems: [], savedFullStates: {}, customColors: {},
      customBones: { hips: [0, 0, 0] }, handlePhotoPoseApply: vi.fn(() => false),
    } as unknown as StudioVrmPoserHost;
    const hook = renderHook(() => useCharacterPlatformWorkbench(host, useCharacterShaperBinding(host)));
    act(() => { expect(hook.result.current.stabilizeCurrentPose()).toBe(false); });
    expect(hook.result.current.notice).toContain("적용할 수 없습니다");
  });
});
