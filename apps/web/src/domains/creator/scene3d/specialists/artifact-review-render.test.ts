import {
  Box3,
  Group,
  MeshBasicMaterial,
  PerspectiveCamera,
  Scene,
  Vector3,
} from "three";
import { describe, expect, it, vi } from "vitest";
import {
  artifactReviewFit,
  renderArtifactReview,
} from "./artifact-review-render";
import type { WebGLRenderer } from "three";

function fixture() {
  const source = new Group();
  const result = new Group();
  const scene = new Scene().add(source, result);
  const camera = new PerspectiveCamera(45, 2, 0.01, 1000);
  const draws: {
    source: boolean;
    result: boolean;
    viewport: number[];
    scissor: number[];
    camera: PerspectiveCamera;
  }[] = [];
  let viewport: number[] = [];
  let scissor: number[] = [];
  const renderer = {
    setViewport: vi.fn((...values: number[]) => {
      viewport = values;
    }),
    setScissor: vi.fn((...values: number[]) => {
      scissor = values;
    }),
    setScissorTest: vi.fn(),
    clear: vi.fn(),
    render: vi.fn((_scene: Scene, camera: PerspectiveCamera) =>
      draws.push({
        source: source.visible,
        result: result.visible,
        viewport: [...viewport],
        scissor: [...scissor],
        camera,
      }),
    ),
  };
  return { source, result, scene, camera, draws, renderer };
}
describe("truthful common-projection source/result rendering", () => {
  it.each([0, 0.25, 0.5, 1])(
    "uses a full common viewport and disjoint exact scissor regions at %s",
    (fraction) => {
      const f = fixture();
      renderArtifactReview({
        ...f,
        renderer: f.renderer as unknown as WebGLRenderer,
        mode: "wipe",
        fraction,
        width: 641,
        height: 280,
      });
      const split = Math.floor(641 * fraction);
      const expected = [
        ...(split
          ? [{ source: true, result: false, scissor: [0, 0, split, 280] }]
          : []),
        ...(split < 641
          ? [
              {
                source: false,
                result: true,
                scissor: [split, 0, 641 - split, 280],
              },
            ]
          : []),
      ];
      expect(f.draws).toEqual(
        expected.map((entry) => ({
          ...entry,
          viewport: [0, 0, 641, 280],
          camera: f.camera,
        })),
      );
      expect(f.renderer.setScissorTest).toHaveBeenLastCalledWith(false);
      expect(f.source.visible).toBe(true);
      expect(f.result.visible).toBe(true);
    },
  );
  it.each(["source", "result"] as const)(
    "renders %s-only with the same full camera",
    (mode) => {
      const f = fixture();
      renderArtifactReview({
        ...f,
        renderer: f.renderer as unknown as WebGLRenderer,
        mode,
        fraction: 0.5,
        width: 640,
        height: 280,
      });
      expect(f.draws).toHaveLength(1);
      expect(f.draws[0]).toMatchObject({
        source: mode === "source",
        result: mode === "result",
        viewport: [0, 0, 640, 280],
        scissor: [0, 0, 640, 280],
      });
    },
  );
  it("restores scene override, visibility and scissor even when GPU rendering fails", () => {
    const f = fixture();
    const old = new MeshBasicMaterial();
    const wire = new MeshBasicMaterial({ wireframe: true });
    f.scene.overrideMaterial = old;
    f.source.visible = false;
    f.renderer.render.mockImplementation(() => {
      throw new Error("GPU error");
    });
    expect(() =>
      renderArtifactReview({
        ...f,
        renderer: f.renderer as unknown as WebGLRenderer,
        mode: "wipe",
        fraction: 0.5,
        width: 640,
        height: 280,
        wireframe: wire,
      }),
    ).toThrow("GPU error");
    expect(f.scene.overrideMaterial).toBe(old);
    expect(f.source.visible).toBe(false);
    expect(f.result.visible).toBe(true);
    expect(f.renderer.setScissorTest).toHaveBeenLastCalledWith(false);
  });
  it("fits from original bounds and retains one world center, including portrait views", () => {
    const bounds = new Box3(new Vector3(10, -2, 4), new Vector3(14, 2, 8));
    const wide = artifactReviewFit(bounds, 2, 45);
    const narrow = artifactReviewFit(bounds, 0.5, 45);
    expect(wide.center.toArray()).toEqual([12, 0, 6]);
    expect(narrow.center.toArray()).toEqual(wide.center.toArray());
    expect(narrow.distance).toBeGreaterThan(wide.distance);
    expect(wide.radius).toBeCloseTo(Math.sqrt(48) / 2);
    expect(() => artifactReviewFit(new Box3(), 1, 45)).toThrow();
  });
});
