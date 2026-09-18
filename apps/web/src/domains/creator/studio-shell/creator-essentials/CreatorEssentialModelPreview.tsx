import { useEffect, useRef, useState } from "react";
import { AmbientLight, Box3, Color, DirectionalLight, Group, Mesh, PerspectiveCamera, Scene, Vector3, WebGLRenderer } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { fetchCreatorEssential } from "./creator-essentials-download";
import type { CreatorEssential, EssentialsLocale } from "./creator-essentials-catalog";
import {
  translateBilingualValueForActiveLocale,
  useBilingualI18nRevision,
} from "@/shared/lib/i18n-bilingual-copy";

const bi = <T,>(ko: T, en: T): T =>
  translateBilingualValueForActiveLocale("CreatorEssentialModelPreview", ko, en);

function disposeModel(root: Group): void {
  root.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    object.geometry.dispose();
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) material.dispose();
  });
}
export default function CreatorEssentialModelPreview({ asset, locale: _locale }: { readonly asset: CreatorEssential; readonly locale: EssentialsLocale }) {
  useBilingualI18nRevision();
  const host = useRef<HTMLDivElement>(null);
  const reset = useRef<(() => void) | null>(null);
  const turn = useRef<((direction: number) => void) | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  useEffect(() => {
    const container = host.current;
    if (!container) return;
    const abort = new AbortController();
    let renderer: WebGLRenderer | null = null;
    let model: Group | null = null;
    let controls: OrbitControls | null = null;
    let observer: ResizeObserver | null = null;
    let frame = 0;
    setStatus("loading");
    const release = () => {
      cancelAnimationFrame(frame); frame = 0;
      observer?.disconnect(); controls?.dispose();
      if (model) { disposeModel(model); model = null; }
      renderer?.dispose(); renderer?.domElement.remove(); renderer = null;
      reset.current = null; turn.current = null;
    };
    void (async () => {
      try {
        const bytes = await fetchCreatorEssential(asset, abort.signal);
        const result = await new GLTFLoader().parseAsync(bytes, "");
        if (abort.signal.aborted) { disposeModel(result.scene); return; }
        model = result.scene;
        const scene = new Scene(); scene.background = new Color(0xf4f1eb); scene.add(model);
        scene.add(new AmbientLight(0xffffff, 2));
        const light = new DirectionalLight(0xffffff, 3); light.position.set(-3, 5, 4); scene.add(light);
        const bounds = new Box3().setFromObject(model);
        const center = bounds.getCenter(new Vector3());
        const size = bounds.getSize(new Vector3());
        const extent = Math.max(size.x, size.y, size.z, 0.1);
        const camera = new PerspectiveCamera(38, 1, extent / 100, extent * 30);
        camera.position.copy(center).add(new Vector3(extent * 1.6, extent * 0.8, extent * 2.2));
        renderer = new WebGLRenderer({ antialias: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
        renderer.domElement.setAttribute("aria-label", `${bi((asset.label).ko, (asset.label).en)} 3D`);
        renderer.domElement.setAttribute("role", "img");
        renderer.domElement.style.touchAction = "none";
        container.append(renderer.domElement);
        controls = new OrbitControls(camera, renderer.domElement); controls.target.copy(center);
        controls.minDistance = extent * 0.6; controls.maxDistance = extent * 8;
        controls.enableDamping = false; controls.update(); controls.saveState();
        const render = () => {
          if (frame || abort.signal.aborted) return;
          frame = requestAnimationFrame(() => { frame = 0; renderer?.render(scene, camera); });
        };
        const resize = () => {
          const width = Math.max(1, container.clientWidth);
          camera.aspect = width / 280; camera.updateProjectionMatrix();
          renderer?.setSize(width, 280, false); render();
        };
        controls.addEventListener("change", render);
        reset.current = () => { if (model) model.rotation.y = 0; controls?.reset(); render(); };
        turn.current = (direction) => {
          if (!model) return;
          model.rotation.y += direction * Math.PI / 6; render();
        };
        renderer.domElement.addEventListener("webglcontextlost", (event) => {
          event.preventDefault();
          if (!abort.signal.aborted) { release(); setStatus("error"); }
        });
        observer = new ResizeObserver(resize); observer.observe(container); resize(); setStatus("ready");
      } catch {
        release();
        if (!abort.signal.aborted) setStatus("error");
      }
    })();
    return () => { abort.abort(); release(); };
  }, [asset]);

  return <div className="mt-3 space-y-2 rounded-xl border border-line p-2">
    <div ref={host} className="h-[280px] w-full overflow-hidden rounded-lg" data-testid="essentials-model-preview" />
    {status === "loading" ? <p role="status" className="text-xs text-fg-2">{bi("모델을 검증하고 여는 중…", "Verifying and opening the model…")}</p> : null}
    {status === "error" ? <p role="alert" className="text-xs text-bad">{bi("이 브라우저에서 3D 미리보기를 열지 못했습니다. GLB를 저장해 3D 편집기에서 열거나, 미리보기를 닫고 다시 시도하세요.", "3D preview is unavailable. Download the GLB for your editor, or close and reopen this preview.")}</p> : null}
    <div className="flex flex-wrap gap-2">
      {([-1, 1] as const).map((direction) => <button key={direction} type="button" disabled={status !== "ready"} className="min-h-11 rounded-lg border border-line px-3 text-xs text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-40" onClick={() => turn.current?.(direction)}>{direction < 0 ? (bi("왼쪽 회전", "Rotate left")) : (bi("오른쪽 회전", "Rotate right"))}</button>)}
      <button type="button" disabled={status !== "ready"} className="min-h-11 rounded-lg border border-line px-3 text-xs text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-40" onClick={() => reset.current?.()}>{bi("시점 초기화", "Reset view")}</button>
    </div>
    <p className="text-xs leading-5 text-fg-3">{bi("드래그로 회전 · 휠 또는 두 손가락으로 확대. 회전 버튼은 키보드로도 조작할 수 있습니다.", "Drag to orbit; scroll or pinch to zoom. Rotation buttons also support keyboard navigation.")}</p>
  </div>;
}
