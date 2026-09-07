// @vitest-environment jsdom
import { createRequire } from "node:module";

import { cleanup, render } from "@testing-library/react";
import { PerspectiveCamera } from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { StudioBg3dTurntableMotion } from "./StudioBg3dTurntableMotion";

interface Orbit {
  autoRotate: boolean;
  autoRotateSpeed: number;
  enableDamping: boolean;
  dampingFactor: number;
  getAzimuthalAngle(): number;
  update(): void;
}

const runtime = vi.hoisted(() => ({
  controls: null as Orbit | null,
  invalidate: vi.fn(),
  frame: null as ((state: unknown, delta: number) => void) | null,
}));
vi.mock("@react-three/fiber", () => ({
  useThree: (select: (state: typeof runtime) => unknown) => select(runtime),
  useFrame: (frame: typeof runtime.frame) => { runtime.frame = frame; },
}));

// Exercise the same installed three-stdlib implementation that Drei uses, not a rotation mock.
const require = createRequire(import.meta.url);
const { OrbitControls } = require(require.resolve("three-stdlib", {
  paths: [require.resolve("@react-three/drei")],
})) as { OrbitControls: new (camera: PerspectiveCamera) => Orbit };
function createControls(): Orbit {
  const camera = new PerspectiveCamera();
  camera.position.set(0, 2, 10);
  const controls = new OrbitControls(camera);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  return controls;
}
function advance(seconds: number) {
  runtime.frame?.({}, seconds);
  runtime.controls?.update();
}
beforeEach(() => {
  runtime.controls = createControls();
  runtime.invalidate.mockClear();
});
afterEach(() => { cleanup(); runtime.frame = null; });

describe("BG3D turntable camera motion", () => {
  it.each([20, 60])("rotates at the requested RPM at %i frames per second", (fps) => {
    render(<StudioBg3dTurntableMotion active speedRpm={2} />);
    advance(120); // The paused demand-loop interval must not become a camera jump.
    expect(runtime.controls?.getAzimuthalAngle()).toBeCloseTo(0, 10);
    for (let frame = 0; frame < fps; frame += 1) advance(1 / fps);
    expect(runtime.controls?.getAzimuthalAngle()).toBeCloseTo(-2 * Math.PI * 2 / 60, 10);
    expect(runtime.invalidate).toHaveBeenCalled();
  });

  it("reverses direction and stops without advancing the camera while paused", () => {
    const view = render(<StudioBg3dTurntableMotion active speedRpm={4} />);
    advance(1);
    advance(0.5);
    const forward = runtime.controls?.getAzimuthalAngle();
    expect(forward).toBeLessThan(0);
    view.rerender(<StudioBg3dTurntableMotion active speedRpm={-4} />);
    advance(0.5);
    expect(runtime.controls?.getAzimuthalAngle()).toBeCloseTo(0, 10);
    view.rerender(<StudioBg3dTurntableMotion active={false} speedRpm={-4} />);
    expect(runtime.controls?.enableDamping).toBe(true);
    for (let frame = 0; frame < 60; frame += 1) advance(1 / 60);
    expect(runtime.controls?.getAzimuthalAngle()).toBeCloseTo(0, 10);
    view.rerender(<StudioBg3dTurntableMotion active speedRpm={-4} />);
    advance(60);
    expect(runtime.controls?.getAzimuthalAngle()).toBeCloseTo(0, 10);
    advance(0.5);
    expect(runtime.controls?.getAzimuthalAngle()).toBeCloseTo(-Number(forward), 10);
  });

  it("releases the original controls when a view replaces them or unmounts", () => {
    const original = runtime.controls;
    const view = render(<StudioBg3dTurntableMotion active speedRpm={8} />);
    advance(1);
    advance(0.05);
    runtime.controls = createControls();
    view.rerender(<StudioBg3dTurntableMotion active speedRpm={8} />);
    expect(original?.autoRotate).toBe(false);
    expect(original?.autoRotateSpeed).toBe(2);
    expect(runtime.controls.autoRotate).toBe(true);
    view.unmount();
    expect(runtime.controls.autoRotate).toBe(false);
    expect(runtime.controls.autoRotateSpeed).toBe(2);
  });

  it("waits for OrbitControls to mount before starting", () => {
    runtime.controls = null;
    const view = render(<StudioBg3dTurntableMotion active speedRpm={2} />);
    advance(1);
    expect(runtime.invalidate).not.toHaveBeenCalled();
    runtime.controls = createControls();
    view.rerender(<StudioBg3dTurntableMotion active speedRpm={2} />);
    expect(runtime.controls.autoRotate).toBe(true);
  });
});
