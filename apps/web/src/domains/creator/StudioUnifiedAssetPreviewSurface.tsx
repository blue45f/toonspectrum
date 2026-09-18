import { Box, LoaderCircle, Rotate3d, TriangleAlert } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";

import { StudioSceneTemplateMap } from "./catalog/StudioSceneTemplateMap";
import { svgToDataUrl } from "./studio-characters";

import type {
  StudioUnifiedAssetRichPreview,
  StudioUnifiedThreePreviewSource,
} from "./studio-unified-asset-preview";
import type {
  Material,
  Object3D,
  Texture,
} from "three";

import { cn } from "@/shared/lib/utils";

interface ThreePosterCacheEntry {
  readonly value: string;
  readonly estimatedBytes: number;
}

const THREE_POSTER_CACHE = new Map<string, ThreePosterCacheEntry>();
const THREE_POSTER_CACHE_LIMIT = 96;
const THREE_POSTER_CACHE_MAX_ESTIMATED_BYTES = 8 * 1024 * 1024;
let threePosterCacheRetainedBytes = 0;

function deleteThreePoster(key: string): void {
  const cached = THREE_POSTER_CACHE.get(key);
  if (!cached) return;
  THREE_POSTER_CACHE.delete(key);
  threePosterCacheRetainedBytes = Math.max(
    0,
    threePosterCacheRetainedBytes - cached.estimatedBytes,
  );
}

function getThreePoster(key: string): string | null {
  return THREE_POSTER_CACHE.get(key)?.value ?? null;
}

function cacheThreePoster(key: string, value: string): void {
  deleteThreePoster(key);
  const estimatedBytes = 192 + value.length * 2;
  if (estimatedBytes > THREE_POSTER_CACHE_MAX_ESTIMATED_BYTES) return;
  THREE_POSTER_CACHE.set(key, { value, estimatedBytes });
  threePosterCacheRetainedBytes += estimatedBytes;
  while (
    THREE_POSTER_CACHE.size > THREE_POSTER_CACHE_LIMIT
    || threePosterCacheRetainedBytes > THREE_POSTER_CACHE_MAX_ESTIMATED_BYTES
  ) {
    const oldest = THREE_POSTER_CACHE.keys().next().value as string | undefined;
    if (!oldest) break;
    deleteThreePoster(oldest);
  }
}

function canvasToDataUrlAsync(
  canvas: HTMLCanvasElement,
  type: string,
  quality?: number,
): Promise<string> {
  if (typeof canvas.toBlob !== "function") return Promise.resolve(canvas.toDataURL(type, quality));
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("3D preview poster encoding failed"));
        return;
      }
      const reader = new FileReader();
      reader.onerror = () => reject(reader.error ?? new Error("3D preview poster read failed"));
      reader.onload = () => resolve(String(reader.result ?? ""));
      reader.readAsDataURL(blob);
    }, type, quality);
  });
}

function disposeMaterial(material: Material): void {
  for (const value of Object.values(material)) {
    if (
      value
      && typeof value === "object"
      && "isTexture" in value
      && (value as Texture).isTexture
    ) {
      (value as Texture).dispose();
    }
  }
  material.dispose();
}

function disposeObject(root: Object3D): void {
  root.traverse((node) => {
    const mesh = node as Object3D & {
      geometry?: { dispose(): void };
      material?: Material | Material[];
    };
    mesh.geometry?.dispose();
    if (Array.isArray(mesh.material)) mesh.material.forEach(disposeMaterial);
    else if (mesh.material) disposeMaterial(mesh.material);
  });
}

async function createThreePreviewObject(
  THREE: typeof import("three"),
  source: StudioUnifiedThreePreviewSource,
): Promise<Object3D> {
  if (source.kind === "gltf") {
    const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js");
    const loader = new GLTFLoader();
    return (await loader.loadAsync(source.url)).scene;
  }

  if (source.kind === "procedural-prop") {
    const { buildPropObject, propDefById } = await import("./vrm/studio-vrm-props");
    const definition = propDefById(source.propId);
    if (!definition || definition.geometrySource.kind !== "procedural") {
      throw new Error("절차형 3D 소품 원본을 찾지 못했습니다.");
    }
    return buildPropObject(
      THREE as unknown as Parameters<typeof buildPropObject>[0],
      definition,
      definition.defaultColor,
    ) as unknown as Object3D;
  }

  if (source.kind === "primitive") {
    const [{ makeGeometry }, { PRIMITIVE_DEFS }] = await Promise.all([
      import("./studio-background-3d-primitives"),
      import("./studio-background-3d-metadata"),
    ]);
    const definition = PRIMITIVE_DEFS[source.primitiveKind];
    const mesh = new THREE.Mesh(
      makeGeometry(source.primitiveKind),
      new THREE.MeshStandardMaterial({
        color: definition.color,
        roughness: 0.68,
        metalness: 0.08,
        side: THREE.DoubleSide,
      }),
    );
    mesh.position.set(...definition.position);
    mesh.rotation.set(...definition.rotation);
    mesh.scale.set(...definition.scale);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  const [{ BG_SCENE_TEMPLATES, instantiateSceneTemplate }, { makeGeometry }] =
    await Promise.all([
      import("./studio-background-3d-scene-templates"),
      import("./studio-background-3d-primitives"),
    ]);
  const template = BG_SCENE_TEMPLATES.find((candidate) => candidate.id === source.templateId);
  if (!template) throw new Error("3D 장면 템플릿 원본을 찾지 못했습니다.");
  const group = new THREE.Group();
  group.name = `asset-preview:${template.id}`;
  for (const primitive of instantiateSceneTemplate(template, 0)) {
    if (primitive.visible === false) continue;
    const mesh = new THREE.Mesh(
      makeGeometry(primitive.kind),
      new THREE.MeshStandardMaterial({
        color: primitive.color,
        roughness: 0.72,
        metalness: 0.04,
        side: THREE.DoubleSide,
      }),
    );
    mesh.position.set(...primitive.position);
    mesh.rotation.set(...primitive.rotation);
    mesh.scale.set(...primitive.scale);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  return group;
}

function fitCameraToObject(
  THREE: typeof import("three"),
  object: Object3D,
  camera: import("three").PerspectiveCamera,
): number {
  object.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(object);
  if (bounds.isEmpty()) {
    camera.position.set(2.2, 1.6, 2.8);
    camera.lookAt(0, 0, 0);
    return 1;
  }
  const center = bounds.getCenter(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());
  object.position.sub(center);
  object.updateMatrixWorld(true);
  const radius = Math.max(size.x, size.y, size.z, 0.25);
  camera.near = Math.max(0.001, radius / 100);
  camera.far = Math.max(100, radius * 100);
  camera.position.set(radius * 1.45, radius * 0.95, radius * 1.65);
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();
  return radius;
}

function useIntersectionActivation(
  target: RefObject<HTMLElement | null>,
  immediate: boolean,
): boolean {
  const [active, setActive] = useState(immediate);
  useEffect(() => {
    if (immediate) {
      setActive(true);
      return undefined;
    }
    const element = target.current;
    if (!element) return undefined;
    if (typeof IntersectionObserver === "undefined") {
      setActive(true);
      return undefined;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setActive(true);
          observer.disconnect();
        }
      },
      { rootMargin: "240px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [immediate, target]);
  return active;
}

function ThreePreview({
  preview,
  mode,
  className,
}: {
  readonly preview: Extract<StudioUnifiedAssetRichPreview, { kind: "three" }>;
  readonly mode: "thumbnail" | "interactive";
  readonly className?: string;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasHostRef = useRef<HTMLDivElement>(null);
  const requestRenderRef = useRef<(() => void) | null>(null);
  const active = useIntersectionActivation(hostRef, mode === "interactive");
  const cachedPoster = mode === "thumbnail"
    ? getThreePoster(preview.cacheKey)
    : null;
  const [poster, setPoster] = useState<string | null>(cachedPoster);
  const [scrubbing, setScrubbing] = useState(false);
  const thumbnailRotationRef = useRef(Math.PI / 5);
  const wakeRendererRef = useRef<(() => void) | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "ready" | "error">(
    cachedPoster ? "ready" : "idle",
  );
  const initialAutoRotate = useMemo(() => {
    if (mode !== "interactive" || typeof window === "undefined") return false;
    return typeof window.matchMedia !== "function"
      || !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, [mode]);
  const [autoRotate, setAutoRotate] = useState(initialAutoRotate);
  const autoRotateRef = useRef(autoRotate);
  autoRotateRef.current = autoRotate;

  useEffect(() => {
    requestRenderRef.current?.();
  }, [autoRotate]);

  useEffect(() => {
    if (!active || (mode === "thumbnail" && poster && !scrubbing)) return undefined;
    const hostNode = canvasHostRef.current;
    if (!hostNode) return undefined;
    const host: HTMLDivElement = hostNode;
    let cancelled = false;
    let frame = 0;
    let resizeObserver: ResizeObserver | null = null;
    let cleanObject: Object3D | null = null;
    let renderer: import("three").WebGLRenderer | null = null;
    let controls: import("three/examples/jsm/controls/OrbitControls.js").OrbitControls | null = null;
    let detachControlEvents: (() => void) | null = null;

    async function start(): Promise<void> {
      setState("loading");
      try {
        const THREE = await import("three");
        if (cancelled) return;
        renderer = new THREE.WebGLRenderer({
          alpha: true,
          antialias: true,
          preserveDrawingBuffer: mode === "thumbnail",
          powerPreference: mode === "thumbnail" ? "low-power" : "high-performance",
        });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, mode === "thumbnail" ? 1.25 : 2));
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.05;
        renderer.shadowMap.enabled = mode === "interactive";
        renderer.domElement.className = "size-full touch-none";
        renderer.domElement.setAttribute("aria-hidden", "true");
        host.replaceChildren(renderer.domElement);

        const scene = new THREE.Scene();
        scene.background = new THREE.Color(mode === "thumbnail" ? "#eef2f7" : "#e8edf4");
        const camera = new THREE.PerspectiveCamera(34, 1, 0.01, 1_000);
        const object = await createThreePreviewObject(THREE, preview.source);
        if (cancelled) {
          disposeObject(object);
          return;
        }
        cleanObject = object;
        scene.add(object);
        const radius = fitCameraToObject(THREE, object, camera);

        scene.add(new THREE.HemisphereLight(0xffffff, 0x75839a, 2.25));
        const key = new THREE.DirectionalLight(0xffffff, 3.2);
        key.position.set(radius * 2.2, radius * 3.1, radius * 2.4);
        key.castShadow = mode === "interactive";
        scene.add(key);
        const rim = new THREE.DirectionalLight(0x9bc4ff, 1.45);
        rim.position.set(-radius * 2, radius * 1.3, -radius * 1.5);
        scene.add(rim);

        const resize = () => {
          if (!renderer) return;
          const width = Math.max(1, host.clientWidth || (mode === "thumbnail" ? 280 : 420));
          const height = Math.max(1, host.clientHeight || (mode === "thumbnail" ? 210 : 360));
          renderer.setSize(width, height, false);
          camera.aspect = width / height;
          camera.updateProjectionMatrix();
        };
        const render = () => {
          renderer?.render(scene, camera);
        };
        resize();

        if (mode === "thumbnail") {
          if (!poster) {
            render();
            const nextPoster = await canvasToDataUrlAsync(renderer.domElement, "image/webp", 0.86);
            if (cancelled) return;
            cacheThreePoster(preview.cacheKey, nextPoster);
            setPoster(nextPoster);
            setState("ready");
            return;
          }
          const renderThumbnail = () => {
            frame = 0;
            if (cancelled || !renderer) return;
            object.rotation.y = thumbnailRotationRef.current;
            render();
          };
          const requestThumbnailRender = () => {
            if (cancelled || frame !== 0) return;
            frame = requestAnimationFrame(renderThumbnail);
          };
          requestRenderRef.current = requestThumbnailRender;
          resizeObserver = typeof ResizeObserver === "undefined"
            ? null
            : new ResizeObserver(() => {
              resize();
              requestThumbnailRender();
            });
          resizeObserver?.observe(host);
          setState("ready");
          requestThumbnailRender();
          return;
        }

        const { OrbitControls } = await import("three/examples/jsm/controls/OrbitControls.js");
        if (cancelled || !renderer) return;
        controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.075;
        controls.enablePan = false;
        controls.minDistance = radius * 0.55;
        controls.maxDistance = radius * 8;
        controls.autoRotateSpeed = 1.25;
        controls.target.set(0, 0, 0);
        controls.update();

        let interacting = false;
        let dampingFramesRemaining = 0;
        const renderInteractiveFrame = (): void => {
          frame = 0;
          if (cancelled || !renderer || !controls) return;
          controls.autoRotate = autoRotateRef.current;
          controls.update();
          render();
          if (interacting) dampingFramesRemaining = 18;
          else if (!autoRotateRef.current && dampingFramesRemaining > 0) dampingFramesRemaining -= 1;
          if (autoRotateRef.current || interacting || dampingFramesRemaining > 0) {
            requestInteractiveRender();
          }
        };
        const requestInteractiveRender = (): void => {
          if (cancelled || frame !== 0) return;
          frame = requestAnimationFrame(renderInteractiveFrame);
        };
        const handleInteractionStart = () => {
          interacting = true;
          requestInteractiveRender();
        };
        const handleInteractionEnd = () => {
          interacting = false;
          dampingFramesRemaining = 18;
          requestInteractiveRender();
        };
        const handleControlsChange = () => render();
        controls.addEventListener("start", handleInteractionStart);
        controls.addEventListener("end", handleInteractionEnd);
        controls.addEventListener("change", handleControlsChange);
        detachControlEvents = () => {
          controls?.removeEventListener("start", handleInteractionStart);
          controls?.removeEventListener("end", handleInteractionEnd);
          controls?.removeEventListener("change", handleControlsChange);
        };
        requestRenderRef.current = requestInteractiveRender;
        resizeObserver = typeof ResizeObserver === "undefined"
          ? null
          : new ResizeObserver(() => {
            resize();
            requestInteractiveRender();
          });
        resizeObserver?.observe(host);
        setState("ready");
        requestInteractiveRender();
      } catch {
        if (!cancelled) setState("error");
      }
    }

    void start();
    return () => {
      cancelled = true;
      requestRenderRef.current = null;
      cancelAnimationFrame(frame);
      wakeRendererRef.current = null;
      resizeObserver?.disconnect();
      detachControlEvents?.();
      controls?.dispose();
      if (cleanObject) disposeObject(cleanObject);
      renderer?.dispose();
      renderer?.forceContextLoss();
      host.replaceChildren();
    };
  }, [active, mode, poster, preview, scrubbing]);

  return (
    <div
      ref={hostRef}
      className={cn(
        "relative grid size-full min-h-32 place-items-center overflow-hidden bg-gradient-to-br from-slate-100 via-slate-50 to-slate-200 dark:from-neutral-800 dark:via-neutral-900 dark:to-neutral-900",
        className,
      )}
      role={mode === "thumbnail" ? "img" : "group"}
      aria-label={preview.alt}
      onPointerEnter={mode === "thumbnail" ? () => setScrubbing(true) : undefined}
      onPointerLeave={mode === "thumbnail" ? () => setScrubbing(false) : undefined}
      onPointerMove={mode === "thumbnail" ? (event) => {
        const bounds = event.currentTarget.getBoundingClientRect();
        const progress = bounds.width > 0
          ? (event.clientX - bounds.left) / bounds.width
          : 0.5;
        thumbnailRotationRef.current = (progress * Math.PI * 2) - Math.PI;
        requestRenderRef.current?.();
      } : undefined}
      data-studio-three-preview={preview.cacheKey}
      data-preview-mode={mode}
      data-preview-state={state}
      data-preview-scrubbing={scrubbing ? "true" : "false"}
    >
      <div ref={canvasHostRef} className="absolute inset-0" aria-hidden />
      {poster && !(mode === "thumbnail" && scrubbing) ? (
        <img src={poster} alt="" className="size-full object-contain" draggable={false} />
      ) : null}
      {state === "idle" || state === "loading" ? (
        <div className="absolute inset-0 grid place-items-center text-slate-500" aria-hidden>
          <span className="grid size-14 place-items-center rounded-2xl border border-white/70 bg-white/70 shadow-sm backdrop-blur dark:border-white/10 dark:bg-black/25">
            {state === "loading"
              ? <LoaderCircle size={24} className="animate-spin" />
              : <Box size={24} />}
          </span>
        </div>
      ) : null}
      {state === "error" ? (
        <div className="absolute inset-0 grid place-items-center p-4 text-center text-xs text-fg-3">
          <div>
            <TriangleAlert size={22} className="mx-auto mb-2 text-warn" aria-hidden />
            <p className="font-semibold text-fg-2">3D 미리보기를 표시하지 못했습니다</p>
            <p className="mt-1">선택한 모델은 3D 편집기에서 계속 열 수 있습니다.</p>
          </div>
        </div>
      ) : null}
      {mode === "thumbnail" && poster && state === "ready" ? (
        <span
          className="pointer-events-none absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-full border border-white/70 bg-white/80 px-2 py-1 text-[0.62rem] font-bold text-slate-700 shadow-sm backdrop-blur dark:border-white/10 dark:bg-black/55 dark:text-white"
          aria-hidden
        >
          <Rotate3d size={12} />
          {scrubbing ? "좌우로 움직여 회전" : "360°"}
        </span>
      ) : null}
      {mode === "interactive" && state === "ready" ? (
        <button
          type="button"
          onClick={() => {
            const next = !autoRotateRef.current;
            autoRotateRef.current = next;
            setAutoRotate(next);
            wakeRendererRef.current?.();
          }}
          aria-pressed={autoRotate}
          className="absolute bottom-3 right-3 inline-flex min-h-10 items-center gap-1.5 rounded-full border border-white/70 bg-white/85 px-3 text-xs font-semibold text-slate-700 shadow-sm backdrop-blur focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent dark:border-white/10 dark:bg-black/55 dark:text-white"
        >
          <Rotate3d size={15} aria-hidden />
          {autoRotate ? "자동 회전 끄기" : "자동 회전"}
        </button>
      ) : null}
    </div>
  );
}

function GeneratedPoster({
  preview,
}: {
  readonly preview: Extract<StudioUnifiedAssetRichPreview, { kind: "generated-poster" }>;
}) {
  return (
    <div
      className="relative grid size-full place-items-center overflow-hidden bg-gradient-to-br from-accent-soft via-card to-raised p-4 text-center"
      role="img"
      aria-label={preview.alt}
      data-studio-generated-asset-poster="true"
    >
      <div className="absolute -right-10 -top-10 size-32 rounded-full border-[18px] border-accent/10" aria-hidden />
      <div className="absolute -bottom-12 -left-10 size-36 rotate-12 rounded-3xl bg-accent/10" aria-hidden />
      <div className="relative">
        <span className="mx-auto grid size-14 place-items-center rounded-2xl border border-accent/20 bg-panel/80 text-accent shadow-sm">
          <Box size={25} aria-hidden />
        </span>
        <p className="mt-3 line-clamp-2 text-sm font-black text-fg">{preview.label}</p>
        <p className="mt-1 text-[0.68rem] font-semibold text-fg-3">{preview.category}</p>
      </div>
    </div>
  );
}

export function StudioUnifiedAssetPreviewSurface({
  preview,
  mode = "thumbnail",
  className,
}: {
  readonly preview: StudioUnifiedAssetRichPreview;
  readonly mode?: "thumbnail" | "interactive";
  readonly className?: string;
}) {
  if (preview.kind === "three") {
    return <ThreePreview preview={preview} mode={mode} className={className} />;
  }
  if (preview.kind === "scene-template") {
    return (
      <div
        className={cn("size-full overflow-hidden bg-white p-2", className)}
        data-studio-template-preview="true"
      >
        <StudioSceneTemplateMap summary={preview.summary} label={preview.alt} />
      </div>
    );
  }
  if (preview.kind === "image") {
    return (
      <div className={cn("size-full overflow-hidden bg-slate-100 dark:bg-neutral-900", className)}>
        <img
          src={preview.src}
          alt={preview.alt}
          loading="lazy"
          decoding="async"
          draggable={false}
          className="size-full object-contain"
        />
      </div>
    );
  }
  if (preview.kind === "svg") {
    return (
      <div className={cn("size-full overflow-hidden bg-white p-2 dark:bg-neutral-900", className)}>
        <img
          src={svgToDataUrl(preview.svg)}
          alt={preview.alt}
          loading="lazy"
          decoding="async"
          draggable={false}
          className="size-full object-contain"
        />
      </div>
    );
  }
  return <GeneratedPoster preview={preview} />;
}
