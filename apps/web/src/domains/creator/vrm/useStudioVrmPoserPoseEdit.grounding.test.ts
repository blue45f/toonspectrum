import { describe, expect, it, vi } from "vitest";

import { applyPoserVisualState } from "./studio-vrm-poser-utils";
import { commitStudioVrmFullStateHistoryTransaction } from "./studio-vrm-state-history";
import { useStudioVrmPoserPoseEdit } from "./useStudioVrmPoserPoseEdit";

import type { StudioVrmPoserHost } from "./StudioVrmPoserHost";

vi.mock("react", async (importOriginal) => ({ ...await importOriginal<typeof import("react")>(), useEffect: vi.fn() }));
vi.mock("./studio-vrm-poser-utils", async (importOriginal) => ({
  ...await importOriginal<typeof import("./studio-vrm-poser-utils")>(),
  serializeFullVrmState: (value: unknown) => value,
  applyPoserVisualState: vi.fn(),
}));
vi.mock("./studio-vrm-persistent-ik-signature", () => ({ buildStudioVrmPersistentIkSignature: () => "candidate" }));
vi.mock("./studio-vrm-state-history", () => ({
  commitStudioVrmFullStateHistoryTransaction: vi.fn((_history, before, after) => ({ entries: [before, after], index: 1, generation: 1 })),
}));

function fixture() {
  vi.clearAllMocks();
  const before = { yOffset: 0.4, poseTranslations: {}, ikConstraints: [], avatarForge: null };
  const host = { activeModelId: "grounding", customBones: {}, fingerEdits: {}, customYOffset: 0.4,
    poseTranslations: {}, lockedPoseBones: [], vrmPropItems: [], bodyScale: 1, jointLimitsEnabled: false,
    vrmRef: { current: { humanoid: { getNormalizedBoneNode: () => ({}) } } },
    pendingPersistentIkCommandRef: { current: null }, jointIkTransactionRef: { current: null },
    persistentIkResolvedSignatureRef: { current: null }, persistentIkCaptureIsReady: () => true,
    fullStateHistoryRef: { current: { entries: [before], index: 0, generation: 0 } }, captureFullState: () => before,
    setCanUndo: vi.fn(), setCanRedo: vi.fn(), setActivePoseId: vi.fn(), setCustomBones: vi.fn(),
    setFingerEdits: vi.fn(), setCustomYOffset: vi.fn(), setJointHandleStatus: vi.fn(),
  } as unknown as StudioVrmPoserHost;
  useStudioVrmPoserPoseEdit(host);
  return { host, before };
}

describe("grounding root state and history wiring", () => {
  it.each([0.1, undefined])("commits the same root height to history, state and renderer (%s)", (yOffset) => {
    const { host, before } = fixture();
    expect(host.handlePhotoPoseApply({ bones: { hips: [0.1, 0, 0] }, fingerEdits: {}, detectedHandSides: [], yOffset })).toBe(true);
    const expected = yOffset ?? before.yOffset;
    expect(commitStudioVrmFullStateHistoryTransaction).toHaveBeenCalledWith(expect.anything(), before, expect.objectContaining({ yOffset: expected }), "grounding");
    expect(host.setCustomYOffset).toHaveBeenCalledWith(expected);
    expect(applyPoserVisualState).toHaveBeenCalledWith(host.vrmRef.current, expect.objectContaining({ yOffset: expected }));
  });

  it.each([NaN, Infinity, -Infinity])("rejects a non-finite root height before any mutation (%s)", (yOffset) => {
    const { host } = fixture();
    expect(host.handlePhotoPoseApply({ bones: { hips: [0.1, 0, 0] }, fingerEdits: {}, detectedHandSides: [], yOffset })).toBe(false);
    expect(commitStudioVrmFullStateHistoryTransaction).not.toHaveBeenCalled();
    expect(host.setCustomYOffset).not.toHaveBeenCalled();
    expect(applyPoserVisualState).not.toHaveBeenCalled();
  });
});
