import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const poserSource = readFileSync(new URL("./StudioVrmPoser.tsx", import.meta.url), "utf8");
const panelSource = readFileSync(
  new URL("./StudioVrmTexturePaintPanel.tsx", import.meta.url),
  "utf8",
);

describe("Studio VRM texture-paint production integration boundary", () => {
  it("mounts one compact surface workflow and owns one runtime per loaded VRM", () => {
    expect(poserSource).toContain('from "./studio-vrm-texture-paint-runtime"');
    expect(poserSource).toContain('from "./StudioVrmTexturePaintPanel"');
    expect(poserSource).toContain('{ id: "surface", label: "표면", icon: Paintbrush }');
    expect(poserSource).toContain('<StudioVrmTexturePaintPanel');
    expect(poserSource).toContain('hidden={hideOnCharacterSection("surface")}');
    expect(poserSource).toContain("planStudioVrmTexturePaintDeviceTier(");
    expect(poserSource).toContain("texturePaintDevicePlan.runtimeOptions");
    expect(poserSource).toContain("createStudioVrmTexturePaintRuntime(");
    expect(poserSource).toContain("const unsubscribe = runtime.subscribe");
    expect(poserSource).toContain("runtime.dispose()");
    expect(poserSource).toContain(
      "activeTargetId={texturePaintSnapshot?.activeTargetId ?? null}",
    );

    expect(panelSource).toContain('id="vrm-character-section-surface"');
    expect(panelSource).toContain('aria-labelledby="vrm-character-subtab-surface"');
    expect(panelSource).toContain("최소 굵기");
    expect(panelSource).toContain("settings.blend === \"erase\"");
    expect(panelSource).toContain("value={colorDraft}");
    expect(panelSource).toContain("onBlur={commitColorDraft}");
    expect(panelSource).toContain("aria-invalid={!colorDraftIsValid}");
  });

  it("commits only explicit pointerup and rolls back cancellation, capture loss, blur, and unmount", () => {
    const down = poserSource.indexOf("const beginTexturePaint =");
    const move = poserSource.indexOf("const moveTexturePaint =", down);
    const finish = poserSource.indexOf("const finishTexturePaint =", move);
    const cancel = poserSource.indexOf("const cancelTexturePaint =", finish);
    const primitive = poserSource.indexOf("<primitive", cancel);

    expect(down).toBeGreaterThan(-1);
    expect(move).toBeGreaterThan(down);
    expect(finish).toBeGreaterThan(move);
    expect(cancel).toBeGreaterThan(finish);
    expect(primitive).toBeGreaterThan(cancel);
    expect(poserSource.slice(down, move)).toContain("runtime.beginStroke({");
    expect(poserSource.slice(move, finish)).toContain(".moveStroke({");
    expect(poserSource).toContain("texturePaintRuntimeRef.current?.commitStroke(pointerId)");
    expect(poserSource).toContain("texturePaintRuntimeRef.current?.cancelStroke(pointerId)");
    expect(poserSource).toContain(
      'window.addEventListener("pointerup", finishMatchingPointer)',
    );
    expect(poserSource).toContain(
      'window.addEventListener("pointercancel", cancelMatchingPointer)',
    );
    expect(poserSource).toContain(
      'gl.domElement.addEventListener("lostpointercapture", cancelMatchingPointer)',
    );
    expect(poserSource).toContain('window.addEventListener("blur", cancelOnWindowBlur)');
    expect(poserSource).toContain("cancelTexturePaint();");
    expect(poserSource.slice(primitive, primitive + 420)).toContain(
      "onPointerCancel={cancelTexturePaint}",
    );
    expect(poserSource.slice(primitive, primitive + 420)).toContain(
      "onLostPointerCapture={cancelTexturePaint}",
    );
  });

  it("keeps paint moves off React state and explicitly invalidates the demand renderer", () => {
    expect(poserSource).toContain("<StudioVrmTexturePaintInvalidateBridge");
    expect(poserSource).toContain("if (result?.ok && result.value) invalidate()");
    expect(poserSource).toContain("texturePaintInvalidateRef.current?.()");
    expect(poserSource).toContain("enableRotate={!texturePaintInteractionEnabled}");
    expect(poserSource).toContain("&& !texturePaintStrokeActive");
    expect(poserSource).toContain("createStudioVrmTexturePaintCursor(texturePaintSettings)");
  });

  it("threads the R3F triangle face index through both begin and move paint hits", () => {
    const hitStart = poserSource.indexOf("function studioVrmTexturePaintHit(");
    const hitEnd = poserSource.indexOf("function studioVrmTexturePaintPressure(", hitStart);
    const hitSource = poserSource.slice(hitStart, hitEnd);
    const begin = poserSource.indexOf("const beginTexturePaint =");
    const move = poserSource.indexOf("const moveTexturePaint =", begin);
    const finish = poserSource.indexOf("const finishTexturePaint =", move);

    expect(hitStart).toBeGreaterThan(-1);
    expect(hitEnd).toBeGreaterThan(hitStart);
    expect(hitSource).toContain("faceIndex: event.faceIndex");
    expect(poserSource.slice(begin, move)).toContain(
      "const hit = studioVrmTexturePaintHit(event)",
    );
    expect(poserSource.slice(move, finish)).toContain(
      "const hit = studioVrmTexturePaintHit(event)",
    );
  });

  it("guards every history command and capture boundary during an unfinished stroke", () => {
    const undo = poserSource.indexOf("const doUndo =");
    const redo = poserSource.indexOf("const doRedo =", undo);
    const fullStateUndo = poserSource.indexOf("restoreHistoryStep(-1)", undo);
    const fullStateRedo = poserSource.indexOf("restoreHistoryStep(1)", redo);
    expect(undo).toBeGreaterThan(-1);
    expect(redo).toBeGreaterThan(undo);
    expect(poserSource.slice(undo, redo)).toContain(
      'typeof texturePaintSnapshotRef.current?.activePointerId === "number"',
    );
    expect(poserSource.slice(redo, fullStateRedo)).toContain(
      'typeof texturePaintSnapshotRef.current?.activePointerId === "number"',
    );
    expect(poserSource.indexOf("handleTexturePaintUndo()", undo)).toBeLessThan(fullStateUndo);
    expect(poserSource.indexOf("handleTexturePaintRedo()", redo)).toBeLessThan(fullStateRedo);
    expect(poserSource).toContain(
      "texturePaintSnapshotRef.current?.history.undoCount",
    );
    expect(poserSource).toContain(
      "texturePaintSnapshotRef.current?.history.redoCount",
    );
    expect(poserSource).toContain(
      "typeof activeTexturePaintPointerId === \"number\"",
    );
    expect(poserSource).toContain(
      "persistentIkReconciling || texturePaintStrokeActive",
    );
    const viewportUndo = poserSource.indexOf("const viewportCanUndo =");
    const viewportRedo = poserSource.indexOf("const viewportCanRedo =", viewportUndo);
    expect(poserSource.slice(viewportUndo, viewportRedo)).toContain(
      "!texturePaintStrokeActive",
    );
    expect(poserSource.slice(viewportRedo, viewportRedo + 260)).toContain(
      "!texturePaintStrokeActive",
    );
  });

  it("labels and describes the viewport without promising unavailable paint gestures", () => {
    const instructions = poserSource.indexOf("<p id={viewportInstructionsId}");
    const canvas = poserSource.indexOf("<Canvas", instructions);

    expect(instructions).toBeGreaterThan(-1);
    expect(canvas).toBeGreaterThan(instructions);
    expect(poserSource.slice(instructions, canvas)).toContain(
      "캐릭터 회전은 잠겨 있습니다.",
    );
    expect(poserSource.slice(canvas, canvas + 720)).toContain('role="group"');
    expect(poserSource.slice(canvas, canvas + 720)).toContain("tabIndex={0}");
    expect(poserSource.slice(canvas, canvas + 720)).toContain(
      '3D 캐릭터 표면 페인트 뷰포트',
    );
    expect(poserSource.slice(canvas, canvas + 720)).toContain(
      "aria-describedby={viewportInstructionsId}",
    );
    expect(poserSource).toContain(
      "표면 칠하기 · 회전 잠김 · 휠·핀치 또는 우측 줌 버튼",
    );
    expect(poserSource).not.toContain(
      "오른쪽 버튼으로 확대/축소",
    );
  });

  it("explains constrained-device texture budget failures in actionable Korean copy", () => {
    expect(poserSource).toContain(
      'texturePaintSnapshot?.error?.code === "target-rgba-budget"',
    );
    expect(poserSource).toContain(
      'texturePaintSnapshot?.error?.code === "aggregate-rgba-budget"',
    );
    expect(poserSource).toContain(
      "텍스처를 줄이거나 데스크톱에서 편집해 주세요.",
    );
    expect(poserSource).toContain(
      "현재 결과를 캡처한 뒤 모델을 다시 열어 다음 텍스처를 편집해 주세요.",
    );
  });
});
