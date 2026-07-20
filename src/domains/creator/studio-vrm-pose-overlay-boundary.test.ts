import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./StudioVrmPoser.tsx", import.meta.url), "utf8");
const studioPageSource = readFileSync(new URL("./StudioPage.tsx", import.meta.url), "utf8");
const studioLazyPanelStackSource = readFileSync(
  new URL("./StudioThreeDPreviewPanelStack.tsx", import.meta.url),
  "utf8"
);

describe("Studio VRM visual pose bone boundary", () => {
  it("renders ephemeral normalized-bone markers that never enter captures", () => {
    expect(source).toContain("const VIEWPORT_POSE_BONES");
    expect(source).toContain("getNormalizedBoneNode(boneName)");
    expect(source).toContain('depthTest={false}');
    expect(source).toContain('depthWrite={false}');
    expect(source).toContain(
      "vrm && showPoseBoneOverlay && !isCapturing && !isSharingPose && !isThumbnailCapturing && !webcamActive",
    );
    expect(source).toContain("const releaseCaptureHelpers = acquireVrmCaptureHelperLease()");
    expect(source).toContain("await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))");
  });

  it("connects a clicked 3D marker to the matching bounded manual-pose card", () => {
    expect(source).toContain("onSelect(boneName)");
    expect(source).toContain("function selectViewportPoseBone(boneName: VRMHumanBoneName)");
    expect(source).toContain("candidate.bones.includes(boneName)");
    expect(source).toContain('id={`vrm-manual-bone-${boneName}`}');
    expect(source).toContain("data-vrm-pose-bone={boneName}");
    expect(source).toContain("selectedViewportPoseBone === boneName");
    expect(source).toContain("locked={lockedBones.includes(boneName)}");
  });

  it("uses a camera-facing pointer plane for hand IK and commits rotations once at drag end", () => {
    expect(source).toContain("dragPlaneRef.current.setFromNormalAndCoplanarPoint(");
    expect(source).toContain("event.ray.intersectPlane(dragPlaneRef.current");
    expect(source).toContain("function handleViewportHandIkDrag(");
    expect(source).toContain("applyVrmTwoBoneGrip(");
    expect(source).toContain('if (phase !== "end") return;');
    expect(source).toContain("setCustomBones(nextBones)");
    expect(source).toContain("enabled={!isViewportHandIkDragging && !jointHandleInteracting}");
    expect(source).toContain("onPointerCancel={(event) => {");
    expect(source).toContain("const pointerTarget = event.currentTarget as unknown as");
    expect(source).toContain("pointerTarget.setPointerCapture(event.pointerId)");
    expect(source).toContain("pointerCaptureTarget.releasePointerCapture(pointerId)");
    expect(source).toContain("onLostPointerCapture={(event) => {");
    expect(source).toContain('window.addEventListener("pointerup", finishMatchingPointer)');
    expect(source).toContain('window.addEventListener("pointercancel", finishMatchingPointer)');
    expect(source).toContain('window.addEventListener("blur", finishOnWindowBlur)');
    expect(source).toContain('gl.domElement.addEventListener("lostpointercapture", finishMatchingPointer)');
    expect(source).toContain("if (!draggingRef.current) return;");
    expect(source).toContain("finishDragRef.current(target)");
    expect(source).toContain("setIsViewportHandIkDragging(false)");
  });

  it("previews bounded full-body multi-chain output and commits translations only on release", () => {
    const previewStart = source.indexOf("function previewJointHandleIk(");
    const commitStart = source.indexOf("function handleJointHandleIkCommit(");
    const rollbackStart = source.indexOf("function handleJointHandleIkRollback(");
    const previewSource = source.slice(previewStart, commitStart);
    const commitSource = source.slice(commitStart, rollbackStart);

    expect(previewSource).toContain("solveStudioVrmFullBodyIk(currentVrm");
    expect(previewSource).toContain("baseTranslations: transaction.baseline.translations");
    expect(previewSource).toContain('(["leftFoot", "rightFoot"] as const).flatMap');
    expect(previewSource).toContain("양발 고정에 참여하는 다리에 잠긴 관절이 있습니다");
    expect(previewSource).toContain("applyStudioVrmRotationPose(currentVrm");
    expect(previewSource).not.toContain("setPoseTranslations(");
    expect(previewSource).not.toContain("setCustomBones(");
    expect(commitSource).toContain("setCustomBones(nextBones)");
    expect(commitSource).toContain("setPoseTranslations(cloneStudioVrmPoseTranslations(nextTranslations))");
    expect(commitSource).toContain("constraints.length");
  });

  it("keeps the poser open when the editor rejects an obsolete insertion ticket", () => {
    expect(source).toContain("onInsert: (result: StudioVrmPoserInsertResult) =>");
    expect(source).toContain("const accepted = await onInsert({");
    expect(source).toContain("pngDataUrl: fullDataUrl,");
    expect(source).toContain("scene: sceneDocument,");
    expect(source).toContain("if (accepted === false) {");
    expect(studioPageSource).toContain(
      "insertVrmResult: (result) => applyStudioVrmInsertResult({"
    );
    expect(studioLazyPanelStackSource).toContain("onInsert={insertVrmResult}");
  });

  it("bounds server sharing and releases local capture helpers before upload", () => {
    const readbackIndex = source.indexOf("const rgba = captureStudioVrmRgba(gl, scene, camera, { width, height });");
    const releaseIndex = source.indexOf("releaseLocalCapture();", readbackIndex);
    const encodeIndex = source.indexOf("await encodeStudioVrmCapturePngDataUrl(", releaseIndex);
    const uploadIndex = source.indexOf("await publishAsset({", releaseIndex);

    expect(source).toContain("const STUDIO_VRM_SHARE_TIMEOUT_MS = 30_000");
    expect(source).toContain("const sharePoseAbortRef = useRef<AbortController | null>(null)");
    expect(source).toContain("controller.abort()");
    expect(source).toContain("}, controller.signal)");
    expect(source).toContain("ToonSpectrum 표준 사용권으로 공유할 권한");
    expect(source).toContain('license: "toonspectrum-standard"');
    expect(source).toContain('containsAi: false');
    expect(source).toContain('tags: ["VRM", "3D 데생 인형", "포즈"]');
    expect(source).toContain("rightsConfirmed: true");
    expect(source).not.toContain("preserveDrawingBuffer: true");
    expect(source).not.toContain('gl.domElement.toDataURL("image/png")');
    expect(source).toContain('{isSharingPose ? "공유 취소" : "포즈 서버에 공유"}');
    expect(readbackIndex).toBeGreaterThan(-1);
    expect(releaseIndex).toBeGreaterThan(readbackIndex);
    expect(encodeIndex).toBeGreaterThan(releaseIndex);
    expect(uploadIndex).toBeGreaterThan(encodeIndex);
  });

  it("cancels stale insert encodes and captures independently of the default framebuffer", () => {
    expect(source).toContain("const insertCaptureAbortRef = useRef<AbortController | null>(null)");
    expect(source).toContain("insertCaptureAbortRef.current?.abort()");
    expect(source).toContain("const rgba = captureStudioVrmRgba(gl, scene, camera, { width, height })");
    expect(source).toContain("signal: captureController.signal");
    expect(source).toContain("captureRef.current.camera !== camera");
    expect(source).toContain("if (insertCaptureAbortRef.current === captureController)");
  });
});
