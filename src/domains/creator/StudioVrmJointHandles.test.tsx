// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import * as THREE from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createStudioVrmJointDragPlane,
  projectStudioVrmJointPointerToPlane,
  resolveStudioVrmJointDragOutcome,
  resolveStudioVrmJointNodeBindings,
  STUDIO_VRM_JOINT_HANDLE_DEFINITIONS,
  StudioVrmJointHandles,
} from "./StudioVrmJointHandles";

import type { VRM, VRMHumanBoneName } from "@pixiv/three-vrm";
import type { ReactNode } from "react";

const fiberMock = vi.hoisted(() => ({
  frameCallbacks: [] as Array<() => void>,
  state: null as unknown,
}));

vi.mock("@react-three/fiber", () => ({
  useFrame: (callback: () => void) => {
    fiberMock.frameCallbacks.push(callback);
  },
  useThree: (selector: (state: unknown) => unknown) => selector(fiberMock.state),
}));

vi.mock("@react-three/drei/web/Html.js", () => ({
  Html: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}));

function makeVrm(
  nodes: Partial<Record<(typeof STUDIO_VRM_JOINT_HANDLE_DEFINITIONS)[number]["bone"], THREE.Object3D>>
): Pick<VRM, "humanoid"> {
  return {
    humanoid: {
      getNormalizedBoneNode: (name: VRMHumanBoneName) =>
        nodes[name as keyof typeof nodes] ?? null,
    },
  } as unknown as Pick<VRM, "humanoid">;
}

beforeEach(() => {
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
  camera.position.set(0, 0, 5);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  fiberMock.state = {
    camera,
    gl: {
      domElement: {
        getBoundingClientRect: () => ({ left: 0, top: 0, width: 400, height: 400 }),
      },
    },
  };
});

afterEach(() => {
  cleanup();
  fiberMock.frameCallbacks.length = 0;
  vi.clearAllMocks();
});

describe("StudioVrmJointHandles helpers", () => {
  it("defines the requested center, left, and right joints with four IK effectors", () => {
    expect(STUDIO_VRM_JOINT_HANDLE_DEFINITIONS.map((item) => item.bone)).toEqual([
      "hips",
      "head",
      "leftShoulder",
      "rightShoulder",
      "leftLowerArm",
      "rightLowerArm",
      "leftHand",
      "rightHand",
      "leftLowerLeg",
      "rightLowerLeg",
      "leftFoot",
      "rightFoot",
    ]);
    expect(STUDIO_VRM_JOINT_HANDLE_DEFINITIONS.filter((item) => item.effector).map((item) => item.bone))
      .toEqual(["leftHand", "rightHand", "leftFoot", "rightFoot"]);
  });

  it("skips absent and broken normalized bones without hiding valid bindings", () => {
    const hips = new THREE.Object3D();
    const leftHand = new THREE.Object3D();
    const bindings = resolveStudioVrmJointNodeBindings({
      getNormalizedBoneNode: (name) => {
        if (name === "rightShoulder") throw new Error("broken accessor");
        if (name === "hips") return hips;
        if (name === "leftHand") return leftHand;
        return null;
      },
    });

    expect(bindings.map((binding) => binding.bone)).toEqual(["hips", "leftHand"]);
    expect(bindings[0]?.node).toBe(hips);
    expect(bindings[1]?.node).toBe(leftHand);
    expect(resolveStudioVrmJointNodeBindings(null)).toEqual([]);
  });

  it("uses a copied explicit drag plane or a camera-facing plane through the start point", () => {
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    camera.position.set(0, 0, 5);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    const start = new THREE.Vector3(1, 2, 3);
    const explicit = new THREE.Plane(new THREE.Vector3(0, 2, 0), -4);

    const copied = createStudioVrmJointDragPlane(camera, start, explicit);
    expect(copied).not.toBe(explicit);
    expect(copied.normal.length()).toBeCloseTo(1);
    expect(explicit.normal.length()).toBeCloseTo(2);

    const cameraFacing = createStudioVrmJointDragPlane(camera, start);
    expect(cameraFacing.distanceToPoint(start)).toBeCloseTo(0);
    expect(Math.abs(cameraFacing.normal.dot(camera.getWorldDirection(new THREE.Vector3()))))
      .toBeCloseTo(1);
  });

  it("projects canvas coordinates onto the 3D drag plane and rejects invalid viewports", () => {
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    camera.position.set(0, 0, 5);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);

    const center = projectStudioVrmJointPointerToPlane(
      200,
      100,
      { left: 100, top: 0, width: 200, height: 200 },
      camera,
      plane
    );
    expect(center?.x).toBeCloseTo(0);
    expect(center?.y).toBeCloseTo(0);
    expect(center?.z).toBeCloseTo(0);

    expect(projectStudioVrmJointPointerToPlane(
      0,
      0,
      { left: 0, top: 0, width: 0, height: 200 },
      camera,
      plane
    )).toBeNull();
  });

  it("commits only a previewed pointerup and rolls pointer cancellation back to its start", () => {
    const snapshot = {
      bone: "leftHand" as const,
      startWorld: [1, 2, 3] as const,
      latestWorld: [4, 5, 6] as const,
      didPreview: true,
    };

    expect(resolveStudioVrmJointDragOutcome(snapshot, false)).toEqual({
      kind: "commit",
      bone: "leftHand",
      worldPosition: [4, 5, 6],
    });
    expect(resolveStudioVrmJointDragOutcome(snapshot, true)).toEqual({
      kind: "rollback",
      bone: "leftHand",
      worldPosition: [1, 2, 3],
    });
    expect(resolveStudioVrmJointDragOutcome({ ...snapshot, didPreview: false }, false)).toEqual({
      kind: "selection-only",
      bone: "leftHand",
    });
  });
});

describe("StudioVrmJointHandles interaction boundary", () => {
  it("renders only available bones as keyboard-accessible fixed-size controls", () => {
    const vrm = makeVrm({
      hips: new THREE.Object3D(),
      leftHand: new THREE.Object3D(),
    });

    render(<StudioVrmJointHandles vrm={vrm} selectedBone="leftHand" screenSize={24} />);

    const hips = screen.getByRole("button", { name: "골반 관절 선택" });
    const leftHand = screen.getByRole("button", { name: "왼손 관절 IK 목표 이동" });
    expect(hips.getAttribute("aria-pressed")).toBe("false");
    expect(leftHand.getAttribute("aria-pressed")).toBe("true");
    expect(leftHand.getAttribute("aria-keyshortcuts")).toContain("ArrowLeft");
    expect(leftHand.style.width).toBe("24px");
    expect(screen.queryByRole("button", { name: "오른손 관절 IK 목표 이동" })).toBeNull();
  });

  it("stops pointer bubbling, locks orbit interaction, and does not commit a selection-only press", () => {
    const onParentPointerDown = vi.fn();
    const onSelectBone = vi.fn();
    const onInteractionActiveChange = vi.fn();
    const onEffectorCommit = vi.fn();
    const vrm = makeVrm({ leftHand: new THREE.Object3D() });
    render(
      <div onPointerDown={onParentPointerDown}>
        <StudioVrmJointHandles
          vrm={vrm}
          onSelectBone={onSelectBone}
          onInteractionActiveChange={onInteractionActiveChange}
          onEffectorCommit={onEffectorCommit}
        />
      </div>
    );
    const handle = screen.getByRole("button", { name: "왼손 관절 IK 목표 이동" });

    fireEvent.pointerDown(handle, { pointerId: 7, button: 0, clientX: 100, clientY: 100 });
    fireEvent.pointerUp(handle, { pointerId: 7, button: 0, clientX: 100, clientY: 100 });

    expect(onParentPointerDown).not.toHaveBeenCalled();
    expect(onSelectBone).toHaveBeenCalledOnce();
    expect(onSelectBone).toHaveBeenCalledWith("leftHand");
    expect(onInteractionActiveChange.mock.calls).toEqual([[true], [false]]);
    expect(onEffectorCommit).not.toHaveBeenCalled();
  });

  it("rolls an active effector interaction back when its handle unmounts", () => {
    const onEffectorRollback = vi.fn();
    const onInteractionActiveChange = vi.fn();
    const hand = new THREE.Object3D();
    hand.position.set(0.25, 1.1, -0.2);
    const view = render(
      <StudioVrmJointHandles
        vrm={makeVrm({ rightHand: hand })}
        onEffectorRollback={onEffectorRollback}
        onInteractionActiveChange={onInteractionActiveChange}
      />
    );
    const handle = screen.getByRole("button", { name: "오른손 관절 IK 목표 이동" });

    fireEvent.pointerDown(handle, { pointerId: 3, button: 0, clientX: 80, clientY: 90 });
    view.unmount();

    expect(onEffectorRollback).toHaveBeenCalledOnce();
    expect(onEffectorRollback).toHaveBeenCalledWith("rightHand", [0.25, 1.1, -0.2]);
    expect(onInteractionActiveChange.mock.calls).toEqual([[true], [false]]);
  });
});
