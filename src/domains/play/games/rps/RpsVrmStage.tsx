import { Canvas, useFrame } from "@react-three/fiber";
import { useEffect, useRef, useState } from "react";


import type { Hand, Outcome } from "./rps-logic";
import type { VRM } from "@pixiv/three-vrm";

import {
  applyExpressionWeightsToVrm,
  applyFingerRotations,
  applyPoseToVrm,
  POSE_PRESETS,
  type FingerRotationMap,
  type PoseBoneMap,
} from "@/src/domains/creator/studio-vrm-poser-utils";

const VRM_URL = "/vrm/sample.vrm";
const d = (deg: number) => (deg * Math.PI) / 180;

// 오른팔을 들어 손을 카메라 쪽으로 보여주는 검증된 프리셋.
const WAVE_POSE: PoseBoneMap = POSE_PRESETS.find((p) => p.id === "wave")?.bones ?? {};

// 가위/바위/보 → 오른손 손가락 회전(스튜디오 손모양 프리셋과 동일 규약, 우측 sign=+1).
function handFingers(hand: Hand): FingerRotationMap {
  const fingers = ["Index", "Middle", "Ring", "Little"] as const;
  const segments = ["Proximal", "Intermediate", "Distal"] as const;
  const out: FingerRotationMap = {};
  const set = (bone: string, v: [number, number, number]) => {
    (out as Record<string, [number, number, number]>)[`right${bone}`] = v;
  };

  if (hand === "paper") {
    for (const f of fingers) for (const s of segments) set(`${f}${s}`, [0, 0, 0]);
    set("ThumbMetacarpal", [0, 0, 0]);
    set("ThumbProximal", [0, 0, 0]);
    set("ThumbDistal", [0, 0, 0]);
  } else if (hand === "rock") {
    const r = d(85);
    for (const f of fingers) for (const s of segments) set(`${f}${s}`, [0, 0, r]);
    set("ThumbProximal", [0, d(40), d(40)]);
    set("ThumbDistal", [0, 0, d(40)]);
  } else {
    // scissors: 검지·중지 펴고 약지·소지 접기
    const r = d(85);
    for (const s of segments) {
      set(`Index${s}`, [0, 0, 0]);
      set(`Middle${s}`, [0, 0, 0]);
      set(`Ring${s}`, [0, 0, r]);
      set(`Little${s}`, [0, 0, r]);
    }
    set("ThumbProximal", [0, d(45), d(40)]);
    set("ThumbDistal", [0, 0, d(30)]);
  }
  return out;
}

// 결과(플레이어 관점) → 상대(VRM) 표정. 플레이어 승=상대 슬픔, 플레이어 패=상대 기쁨.
function reactionWeights(outcome: Outcome | null): Record<string, number> {
  if (outcome === "win") return { sad: 0.9 };
  if (outcome === "lose") return { happy: 1 };
  if (outcome === "draw") return { relaxed: 0.6 };
  return {};
}

async function loadVrm(url: string): Promise<VRM> {
  const [{ GLTFLoader }, { VRMLoaderPlugin, VRMUtils }] = await Promise.all([
    import("three/examples/jsm/loaders/GLTFLoader.js"),
    import("@pixiv/three-vrm"),
  ]);
  const loader = new GLTFLoader();
  loader.register((parser) => new VRMLoaderPlugin(parser));
  const gltf = await loader.loadAsync(url);
  VRMUtils.combineSkeletons?.(gltf.scene);
  const vrm = gltf.userData.vrm as VRM | undefined;
  if (!vrm) {
    VRMUtils.deepDispose(gltf.scene);
    throw new Error("VRM 데이터를 찾지 못했습니다.");
  }
  if (vrm.meta.metaVersion === "0") VRMUtils.rotateVRM0(vrm);
  VRMUtils.removeUnnecessaryJoints?.(vrm.scene);
  return vrm;
}

function VrmModel({ hand, outcome, onReady }: { hand: Hand | null; outcome: Outcome | null; onReady: () => void }) {
  const [vrm, setVrm] = useState<VRM | null>(null);
  const onReadyRef = useRef(onReady);
  useEffect(() => {
    onReadyRef.current = onReady;
  });

  useEffect(() => {
    let alive = true;
    let loaded: VRM | null = null;
    loadVrm(VRM_URL)
      .then((v) => {
        if (!alive) return;
        loaded = v;
        setVrm(v);
        onReadyRef.current();
      })
      .catch(() => {});
    return () => {
      alive = false;
      if (loaded) {
        import("@pixiv/three-vrm").then(({ VRMUtils }) => VRMUtils.deepDispose(loaded!.scene)).catch(() => {});
      }
    };
  }, []);

  // 포즈(팔 들기) + 손가락 제스처.
  useEffect(() => {
    if (!vrm) return;
    applyPoseToVrm(vrm, WAVE_POSE, 0);
    if (hand) applyFingerRotations(vrm, handFingers(hand));
  }, [vrm, hand]);

  // 승패 표정.
  useEffect(() => {
    if (!vrm) return;
    applyExpressionWeightsToVrm(vrm, reactionWeights(outcome));
  }, [vrm, outcome]);

  const t = useRef(0);
  useFrame((_, delta) => {
    if (!vrm) return;
    t.current += delta;
    vrm.scene.position.y = Math.sin(t.current * 1.6) * 0.012; // 가벼운 숨쉬기
    vrm.scene.rotation.y = Math.sin(t.current * 0.5) * 0.05;
    vrm.update(delta);
  });

  if (!vrm) return null;
  return <primitive object={vrm.scene} />;
}

export function RpsVrmStage({ hand, outcome, onReady }: { hand: Hand | null; outcome: Outcome | null; onReady?: () => void }) {
  return (
    <Canvas
      camera={{ position: [0, 1.32, 1.05], fov: 30 }}
      onCreated={({ camera }) => camera.lookAt(0, 1.18, 0)}
      gl={{ alpha: true }}
      style={{ background: "transparent" }}
    >
      <ambientLight intensity={1.3} />
      <directionalLight position={[1, 2, 2]} intensity={1.6} />
      <directionalLight position={[-1, 1, 1]} intensity={0.5} />
      <VrmModel hand={hand} outcome={outcome} onReady={onReady ?? (() => {})} />
    </Canvas>
  );
}

export default RpsVrmStage;
