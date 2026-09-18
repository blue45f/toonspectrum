import { translateCurrentStaticSourceText } from "@/shared/lib/i18n-bilingual-copy";
import { useEffect, useRef } from "react";
import { Color, DirectionalLight, HemisphereLight, PerspectiveCamera, Scene, WebGLRenderer } from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { disposeModel, loadLocalGlb } from "./local-glb";

export function GlbCapture({ file, onCapture, onError }: { file: File; onCapture: (image: string) => void; onError: (message: string) => void }) {
  const host = useRef<HTMLDivElement>(null); const capture = useRef<(() => string) | null>(null);
  const callbacks = useRef({ onCapture, onError }); callbacks.current = { onCapture, onError };
  useEffect(() => {
    const controller = new AbortController(); const element = host.current; if (!element) return;
    let release = () => {};
    void (async () => {
      const scene = new Scene(); scene.background = new Color(0xffffff);
      const renderer = new WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
      renderer.setSize(768,768); renderer.setPixelRatio(1); renderer.domElement.style.width = "100%"; renderer.domElement.style.height = "auto";
      const camera = new PerspectiveCamera(35,1,.01,100); camera.position.set(0,0,4);
      const controls = new OrbitControls(camera,renderer.domElement); controls.enableDamping = true; controls.minDistance = 1; controls.maxDistance = 10;
      const key = new DirectionalLight(0xffffff,3); key.position.set(3,4,5); scene.add(key,new HemisphereLight(0xffffff,0x8899aa,2));
      let model: Awaited<ReturnType<typeof loadLocalGlb>> | undefined;
      release = () => { capture.current = null; renderer.setAnimationLoop(null); controls.dispose(); if (model) disposeModel(model); renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove(); };
      try {
        model = await loadLocalGlb(await file.arrayBuffer(),controller.signal);
        if (controller.signal.aborted) { disposeModel(model); return; }
        scene.add(model); element.replaceChildren(renderer.domElement);
        renderer.setAnimationLoop(() => { controls.update(); renderer.render(scene,camera); });
        capture.current = () => { renderer.render(scene,camera); return renderer.domElement.toDataURL("image/png"); };
      } catch (error) { release(); if (!controller.signal.aborted) callbacks.current.onError(error instanceof Error ? error.message : "3D 모델을 열지 못했어요."); }
    })().catch(error => { if (!controller.signal.aborted) callbacks.current.onError(String(error)); });
    return () => { controller.abort(); release(); };
  },[file]);
  return <section><p>{translateCurrentStaticSourceText("domains.creator.generative.GlbCapture", "ko", "드래그로 시점·포즈 구도를 확인하고, 현재 구도를 AI에 전달하세요. 원본 GLB는 변경되지 않습니다.")}</p><div ref={host} aria-label={translateCurrentStaticSourceText("domains.creator.generative.GlbCapture", "ko", "3D 캐릭터 시점 미리보기")} /><button type="button" onClick={() => { if (capture.current) onCapture(capture.current()); else onError("모델을 불러오는 중이에요."); }}>{translateCurrentStaticSourceText("domains.creator.generative.GlbCapture", "ko", "현재 3D 구도를 2D 변환 입력으로 사용")}</button></section>;
}
