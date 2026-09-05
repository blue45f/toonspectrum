// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { OrthographicCamera, PerspectiveCamera, Vector3 } from "three";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioHybridDccCameraRig } from "./StudioHybridDccCameraRig";

const harness = vi.hoisted(() => ({ state: {} as Record<string, unknown> }));
vi.mock("@react-three/fiber", () => ({
  useThree: (select: (state: Record<string, unknown>) => unknown) => select(harness.state),
}));
afterEach(cleanup);
const props = () => ({ center: [0, 0, 0] as const, radius: 1,
  intent: { revision: 0, orientationRevision: 0, view: "isometric" as const },
  sceneCenter: [0, 0, 0] as const, sceneRadius: 10 });
function setup() {
  const camera = new PerspectiveCamera(42, 1, 0.01, 100);
  const controls = { target: new Vector3(), update: vi.fn() };
  harness.state = { camera, controls, size: { width: 640, height: 640 }, invalidate: vi.fn() };
  return { camera, controls };
}
const closeVector = (a: Vector3, b: Vector3) => {
  expect(a.x).toBeCloseTo(b.x, 8); expect(a.y).toBeCloseTo(b.y, 8); expect(a.z).toBeCloseTo(b.z, 8);
};

describe("camera navigation lifecycle", () => {
  it("preserves live orbit and target while geometry bounds change", () => {
    const { camera, controls } = setup();
    const initial = props();
    const view = render(<StudioHybridDccCameraRig {...initial} />);
    camera.position.set(5, 4, 3);
    controls.target.set(1, 2, 3);
    camera.lookAt(controls.target);
    const rotation = camera.quaternion.clone();
    controls.update.mockClear();
    view.rerender(<StudioHybridDccCameraRig {...initial} center={[10, 20, 30]} radius={5} />);
    closeVector(camera.position, new Vector3(5, 4, 3));
    closeVector(controls.target, new Vector3(1, 2, 3));
    expect(camera.quaternion.equals(rotation)).toBe(true);
    expect(controls.update).not.toHaveBeenCalled();
  });
  it("frames a requested selection without losing the user's orbit direction", () => {
    const { camera, controls } = setup();
    const initial = props();
    const view = render(<StudioHybridDccCameraRig {...initial} />);
    camera.position.set(5, 4, 3); controls.target.set(1, 2, 3);
    const direction = camera.position.clone().sub(controls.target).normalize();
    view.rerender(<StudioHybridDccCameraRig {...initial} center={[10, 0, 0]} intent={{ ...initial.intent, revision: 1 }} />);
    closeVector(controls.target, new Vector3(10, 0, 0));
    closeVector(camera.position.clone().sub(controls.target).normalize(), direction);
  });
  it("re-aligns even the same standard view when explicitly requested again", () => {
    const { camera, controls } = setup();
    const initial = { ...props(), intent: { revision: 0, orientationRevision: 0, view: "front" as const } };
    const view = render(<StudioHybridDccCameraRig {...initial} />);
    camera.position.set(5, 3, 2);
    view.rerender(<StudioHybridDccCameraRig {...initial} intent={{ ...initial.intent, orientationRevision: 1 }} />);
    closeVector(camera.position.clone().sub(controls.target).normalize(), new Vector3(0, 0, 1));
  });
  it("preserves target, orientation and apparent height across projection switches", () => {
    const { camera, controls } = setup();
    const initial = props();
    const view = render(<StudioHybridDccCameraRig {...initial} />);
    camera.position.set(5, 4, 8); controls.target.set(1, 2, 3);
    const span = 2 * camera.position.distanceTo(controls.target) * Math.tan(camera.fov * Math.PI / 360);
    const orthographic = new OrthographicCamera(-320, 320, 320, -320, 0.01, 100);
    harness.state.camera = orthographic;
    view.rerender(<StudioHybridDccCameraRig {...initial} />);
    expect(640 / orthographic.zoom).toBeCloseTo(span, 8);
    closeVector(controls.target, new Vector3(1, 2, 3));
    closeVector(orthographic.position, camera.position);
    const next = new PerspectiveCamera(42, 1, 0.01, 100);
    harness.state.camera = next;
    view.rerender(<StudioHybridDccCameraRig {...initial} />);
    closeVector(next.position, camera.position);
  });
  it("maintains orthographic vertical span on resize without resetting orbit", () => {
    const { controls } = setup();
    const camera = new OrthographicCamera(-320, 320, 320, -320, 0.01, 100);
    harness.state.camera = camera;
    const initial = props();
    const view = render(<StudioHybridDccCameraRig {...initial} />);
    camera.position.set(5, 4, 3); controls.target.set(1, 2, 3);
    const span = 640 / camera.zoom;
    harness.state.size = { width: 320, height: 320 };
    camera.left = -160; camera.right = 160; camera.top = 160; camera.bottom = -160;
    view.rerender(<StudioHybridDccCameraRig {...initial} />);
    expect(320 / camera.zoom).toBeCloseTo(span, 8);
    closeVector(camera.position, new Vector3(5, 4, 3));
  });
});
