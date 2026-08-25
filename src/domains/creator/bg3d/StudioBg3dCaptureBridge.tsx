import { useThree } from "@react-three/fiber";
import { useEffect, useEffectEvent } from "react";

import { loadStudioBg3dThreeWebglCaptureRuntime } from "./studio-bg3d-editor-derivations";

import type { StudioBg3dCaptureAdapter } from "./studio-bg3d-capture-adapter";
import type { CaptureState } from "./StudioBackground3DTypes";

/* ── R3F Canvas 내부에서 렌더러/씬/카메라를 꺼내 캡처용 ref에 흘려보내는 다리.
   VRM 포저의 CaptureBridge와 동일한 패턴 — ref-not-state라 마운트마다 리렌더를 유발하지 않는다. */
export function CaptureBridge({
  onCaptureUpdate,
}: {
  onCaptureUpdate: (state: CaptureState, cleanupAdapter?: StudioBg3dCaptureAdapter | null) => void;
}) {
  const { camera, gl, scene } = useThree();
  const updateCapture = useEffectEvent(onCaptureUpdate);

  useEffect(() => {
    let disposed = false;
    let adapter: StudioBg3dCaptureAdapter | null = null;
    void loadStudioBg3dThreeWebglCaptureRuntime().then((runtime) => {
      if (disposed) return;
      adapter = runtime.createStudioBg3dThreeWebglCaptureAdapter({
        camera,
        renderer: gl,
        scene,
      });
      updateCapture({ adapter, camera });
    }).catch(() => {
      if (!disposed) updateCapture({ adapter: null, camera: null });
    });
    return () => {
      disposed = true;
      if (adapter) updateCapture({ adapter: null, camera: null }, adapter);
    };
  }, [camera, gl, scene]);

  return null;
}

export type StudioBg3dImmersiveStageSuccess = Extract<
  import("./studio-bg3d-immersive-stage").StudioBg3dImmersiveStagePlan,
  { readonly ok: true }
>;
