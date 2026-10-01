import { Camera } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Color, DirectionalLight, HemisphereLight, PerspectiveCamera, Scene, WebGLRenderer } from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import { disposeModel, loadLocalGlb } from "./local-glb";

const CAPTURE_SIZE = 768;
const PREVIEW_BACKGROUND = 0xffffff;

/**
 * 로컬 GLB를 브라우저 안에서만 열어 시점을 맞춘 뒤, 현재 구도를 PNG로 캡처한다.
 * 원본 GLB는 서버로 보내지 않고 수정하지도 않는다.
 */
export function GlbCapture({ file, onCapture, onError }: { file: File; onCapture: (image: string) => void; onError: (message: string) => void }) {
  const bt = useBilingual("GlbCapture");
  const host = useRef<HTMLDivElement>(null);
  const capture = useRef<(() => string) | null>(null);
  const callbacks = useRef({ onCapture, onError });
  const [ready, setReady] = useState(false);

  useEffect(() => {
    callbacks.current = { onCapture, onError };
  }, [onCapture, onError]);

  useEffect(() => {
    const controller = new AbortController();
    const element = host.current;
    if (!element) return;
    setReady(false);
    let release = () => {};
    void (async () => {
      const scene = new Scene();
      // 캡처 PNG는 추론 입력이므로 테마와 무관하게 흰 배경으로 고정한다.
      scene.background = new Color(PREVIEW_BACKGROUND);
      const renderer = new WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
      renderer.setSize(CAPTURE_SIZE, CAPTURE_SIZE);
      renderer.setPixelRatio(1);
      renderer.domElement.style.width = "100%";
      renderer.domElement.style.height = "auto";
      const camera = new PerspectiveCamera(35, 1, 0.01, 100);
      camera.position.set(0, 0, 4);
      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.minDistance = 1;
      controls.maxDistance = 10;
      const key = new DirectionalLight(0xffffff, 3);
      key.position.set(3, 4, 5);
      scene.add(key, new HemisphereLight(0xffffff, 0x8899aa, 2));
      let model: Awaited<ReturnType<typeof loadLocalGlb>> | undefined;
      release = () => {
        capture.current = null;
        renderer.setAnimationLoop(null);
        controls.dispose();
        if (model) disposeModel(model);
        renderer.dispose();
        renderer.forceContextLoss();
        renderer.domElement.remove();
      };
      try {
        model = await loadLocalGlb(await file.arrayBuffer(), controller.signal);
        if (controller.signal.aborted) {
          disposeModel(model);
          return;
        }
        scene.add(model);
        element.replaceChildren(renderer.domElement);
        renderer.setAnimationLoop(() => {
          controls.update();
          renderer.render(scene, camera);
        });
        capture.current = () => {
          renderer.render(scene, camera);
          return renderer.domElement.toDataURL("image/png");
        };
        setReady(true);
      } catch (error) {
        release();
        if (!controller.signal.aborted) callbacks.current.onError(error instanceof Error ? error.message : "3D model could not be opened.");
      }
    })().catch((error: unknown) => {
      if (!controller.signal.aborted) callbacks.current.onError(String(error));
    });
    return () => {
      controller.abort();
      release();
    };
  }, [file]);

  return (
    <section className="rounded-2xl border border-line bg-panel/70 p-3" aria-label={bt("3D 구도 캡처", "3D pose capture")}>
      <p className="text-xs leading-5 text-fg-2">
        {bt("드래그로 시점·포즈 구도를 맞춘 뒤 현재 구도를 변환 입력으로 쓰세요. 원본 GLB는 바뀌지 않아요.", "Drag to frame the pose, then use the current view as the conversion input. The original GLB is never changed.")}
      </p>
      <div
        ref={host}
        role="group"
        aria-label={bt("3D 캐릭터 시점 미리보기 · 드래그해서 회전", "3D character view preview · drag to rotate")}
        className="mt-2 aspect-square w-full overflow-hidden rounded-xl border border-line bg-card"
      />
      <button
        type="button"
        disabled={!ready}
        onClick={() => {
          if (capture.current) onCapture(capture.current());
          else onError(bt("모델을 불러오는 중이에요.", "The model is still loading."));
        }}
        className="mt-2 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-accent/50 bg-accent-soft px-3 text-sm font-bold text-fg hover:bg-accent/25 focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Camera size={16} aria-hidden="true" />
        {bt("현재 3D 구도를 변환 입력으로 사용", "Use this 3D view as the input")}
      </button>
    </section>
  );
}
