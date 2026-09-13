/** One read-only scene. The shared Studio authority owns native XR session lifetime. */
import { Color, DoubleSide, Group, Matrix4, Mesh, MeshBasicMaterial, PerspectiveCamera, PlaneGeometry, Quaternion, Raycaster, RingGeometry, Scene, Vector3, WebGLRenderer } from "three";
import { createStudioWebXrSessionController } from "../studio-webxr-session";
import { moveSpatialReaderCursor, normalizeSpatialReaderSettings, resolveSpatialReaderCursor, spatialReaderCrops, spatialReaderStickStep, SPATIAL_READER_QUALITY } from "./spatial-reader-model";
import { makeSpatialReaderLabel, makeSpatialReaderTexture, releaseSpatialReaderTexture, SpatialReaderImagePool } from "./spatial-reader-textures";
import type { StudioWebXrMode, StudioWebXrSessionController, StudioWebXrSessionState, StudioWebXrSupportSnapshot } from "../studio-webxr-session";
import type { SpatialImageSize, SpatialReaderCommand, SpatialReaderCursor, SpatialReaderSettings } from "./spatial-reader-model";
import type { CanvasTexture, Object3D } from "three";

export interface SpatialReaderSnapshot { pages: readonly string[]; cursor: SpatialReaderCursor; sizes: Readonly<Record<number, SpatialImageSize>>; settings: SpatialReaderSettings }
export interface SpatialReaderRuntimeOptions {
  canvas: HTMLCanvasElement; overlayRoot: HTMLElement;
  onState: (state: StudioWebXrSessionState) => void; onCommand: (command: SpatialReaderCommand) => void;
  onSize: (page: number, size: SpatialImageSize, source: string) => void;
  onMessage: (message: string) => void; onError: (message: string) => void;
}
export interface SpatialReaderRuntime {
  inspectSupport(): Promise<StudioWebXrSupportSnapshot>; update(snapshot: SpatialReaderSnapshot): void;
  start(mode: StudioWebXrMode): Promise<void>; end(): Promise<void>; recenter(): void; dispose(): Promise<void>;
}
const THEMES = { night: "#101923", paper: "#e8e5de", sepia: "#332b23" };
const LABELS: readonly [SpatialReaderCommand, string][] = [
  ["previous", "이전"], ["next", "다음"], ["recenter", "중앙 정렬"], ["exit", "XR 종료"],
  ["nearer", "가까이"], ["farther", "멀리"], ["smaller", "축소"], ["larger", "확대"],
];
class ReaderRuntime implements SpatialReaderRuntime {
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene(); private readonly camera = new PerspectiveCamera(55, 1, 0.05, 50);
  private readonly stage = new Group(); private readonly panels = new Group(); private readonly controls = new Group();
  private readonly raycaster = new Raycaster(); private readonly matrix = new Matrix4();
  private readonly viewerPosition = new Vector3(); private readonly viewerRotation = new Quaternion(); private readonly viewerScale = new Vector3();
  private readonly forward = new Vector3(); private readonly hitMatrix = new Matrix4(); private readonly hitNormal = new Vector3();
  private readonly pool = new SpatialReaderImagePool(); private readonly controller: StudioWebXrSessionController;
  private readonly targetActions = new WeakMap<Object3D, SpatialReaderCommand>();
  private readonly reticle = new Mesh(new RingGeometry(0.045, 0.065, 40).rotateX(-Math.PI / 2), new MeshBasicMaterial({ color: "#86ffe0", side: DoubleSide, depthTest: false }));
  private readonly dwellBar = new Mesh(new PlaneGeometry(0.3, 0.015), new MeshBasicMaterial({ color: "#86ffe0", depthTest: false }));
  private readonly pointer = new Mesh(new RingGeometry(0.006, 0.01, 24), new MeshBasicMaterial({ color: "#86ffe0", side: DoubleSide, depthTest: false }));
  private snapshot: SpatialReaderSnapshot | null = null; private session: XRSession | null = null;
  private mode: StudioWebXrMode | null = null; private hitSource: XRHitTestSource | null = null;
  private needsRecenter = true; private awaitingPlacement = false; private generation = 0; private disposed = false;
  private disposePromise: Promise<void> | null = null; private targets: Object3D[] = []; private lastCommandTime = -Infinity;
  private dwellAction: SpatialReaderCommand | null = null; private dwellSince = 0; private dwellFired = false;
  private readonly stickLatch = new Map<XRInputSource, boolean>(); private contentKey = ""; private lastFrameTime = 0;
  constructor(private readonly options: SpatialReaderRuntimeOptions) {
    this.renderer = new WebGLRenderer({ canvas: options.canvas, alpha: true, antialias: true, powerPreference: "low-power" });
    this.renderer.setPixelRatio(1); this.renderer.setSize(2, 2, false); this.renderer.xr.enabled = false;
    this.stage.add(this.panels, this.controls); this.stage.visible = false;
    this.scene.add(this.stage, this.reticle, this.pointer);
    this.reticle.visible = false; this.reticle.matrixAutoUpdate = false; this.reticle.renderOrder = 10;
    this.pointer.visible = false; this.pointer.renderOrder = 20; this.dwellBar.visible = false; this.controls.add(this.dwellBar);
    const manager = this.renderer.xr;
    this.controller = createStudioWebXrSessionController({
      renderer: {
        get enabled() { return manager.enabled; }, set enabled(value) { manager.enabled = value; },
        get isPresenting() { return manager.isPresenting; },
        setReferenceSpaceType: (type) => manager.setReferenceSpaceType(type),
        setSession: (session) => manager.setSession(session), getSession: () => manager.getSession(),
        waitUntilReleased: async (session) => {
          const released = () => manager.getSession() !== session && !manager.isPresenting;
          if (released()) return;
          await new Promise<void>((resolve) => {
            const done = () => { if (released()) { manager.removeEventListener("sessionend", done); resolve(); } };
            manager.addEventListener("sessionend", done); queueMicrotask(done);
          });
        },
      },
      environment: {
        secureContext: globalThis.isSecureContext === true,
        xr: navigator.xr ? {
          isSessionSupported: (mode) => navigator.xr!.isSessionSupported(mode),
          // Native request stays synchronous with the user's click.
          requestSession: (mode, init) => navigator.xr!.requestSession(mode, { ...init, optionalFeatures: [...(init?.optionalFeatures ?? []), ...(mode === "immersive-ar" ? ["hit-test"] : [])] }),
        } : null,
      },
      domOverlayRoot: options.overlayRoot,
      onStateChange: (state) => {
        if (state.status === "idle" || state.status === "error") this.releaseSessionResources();
        if (!this.disposed) options.onState(state);
      },
    });
    options.overlayRoot.addEventListener("beforexrselect", this.onBeforeXrSelect);
    options.canvas.addEventListener("webglcontextlost", this.onContextLost);
    window.addEventListener("pagehide", this.onPageHide);
    try { this.buildControls(); } catch (error) { void this.dispose(); throw error; }
  }
  inspectSupport(): Promise<StudioWebXrSupportSnapshot> { return this.controller.inspectSupport(); }
  private readonly onBeforeXrSelect = (event: Event) => {
    if (event.target instanceof Element && event.target.closest("[data-spatial-xr-controls]")) event.preventDefault();
  };
  private readonly onPageHide = () => { void this.end(); };
  private readonly onContextLost = (event: Event) => {
    event.preventDefault(); this.options.onError("그래픽 연결이 끊겼습니다. 공간 리더를 닫고 다시 열어 주세요. 원고는 변경되지 않았습니다."); void this.end();
  };
  private releaseSessionResources(): void {
    if (this.session) { this.session.removeEventListener("select", this.onSelect); this.session.removeEventListener("visibilitychange", this.onVisibilityChange); }
    this.session = null;
    try { this.hitSource?.cancel(); } catch { /* Native end can invalidate the subscription. */ }
    this.hitSource = null;
    this.reticle.visible = false; this.pointer.visible = false; this.stage.visible = false;
    this.stickLatch.clear(); this.clearDwell(); this.renderer.setAnimationLoop(null);
  }
  private readonly onVisibilityChange = () => {
    this.clearDwell(); this.stickLatch.clear(); this.reticle.visible = false; this.pointer.visible = false;
    if (this.session?.visibilityState === "visible") this.options.onMessage("읽기를 이어갈 수 있습니다. 위치가 어긋났다면 중앙 정렬을 눌러 주세요.");
  };
  async start(mode: StudioWebXrMode): Promise<void> {
    if (this.disposed) throw new Error("리더가 닫혔습니다.");
    if (!this.snapshot?.pages.length) throw new Error("먼저 읽을 이미지를 열어 주세요.");
    if (this.session || this.controller.state.status === "requesting") throw new Error("이미 XR 전환이 진행 중입니다.");
    this.mode = mode; this.needsRecenter = true; this.awaitingPlacement = mode === "immersive-ar";
    this.renderer.xr.setFramebufferScaleFactor(SPATIAL_READER_QUALITY[this.snapshot.settings.quality].framebufferScale);
    this.scene.background = mode === "immersive-ar" ? null : new Color(THEMES[this.snapshot.settings.theme]);
    this.renderer.setClearAlpha(mode === "immersive-ar" ? 0 : 1);
    const session = await this.controller.start(mode);
    if (this.disposed) return;
    this.session = session; session.addEventListener("select", this.onSelect); session.addEventListener("visibilitychange", this.onVisibilityChange);
    this.renderer.setAnimationLoop(this.onFrame);
    this.options.onMessage(mode === "immersive-ar" ? "주변을 살펴 표면 표시를 찾고 누르면 배치합니다. 표면을 못 찾으면 현재 시점 앞에서 읽을 수 있습니다." : "이전·다음 또는 컨트롤러 스틱으로 읽으세요. 손가락 집기 선택도 같은 버튼을 사용합니다.");
    if (mode === "immersive-ar") void this.requestHitTest(session);
  }
  private async requestHitTest(session: XRSession): Promise<void> {
    try {
      if (!session.requestHitTestSource) throw new Error("Hit test unavailable");
      const viewer = await session.requestReferenceSpace("viewer");
      if (this.disposed || this.session !== session) return;
      const source = await session.requestHitTestSource({ space: viewer });
      if (!source) throw new Error("Hit test unavailable");
      if (this.disposed || this.session !== session) { source.cancel(); return; }
      this.hitSource = source;
    } catch {
      if (!this.disposed && this.session === session) { this.awaitingPlacement = false; this.options.onMessage("이 기기에서는 표면 감지를 사용할 수 없어 시점 앞에 배치했습니다. 중앙 정렬·거리·크기로 조절하세요."); }
    }
  }
  async end(): Promise<void> {
    // Use the authority's disposal fence while renderer attachment is in flight.
    if (this.controller.state.status === "requesting") { await this.dispose(); return; }
    await this.controller.end(); this.releaseSessionResources();
    if (this.controller.requiresRendererRecreation && !this.disposed) this.options.onError("기기 세션이 연결 중 종료됐습니다. 공간 리더를 닫고 다시 열어 주세요.");
  }
  recenter(): void {
    this.needsRecenter = true; this.awaitingPlacement = this.mode === "immersive-ar" && this.hitSource !== null;
    this.reticle.visible = false; this.clearDwell();
  }
  update(snapshot: SpatialReaderSnapshot): void {
    if (this.disposed) return;
    const old = this.snapshot; this.snapshot = { ...snapshot, settings: normalizeSpatialReaderSettings(snapshot.settings) };
    const settings = this.snapshot.settings;
    if (old && old.settings.distance !== settings.distance) this.recenter();
    this.stage.scale.setScalar(settings.scale);
    if (this.mode === "immersive-vr") this.scene.background = new Color(THEMES[settings.theme]);
    if (!settings.dwell) this.clearDwell();
    const current = resolveSpatialReaderCursor(snapshot.cursor, snapshot.pages.length, snapshot.sizes, settings.segments);
    const key = JSON.stringify([snapshot.pages[current.page], current.page, snapshot.cursor.segment, settings.layout, settings.quality, settings.segments, settings.direction, settings.distance, settings.scale, snapshot.pages.length, snapshot.pages[current.page - 1], snapshot.pages[current.page + 1], snapshot.sizes[current.page], snapshot.sizes[current.page - 1], snapshot.sizes[current.page + 1]]);
    if (key !== this.contentKey) { this.contentKey = key; this.buildPanels(); }
  }
  private disposeMesh(mesh: Mesh<PlaneGeometry, MeshBasicMaterial>): void {
    releaseSpatialReaderTexture(mesh.material.map as CanvasTexture | null); mesh.material.dispose(); mesh.geometry.dispose();
  }
  private buildControls(): void {
    for (const [index, [action, label]] of LABELS.entries()) {
      const mesh = new Mesh(new PlaneGeometry(0.37, 0.13), new MeshBasicMaterial({ map: makeSpatialReaderLabel(label, action === "exit"), toneMapped: false, side: DoubleSide }));
      mesh.position.set((index % 4 - 1.5) * 0.4, -0.87 - Math.floor(index / 4) * 0.17, 0.015);
      mesh.userData.readerControl = true; this.controls.add(mesh); this.targetActions.set(mesh, action);
    }
    this.dwellBar.position.set(0, -1.17, 0.02);
  }
  private buildPanels(): void {
    const snapshot = this.snapshot; if (!snapshot) return;
    const generation = ++this.generation;
    for (const item of [...this.panels.children]) { this.panels.remove(item); this.disposeMesh(item as Mesh<PlaneGeometry, MeshBasicMaterial>); }
    this.targets = this.controls.children.filter((child) => child.userData.readerControl);
    if (!snapshot.pages.length) return;
    const settings = snapshot.settings;
    const current = resolveSpatialReaderCursor(snapshot.cursor, snapshot.pages.length, snapshot.sizes, settings.segments);
    const slots: { cursor: SpatialReaderCursor; offset: number }[] = [{ cursor: { ...current, segment: snapshot.cursor.segment }, offset: 0 }];
    if (settings.layout !== "focus" && settings.distance >= settings.scale * 1.35) {
      for (const [command, offset] of [["previous", -1], ["next", 1]] as const) {
        const cursor = moveSpatialReaderCursor(current, command, snapshot.pages.length, snapshot.sizes, settings.segments);
        const resolved = resolveSpatialReaderCursor(cursor, snapshot.pages.length, snapshot.sizes, settings.segments);
        if (resolved.page !== current.page || resolved.segment !== current.segment) slots.push({ cursor, offset });
      }
    }
    for (const slot of slots) {
      const source = snapshot.pages[slot.cursor.page]; if (!source) continue;
      const mesh = new Mesh(new PlaneGeometry(1, 1), new MeshBasicMaterial({ map: makeSpatialReaderLabel("이미지 여는 중"), toneMapped: false, side: DoubleSide }));
      mesh.scale.set(1.15, 1.3, 1); this.panels.add(mesh);
      if (slot.offset !== 0) {
        const offset = slot.offset * (settings.direction === "rtl" ? -1 : 1); const theta = offset * Math.PI / 4;
        if (settings.layout === "arc") {
          const radius = settings.distance / settings.scale;
          mesh.position.set(Math.sin(theta) * radius, 0, (1 - Math.cos(theta)) * radius); mesh.rotation.y = -theta;
        } else mesh.position.set(offset * 1.38, 0, 0);
        this.targetActions.set(mesh, slot.offset < 0 ? "previous" : "next"); this.targets.push(mesh);
      }
      void this.pool.load(source).then((image) => {
        if (this.disposed || generation !== this.generation) return;
        const size = { width: image.naturalWidth, height: image.naturalHeight }; this.options.onSize(slot.cursor.page, size, source);
        const crops = spatialReaderCrops(size, settings.segments);
        const crop = crops[Math.max(0, Math.min(crops.length - 1, slot.cursor.segment))]!;
        const texture = makeSpatialReaderTexture(image, crop, SPATIAL_READER_QUALITY[settings.quality].textureEdge);
        releaseSpatialReaderTexture(mesh.material.map as CanvasTexture | null); mesh.material.map = texture; mesh.material.needsUpdate = true;
        const ratio = crop.width / crop.height; const height = Math.min(1.3, 1.15 / ratio); const factor = slot.offset === 0 ? 1 : 0.85;
        mesh.scale.set(height * ratio * factor, height * factor, 1);
      }).catch((error: unknown) => {
        if (this.disposed || generation !== this.generation) return;
        releaseSpatialReaderTexture(mesh.material.map as CanvasTexture | null); mesh.material.map = makeSpatialReaderLabel("이미지 불러오기 실패"); mesh.material.needsUpdate = true;
        if (slot.offset === 0) this.options.onError(error instanceof Error ? error.message : "이미지를 열지 못했습니다.");
      });
    }
  }
  private clearDwell(): void { this.dwellAction = null; this.dwellSince = 0; this.dwellFired = false; this.dwellBar.visible = false; }
  private invoke(action: SpatialReaderCommand, time: number): void {
    if (this.disposed || time - this.lastCommandTime < 220) return;
    this.lastCommandTime = time;
    if (this.dwellAction === action) this.dwellFired = true;
    if (action === "recenter") this.recenter();
    else if (action === "exit") void this.end().catch(() => this.options.onError("XR 종료를 완료하지 못했습니다. 기기 시스템의 종료 메뉴를 사용해 주세요."));
    else this.options.onCommand(action);
  }
  private readonly onSelect = (event: XRInputSourceEvent) => {
    const reference = this.renderer.xr.getReferenceSpace();
    if (this.disposed || this.session?.visibilityState !== "visible" || !reference) return;
    try {
      // Use the event's transient-pointer ray; never assume inputSources[0/1].
      const pose = event.frame.getPose(event.inputSource.targetRaySpace, reference); if (!pose) return;
      this.matrix.fromArray(pose.transform.matrix); this.raycaster.ray.origin.setFromMatrixPosition(this.matrix);
      this.raycaster.ray.direction.set(0, 0, -1).transformDirection(this.matrix);
      this.scene.updateMatrixWorld(true);
      const hit = this.raycaster.intersectObjects(this.targets, false)[0]; const action = hit && this.targetActions.get(hit.object);
      if (action) { this.invoke(action, performance.now()); return; }
      if (this.awaitingPlacement && this.reticle.visible && performance.now() - this.lastFrameTime < 250) {
        this.stage.position.setFromMatrixPosition(this.hitMatrix); this.hitNormal.set(0, 1, 0).transformDirection(this.hitMatrix);
        if (Math.abs(this.hitNormal.y) > 0.7) this.stage.position.y += 0.8 * (this.snapshot?.settings.scale ?? 1);
        this.forward.subVectors(this.stage.position, this.viewerPosition).setY(0);
        if (this.forward.lengthSq() > 0.001) this.stage.rotation.set(0, Math.atan2(-this.forward.x, -this.forward.z), 0);
        this.awaitingPlacement = false; this.reticle.visible = false;
        this.options.onMessage("표면 위치에 배치했습니다. 다시 놓으려면 중앙 정렬을 누르세요. 방·카메라·공간 좌표는 저장하지 않습니다.");
      }
    } catch { /* A source can disappear mid-gesture; ignore its stale pose. */ }
  };
  private readonly onFrame = (time: number, frame?: XRFrame) => {
    if (this.disposed || !frame || !this.session || !this.snapshot) return;
    const reference = this.renderer.xr.getReferenceSpace(); if (!reference) return;
    if (this.session.visibilityState !== "visible") { this.clearDwell(); return; }
    let pose: XRViewerPose | null;
    try { pose = frame.getViewerPose(reference) ?? null; } catch { this.clearDwell(); return; }
    if (!pose) { this.reticle.visible = false; this.pointer.visible = false; this.clearDwell(); return; }
    this.lastFrameTime = performance.now();
    this.matrix.fromArray(pose.transform.matrix).decompose(this.viewerPosition, this.viewerRotation, this.viewerScale);
    if (this.needsRecenter) {
      this.forward.set(0, 0, -1).applyQuaternion(this.viewerRotation).setY(0);
      if (this.forward.lengthSq() < 0.001) this.forward.set(0, 0, -1);
      this.forward.normalize(); this.stage.position.copy(this.viewerPosition).addScaledVector(this.forward, this.snapshot.settings.distance);
      this.stage.rotation.set(0, Math.atan2(-this.forward.x, -this.forward.z), 0); this.stage.visible = true; this.needsRecenter = false;
    }
    this.reticle.visible = false;
    if (this.awaitingPlacement && this.hitSource) {
      try {
        const result = frame.getHitTestResults(this.hitSource)[0]?.getPose(reference);
        if (result) { this.hitMatrix.fromArray(result.transform.matrix); this.reticle.matrix.copy(this.hitMatrix); this.reticle.visible = true; }
      } catch { /* Hit-test tracking can be temporarily unavailable. */ }
    }
    this.scene.updateMatrixWorld(true); this.pointer.visible = false;
    const activeSources = new Set(this.session.inputSources);
    for (const source of this.stickLatch.keys()) if (!activeSources.has(source)) this.stickLatch.delete(source);
    for (const source of activeSources) {
      const axes = source.gamepad?.axes;
      if (axes) {
        const axis = axes.length >= 4 ? axes[2] : axes[0];
        const step = spatialReaderStickStep(axis ?? 0, this.stickLatch.get(source) ?? false);
        this.stickLatch.set(source, step.latched);
        if (step.command) this.invoke(this.snapshot.settings.direction === "rtl" ? (step.command === "next" ? "previous" : "next") : step.command, time);
      }
      let inputPose: XRPose | null;
      try { inputPose = frame.getPose(source.targetRaySpace, reference) ?? null; } catch { continue; }
      if (inputPose) {
        this.matrix.fromArray(inputPose.transform.matrix);
        this.raycaster.ray.origin.setFromMatrixPosition(this.matrix);
        this.raycaster.ray.direction.set(0, 0, -1).transformDirection(this.matrix);
        const hit = this.raycaster.intersectObjects(this.targets, false)[0];
        if (hit) { this.pointer.position.copy(hit.point); this.pointer.quaternion.copy(this.viewerRotation); this.pointer.visible = true; }
      }
    }
    if (this.snapshot.settings.dwell) {
      // Head-direction dwell is opt-in, not eye tracking. Losing focus resets its timer.
      this.raycaster.ray.origin.copy(this.viewerPosition);
      this.raycaster.ray.direction.set(0, 0, -1).applyQuaternion(this.viewerRotation);
      const hit = this.raycaster.intersectObjects(this.targets, false)[0];
      const action = hit ? this.targetActions.get(hit.object) ?? null : null;
      if (action !== this.dwellAction) { this.clearDwell(); this.dwellAction = action; this.dwellSince = time; }
      if (action && !this.dwellFired) {
        const progress = Math.min(1, Math.max(0, (time - this.dwellSince) / 1400));
        this.dwellBar.visible = true; this.dwellBar.scale.x = progress;
        if (progress >= 1) { this.dwellFired = true; this.dwellBar.visible = false; this.invoke(action, time); }
      }
    }
    this.renderer.render(this.scene, this.camera);
  };
  dispose(): Promise<void> {
    if (this.disposePromise) return this.disposePromise;
    this.disposed = true; this.generation += 1; this.pool.dispose();
    this.options.overlayRoot.removeEventListener("beforexrselect", this.onBeforeXrSelect);
    this.options.canvas.removeEventListener("webglcontextlost", this.onContextLost);
    window.removeEventListener("pagehide", this.onPageHide);
    this.disposePromise = this.controller.dispose().finally(() => {
      this.releaseSessionResources();
      for (const group of [this.panels, this.controls]) {
        for (const item of [...group.children]) { group.remove(item); this.disposeMesh(item as Mesh<PlaneGeometry, MeshBasicMaterial>); }
      }
      for (const mesh of [this.reticle, this.pointer]) { mesh.geometry.dispose(); mesh.material.dispose(); }
      this.renderer.dispose(); this.renderer.forceContextLoss();
    });
    return this.disposePromise;
  }
}
export function createSpatialReaderRuntime(options: SpatialReaderRuntimeOptions): SpatialReaderRuntime {
  return new ReaderRuntime(options);
}
