/**
 * XR 웹툰 프리젠터 — three.js 기반 최소 3D 무대.
 *
 * AR/VR 세션·컷 캡처·VRM 스테이징이 "빈 껍데기"가 아니라 실제로 동작하도록
 * 작은 3D 씬(바닥 격자·컷 평면·프리미티브 캐릭터)을 만든다.
 *
 * - AR/VR: `studio-webxr-session` 컨트롤러가 이 모듈의 renderer port에
 *   XRSession을 붙이면 three WebXRManager가 헤드셋으로 프레임을 낸다.
 * - 컷 캡처: 카메라 프리셋대로 한 프레임을 렌더해 PNG 데이터 URL로 뽑는다.
 * - VRM 스테이징: xr-webtoon-vrm-staging 명세대로 관절·표정·배치를 적용한다.
 *
 * three.js는 동적 import라 초기 번들에 들지 않는다. 모든 WebGL 작업은
 * 이 팩토리 안에서만 일어나며, WebGL이 없으면 생성 단계에서 실패한다.
 */

import type {
  StudioWebXrRendererPort,
} from "../studio-webxr-session";
import type { XrCutCaptureJob } from "./xr-webtoon-cut-capture";
import type {
  XrVrmExpressionId,
  XrVrmJoint,
  XrVrmStagingDescriptor,
} from "./xr-webtoon-vrm-staging";
import type { XrDepthCut } from "./xr-webtoon-depth-model";
import {
  XR_VRM_EXPRESSION_PRESETS,
  XR_VRM_POSE_PRESETS,
  xrVrmResolvePose,
} from "./xr-webtoon-vrm-staging";

export interface XrPresenterHandle {
  /** studio-webxr-session 컨트롤러에 넘기는 renderer port. */
  readonly port: StudioWebXrRendererPort;
  /** VRM 스테이징 명세를 캐릭터에 적용한다. */
  applyVrmStaging(spec: XrVrmStagingDescriptor): void;
  /** 컷 캡처 작업대로 PNG를 렌더해 데이터 URL로 돌려준다. */
  captureCut(job: XrCutCaptureJob): Promise<string>;
  dispose(): void;
}

const DEG_TO_RAD = Math.PI / 180;

/** 이 브라우저에서 WebGL 렌더러를 만들 수 있는지. */
export function xrPresenterWebGlAvailable(): boolean {
  if (typeof document === "undefined") return false;
  try {
    const canvas = document.createElement("canvas");
    const gl =
      canvas.getContext("webgl2") ?? canvas.getContext("webgl");
    return gl !== null;
  } catch {
    return false;
  }
}

type ThreeModule = typeof import("three");

interface JointSet {
  readonly root: InstanceType<ThreeModule["Group"]>;
  readonly joints: Partial<Record<XrVrmJoint, InstanceType<ThreeModule["Group"]>>>;
  readonly faceCanvas: HTMLCanvasElement;
  readonly faceTexture: InstanceType<ThreeModule["CanvasTexture"]>;
}

function drawFace(
  THREE: ThreeModule,
  canvas: HTMLCanvasElement,
  texture: InstanceType<ThreeModule["CanvasTexture"]>,
  expression: XrVrmExpressionId,
): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const ink = "#1e1b4b";
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = ink;
  ctx.fillStyle = ink;
  ctx.lineWidth = 7;
  ctx.lineCap = "round";

  const eye = (x: number, y: number, r: number): void => {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  };
  const happyEye = (x: number, y: number): void => {
    ctx.beginPath();
    ctx.arc(x, y + 4, 12, Math.PI * 1.15, Math.PI * 1.85);
    ctx.stroke();
  };

  switch (expression) {
    case "happy":
      happyEye(44, 52);
      happyEye(84, 52);
      ctx.beginPath();
      ctx.arc(64, 74, 22, Math.PI * 0.15, Math.PI * 0.85);
      ctx.stroke();
      break;
    case "sad":
      eye(44, 52, 7);
      eye(84, 52, 7);
      ctx.beginPath();
      ctx.arc(64, 104, 20, Math.PI * 1.15, Math.PI * 1.85);
      ctx.stroke();
      break;
    case "angry":
      ctx.beginPath();
      ctx.moveTo(30, 40);
      ctx.lineTo(58, 52);
      ctx.moveTo(98, 40);
      ctx.lineTo(70, 52);
      ctx.stroke();
      eye(46, 62, 7);
      eye(82, 62, 7);
      ctx.beginPath();
      ctx.arc(64, 102, 16, Math.PI * 1.2, Math.PI * 1.8);
      ctx.stroke();
      break;
    case "surprised":
      eye(44, 52, 10);
      eye(84, 52, 10);
      ctx.beginPath();
      ctx.arc(64, 88, 12, 0, Math.PI * 2);
      ctx.stroke();
      break;
    case "neutral":
    default:
      eye(44, 52, 7);
      eye(84, 52, 7);
      ctx.beginPath();
      ctx.moveTo(48, 88);
      ctx.lineTo(80, 88);
      ctx.stroke();
      break;
  }
  texture.needsUpdate = true;
}

function buildCharacter(THREE: ThreeModule): JointSet {
  const skin = new THREE.MeshStandardMaterial({ color: 0xc4b5fd, roughness: 0.7 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x7c3aed, roughness: 0.7 });
  const joints: Partial<Record<XrVrmJoint, InstanceType<ThreeModule["Group"]>>> = {};

  const group = (parent: InstanceType<ThreeModule["Object3D"]>, joint: XrVrmJoint | null, x: number, y: number, z: number): InstanceType<ThreeModule["Group"]> => {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    parent.add(g);
    if (joint) joints[joint] = g;
    return g;
  };
  const capsule = (
    parent: InstanceType<ThreeModule["Object3D"]>,
    r: number,
    len: number,
    mat: InstanceType<ThreeModule["Material"]>,
    x: number,
    y: number,
    z: number,
  ): void => {
    const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 6, 16), mat);
    mesh.position.set(x, y, z);
    parent.add(mesh);
  };

  const root = new THREE.Group();

  const hips = group(root, "hips", 0, 1.02, 0);
  capsule(hips, 0.14, 0.1, dark, 0, 0, 0);

  const spine = group(hips, "spine", 0, 0.12, 0);
  capsule(spine, 0.15, 0.26, skin, 0, 0.16, 0);

  const chest = group(spine, "chest", 0, 0.3, 0);
  capsule(chest, 0.16, 0.16, skin, 0, 0.08, 0);

  const neck = group(chest, "neck", 0, 0.22, 0);
  const neckMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.08, 12), skin);
  neckMesh.position.set(0, 0.04, 0);
  neck.add(neckMesh);

  const head = group(neck, "head", 0, 0.12, 0);
  const headMesh = new THREE.Mesh(new THREE.SphereGeometry(0.15, 24, 18), skin);
  headMesh.position.set(0, 0.1, 0);
  head.add(headMesh);

  const faceCanvas = document.createElement("canvas");
  faceCanvas.width = 128;
  faceCanvas.height = 128;
  const faceTexture = new THREE.CanvasTexture(faceCanvas);
  faceTexture.colorSpace = THREE.SRGBColorSpace;
  const face = new THREE.Mesh(
    new THREE.PlaneGeometry(0.2, 0.2),
    new THREE.MeshBasicMaterial({ map: faceTexture, transparent: true }),
  );
  face.position.set(0, 0.1, 0.145);
  head.add(face);
  drawFace(THREE, faceCanvas, faceTexture, "neutral");

  for (const side of ["L", "R"] as const) {
    const sx = side === "L" ? -1 : 1;
    const upperArm = group(chest, `upperArm${side}` as XrVrmJoint, sx * 0.24, 0.16, 0);
    capsule(upperArm, 0.05, 0.2, skin, 0, -0.13, 0);
    const lowerArm = group(upperArm, `lowerArm${side}` as XrVrmJoint, 0, -0.27, 0);
    capsule(lowerArm, 0.045, 0.18, skin, 0, -0.11, 0);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 10), skin);
    hand.position.set(0, -0.25, 0);
    lowerArm.add(hand);

    const upperLeg = group(hips, `upperLeg${side}` as XrVrmJoint, sx * 0.1, -0.04, 0);
    capsule(upperLeg, 0.07, 0.28, dark, 0, -0.19, 0);
    const lowerLeg = group(upperLeg, `lowerLeg${side}` as XrVrmJoint, 0, -0.4, 0);
    capsule(lowerLeg, 0.06, 0.28, dark, 0, -0.19, 0);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.07, 0.18), dark);
    foot.position.set(0, -0.42, 0.04);
    lowerLeg.add(foot);
  }

  return { root, joints, faceCanvas, faceTexture };
}

function posterize(ctx: CanvasRenderingContext2D, w: number, h: number, levels: number): void {
  const image = ctx.getImageData(0, 0, w, h);
  const data = image.data;
  const step = 255 / (levels - 1);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = Math.round(data[i]! / step) * step;
    data[i + 1] = Math.round(data[i + 1]! / step) * step;
    data[i + 2] = Math.round(data[i + 2]! / step) * step;
  }
  ctx.putImageData(image, 0, 0);
}

function screentonePattern(style: "dots" | "lines"): HTMLCanvasElement {
  const tile = document.createElement("canvas");
  tile.width = 10;
  tile.height = 10;
  const tctx = tile.getContext("2d");
  if (tctx) {
    tctx.fillStyle = "rgba(10,10,30,0.9)";
    if (style === "dots") {
      tctx.beginPath();
      tctx.arc(5, 5, 2.2, 0, Math.PI * 2);
      tctx.fill();
    } else {
      tctx.fillRect(2, 0, 2, 10);
    }
  }
  return tile;
}

/**
 * 프리젠터를 만든다. three.js를 동적 로드하므로 호출 시점에만 비용이 든다.
 * WebGL을 만들 수 없으면 throw한다.
 */
export async function createXrWebtoonPresenter(input: {
  readonly cuts: readonly XrDepthCut[];
}): Promise<XrPresenterHandle> {
  if (!xrPresenterWebGlAvailable()) {
    throw new Error("webgl-unavailable");
  }
  const THREE: ThreeModule = await import("three");

  const canvas = document.createElement("canvas");
  const renderer = new THREE.WebGLRenderer({ antialias: true, canvas });
  const DEFAULT_W = 960;
  const DEFAULT_H = 640;
  renderer.setSize(DEFAULT_W, DEFAULT_H, false);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b1026);
  scene.fog = new THREE.Fog(0x0b1026, 8, 22);

  const camera = new THREE.PerspectiveCamera(50, DEFAULT_W / DEFAULT_H, 0.1, 100);
  camera.position.set(0, 1.6, 4.5);
  camera.lookAt(0, 1.2, 0);

  scene.add(new THREE.HemisphereLight(0xc4b5fd, 0x0b1026, 1.1));
  const key = new THREE.DirectionalLight(0xffffff, 1.6);
  key.position.set(3, 6, 4);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x22d3ee, 0.7);
  rim.position.set(-4, 3, -3);
  scene.add(rim);

  const grid = new THREE.GridHelper(24, 24, 0x8b5cf6, 0x243055);
  grid.position.y = 0;
  (grid.material as InstanceType<ThreeModule["Material"]>).transparent = true;
  (grid.material as InstanceType<ThreeModule["Material"]>).opacity = 0.55;
  scene.add(grid);

  // 컷 평면: 호 형태로 배치 (최대 5장).
  const loader = new THREE.TextureLoader();
  const cutPlanes: InstanceType<ThreeModule["Mesh"]>[] = [];
  const shown = input.cuts.slice(0, 5);
  const textures = await Promise.all(
    shown.map((cut) =>
      loader
        .loadAsync(cut.layers[0]?.imageUrl ?? "")
        .catch(() => null),
    ),
  );
  shown.forEach((cut, i) => {
    const tex = textures[i];
    if (!tex) return;
    tex.colorSpace = THREE.SRGBColorSpace;
    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(1.7, 2.2),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide }),
    );
    const angle = (i - (shown.length - 1) / 2) * 0.5;
    const radius = 3.4;
    plane.position.set(Math.sin(angle) * radius, 1.5, -Math.cos(angle) * radius);
    plane.rotation.y = angle;
    scene.add(plane);
    cutPlanes.push(plane);
    void cut;
  });

  const character = buildCharacter(THREE);
  scene.add(character.root);

  const tick = (): void => {
    renderer.render(scene, camera);
  };

  const port: StudioWebXrRendererPort = {
    get enabled() {
      return renderer.xr.enabled;
    },
    set enabled(value: boolean) {
      renderer.xr.enabled = value;
    },
    get isPresenting() {
      return renderer.xr.isPresenting;
    },
    setReferenceSpaceType(type: XRReferenceSpaceType) {
      renderer.xr.setReferenceSpaceType(type);
    },
    setSession(session: XRSession | null): Promise<void> {
      const result = renderer.xr.setSession(session);
      if (session) renderer.setAnimationLoop(tick);
      else renderer.setAnimationLoop(null);
      return result;
    },
    getSession(): XRSession | null {
      return renderer.xr.getSession();
    },
  };

  let disposed = false;

  return {
    port,
    applyVrmStaging(spec: XrVrmStagingDescriptor): void {
      if (disposed) return;
      const preset = XR_VRM_POSE_PRESETS[spec.poseId];
      const resolved = xrVrmResolvePose(preset);
      (Object.keys(resolved) as XrVrmJoint[]).forEach((joint) => {
        const g = character.joints[joint];
        if (!g) return;
        const [x, y, z] = resolved[joint]!;
        g.rotation.set(x * DEG_TO_RAD, y * DEG_TO_RAD, z * DEG_TO_RAD);
      });
      const expr = XR_VRM_EXPRESSION_PRESETS[spec.expressionId];
      drawFace(THREE, character.faceCanvas, character.faceTexture, expr.id);
      const p = spec.placement;
      character.root.position.set((p.x - 0.5) * 3, 0, (0.5 - p.y) * 1.2);
      character.root.rotation.y = p.rotationYDeg * DEG_TO_RAD;
      character.root.scale.setScalar(p.scale * (p.mirrored ? -1 : 1));
      if (p.mirrored) character.root.scale.x = -Math.abs(character.root.scale.x);
    },
    async captureCut(job: XrCutCaptureJob): Promise<string> {
      if (disposed) throw new Error("disposed");
      const w = job.widthPx;
      const h = job.heightPx;
      const prevAspect = camera.aspect;
      camera.aspect = w / h;
      camera.fov = job.camera.fovDeg;
      camera.position.set(job.camera.position[0], job.camera.position[1], job.camera.position[2]);
      camera.lookAt(job.camera.lookAt[0], job.camera.lookAt[1], job.camera.lookAt[2]);
      camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
      renderer.render(scene, camera);

      const out = document.createElement("canvas");
      out.width = w;
      out.height = h;
      const ctx = out.getContext("2d");
      if (!ctx) throw new Error("2d-context-unavailable");
      // 같은 태스크 안에서 동기 복사 — preserveDrawingBuffer 없이도 읽힌다.
      ctx.drawImage(renderer.domElement, 0, 0, w, h);
      if (job.style.toonShading) posterize(ctx, w, h, 5);
      if (job.style.screentone !== "none") {
        const pattern = ctx.createPattern(screentonePattern(job.style.screentone), "repeat");
        if (pattern) {
          ctx.save();
          ctx.globalAlpha = 0.16;
          ctx.fillStyle = pattern;
          ctx.fillRect(0, 0, w, h);
          ctx.restore();
        }
      }
      if (job.style.halftone) {
        const grad = ctx.createLinearGradient(0, 0, 0, h);
        grad.addColorStop(0, "rgba(139,92,246,0)");
        grad.addColorStop(1, "rgba(139,92,246,0.25)");
        ctx.save();
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);
        ctx.restore();
      }
      const url = out.toDataURL("image/png");

      camera.aspect = prevAspect;
      camera.updateProjectionMatrix();
      renderer.setSize(DEFAULT_W, DEFAULT_H, false);
      return url;
    },
    dispose(): void {
      disposed = true;
      renderer.setAnimationLoop(null);
      scene.traverse((obj) => {
        const mesh = obj as InstanceType<ThreeModule["Mesh"]>;
        if (mesh.isMesh) {
          mesh.geometry?.dispose();
          const mat = mesh.material as InstanceType<ThreeModule["Material"]> | InstanceType<ThreeModule["Material"]>[];
          if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
          else mat?.dispose();
        }
      });
      renderer.dispose();
    },
  };
}
