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
    const releaseIndex = source.indexOf("releaseLocalCapture();\n      if (controller.signal.aborted) return;");
    const uploadIndex = source.indexOf("await publishAsset({", releaseIndex);

    expect(source).toContain("const STUDIO_VRM_SHARE_TIMEOUT_MS = 30_000");
    expect(source).toContain("const sharePoseAbortRef = useRef<AbortController | null>(null)");
    expect(source).toContain("controller.abort()");
    expect(source).toContain("}, controller.signal)");
    expect(source).toContain('{isSharingPose ? "공유 취소" : "포즈 서버에 공유"}');
    expect(releaseIndex).toBeGreaterThan(-1);
    expect(uploadIndex).toBeGreaterThan(releaseIndex);
  });
});
