import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./studio-mannequin-scene.ts", import.meta.url), "utf8");

describe("3D mannequin direct-manipulation runtime boundary", () => {
  it("keeps mouse, pen and touch on one constrained pointer-rotation path", () => {
    expect(source).toContain("resolveStudioMannequinPointerRotation({");
    expect(source).toContain("renderer.domElement.setPointerCapture(event.pointerId)");
    expect(source).toContain('addEventListener("pointermove", handlePointerMove, { passive: false })');
    expect(source).toContain('addEventListener("lostpointercapture", handleLostPointerCapture');
  });

  it("rolls direct and IK edits back when pointer ownership is cancelled", () => {
    expect(source).toContain("group.rotation.set(...session.startRotation)");
    expect(source).toContain("const startPose = dragStartPose");
    expect(source).toContain("applyPoseToGraph(currentPose)");
    expect(source).toContain("finishPointerInteraction(event, true)");
  });

  it("uses rounded high-detail geometry, soft shadows and joint double-click focus", () => {
    expect(source).toContain("new RoundedBoxGeometry(");
    expect(source).toContain("new THREE.CapsuleGeometry(primitive.radius, middleLength, 12, 28)");
    expect(source).toContain("renderer.shadowMap.type = THREE.PCFSoftShadowMap");
    expect(source).toContain('addEventListener("dblclick", handleDoubleClick)');
  });
});
