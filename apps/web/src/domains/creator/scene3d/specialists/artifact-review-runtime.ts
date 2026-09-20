import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { createArtifactPreviewResourceOwner } from "./artifact-preview-resource-owner";
import {
  admitArtifactReviewPair,
  artifactReviewAborted,
} from "./artifact-review-admission";
import { ARTIFACT_REVIEW_LIMITS } from "./artifact-review-contract";
import {
  artifactReviewFit,
  renderArtifactReview,
} from "./artifact-review-render";
import { SpecialistError } from "./specialist-contract";
import type { SpecialistArtifact } from "./specialist-contract";
import type {
  ArtifactReviewControls,
  ArtifactReviewFrame,
  ArtifactReviewMeasurement,
  ArtifactReviewMode,
  ArtifactReviewSource,
} from "./artifact-review-contract";
import type { StudioBg3dKtx2RendererRuntime } from "../../bg3d/studio-bg3d-ktx2-renderer-runtime";

/** Sequential parse + one context, one light rig and one camera for a bounded inspection pair. */
export async function createArtifactReviewRuntime(input: {
  readonly host: HTMLElement;
  readonly artifact: SpecialistArtifact;
  readonly source?: ArtifactReviewSource;
  readonly signal: AbortSignal;
  readonly restore?: ArtifactReviewFrame | null;
  readonly onFrame?: (frame: ArtifactReviewFrame) => void;
  readonly onMeasurement?: (measurement: ArtifactReviewMeasurement) => void;
  readonly onError?: () => void;
}): Promise<ArtifactReviewControls> {
  const admitted = await admitArtifactReviewPair(
    input.artifact,
    input.source,
    input.signal,
  );
  artifactReviewAborted(input.signal);
  const key = admitted.source?.sha256 ?? admitted.result.sha256;
  let renderer: THREE.WebGLRenderer | undefined;
  let controls: OrbitControls | undefined;
  let textureRuntime: StudioBg3dKtx2RendererRuntime | undefined;
  let resizeObserver: ResizeObserver | undefined;
  let intersection: IntersectionObserver | undefined;
  let wire: THREE.MeshBasicMaterial | undefined;
  const roots: THREE.Object3D[] = [];
  const scene = new THREE.Scene();
  let disposed = false;
  let failed = false;
  let visible = true;
  let frameId = 0;
  let initialized = false;
  let renderedFrames = 0;
  const report = () => {
    if (disposed || failed || input.signal.aborted) return;
    failed = true;
    renderer?.domElement.setAttribute("data-review-error", "true");
    try {
      input.onError?.();
    } catch {
      /* Presentation only. */
    }
  };
  const onContextLost = (event: Event) => {
    event.preventDefault();
    report();
  };
  // Do not kill pending loader promises on cancellation. The lifecycle waits for parsing to settle
  // before releasing the final decoder lease and starting the latest requested view.
  const hideCancelled = () => {
    cancelAnimationFrame(frameId);
    frameId = 0;
    renderer?.domElement.remove();
  };
  input.signal.addEventListener("abort", hideCancelled, { once: true });
  const onVisibility = () => requestRender();
  function dispose() {
    if (disposed) return;
    disposed = true;
    hideCancelled();
    input.signal.removeEventListener("abort", hideCancelled);
    document.removeEventListener("visibilitychange", onVisibility);
    renderer?.domElement.removeEventListener("webglcontextlost", onContextLost);
    const attempt = (cleanup: () => void) => {
      try {
        cleanup();
      } catch {
        /* Release the remaining owners too. */
      }
    };
    attempt(() => resizeObserver?.disconnect());
    attempt(() => intersection?.disconnect());
    attempt(() => controls?.dispose());
    attempt(() => createArtifactPreviewResourceOwner(roots).dispose());
    attempt(() => wire?.dispose());
    attempt(() => textureRuntime?.dispose());
    scene.clear();
    attempt(() => renderer?.dispose());
    attempt(() => renderer?.forceContextLoss());
  }
  const resultGroup = new THREE.Group();
  const sourceGroup = new THREE.Group();
  const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 10000);
  let mode: ArtifactReviewMode = admitted.source ? "wipe" : "result";
  let fraction = 0.5;
  let wireframe = false;
  let width = 1;
  const height = 280;
  function render() {
    frameId = 0;
    if (
      disposed ||
      failed ||
      input.signal.aborted ||
      !initialized ||
      !visible ||
      document.hidden ||
      !renderer
    )
      return;
    try {
      renderArtifactReview({
        renderer,
        camera,
        scene,
        source: admitted.source ? sourceGroup : undefined,
        result: resultGroup,
        mode,
        fraction,
        width,
        height,
        ...(wireframe ? { wireframe: wire! } : {}),
      });
      renderedFrames++;
      renderer.domElement.dataset.reviewFrameCount = String(renderedFrames);
      renderer.domElement.dataset.reviewMode = mode;
      renderer.domElement.dataset.reviewWireframe = String(wireframe);
      renderer.domElement.dataset.reviewDivider = String(fraction);
    } catch {
      report();
    }
  }
  function requestRender() {
    if (
      !disposed &&
      !failed &&
      !input.signal.aborted &&
      initialized &&
      visible &&
      !document.hidden &&
      !frameId
    )
      frameId = requestAnimationFrame(render);
  }
  function recordFrame() {
    if (!controls || disposed || input.signal.aborted) return;
    const frame: ArtifactReviewFrame = {
      key,
      position: camera.position.toArray(),
      target: controls.target.toArray(),
      up: camera.up.toArray(),
    };
    try {
      input.onFrame?.(frame);
    } catch {
      /* Owner is not a scene mutation authority. */
    }
  }
  function measure(root: THREE.Object3D): {
    bounds: THREE.Box3;
    triangles: number;
  } {
    let triangles = 0;
    const inspected = new Set<THREE.BufferGeometry>();
    root.traverse((object) => {
      if ((object as THREE.Light).isLight) object.visible = false; // same local reference rig on both sides
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh || !mesh.geometry) return;
      const geometry = mesh.geometry;
      const position = geometry.getAttribute("position");
      if (!position || position.itemSize !== 3)
        throw new SpecialistError(
          "invalid-input",
          "Invalid decoded preview geometry.",
        );
      if (!inspected.has(geometry)) {
        inspected.add(geometry);
        for (let i = 0; i < position.count; i++)
          for (const value of [
            position.getX(i),
            position.getY(i),
            position.getZ(i),
          ]) {
            if (!Number.isFinite(value) || Math.abs(value) > 1e7)
              throw new SpecialistError(
                "invalid-input",
                "Non-finite or oversized decoded geometry.",
              );
          }
      }
      const instances = (mesh as THREE.InstancedMesh).isInstancedMesh
        ? (mesh as THREE.InstancedMesh).count
        : 1;
      triangles +=
        Math.floor((geometry.index?.count ?? position.count) / 3) * instances;
      if (triangles > ARTIFACT_REVIEW_LIMITS.triangles)
        throw new SpecialistError(
          "budget",
          "Decoded instance triangle budget exceeded.",
        );
    });
    const bounds = new THREE.Box3().setFromObject(root);
    if (
      bounds.isEmpty() ||
      [...bounds.min.toArray(), ...bounds.max.toArray()].some(
        (value) => !Number.isFinite(value) || Math.abs(value) > 1e7,
      )
    ) {
      throw new SpecialistError(
        "invalid-input",
        "The reference preview has no finite visible bounds.",
      );
    }
    return { bounds, triangles };
  }
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.autoClear = false;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.setClearColor(0x202630);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.dataset.reviewReady = "false";
    renderer.domElement.addEventListener("webglcontextlost", onContextLost);
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = false;
    controls.addEventListener("change", () => {
      recordFrame();
      requestRender();
    });
    const manager = new THREE.LoadingManager();
    let textureFailed = false;
    manager.setURLModifier((url) => {
      if (!url.startsWith("blob:"))
        throw new SpecialistError(
          "unsupported",
          "Preview resources must remain embedded.",
        );
      return url;
    });
    manager.onError = () => {
      textureFailed = true;
    };
    const loader = new GLTFLoader(manager).setMeshoptDecoder(MeshoptDecoder);
    await MeshoptDecoder.ready;
    artifactReviewAborted(input.signal);
    if (admitted.result.usesKtx2 || admitted.source?.usesKtx2) {
      const { createStudioBg3dKtx2RendererRuntime } = await import(
        "../../bg3d/studio-bg3d-ktx2-renderer-runtime"
      );
      textureRuntime = await createStudioBg3dKtx2RendererRuntime({
        renderer,
        signal: input.signal,
      });
      artifactReviewAborted(input.signal);
      loader.setKTX2Loader(textureRuntime.loader);
    }
    const parse = async (bytes: Uint8Array<ArrayBuffer>) => {
      const parsed = await loader.parseAsync(bytes.buffer, "");
      roots.push(...(parsed.scenes.length ? parsed.scenes : [parsed.scene]));
      artifactReviewAborted(input.signal);
      if (textureFailed || textureRuntime?.hasDecodeFailure())
        throw new SpecialistError(
          "runtime",
          "A preview texture failed to decode.",
        );
      return parsed.scene;
    };
    // No parallel decoding: one model settles before the second allocates its buffers.
    let sourceMeasurement: ReturnType<typeof measure> | undefined;
    if (admitted.source) {
      const root = await parse(admitted.source.bytes);
      sourceGroup.add(root);
      sourceMeasurement = measure(root);
    }
    const resultRoot = await parse(admitted.result.bytes);
    resultGroup.add(resultRoot);
    const resultMeasurement = measure(resultRoot);
    const baseBounds = sourceMeasurement?.bounds ?? resultMeasurement.bounds;
    scene.add(sourceGroup, resultGroup);
    const { center, radius } = artifactReviewFit(baseBounds, 1, camera.fov);
    camera.near = Math.max(0.00001, radius / 1000);
    camera.far = radius * 100;
    controls.minDistance = radius * 0.05;
    controls.maxDistance = radius * 50;
    scene.add(new THREE.HemisphereLight(0xffffff, 0x526070, 2));
    const light = new THREE.DirectionalLight(0xffffff, 3);
    light.position
      .copy(center)
      .add(new THREE.Vector3(radius, radius * 2, radius));
    light.target.position.copy(center);
    scene.add(light, light.target);
    wire = new THREE.MeshBasicMaterial({
      wireframe: true,
      color: 0xe4eaf1,
      side: THREE.DoubleSide,
    });
    const fit = () => {
      const framing = artifactReviewFit(baseBounds, camera.aspect, camera.fov);
      camera.up.set(0, 1, 0);
      camera.position
        .copy(framing.center)
        .add(
          new THREE.Vector3(1, 0.7, 1)
            .normalize()
            .multiplyScalar(framing.distance),
        );
      controls!.target.copy(center);
      controls!.update();
      recordFrame();
      requestRender();
    };
    const resize = () => {
      if (disposed || input.signal.aborted || !renderer) return;
      width = Math.max(1, Math.floor(input.host.clientWidth));
      renderer.setSize(width, height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      requestRender();
    };
    input.host.replaceChildren(renderer.domElement);
    resize();
    if (
      input.restore?.key === key &&
      [
        ...input.restore.position,
        ...input.restore.target,
        ...input.restore.up,
      ].every(Number.isFinite) &&
      new THREE.Vector3(...input.restore.position).distanceTo(
        new THREE.Vector3(...input.restore.target),
      ) > camera.near
    ) {
      camera.position.fromArray(input.restore.position);
      camera.up.fromArray(input.restore.up);
      controls.target.fromArray(input.restore.target);
      controls.update();
      recordFrame();
    } else fit();
    if (failed)
      throw new SpecialistError(
        "runtime",
        "The preview context was lost during initialization.",
      );
    initialized = true;
    resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(input.host);
    intersection = new IntersectionObserver((entries) => {
      visible = entries[0]?.isIntersecting ?? false;
      requestRender();
    });
    intersection.observe(input.host);
    document.addEventListener("visibilitychange", onVisibility);
    renderer.domElement.dataset.textureRuntime = textureRuntime
      ? "ktx2-basis"
      : "standard";
    renderer.domElement.dataset.reviewComparison = String(
      Boolean(admitted.source),
    );
    renderer.domElement.dataset.reviewArtifact = input.artifact.name;
    renderer.domElement.dataset.reviewSourceHash =
      admitted.source?.sha256 ?? "";
    renderer.domElement.dataset.reviewReady = "true";
    if (sourceMeasurement)
      input.onMeasurement?.({
        sourceSize: sourceMeasurement.bounds
          .getSize(new THREE.Vector3())
          .toArray(),
        resultSize: resultMeasurement.bounds
          .getSize(new THREE.Vector3())
          .toArray(),
        centerShift: sourceMeasurement.bounds
          .getCenter(new THREE.Vector3())
          .distanceTo(resultMeasurement.bounds.getCenter(new THREE.Vector3())),
        sourceTriangles: sourceMeasurement.triangles,
        resultTriangles: resultMeasurement.triangles,
      });
    requestRender();
    return {
      fit,
      dispose,
      zoom(factor) {
        if (!Number.isFinite(factor) || factor <= 0 || disposed) return;
        const delta = camera.position.clone().sub(controls!.target);
        delta.setLength(
          THREE.MathUtils.clamp(
            delta.length() * factor,
            controls!.minDistance,
            controls!.maxDistance,
          ),
        );
        camera.position.copy(controls!.target).add(delta);
        controls!.update();
        recordFrame();
        requestRender();
      },
      orient(view) {
        if (disposed) return;
        const distance = camera.position.distanceTo(controls!.target);
        const direction =
          view === "front"
            ? new THREE.Vector3(0, 0, 1)
            : view === "right"
              ? new THREE.Vector3(1, 0, 0)
              : view === "top"
                ? new THREE.Vector3(0, 1, 0)
                : new THREE.Vector3(1, 0.7, 1).normalize();
        camera.up.set(0, view === "top" ? 0 : 1, view === "top" ? -1 : 0);
        camera.position
          .copy(controls!.target)
          .addScaledVector(direction, distance);
        controls!.update();
        recordFrame();
        requestRender();
      },
      setMode(next) {
        mode = admitted.source ? next : "result";
        requestRender();
      },
      setDivider(next) {
        if (Number.isFinite(next)) fraction = THREE.MathUtils.clamp(next, 0, 1);
        requestRender();
      },
      setWireframe(next) {
        wireframe = next;
        requestRender();
      },
    };
  } catch (error) {
    dispose();
    throw error;
  }
}
