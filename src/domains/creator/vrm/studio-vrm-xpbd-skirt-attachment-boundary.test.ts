import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { readStudioVrmPoserImplementationSource } from "./studio-vrm-poser-implementation-source";

const attachmentSource = readFileSync(
  new URL("./StudioVrmXpbdSkirtAttachment.tsx", import.meta.url),
  "utf8",
);
const projectionSource = readFileSync(
  new URL("./StudioVrmWardrobePropsProjection.tsx", import.meta.url),
  "utf8",
);

const poserSource = readStudioVrmPoserImplementationSource();

function requiredIndex(source: string, token: string, from = 0): number {
  const index = source.indexOf(token, from);
  if (index < 0) throw new Error(`Expected source token was not found: ${token}`);
  return index;
}

describe("Studio VRM XPBD skirt product boundary", () => {
  it("keeps the frame pipeline ordered as pose, prop IK, VRM commit, cloth, then render", () => {
    expect(poserSource).toContain("const VRM_FRAME_BASE_PRIORITY = -3;");
    expect(projectionSource).toContain("const VRM_FRAME_PROP_PRIORITY = -2;");
    expect(projectionSource).toContain("const VRM_FRAME_COMMIT_PRIORITY = -1;");
    expect(attachmentSource).toContain("export const VRM_FRAME_XPBD_SKIRT_PRIORITY = -0.5;");

    const commit = requiredIndex(poserSource, "<StudioVrmRuntimeCommit");
    const wardrobe = requiredIndex(poserSource, "<StudioVrmWardrobeAttachment", commit);
    expect(commit).toBeLessThan(wardrobe);
    expect(attachmentSource).toContain("}, VRM_FRAME_XPBD_SKIRT_PRIORITY);");
  });

  it("routes only pleated/longskirt to XPBD and renders the existing garment on unavailable", () => {
    expect(projectionSource).toContain('def?.geometrySource === "xpbd-skirt-v1"');
    expect(projectionSource).toContain("<StudioVrmXpbdSkirtAttachment");
    expect(projectionSource).toContain(
      "fallback={<StudioVrmProceduralWardrobeAttachment {...props} />}",
    );
    expect(attachmentSource).toContain("if (fallbackRequired) return fallback;");
    expect(attachmentSource).toContain("setFailedRuntime(runtime);");
    expect(projectionSource).toContain(
      'complete: def.geometrySource !== "xpbd-skirt-v1"',
    );
    expect(attachmentSource).toContain("if (runtimePending) return null;");
  });

  it("creates GPU cloth only after commit and publishes it under an active resource lease", () => {
    expect(attachmentSource).not.toContain("const runtimeResult = useMemo(() => {");
    const layoutEffect = requiredIndex(attachmentSource, "useLayoutEffect(() => {");
    const createRuntime = requiredIndex(
      attachmentSource,
      "const created = createStudioVrmXpbdSkirtAttachmentRuntime({",
      layoutEffect,
    );
    const retain = requiredIndex(
      attachmentSource,
      "if (created.ok && !created.runtime.retain()) return;",
      createRuntime,
    );
    const publish = requiredIndex(attachmentSource, "setRuntimeBinding(binding);", retain);
    const release = requiredIndex(
      attachmentSource,
      "return releaseOwnerLease;",
      publish,
    );

    expect(layoutEffect).toBeLessThan(createRuntime);
    expect(createRuntime).toBeLessThan(retain);
    expect(retain).toBeLessThan(publish);
    expect(publish).toBeLessThan(release);
    expect(attachmentSource).not.toContain("!runtime.retain()");
    expect(attachmentSource).toContain("activeRuntimeBinding.releaseOwnerLease();");
  });

  it("caps SHA-heavy solves, updates capsules each sampled frame, and forbids duplicate generations", () => {
    expect(attachmentSource).toContain("maxSolveHz: 20");
    expect(attachmentSource).toContain("maxSolveHz: 10");
    expect(attachmentSource).toContain("const poseSignature = runtime.readPoseSignature();");
    expect(attachmentSource).toContain("cadenceRef.current.controller?.shouldSolve");
    expect(attachmentSource).toContain("poseGeneration <= lastPoseGeneration");
    expect(attachmentSource).toContain("const currentRig = sampleRig(");
    expect(attachmentSource).toContain("const body = bodyProxies(");
    expect(attachmentSource).toContain("expectedTopologySha256: topology.topologySha256");
    expect(attachmentSource).toContain("expectedPoseGeneration: poseGeneration");
  });

  it("uses one mutable BufferGeometry for viewport and capture, with an exact capture fence", () => {
    expect(poserSource).toContain(
      "onXpbdCaptureSyncChange={handleWardrobeXpbdCaptureSyncChange}",
    );
    expect(attachmentSource).toContain("captureSyncHandlerRef.current = () => {");
    expect(attachmentSource).toContain("onCaptureSyncChangeRef.current?.(slot, sync, true);");
    expect(poserSource).toContain(
      "wardrobeXpbdCaptureSyncRef.current.get(slot) === sync",
    );
    expect(attachmentSource).toContain("position.array.set(solved.mesh.positions);");
    expect(attachmentSource).toContain("position.needsUpdate = true;");
    expect(attachmentSource).toContain(
      "return createPortal(<primitive object={runtime.surface.mesh} />, vrm.scene);",
    );
    expect(attachmentSource).not.toMatch(/capture(?:Mesh|Geometry)/u);

    const finalRawCommit = requiredIndex(poserSource, "currentVrm.update(0);");
    const exactSync = requiredIndex(
      poserSource,
      "const result = sync();",
      finalRawCommit,
    );
    const pixelCapture = requiredIndex(
      poserSource,
      "captureStudioVrmRgba(gl, scene, camera",
      exactSync,
    );
    expect(finalRawCommit).toBeLessThan(exactSync);
    expect(exactSync).toBeLessThan(pixelCapture);
    expect(poserSource).toContain("xpbdSkirtCaptureAuthorityIsCurrent()");
  });

  it("runs the same exact cloth solve for server sharing before GPU readback", () => {
    const shareStart = requiredIndex(poserSource, "async function handleSharePoseToServer()");
    const shareEnd = requiredIndex(poserSource, "// Effect Event so the dispose runs", shareStart);
    const share = poserSource.slice(shareStart, shareEnd);
    const finalRawCommit = requiredIndex(share, "currentVrm.update(0);");
    const exactSync = requiredIndex(share, "const result = sync();", finalRawCommit);
    const pixelCapture = requiredIndex(
      share,
      "captureStudioVrmRgba(gl, scene, camera",
      exactSync,
    );

    expect(share).toContain("shareXpbdSkirtAuthorityIsCurrent()");
    expect(share).toContain("if (countSpringBoneJoints(currentVrm) > 0) {");
    expect(share).not.toContain("if (!physicsPreview && countSpringBoneJoints(currentVrm) > 0)");
    expect(finalRawCommit).toBeLessThan(exactSync);
    expect(exactSync).toBeLessThan(pixelCapture);
  });

  it("keeps the UI honest about unsupported self collision", () => {
    expect(poserSource).toContain("천 물리 · 자기충돌 X");
    expect(poserSource).toContain("자기 충돌은 아직 지원하지 않습니다.");
    expect(attachmentSource).toContain(
      "selfCollisionEnabled: STUDIO_VRM_XPBD_SKIRT_SELF_COLLISION_ENABLED",
    );
  });
});
