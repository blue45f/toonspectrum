import { Box3, MathUtils, Vector3 } from "three";
import type { ArtifactReviewMode } from "./artifact-review-contract";
import type {
  Group,
  Material,
  PerspectiveCamera,
  Scene,
  WebGLRenderer,
} from "three";

/** Same full-image projection in both halves: only the scissor region changes. No per-side fit/scale. */
export function renderArtifactReview(input: {
  renderer: WebGLRenderer;
  camera: PerspectiveCamera;
  scene: Scene;
  source?: Group;
  result: Group;
  width: number;
  height: number;
  mode: ArtifactReviewMode;
  fraction: number;
  wireframe?: Material;
}): void {
  const { renderer, scene, camera, width, height, source, result } = input;
  const previousOverride = scene.overrideMaterial;
  const originalSource = source?.visible;
  const originalResult = result.visible;
  try {
    renderer.setViewport(0, 0, width, height);
    renderer.setScissorTest(false);
    renderer.clear(true, true, true);
    scene.overrideMaterial = input.wireframe ?? null;
    const draw = (which: "source" | "result", x: number, w: number) => {
      if (w < 1) return;
      if (source) source.visible = which === "source";
      result.visible = which === "result";
      renderer.setViewport(0, 0, width, height);
      renderer.setScissor(x, 0, w, height);
      renderer.setScissorTest(true);
      renderer.render(scene, camera);
    };
    if (!source || input.mode === "result") draw("result", 0, width);
    else if (input.mode === "source") draw("source", 0, width);
    else {
      const split = Math.floor(width * MathUtils.clamp(input.fraction, 0, 1));
      draw("source", 0, split);
      draw("result", split, width - split);
    }
  } finally {
    scene.overrideMaterial = previousOverride;
    if (source) source.visible = originalSource!;
    result.visible = originalResult;
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, width, height);
  }
}
export function artifactReviewFit(
  bounds: Box3,
  aspect: number,
  fovDegrees: number,
): { center: Vector3; radius: number; distance: number } {
  const center = bounds.getCenter(new Vector3());
  const radius = Math.max(0.01, bounds.getSize(new Vector3()).length() / 2);
  if (
    bounds.isEmpty() ||
    ![
      ...bounds.min.toArray(),
      ...bounds.max.toArray(),
      aspect,
      fovDegrees,
    ].every(Number.isFinite) ||
    aspect <= 0 ||
    fovDegrees <= 0 ||
    fovDegrees >= 179
  ) {
    throw new Error("Invalid preview framing bounds.");
  }
  const vertical = MathUtils.degToRad(fovDegrees) / 2;
  const horizontal = Math.atan(Math.tan(vertical) * aspect);
  return {
    center,
    radius,
    distance: (radius / Math.sin(Math.min(vertical, horizontal))) * 1.08,
  };
}
