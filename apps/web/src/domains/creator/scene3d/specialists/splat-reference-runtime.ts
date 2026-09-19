import { inspectNativeSplatAsync } from "./splat-reference-contract";
import { SpecialistError } from "./specialist-contract";
import type * as ThreeTypes from "three";
import type { OrbitControls as ControlsType } from "three/addons/controls/OrbitControls.js";
import type {
  SparkRenderer as SparkType,
  SplatMesh as MeshType,
} from "@sparkjsdev/spark";

export interface SparkReferenceSession {
  readonly count: number;
  readonly canvas: HTMLCanvasElement;
  renderedFrames(): number;
  dispose(): Promise<void>;
}
/** Spark is a bounded reference viewer, never the canonical Scene3D renderer. */
export async function createSparkReferenceSession(
  element: HTMLElement,
  bytes: Uint8Array<ArrayBuffer>,
  signal?: AbortSignal,
  onError?: (error: SpecialistError) => void,
): Promise<SparkReferenceSession> {
  const info = await inspectNativeSplatAsync(bytes, { signal });
  const [
    THREE,
    { OrbitControls },
    { SparkRenderer, SplatMesh, SplatFileType },
  ] = await Promise.all([
    import("three"),
    import("three/addons/controls/OrbitControls.js"),
    import("@sparkjsdev/spark"),
  ]);
  if (signal?.aborted) throw new SpecialistError("cancelled", "Cancelled.");
  let renderer: ThreeTypes.WebGLRenderer | undefined;
  let scene: ThreeTypes.Scene | undefined;
  let camera: ThreeTypes.PerspectiveCamera | undefined;
  let controls: ControlsType | undefined;
  let spark: SparkType | undefined;
  let mesh: MeshType | undefined;
  let observer: ResizeObserver | undefined;
  let intersection: IntersectionObserver | undefined;
  let closed = false;
  let ready = false;
  let frame = 0;
  let rendered = 0;
  let visible = true;
  let failed = false;
  let pending: Promise<void> = Promise.resolve();
  let disposing: Promise<void> | undefined;
  const schedule = () => {
    if (ready && !closed && !failed && visible && !document.hidden && !frame)
      frame = requestAnimationFrame(draw);
  };
  function notify(error: SpecialistError) {
    try {
      onError?.(error);
    } catch {
      /* Diagnostic callbacks do not own cleanup. */
    }
  }
  function reportFailure() {
    if (closed || failed) return;
    failed = true;
    cancelAnimationFrame(frame);
    if (renderer) renderer.domElement.dataset.renderError = "true";
    notify(
      new SpecialistError(
        "runtime",
        "The GPU reference renderer failed. Close and reopen the viewer on a supported browser.",
      ),
    );
  }
  function draw() {
    frame = 0;
    if (closed || !ready || !visible || document.hidden) return;
    pending = pending
      .then(async () => {
        if (closed || !spark || !scene || !camera || !renderer) return;
        await spark.update({ scene, camera });
        if (!closed) {
          renderer.render(scene, camera);
          rendered++;
          renderer.domElement.dataset.renderedFrames = String(rendered);
        }
      })
      .catch(reportFailure);
  }
  const resize = () => {
    if (closed || !renderer || !camera) return;
    const width = Math.max(1, element.clientWidth);
    renderer.setSize(width, 320);
    camera.aspect = width / 320;
    camera.updateProjectionMatrix();
    schedule();
  };
  const dispose = (): Promise<void> => {
    if (disposing) return disposing;
    closed = true;
    ready = false;
    cancelAnimationFrame(frame);
    const attempt = (action: () => void) => {
      try {
        action();
      } catch {
        /* Keep releasing the remaining owners. */
      }
    };
    attempt(() => observer?.disconnect());
    attempt(() => intersection?.disconnect());
    attempt(() => controls?.dispose());
    document.removeEventListener("visibilitychange", schedule);
    signal?.removeEventListener("abort", abort);
    disposing = (async () => {
      await Promise.allSettled(mesh ? [mesh.initialized, pending] : [pending]);
      attempt(() => mesh?.dispose());
      attempt(() => spark?.dispose());
      attempt(() => scene?.clear());
      attempt(() => renderer?.dispose());
      attempt(() => renderer?.forceContextLoss());
      attempt(() => renderer?.domElement.remove());
    })();
    return disposing;
  };
  const abort = () => {
    void dispose();
  };
  try {
    // Every partially created owner is now covered, including throwing constructors.
    renderer = new THREE.WebGLRenderer({ antialias: false });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    renderer.setClearColor(0x202630);
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(
      50,
      1,
      info.radius / 1000,
      info.radius * 100,
    );
    camera.position
      .set(...info.center)
      .add(
        new THREE.Vector3(0.8, 0.5, 1)
          .normalize()
          .multiplyScalar(info.radius * 3),
      );
    controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(...info.center);
    controls.update();
    spark = new SparkRenderer({
      renderer,
      autoUpdate: false,
      onDirty: schedule,
    });
    scene.add(spark);
    mesh = new SplatMesh({
      fileBytes: bytes.slice(),
      fileType: SplatFileType.SPLAT,
      fileName: "reference.splat",
      editable: false,
      raycastable: false,
      lod: false,
    });
    scene.add(mesh);
    observer = new ResizeObserver(resize);
    intersection = new IntersectionObserver((entries) => {
      visible = entries[0]?.isIntersecting ?? false;
      if (visible) schedule();
    });
    signal?.addEventListener("abort", abort, { once: true });
    await mesh.initialized;
    if (closed || signal?.aborted)
      throw new SpecialistError("cancelled", "Cancelled.");
    ready = true;
    element.replaceChildren(renderer.domElement);
    controls.addEventListener("change", schedule);
    observer.observe(element);
    intersection.observe(element);
    document.addEventListener("visibilitychange", schedule);
    resize();
    return {
      count: info.count,
      canvas: renderer.domElement,
      renderedFrames: () => rendered,
      dispose,
    };
  } catch (error) {
    await dispose();
    throw error;
  }
}
