import { inspectNativeSplat } from "./splat-reference-contract";
import { SpecialistError } from "./specialist-contract";

export interface SparkReferenceSession {
  readonly count: number;
  readonly canvas: HTMLCanvasElement;
  renderedFrames(): number;
  dispose(): Promise<void>;
}
/** Spark is an isolated reference viewer, not an admitted Scene3D output renderer. */
export async function createSparkReferenceSession(
  element: HTMLElement,
  bytes: Uint8Array<ArrayBuffer>,
  signal?: AbortSignal,
  onError?: (error: SpecialistError) => void,
): Promise<SparkReferenceSession> {
  const info = inspectNativeSplat(bytes);
  if (signal?.aborted) throw new SpecialistError("cancelled", "Cancelled.");
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
  const renderer = new THREE.WebGLRenderer({ antialias: false });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.setClearColor(0x202630);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(
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
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(...info.center);
  controls.update();
  let closed = false;
  let frame = 0;
  let rendered = 0;
  let visible = true;
  let failed = false;
  let pending: Promise<void> = Promise.resolve();
  let disposing: Promise<void> | undefined;
  const schedule = () => {
    if (!closed && !failed && visible && !document.hidden && !frame)
      frame = requestAnimationFrame(draw);
  };
  const spark = new SparkRenderer({
    renderer,
    autoUpdate: false,
    onDirty: schedule,
  });
  scene.add(spark);
  const mesh = new SplatMesh({
    fileBytes: bytes.slice(),
    fileType: SplatFileType.SPLAT,
    fileName: "reference.splat",
    editable: false,
    raycastable: false,
    lod: false,
  });
  scene.add(mesh);
  const reportFailure = () => {
    if (closed || failed) return;
    failed = true;
    cancelAnimationFrame(frame);
    renderer.domElement.dataset.renderError = "true";
    onError?.(
      new SpecialistError(
        "runtime",
        "The GPU reference renderer failed. Close and reopen the viewer on a supported browser.",
      ),
    );
  };
  function draw() {
    frame = 0;
    if (closed || !visible || document.hidden) return;
    pending = pending
      .then(async () => {
        if (closed) return;
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
    if (closed) return;
    const width = Math.max(1, element.clientWidth);
    renderer.setSize(width, 320);
    camera.aspect = width / 320;
    camera.updateProjectionMatrix();
    schedule();
  };
  const observer = new ResizeObserver(resize);
  const intersection = new IntersectionObserver((entries) => {
    visible = entries[0]?.isIntersecting ?? false;
    if (visible) schedule();
  });
  const dispose = (): Promise<void> => {
    if (disposing) return disposing;
    closed = true;
    cancelAnimationFrame(frame);
    observer.disconnect();
    intersection.disconnect();
    controls.dispose();
    document.removeEventListener("visibilitychange", schedule);
    signal?.removeEventListener("abort", abort);
    disposing = (async () => {
      await Promise.allSettled([mesh.initialized, pending]);
      mesh.dispose();
      spark.dispose();
      scene.clear();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    })();
    return disposing;
  };
  const abort = () => {
    void dispose();
  };
  signal?.addEventListener("abort", abort, { once: true });
  try {
    await mesh.initialized;
    if (closed || signal?.aborted)
      throw new SpecialistError("cancelled", "Cancelled.");
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
