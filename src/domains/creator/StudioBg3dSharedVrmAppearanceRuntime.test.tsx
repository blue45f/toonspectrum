// @vitest-environment jsdom

import { act, cleanup, render } from "@testing-library/react";
import * as THREE from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createStudioShared3dSceneSession } from "./studio-shared-3d-scene-bridge";
import { DEFAULT_VRM_PROP_RIG_METRICS } from "./studio-vrm-prop-rig";
import { createPropInstance, serializeVrmProps } from "./studio-vrm-props";
import {
  createStudioVrmSceneDocument,
  type StudioVrmCanonicalData,
} from "./studio-vrm-scene-document";
import {
  FALLBACK_WARDROBE_METRICS,
  createWardrobeEquip,
  serializeWardrobe,
} from "./studio-vrm-wardrobe";
import { StudioBg3dSharedVrmAppearanceRuntime } from
  "./StudioBg3dSharedVrmAppearanceRuntime";

import type { StudioShared3dCharacterSource } from "./studio-shared-3d-scene-bridge";

const runtimeMocks = vi.hoisted(() => ({
  applyBase: vi.fn(() => true),
  applyCostume: vi.fn(),
  commitCallbacks: [] as Array<((frame: number) => void) | null>,
  invalidate: vi.fn(),
  propCallbacks: new Map<string, (
    uid: string,
    propId: string,
    status: "ready" | "unavailable" | "detached",
  ) => void>(),
  wardrobeCallbacks: new Map<string, (
    slot: string,
    itemId: string,
    status: "ready" | "unavailable" | "detached",
  ) => void>(),
  propStatus: "ready" as "ready" | "unavailable",
  wardrobeStatus: "ready" as "ready" | "unavailable",
}));

vi.mock("@react-three/fiber", () => ({
  useThree: (selector: (state: { invalidate: typeof runtimeMocks.invalidate }) => unknown) =>
    selector({ invalidate: runtimeMocks.invalidate }),
}));

vi.mock("./studio-bg3d-shared-vrm-runtime", () => ({
  applyStudioBg3dLinkedCharacterState: runtimeMocks.applyBase,
}));

vi.mock("./studio-vrm-costume-runtime", () => ({
  applyStudioVrmCostumeState: runtimeMocks.applyCostume,
}));

vi.mock("./StudioVrmWardrobePropsProjection", async () => {
  const { useLayoutEffect } = await import("react");
  return {
    StudioVrmPropAttachment: (props: {
      instance: { uid: string; propId: string };
      onAttachmentStatus?: (
        uid: string,
        propId: string,
        status: "ready" | "unavailable" | "detached",
      ) => void;
    }) => {
      const { instance, onAttachmentStatus } = props;
      useLayoutEffect(() => {
        if (onAttachmentStatus) {
          runtimeMocks.propCallbacks.set(instance.uid, onAttachmentStatus);
        }
        onAttachmentStatus?.(
          instance.uid,
          instance.propId,
          runtimeMocks.propStatus,
        );
        return () => {
          if (runtimeMocks.propCallbacks.get(instance.uid) === onAttachmentStatus) {
            runtimeMocks.propCallbacks.delete(instance.uid);
          }
          onAttachmentStatus?.(
            instance.uid,
            instance.propId,
            "detached",
          );
        };
      }, [instance.propId, instance.uid, onAttachmentStatus]);
      return null;
    },
    StudioVrmWardrobeAttachment: (props: {
      slot: string;
      equip: { itemId: string };
      onAttachmentStatus?: (
        slot: string,
        itemId: string,
        status: "ready" | "unavailable" | "detached",
      ) => void;
    }) => {
      const { equip, onAttachmentStatus, slot } = props;
      useLayoutEffect(() => {
        if (onAttachmentStatus) {
          runtimeMocks.wardrobeCallbacks.set(slot, onAttachmentStatus);
        }
        onAttachmentStatus?.(
          slot,
          equip.itemId,
          runtimeMocks.wardrobeStatus,
        );
        return () => {
          if (runtimeMocks.wardrobeCallbacks.get(slot) === onAttachmentStatus) {
            runtimeMocks.wardrobeCallbacks.delete(slot);
          }
          onAttachmentStatus?.(
            slot,
            equip.itemId,
            "detached",
          );
        };
      }, [equip.itemId, onAttachmentStatus, slot]);
      return null;
    },
    StudioVrmRuntimeCommit: (props: { onCommitFrame?: (frame: number) => void }) => {
      const callbackIndex = runtimeMocks.commitCallbacks.length;
      useLayoutEffect(() => {
        runtimeMocks.commitCallbacks[callbackIndex] = props.onCommitFrame ?? null;
        return () => {
          runtimeMocks.commitCallbacks[callbackIndex] = null;
        };
      }, [callbackIndex, props.onCommitFrame]);
      return null;
    },
  };
});

function supportedSource(positionX = 0): StudioShared3dCharacterSource {
  const scene = createStudioVrmSceneDocument();
  const wardrobe = serializeWardrobe({ top: createWardrobeEquip("shirt")! })!;
  const props = serializeVrmProps([createPropInstance("mug", "shared-mug")!])!;
  const projectedScene = {
    ...scene,
    appearance: {
      ...scene.appearance,
      wardrobe: wardrobe as unknown as StudioVrmCanonicalData,
    },
    props: props as unknown as StudioVrmCanonicalData,
  };
  return createStudioShared3dSceneSession([{
    elementId: "character-a",
    scene: projectedScene,
    stageTransform: { position: [positionX, 0, 0], rotationY: 0 },
  }]).characters[0]!;
}

function renderRuntime(
  source: StudioShared3dCharacterSource,
  onStatus = vi.fn(),
) {
  const vrm = {
    scene: new THREE.Group(),
    update: vi.fn(),
  } as never;
  const costumeMeshes = [{
    key: "baked-shirt",
    label: "Baked shirt",
    slot: "tops",
    mesh: new THREE.Mesh(),
  }] as never;
  const result = render(
    <StudioBg3dSharedVrmAppearanceRuntime
      vrm={vrm}
      source={source}
      wardrobeMetrics={FALLBACK_WARDROBE_METRICS}
      propRigMetrics={DEFAULT_VRM_PROP_RIG_METRICS}
      costumeMeshes={costumeMeshes}
      onStatus={onStatus}
    />,
  );
  return { ...result, onStatus };
}

function latestCommitCallback(): (frame: number) => void {
  const callback = [...runtimeMocks.commitCallbacks].reverse().find(Boolean);
  if (!callback) throw new Error("expected mounted runtime commit callback");
  return callback;
}

describe("Shared Stage linked VRM appearance runtime", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    runtimeMocks.commitCallbacks.length = 0;
    runtimeMocks.propCallbacks.clear();
    runtimeMocks.wardrobeCallbacks.clear();
    runtimeMocks.propStatus = "ready";
    runtimeMocks.wardrobeStatus = "ready";
  });

  afterEach(() => cleanup());

  it("requires attachments, a runtime commit, and a strictly later demand frame before ready", () => {
    const { onStatus } = renderRuntime(supportedSource());
    const commit = latestCommitCallback();

    expect(onStatus.mock.calls.map((call) => call[1])).toContain("loading");
    expect(onStatus.mock.calls.map((call) => call[1])).not.toContain("ready");

    act(() => commit(0));
    expect(onStatus.mock.calls.map((call) => call[1])).not.toContain("ready");
    expect(runtimeMocks.invalidate).toHaveBeenCalled();
    expect(runtimeMocks.applyCostume).toHaveBeenLastCalledWith(
      expect.any(Array),
      expect.objectContaining({ hidden: ["baked-shirt"] }),
    );

    act(() => commit(1));
    expect(onStatus.mock.calls.at(-1)?.[1]).toBe("ready");
  });

  it("keeps the authored costume visible and fails closed when an attachment is unavailable", () => {
    runtimeMocks.propStatus = "unavailable";
    const { onStatus } = renderRuntime(supportedSource());

    act(() => latestCommitCallback()(0));

    expect(onStatus.mock.calls.at(-1)?.[1]).toBe("unavailable");
    expect(runtimeMocks.applyCostume).toHaveBeenLastCalledWith(
      expect.any(Array),
      expect.objectContaining({ hidden: [] }),
    );
    expect(runtimeMocks.propCallbacks).toHaveLength(0);
    expect(runtimeMocks.wardrobeCallbacks).toHaveLength(0);
  });

  it("revokes the generation when secondary grip becomes unavailable before post-commit", () => {
    const { onStatus } = renderRuntime(supportedSource());
    const commit = latestCommitCallback();

    act(() => commit(0));
    expect(onStatus.mock.calls.map((call) => call[1])).not.toContain("ready");

    act(() => {
      runtimeMocks.propCallbacks.get("shared-mug")?.(
        "shared-mug",
        "mug",
        "unavailable",
      );
    });
    act(() => commit(1));

    expect(onStatus.mock.calls.at(-1)?.[1]).toBe("unavailable");
    expect(onStatus.mock.calls.filter((call) => call[1] === "ready")).toHaveLength(0);
    expect(runtimeMocks.applyCostume).toHaveBeenLastCalledWith(
      expect.any(Array),
      expect.objectContaining({ hidden: [] }),
    );
    expect(runtimeMocks.propCallbacks).toHaveLength(0);
    expect(runtimeMocks.wardrobeCallbacks).toHaveLength(0);
  });

  it("revokes an already-ready generation when an attachment later fails", () => {
    const { onStatus } = renderRuntime(supportedSource());
    const commit = latestCommitCallback();

    act(() => commit(0));
    act(() => commit(1));
    expect(onStatus.mock.calls.at(-1)?.[1]).toBe("ready");

    act(() => {
      runtimeMocks.propCallbacks.get("shared-mug")?.(
        "shared-mug",
        "mug",
        "unavailable",
      );
    });
    act(() => commit(2));

    expect(onStatus.mock.calls.at(-1)?.[1]).toBe("unavailable");
    expect(runtimeMocks.applyCostume).toHaveBeenLastCalledWith(
      expect.any(Array),
      expect.objectContaining({ hidden: [] }),
    );
    expect(runtimeMocks.propCallbacks).toHaveLength(0);
    expect(runtimeMocks.wardrobeCallbacks).toHaveLength(0);
  });

  it("detects a received attachment that detaches before the later frame", () => {
    const { onStatus } = renderRuntime(supportedSource());
    const commit = latestCommitCallback();

    act(() => commit(0));
    act(() => {
      runtimeMocks.propCallbacks.get("shared-mug")?.(
        "shared-mug",
        "mug",
        "detached",
      );
    });
    act(() => commit(1));

    expect(onStatus.mock.calls.at(-1)?.[1]).toBe("unavailable");
    expect(onStatus.mock.calls.filter((call) => call[1] === "ready")).toHaveLength(0);
    expect(runtimeMocks.propCallbacks).toHaveLength(0);
    expect(runtimeMocks.wardrobeCallbacks).toHaveLength(0);
  });

  it("fails closed when a received prop uid is rebound to a different catalog item", () => {
    const { onStatus } = renderRuntime(supportedSource());
    const commit = latestCommitCallback();

    act(() => commit(0));
    act(() => {
      runtimeMocks.propCallbacks.get("shared-mug")?.(
        "shared-mug",
        "smartphone",
        "ready",
      );
      commit(1);
    });

    expect(onStatus.mock.calls.at(-1)?.[1]).toBe("unavailable");
    expect(onStatus.mock.calls.filter((call) => call[1] === "ready")).toHaveLength(0);
    expect(runtimeMocks.propCallbacks).toHaveLength(0);
    expect(runtimeMocks.wardrobeCallbacks).toHaveLength(0);
  });

  it("keeps a failed generation quarantined when a late callback reports ready", () => {
    runtimeMocks.propStatus = "unavailable";
    const { onStatus } = renderRuntime(supportedSource());
    const commit = latestCommitCallback();
    const stalePropCallback = runtimeMocks.propCallbacks.get("shared-mug");

    act(() => commit(0));
    const callsAfterFailure = onStatus.mock.calls.length;
    act(() => {
      stalePropCallback?.("shared-mug", "mug", "ready");
      commit(1);
    });

    expect(onStatus).toHaveBeenCalledTimes(callsAfterFailure);
    expect(onStatus.mock.calls.at(-1)?.[1]).toBe("unavailable");
    expect(runtimeMocks.propCallbacks).toHaveLength(0);
    expect(runtimeMocks.wardrobeCallbacks).toHaveLength(0);
  });

  it("deactivates an old generation callback after placement changes", () => {
    const firstSource = supportedSource(0);
    const onStatus = vi.fn();
    const rendered = renderRuntime(firstSource, onStatus);
    const oldCommit = latestCommitCallback();

    rendered.rerender(
      <StudioBg3dSharedVrmAppearanceRuntime
        vrm={{ scene: new THREE.Group(), update: vi.fn() } as never}
        source={supportedSource(1)}
        wardrobeMetrics={FALLBACK_WARDROBE_METRICS}
        propRigMetrics={DEFAULT_VRM_PROP_RIG_METRICS}
        costumeMeshes={[]}
        onStatus={onStatus}
      />,
    );
    const callsBeforeStaleFrame = onStatus.mock.calls.length;

    act(() => {
      oldCommit(0);
      oldCommit(1);
    });

    expect(onStatus).toHaveBeenCalledTimes(callsBeforeStaleFrame);
  });
});
