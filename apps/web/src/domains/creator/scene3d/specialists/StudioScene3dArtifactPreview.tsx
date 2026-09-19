import { useEffect, useRef, useState } from "react";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { createArtifactPreviewResourceOwner } from "./artifact-preview-resource-owner";
import type { SpecialistArtifact } from "./specialist-contract";

/** Isolated artifact viewer. It never owns or changes the editor's canonical scene. */
export function StudioScene3dArtifactPreview({
  artifact,
}: {
  readonly artifact: SpecialistArtifact;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const t = useBilingual("scene3d-specialists");
  const navigation = useRef<{ fit(): void; zoom(factor: number): void } | null>(
    null,
  );
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const element = host.current;
    if (!element) return;
    let dead = false;
    let dispose: (() => void) | undefined;
    setError(null);
    setReady(false);
    navigation.current = null;
    void (async () => {
      const [THREE, { GLTFLoader }, { OrbitControls }, { MeshoptDecoder }] =
        await Promise.all([
          import("three"),
          import("three/addons/loaders/GLTFLoader.js"),
          import("three/addons/controls/OrbitControls.js"),
          import("three/addons/libs/meshopt_decoder.module.js"),
        ]);
      if (dead) return;
      const renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: false,
      });
      dispose = () => {
        renderer.dispose();
        renderer.forceContextLoss();
        renderer.domElement.remove();
      };
      try {
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
        renderer.setClearColor(0x202630);
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 10000);
        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = false;
        const render = () => {
          if (!dead) renderer.render(scene, camera);
        };
        const resize = () => {
          const width = Math.max(1, element.clientWidth);
          renderer.setSize(width, 280);
          camera.aspect = width / 280;
          camera.updateProjectionMatrix();
          render();
        };
        const observer = new ResizeObserver(resize);
        let resources: ReturnType<typeof createArtifactPreviewResourceOwner> | null = null;
        let disposed = false;
        dispose = () => {
          if (disposed) return;
          disposed = true;
          observer.disconnect();
          controls.dispose();
          resources?.dispose();
          scene.clear();
          renderer.dispose();
          renderer.forceContextLoss();
          renderer.domElement.remove();
        };
        await MeshoptDecoder.ready;
        const parsed = await new GLTFLoader()
          .setMeshoptDecoder(MeshoptDecoder)
          .parseAsync(artifact.bytes.slice().buffer, "");
        resources = createArtifactPreviewResourceOwner(
          parsed.scenes.length ? parsed.scenes : [parsed.scene],
        );
        if (dead) {
          resources.dispose();
          return;
        }
        const root = parsed.scene;
        scene.add(root);
        const bounds = new THREE.Box3().setFromObject(root);
        const center = bounds.getCenter(new THREE.Vector3());
        const radius = Math.max(
          0.1,
          bounds.getSize(new THREE.Vector3()).length() / 2,
        );
        camera.near = Math.max(0.001, radius / 1000);
        camera.far = radius * 100;
        camera.position
          .copy(center)
          .add(
            new THREE.Vector3(1, 0.7, 1)
              .normalize()
              .multiplyScalar(radius * 3.2),
          );
        controls.target.copy(center);
        controls.minDistance = radius * 0.05;
        controls.maxDistance = radius * 50;
        const fitPosition = camera.position.clone();
        navigation.current = {
          fit: () => {
            camera.position.copy(fitPosition);
            controls.target.copy(center);
            controls.update();
            render();
          },
          zoom: (factor) => {
            const direction = camera.position.clone().sub(controls.target);
            direction.setLength(
              THREE.MathUtils.clamp(
                direction.length() * factor,
                controls.minDistance,
                controls.maxDistance,
              ),
            );
            camera.position.copy(controls.target).add(direction);
            controls.update();
            render();
          },
        };
        controls.update();
        scene.add(new THREE.HemisphereLight(0xffffff, 0x526070, 2));
        const key = new THREE.DirectionalLight(0xffffff, 3);
        key.position
          .copy(center)
          .add(new THREE.Vector3(radius, radius * 2, radius));
        scene.add(key);
        element.replaceChildren(renderer.domElement);
        observer.observe(element);
        controls.addEventListener("change", render);
        resize();
        setReady(true);
      } catch (error) {
        dispose();
        dispose = undefined;
        throw error;
      }
    })().catch(() => {
      if (!dead) setError("preview-unavailable");
    });
    return () => {
      dead = true;
      navigation.current = null;
      dispose?.();
    };
  }, [artifact]);
  return (
    <div>
      <div
        ref={host}
        className="h-[280px] w-full overflow-hidden rounded-lg border border-line"
        aria-label={t("가공 결과 3D 미리보기", "Processed 3D artifact preview")}
      />
      <div
        role="toolbar"
        aria-label={t("3D 미리보기 탐색", "3D preview navigation")}
        className="mt-2 flex flex-wrap gap-2"
      >
        <button
          type="button"
          disabled={!ready || Boolean(error)}
          className="min-h-11 rounded border border-line px-3 text-xs"
          onClick={() => navigation.current?.fit()}
        >
          {t("화면에 맞춤", "Fit view")}
        </button>
        <button
          type="button"
          disabled={!ready || Boolean(error)}
          className="min-h-11 rounded border border-line px-3 text-xs"
          onClick={() => navigation.current?.zoom(0.8)}
        >
          {t("확대", "Zoom in")}
        </button>
        <button
          type="button"
          disabled={!ready || Boolean(error)}
          className="min-h-11 rounded border border-line px-3 text-xs"
          onClick={() => navigation.current?.zoom(1.25)}
        >
          {t("축소", "Zoom out")}
        </button>
      </div>
      <p role="status" className="mt-1 text-xs text-fg-3">
        {error
          ? t(
              "이 결과는 미리보기에서 지원하지 않습니다. 파일을 내려받아 확인하세요.",
              "This artifact is not supported by the preview. Download it for inspection.",
            )
          : t(
              "드래그로 회전 · 휠/핀치로 확대 · 문서 원본은 변경되지 않습니다.",
              "Drag to orbit · wheel/pinch to zoom · the original document is unchanged.",
            )}
      </p>
    </div>
  );
}
