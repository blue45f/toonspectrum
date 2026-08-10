import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const poserSource = readFileSync(new URL("./StudioVrmPoser.tsx", import.meta.url), "utf8");
const panelSource = readFileSync(
  new URL("./StudioVrmTexturePaintPanel.tsx", import.meta.url),
  "utf8",
);
const runtimeSource = readFileSync(
  new URL("./studio-vrm-texture-paint-runtime.ts", import.meta.url),
  "utf8",
);
const fillWorkerClientSource = readFileSync(
  new URL("./studio-vrm-texture-fill-worker-client.ts", import.meta.url),
  "utf8",
);

function requiredIndex(source: string, token: string, from = 0): number {
  const index = source.indexOf(token, from);
  if (index < 0) throw new Error(`Expected source token was not found: ${token}`);
  return index;
}

function sourceBetween(source: string, startToken: string, endToken: string): string {
  const start = requiredIndex(source, startToken);
  const end = requiredIndex(source, endToken, start + startToken.length);
  return source.slice(start, end);
}

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

  it("eagerly prepares Lumi and re-invalidates the demand viewport after surface layout settles", () => {
    const eagerLoad = requiredIndex(
      poserSource,
      "loadModelRef.current(SAMPLE_VRM_ENTRIES[0]);",
    );
    const libraryHydration = requiredIndex(
      poserSource,
      "listVrmLibraryEntries()",
      eagerLoad,
    );
    const readyFrame = sourceBetween(
      poserSource,
      "function StudioVrmViewportReadyFrame(",
      "function studioVrmTexturePaintHit(",
    );

    expect(eagerLoad).toBeLessThan(libraryHydration);
    // 의도적 변경(2026-08-07): 취소된 로드가 status=loading 에 갇히지 않도록 설치 여부(vrmRef)까지 확인.
    expect(poserSource).toContain(
      "if (modelLoadTargetIdRef.current === targetEntry.id && vrmRef.current) return;",
    );
    expect(readyFrame).toContain("useLayoutEffect(() => {");
    expect(readyFrame).toContain("settledFrame = requestAnimationFrame(() => invalidate())");
    expect(poserSource).toContain(
      'revision={`${installedModelId ?? "empty"}:${status}:${texturePaintModeSelected ? "surface" : "standard"}`}',
    );
  });

  it("reserves most narrow-screen height for scrollable surface controls", () => {
    expect(poserSource).toContain(
      "grid-rows-[minmax(0,2fr)_minmax(0,3fr)] sm:grid-rows-[minmax(0,1fr)_minmax(0,1fr)]",
    );
    expect(poserSource).not.toContain(
      "grid-rows-[minmax(0,60dvh)_minmax(0,1fr)]",
    );
    expect(poserSource).toContain(
      'id="vrm-panel-body" role="tabpanel"',
    );
    expect(poserSource).toContain("min-h-0 flex-1 space-y-5 overflow-y-auto");
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
      'window.addEventListener("pointerup", finishMatchingPointer, { passive: true })',
    );
    expect(poserSource).toContain(
      'window.addEventListener("pointercancel", cancelMatchingPointer, { passive: true })',
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

  it("accepts uv1-only R3F hits and lets the runtime select the texture channel", () => {
    const hitSource = sourceBetween(
      poserSource,
      "function studioVrmTexturePaintHit(",
      "function studioVrmTexturePaintPressure(",
    );
    const resolveBaseColorHit = sourceBetween(
      runtimeSource,
      "private resolveBaseColorHit(",
      "private resolveHit(",
    );

    expect(hitSource).toContain("(!event.uv && !event.uv1)");
    expect(hitSource).toContain("...(event.uv ? { uv: event.uv } : {})");
    expect(hitSource).toContain("...(event.uv1 ? { uv1: event.uv1 } : {})");
    expect(runtimeSource).toContain(
      "readonly uv1?: THREE.Vector2 | Readonly<{ x: number; y: number }>;",
    );
    expect(resolveBaseColorHit).toContain("let textureChannel: number");
    expect(resolveBaseColorHit).toContain(
      "textureChannel = effectiveTexture.channel",
    );
    expect(resolveBaseColorHit).toContain(
      "finiteUv(textureChannel === 1 ? hit.uv1 : hit.uv)",
    );
  });

  it("arms Alt and explicit eyedropper samples on down but executes only after a confirmed up", () => {
    const begin = sourceBetween(
      poserSource,
      "const beginTexturePaint =",
      "const moveTexturePaint =",
    );
    const finish = sourceBetween(
      poserSource,
      "const finishTexturePaint = (event: ThreeEvent<PointerEvent>)",
      "const cancelTexturePaint = (event: ThreeEvent<PointerEvent>)",
    );
    const oneShot = sourceBetween(
      poserSource,
      "const runTexturePaintOneShot =",
      "const finishTexturePaintPendingOneShotTap =",
    );
    const explicitEyedropper = requiredIndex(
      begin,
      "const explicitEyedropper = texturePaintEyedropperActiveRef.current",
    );
    const sampleIntent = requiredIndex(
      begin,
      "event.altKey || explicitEyedropper",
      explicitEyedropper,
    );
    const pendingOwnership = requiredIndex(
      begin,
      "texturePaintPendingOneShotTapRef.current = pending",
      sampleIntent,
    );
    const tapCapture = requiredIndex(
      begin,
      "captureTarget.setPointerCapture(event.pointerId)",
      pendingOwnership,
    );
    const pendingReturn = requiredIndex(begin, "return;", tapCapture);
    const brushStart = requiredIndex(begin, "runtime.beginStroke({", pendingReturn);

    expect(explicitEyedropper).toBeLessThan(sampleIntent);
    expect(sampleIntent).toBeLessThan(pendingOwnership);
    expect(pendingOwnership).toBeLessThan(tapCapture);
    expect(tapCapture).toBeLessThan(pendingReturn);
    expect(pendingReturn).toBeLessThan(brushStart);
    expect(begin).not.toContain("runtime.sampleBaseColor(");
    expect(begin).not.toContain("runtime.fillBaseColor(");
    expect(oneShot).toContain("pending.runtime.sampleBaseColor({");
    expect(finish).toContain("finishTexturePaintPendingOneShotTap(");
  });

  it("owns and aborts asynchronous surface samples without accepting stale completion", () => {
    const actorSetup = sourceBetween(
      poserSource,
      "function VrmActor({",
      "useEffect(() => {",
    );
    const oneShot = sourceBetween(
      poserSource,
      "const runTexturePaintOneShot =",
      "const finishTexturePaintPendingOneShotTap =",
    );
    const runtimeSample = sourceBetween(
      runtimeSource,
      "async sampleBaseColor(",
      "async beginStroke(",
    );

    expect(actorSetup).toContain(
      "const texturePaintOneShotGenerationRef = useRef(0)",
    );
    expect(actorSetup).toContain(
      "const texturePaintOneShotAbortRef = useRef<AbortController | null>(null)",
    );
    expect(oneShot).toContain("const controller = new AbortController()");
    expect(oneShot).toContain(
      "texturePaintOneShotAbortRef.current = controller",
    );
    expect(oneShot).toContain(
      "pending.runtime.sampleBaseColor({",
    );
    expect(oneShot).toContain(
      "signal: controller.signal",
    );
    expect(oneShot).toContain(
      "generation !== texturePaintOneShotGenerationRef.current",
    );
    expect(oneShot).toContain(
      "texturePaintOneShotAbortRef.current === controller",
    );
    expect(poserSource).toContain("texturePaintOneShotAbortRef.current?.abort()");

    expect(runtimeSample).toContain("const controller = new AbortController()");
    expect(runtimeSample).toContain("const abortFromCaller = () => controller.abort()");
    expect(runtimeSample).toContain(
      'input.signal?.addEventListener("abort", abortFromCaller, { once: true })',
    );
    expect(runtimeSample).toContain(
      'input.signal?.removeEventListener("abort", abortFromCaller)',
    );
    expect(runtimeSample).toContain(
      "if (this.sampling !== request || this.disposed)",
    );
    expect(runtimeSample).toContain(
      "!sameResolvedBaseColorHit(resolved, currentHit.value)",
    );
  });

  it("updates only the selected colour and disarms only a successful armed sample", () => {
    const oneShot = sourceBetween(
      poserSource,
      "const runTexturePaintOneShot =",
      "const finishTexturePaintPendingOneShotTap =",
    );
    const colorHandler = sourceBetween(
      poserSource,
      "const handleTexturePaintColorSampled =",
      "const handleTexturePaintUndo =",
    );
    const actorWiring = sourceBetween(
      poserSource,
      "<VrmActor",
      "{vrm && showPoseBoneOverlay",
    );

    const success = requiredIndex(
      oneShot,
      'pending.kind === "sample" && result.ok',
    );
    const colorUpdate = requiredIndex(
      oneShot,
      "texturePaintColorSampledRef.current(result.value.color)",
      success,
    );
    const oneShotCompletion = requiredIndex(
      oneShot,
      "if (pending.explicitEyedropper) texturePaintEyedropperCompleteRef.current()",
      colorUpdate,
    );
    const successEnd = requiredIndex(oneShot, "invalidate();", oneShotCompletion);
    const catchStart = requiredIndex(oneShot, ".catch(", successEnd);

    expect(colorUpdate).toBeLessThan(oneShotCompletion);
    expect(oneShotCompletion).toBeLessThan(successEnd);
    expect(successEnd).toBeLessThan(catchStart);
    expect(oneShot.slice(catchStart)).not.toContain(
      "texturePaintEyedropperCompleteRef.current()",
    );
    expect(colorHandler).toContain(
      "setTexturePaintSettings((current) => ({ ...current, color }))",
    );
    expect(colorHandler).not.toContain("opacity");
    expect(colorHandler).not.toContain("blend");
    expect(colorHandler).not.toContain("tuning");
    expect(actorWiring).toContain(
      "onTexturePaintColorSampled={handleTexturePaintColorSampled}",
    );
    expect(actorWiring).toContain(
      "onTexturePaintEyedropperComplete={() =>",
    );
    expect(actorWiring).toContain(
      "setTexturePaintEyedropperActive(false)",
    );
  });

  it("wires one 44px panel eyedropper through the poser and runtime", () => {
    const panelButton = sourceBetween(
      panelSource,
      'aria-label={eyedropperActive ? "표면 스포이드 취소" : "표면 스포이드"}',
      '<input',
    );
    const panelWiring = sourceBetween(
      poserSource,
      "<StudioVrmTexturePaintPanel\n",
      "/>",
    );

    expect(panelSource).toContain("readonly eyedropperActive: boolean");
    expect(panelSource).toContain("readonly onEyedropperToggle: () => void");
    expect(panelButton).toContain("aria-pressed={eyedropperActive}");
    expect(panelButton).toContain("size-11");
    expect(panelButton).toContain("onClick={onEyedropperToggle}");
    expect(panelWiring).toContain(
      "eyedropperActive={texturePaintEyedropperActive}",
    );
    expect(panelWiring).toContain(
      "onEyedropperToggle={() =>",
    );
    expect(runtimeSource).toContain("async sampleBaseColor(");
    const sampleGuard = sourceBetween(
      runtimeSource,
      "async sampleBaseColor(",
      "if (input.signal?.aborted)",
    );
    for (const mutuallyExclusiveOperation of [
      "this.sampling",
      "this.filling",
      "this.pending",
      "this.active",
      "this.surfaceSession",
    ]) {
      expect(sampleGuard).toContain(mutuallyExclusiveOperation);
    }
    expect(sampleGuard).toContain('return this.fail("pointer-active");');
  });

  it("arms ColorDrop as a pending tap while preserving brush pointerdown latency", () => {
    const begin = sourceBetween(
      poserSource,
      "const beginTexturePaint =",
      "const moveTexturePaint =",
    );
    const oneShot = sourceBetween(
      poserSource,
      "const runTexturePaintOneShot =",
      "const finishTexturePaintPendingOneShotTap =",
    );
    const settings = requiredIndex(begin, "const settings = texturePaintSettingsRef.current");
    const fillIntent = requiredIndex(begin, 'settings.tool === "fill"', settings);
    const pendingOwnership = requiredIndex(
      begin,
      "texturePaintPendingOneShotTapRef.current = pending",
      fillIntent,
    );
    const pendingReturn = requiredIndex(begin, "return;", pendingOwnership);
    const brushPointerOwnership = requiredIndex(
      begin,
      "const pointerId = event.pointerId",
      pendingReturn,
    );
    const brushPointerCapture = requiredIndex(
      begin,
      "captureTarget.setPointerCapture(pointerId)",
      brushPointerOwnership,
    );
    const brushStart = requiredIndex(begin, "runtime.beginStroke({", brushPointerCapture);

    expect(settings).toBeLessThan(fillIntent);
    expect(fillIntent).toBeLessThan(pendingOwnership);
    expect(pendingOwnership).toBeLessThan(pendingReturn);
    expect(pendingReturn).toBeLessThan(brushPointerOwnership);
    expect(brushPointerOwnership).toBeLessThan(brushPointerCapture);
    expect(brushPointerCapture).toBeLessThan(brushStart);
    expect(begin).not.toContain("runtime.fillBaseColor({");
    expect(oneShot).toContain("pending.runtime.fillBaseColor({");
    expect(oneShot).toContain("color: pending.settings.color");
    expect(oneShot).toContain("tolerance: pending.settings.fillTolerance");
    expect(oneShot).toContain("scope: pending.settings.fillScope");
  });

  it("owns ColorDrop as one abortable generation and rejects stale completion", () => {
    const actorSetup = sourceBetween(
      poserSource,
      "function VrmActor({",
      "useEffect(() => {",
    );
    const oneShot = sourceBetween(
      poserSource,
      "const runTexturePaintOneShot =",
      "const finishTexturePaintPendingOneShotTap =",
    );
    const unmountCleanup = sourceBetween(
      poserSource,
      "useEffect(() => () => {",
      "useEffect(() => {\n    const releaseCapture",
    );
    const disabledCleanup = sourceBetween(
      poserSource,
      "useEffect(() => {\n    if (texturePaintEnabled) return;",
      "useEffect(() => {\n    applyPoserVisualState",
    );

    expect(actorSetup).toContain(
      "const texturePaintOneShotGenerationRef = useRef(0)",
    );
    expect(actorSetup).toContain(
      "const texturePaintOneShotAbortRef = useRef<AbortController | null>(null)",
    );
    expect(actorSetup).toContain(
      "const texturePaintOneShotBusyRef = useRef(false)",
    );
    expect(oneShot).toContain(
      "const generation = texturePaintOneShotGenerationRef.current + 1",
    );
    expect(oneShot).toContain(
      "texturePaintOneShotGenerationRef.current = generation",
    );
    expect(oneShot).toContain("texturePaintOneShotBusyRef.current = true");
    expect(oneShot).toContain("const controller = new AbortController()");
    expect(oneShot).toContain("texturePaintOneShotAbortRef.current = controller");
    expect(oneShot).toContain("signal: controller.signal");
    expect(oneShot).toContain(
      "generation === texturePaintOneShotGenerationRef.current",
    );
    expect(oneShot).toContain(
      "texturePaintOneShotAbortRef.current === controller",
    );
    expect(oneShot).toContain("texturePaintOneShotAbortRef.current = null");
    expect(oneShot).toContain("texturePaintOneShotBusyRef.current = false");
    expect(unmountCleanup).toContain("texturePaintOneShotGenerationRef.current += 1");
    expect(unmountCleanup).toContain("texturePaintOneShotAbortRef.current?.abort()");
    expect(disabledCleanup).toContain("texturePaintOneShotGenerationRef.current += 1");
    expect(disabledCleanup).toContain("texturePaintOneShotAbortRef.current?.abort()");
    expect(disabledCleanup).toContain("texturePaintOneShotBusyRef.current = false");
  });

  it("cancels pending one-shot taps on movement, pinch, cancellation, capture loss, and mode cleanup", () => {
    const movement = sourceBetween(
      poserSource,
      "function studioVrmTexturePaintOneShotTapMoved(",
      "function VrmActor({",
    );
    const begin = sourceBetween(
      poserSource,
      "const beginTexturePaint =",
      "const moveTexturePaint =",
    );
    const move = sourceBetween(
      poserSource,
      "const moveTexturePaint =",
      "const finishTexturePaint =",
    );
    const finishPending = sourceBetween(
      poserSource,
      "const finishTexturePaintPendingOneShotTap =",
      "useEffect(() => {",
    );
    const cancelPending = sourceBetween(
      poserSource,
      "const cancelTexturePaintPendingOneShotTap =",
      "const runTexturePaintOneShot =",
    );
    const cancel = sourceBetween(
      poserSource,
      "const cancelTexturePaint =",
      "return (",
    );
    const pointerLifecycle = sourceBetween(
      poserSource,
      "useEffect(() => {\n    const releaseCapture",
      "useEffect(() => {\n    cancelTexturePaintPendingOneShotTap();",
    );
    const unmountCleanup = sourceBetween(
      poserSource,
      "useEffect(() => () => {",
      "useEffect(() => {\n    const releaseCapture",
    );
    const disabledCleanup = sourceBetween(
      poserSource,
      "useEffect(() => {\n    if (texturePaintEnabled) return;",
      "useEffect(() => {\n    applyPoserVisualState",
    );

    expect(poserSource).toContain(
      "STUDIO_VRM_TEXTURE_PAINT_ONE_SHOT_TAP_MAX_DISTANCE_CSS_PX = 10",
    );
    expect(movement).toContain(
      "> STUDIO_VRM_TEXTURE_PAINT_ONE_SHOT_TAP_MAX_DISTANCE_SQUARED",
    );
    expect(begin).toContain("const existingPendingTap =");
    expect(begin).toContain(
      "existingPendingTap.pointerId !== event.pointerId",
    );
    expect(begin).toContain("cancelTexturePaintPendingOneShotTap()");
    expect(begin).not.toContain("runtime.sampleBaseColor(");
    expect(begin).not.toContain("runtime.fillBaseColor(");
    expect(move).toContain("studioVrmTexturePaintOneShotTapMoved(");
    expect(move).toContain(
      "cancelTexturePaintPendingOneShotTap(event.pointerId)",
    );
    expect(move).not.toContain("runTexturePaintOneShot");
    expect(cancelPending).toContain(
      "releaseTexturePaintPendingOneShotCapture(pending)",
    );

    const release = requiredIndex(
      finishPending,
      "releaseTexturePaintPendingOneShotCapture(pending)",
    );
    const movementGate = requiredIndex(
      finishPending,
      "studioVrmTexturePaintOneShotTapMoved(",
      release,
    );
    const execute = requiredIndex(
      finishPending,
      "runTexturePaintOneShot(pending)",
      movementGate,
    );
    expect(release).toBeLessThan(movementGate);
    expect(movementGate).toBeLessThan(execute);

    expect(pointerLifecycle).toContain(
      'window.addEventListener("pointermove", cancelPendingTapOnMove, { passive: true })',
    );
    expect(pointerLifecycle).toContain(
      "pending.pointerId !== event.pointerId",
    );
    expect(pointerLifecycle).toContain(
      '"pointerdown",\n      cancelPendingTapOnAdditionalPointer,\n      true',
    );
    expect(pointerLifecycle).toContain(
      'window.addEventListener("pointercancel", cancelMatchingPointer, { passive: true })',
    );
    expect(pointerLifecycle).toContain(
      'gl.domElement.addEventListener("lostpointercapture", cancelMatchingPointer)',
    );
    expect(pointerLifecycle).toContain("cancelTexturePaintPendingOneShotTap()");
    expect(cancel).toContain(
      "cancelTexturePaintPendingOneShotTap(event.pointerId)",
    );
    expect(cancel).not.toContain("runTexturePaintOneShot");
    expect(unmountCleanup).toContain("cancelTexturePaintPendingOneShotTap()");
    expect(disabledCleanup).toContain("cancelTexturePaintPendingOneShotTap()");
  });

  it("keeps idle and eyedropper guidance aligned with the selected tool", () => {
    expect(poserSource).toContain(
      'texturePaintSettings.tool === "fill" ? "ColorDrop" : "브러시"',
    );
    expect(poserSource).toContain(
      "표면을 한 번 눌러 ColorDrop으로 채우세요. Ctrl/⌘+Z로 이 채우기를 되돌릴 수 있습니다.",
    );
    expect(poserSource).toContain(
      "표면을 끌어 칠하세요. Ctrl/⌘+Z로 이 텍스처 획을 되돌릴 수 있습니다.",
    );
  });

  it("offers an accessible F shortcut that toggles brush and ColorDrop safely", () => {
    const keyboard = sourceBetween(
      poserSource,
      'aria-keyshortcuts="F I"',
      "camera={{",
    );
    const keyNormalization = requiredIndex(
      keyboard,
      "const key = event.key.toLowerCase()",
    );
    const fillShortcut = requiredIndex(
      keyboard,
      'else if (key === "f")',
      keyNormalization,
    );

    expect(keyboard).toContain("!texturePaintInteractionEnabled");
    expect(keyboard).toContain("texturePaintStrokeActive");
    expect(keyboard).toContain("event.metaKey");
    expect(keyboard).toContain("event.ctrlKey");
    expect(keyboard).toContain("event.altKey");
    expect(fillShortcut).toBeGreaterThan(keyNormalization);
    expect(keyboard.slice(fillShortcut)).toContain("event.preventDefault()");
    expect(keyboard.slice(fillShortcut)).toContain(
      "setTexturePaintEyedropperActive(false)",
    );
    expect(keyboard.slice(fillShortcut)).toContain(
      'tool: current.tool === "brush" ? "fill" : "brush"',
    );
  });

  it("keeps production ColorDrop behind the module Worker with no direct main-thread fallback", () => {
    expect(runtimeSource).toContain(
      'from "./studio-vrm-texture-fill-worker-client"',
    );
    expect(runtimeSource).toContain(
      "runTextureFill: options.runTextureFill ?? runStudioVrmTextureFillWorker",
    );
    expect(runtimeSource).toContain(
      "fillResult = await this.options.runTextureFill({",
    );
    expect(runtimeSource).not.toContain("computeStudioVrmTextureFillMask");
    expect(fillWorkerClientSource).toContain(
      'new URL("./studio-vrm-texture-fill.worker.ts", import.meta.url)',
    );
    expect(fillWorkerClientSource).toContain('type: "module",');
    expect(fillWorkerClientSource).toContain("intentionally has no direct");
    expect(fillWorkerClientSource).not.toContain("computeStudioVrmTextureFillMask");
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
    const insertAction = poserSource.indexOf("onClick={handleInsert}");
    const insertDisabled = poserSource.lastIndexOf("disabled={", insertAction);
    expect(insertDisabled).toBeGreaterThan(-1);
    expect(poserSource.slice(insertDisabled, insertAction)).toContain(
      "persistentIkReconciling",
    );
    expect(poserSource.slice(insertDisabled, insertAction)).toContain(
      "texturePaintStrokeActive",
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
