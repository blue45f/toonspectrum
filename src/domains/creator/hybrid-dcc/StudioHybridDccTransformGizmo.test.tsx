// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { Group } from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createStudioHybridDccIdentityTransform } from "./studio-hybrid-dcc-object-transform";
import { STUDIO_HYBRID_DCC_VIEWPORT_DEFAULTS } from "./studio-hybrid-dcc-viewport-interaction";
import { StudioHybridDccTransformGizmo } from "./StudioHybridDccTransformGizmo";

import type { ReactNode } from "react";

interface ControlsProps {
  readonly onMouseDown?: () => void;
  readonly onMouseUp?: () => void;
  readonly children?: ReactNode;
  readonly translationSnap?: number | null;
}
const harness = vi.hoisted(() => ({
  props: null as ControlsProps | null,
  control: { dragging: false, axis: null as string | null },
  state: {} as Record<string, unknown>,
}));
vi.mock("@react-three/fiber", () => ({
  useThree: (select: (state: Record<string, unknown>) => unknown) => select(harness.state),
}));
vi.mock("@react-three/drei/core/TransformControls.js", async () => {
  const { forwardRef, useImperativeHandle } = await import("react");
  return {
    TransformControls: forwardRef<typeof harness.control, ControlsProps>((props, ref) => {
      harness.props = props;
      useImperativeHandle(ref, () => harness.control, []);
      return <>{props.children}</>;
    }),
  };
});
beforeEach(() => {
  harness.control.dragging = false;
  harness.control.axis = null;
  harness.state = { gl: { domElement: document.createElement("canvas") }, invalidate: vi.fn() };
});
afterEach(cleanup);
function setup() {
  const object = new Group();
  const props = {
    objectRef: { current: object },
    source: { assetId: "cube", geometryStamp: "mesh:1", transform: createStudioHybridDccIdentityTransform() },
    mode: "translate" as const, space: "world" as const,
    preferences: STUDIO_HYBRID_DCC_VIEWPORT_DEFAULTS,
    onCommit: vi.fn(), onDraggingChange: vi.fn(), onNotice: vi.fn(),
  };
  const view = render(<StudioHybridDccTransformGizmo {...props}><span>mesh</span></StudioHybridDccTransformGizmo>);
  return { ...view, props, object };
}
function start() { act(() => { harness.control.dragging = true; harness.control.axis = "X"; harness.props?.onMouseDown?.(); }); }
function finish() { act(() => harness.props?.onMouseUp?.()); }

describe("gizmo gesture lifecycle", () => {
  it("commits once and never leaves an uncommitted presentation pose", () => {
    const { props, object } = setup();
    start(); object.position.x = 2; finish(); finish();
    expect(props.onCommit).toHaveBeenCalledTimes(1);
    expect(props.onCommit).toHaveBeenCalledWith("cube", { ...props.source.transform, position: [2, 0, 0] });
    expect(object.position.toArray()).toEqual([0, 0, 0]);
  });
  it("does not create an undo command for a click with no movement", () => {
    const { props } = setup(); start(); finish();
    expect(props.onCommit).not.toHaveBeenCalled();
  });
  it("cancels Escape before a parent dialog can consume it", () => {
    const { props, object } = setup(); start(); object.position.x = 4;
    const event = new KeyboardEvent("keydown", { key: "Escape", cancelable: true, bubbles: true });
    act(() => window.dispatchEvent(event));
    expect(event.defaultPrevented).toBe(true);
    expect(object.position.toArray()).toEqual([0, 0, 0]);
    expect(harness.control.dragging).toBe(false);
    finish(); expect(props.onCommit).not.toHaveBeenCalled();
  });
  it("restores source on focus loss and rejects the later pointer-up", () => {
    const { props, object } = setup(); start(); object.position.y = 4;
    fireEvent(window, new Event("blur")); finish();
    expect(object.position.toArray()).toEqual([0, 0, 0]);
    expect(props.onCommit).not.toHaveBeenCalled();
  });
  it("cancels a stale gesture when the authoring source changes", () => {
    const { rerender, props, object } = setup(); start(); object.position.x = 4;
    rerender(<StudioHybridDccTransformGizmo {...props} source={{ ...props.source, geometryStamp: "mesh:2", transform: { ...props.source.transform, position: [8, 0, 0] } }}><span>mesh</span></StudioHybridDccTransformGizmo>);
    expect(object.position.toArray()).toEqual([8, 0, 0]);
    finish(); expect(props.onCommit).not.toHaveBeenCalled();
  });
  it("rejects singular scale and restores the unchanged authoring transform", () => {
    const { props, object } = setup(); start(); object.scale.y = 0; finish();
    expect(props.onCommit).not.toHaveBeenCalled();
    expect(object.scale.toArray()).toEqual([1, 1, 1]);
    expect(props.onNotice).toHaveBeenLastCalledWith(expect.stringContaining("유효하지 않은 변형"));
  });
  it("forwards null snaps and restores an interrupted gesture on unmount", () => {
    const { rerender, unmount, props, object } = setup();
    rerender(<StudioHybridDccTransformGizmo {...props} preferences={{ ...props.preferences, snapping: false }}><span>mesh</span></StudioHybridDccTransformGizmo>);
    expect(harness.props?.translationSnap).toBeNull();
    start(); object.rotation.x = 0.8; unmount();
    expect(object.rotation.x).toBe(0);
    expect(props.onCommit).not.toHaveBeenCalled();
    expect(harness.control.dragging).toBe(false);
  });
});
