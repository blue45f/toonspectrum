/**
 * 투영 페인트(베타) 엔진 구현: Babylon `MeshUVSpaceRenderer`로 브러시 비트맵을 표면 위치·법선 방향으로 메시의 UV 공간 렌더 타깃에 투영한다
 * (UV가 늘어나도 표면 위 브러시 크기가 같고, 투영 볼륨이 UV 섬 경계를 가로질러도 양쪽이 칠해진다. 이음매 번짐 보정 `uvEdgeBlending` 사용).
 * 순수 계약·수학은 `render/projection-paint.ts`, paint 도메인(레이어 합성·undo 토큰)과의 연결은 `app/shell/panels/projection-paint-driver.ts`다.
 *
 * - 부위(PartRole)마다 메시별 렌더러를 둔다(`begin`에서 만들고 부위가 바뀌면 다시 만든다). 렌더러 RTT는 레이어와 같은 크기 RGBA8이다.
 * - 셰이더 파일(WebGL2 GLSL·WebGPU WGSL)이 비동기로 로드되므로 준비 전 스탬프는 큐에 두었다가 `flush`에서 순서대로 재생한다.
 * - 블렌딩: MeshUVSpaceRenderer가 장면에 하나 만드는 공용 ShaderMaterial(`meshUVSpaceRendererShader`)의 알파 모드를 premultiplied porter-duff로 바꾼다
 *   (브러시 비트맵이 premultiplied라 `src + dst·(1−a)`가 색·알파 모두에 정확히 맞는다. 기본 COMBINE은 알파가 가산이라 겹침이 어두워진다).
 * - 읽기: `RenderTargetTexture.readPixels`(bottom-up). UV 공간 렌더는 v 0이 첫 행이라 `PaintLayer`(행 0 = v 0)와 같은 순서이므로 뒤집지 않는다.
 *   NullEngine·readback 불가 엔진은 `readPixels`가 null이라 `flush`가 null을 돌려준다(능력 판정이 먼저 막는다).
 * 브라우저 실측: Chrome + SwiftShader WebGL2(docs/parity/render.md). 실 GPU·WebGPU는 미검증이다.
 */
import { Constants } from "@babylonjs/core/Engines/constants.js";
import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { MeshUVSpaceRenderer } from "@babylonjs/core/Meshes/meshUVSpaceRenderer.js";

import { isPartRole } from "../../contracts";
import { waitUntilReady } from "../material-readiness";
import { PROJECTION_FALLBACK_SCREEN_NDC, metersPerTexel, projectionSizeM } from "../projection-paint";

import { toVector3 } from "./convert";
import { pickCandidates } from "./pick-and-paint";

import type { PartRole } from "../../contracts";
import type { ProjectionBrushBitmap, ProjectionOverlay, ProjectionPaintPort, ProjectionStampOutcome } from "../projection-paint";
import type { ReadbackLane } from "../readback";
import type { CharacterRig } from "./character-rig";
import type { Camera } from "@babylonjs/core/Cameras/camera.js";
import type { AbstractEngine } from "@babylonjs/core/Engines/abstractEngine.js";
import type { RenderTargetTexture } from "@babylonjs/core/Materials/Textures/renderTargetTexture.js";
import type { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import type { Scene } from "@babylonjs/core/scene.js";

/** 렌더러(셰이더) 준비 대기 상한 */
export const PROJECTION_READY_TIMEOUT_MS = 30_000;
/** UV 정보가 없는 삼각형에서 쓰는 대체 m/텍셀(1 mm) */
export const PROJECTION_FALLBACK_TEXEL_M = 0.001;

export interface ProjectionSupport {
  readonly supported: boolean;
  readonly reasonKo?: string;
}

/**
 * 투영 페인트를 켤 수 있는지: readback이 있는 실제 GPU 레인(WebGL2·WebGPU)이고 RTT 렌더가 가능해야 한다.
 * NullEngine(lane = "null")은 readPixels가 없어 결과를 읽을 수 없으므로 지원하지 않는다.
 */
export function projectionPaintSupport(engine: AbstractEngine, lane: ReadbackLane): ProjectionSupport {
  if (lane === "null") return { supported: false, reasonKo: "NullEngine에는 GPU readback이 없어 투영 결과를 읽을 수 없습니다(실제 WebGL2·WebGPU 엔진에서만 켤 수 있습니다)." };
  if (engine.getCaps().maxRenderTextureSize <= 0) return { supported: false, reasonKo: "이 엔진은 렌더 타깃 텍스처를 지원하지 않습니다." };
  return { supported: true };
}

export interface ProjectionPainterDeps {
  readonly scene: Scene;
  readonly camera: Camera;
  readonly rig: () => CharacterRig | null;
}

export interface ProjectionPainter extends ProjectionPaintPort {
  /** 렌더러가 붙은 메시 수(진단) */
  rendererCount(): number;
  dispose(): void;
}

interface BrushState {
  readonly bitmap: ProjectionBrushBitmap;
  readonly radiusPx: number;
  readonly texture: RawTexture;
}

interface QueuedStamp {
  readonly renderer: MeshUVSpaceRenderer;
  readonly position: Vector3;
  readonly normal: Vector3;
  readonly size: Vector3;
  readonly brush: RawTexture;
}

const SHARED_SHADER_NAME = "meshUVSpaceRendererShader";

export function createProjectionPainter(deps: ProjectionPainterDeps): ProjectionPainter {
  const { scene, camera } = deps;
  let part: PartRole | null = null;
  let layerWidth = 0;
  let layerHeight = 0;
  let brush: BrushState | null = null;
  const renderers = new Map<Mesh, MeshUVSpaceRenderer>();
  let queue: QueuedStamp[] = [];
  let painted = false;
  let blendConfigured = false;

  const disposeRenderers = (): void => {
    for (const renderer of renderers.values()) renderer.dispose();
    renderers.clear();
    queue = [];
    painted = false;
    blendConfigured = false;
  };

  /** 공용 ShaderMaterial의 알파 모드를 premultiplied porter-duff로 바꾼다(처음 준비된 뒤 한 번). */
  const configureBlend = (): void => {
    if (blendConfigured) return;
    const shader = scene.getMaterialByName(SHARED_SHADER_NAME);
    if (!shader) return;
    shader.alphaMode = Constants.ALPHA_PREMULTIPLIED_PORTERDUFF;
    blendConfigured = true;
  };

  const replay = (stamp: QueuedStamp): void => {
    stamp.renderer.renderTexture(stamp.brush, stamp.position, stamp.normal, stamp.size, 0, false);
    painted = true;
  };

  const uploadBrush = (bitmap: ProjectionBrushBitmap, radiusPx: number): BrushState => {
    const bytes = new Uint8Array(bitmap.rgba);
    if (brush && brush.bitmap.size === bitmap.size) {
      if (brush.bitmap.key !== bitmap.key) brush.texture.update(bytes);
      return { bitmap, radiusPx, texture: brush.texture };
    }
    brush?.texture.dispose();
    const texture = RawTexture.CreateRGBATexture(bytes, bitmap.size, bitmap.size, scene, false, false, Constants.TEXTURE_BILINEAR_SAMPLINGMODE, Constants.TEXTURETYPE_UNSIGNED_BYTE);
    texture.name = "projection-paint:brush";
    texture.wrapU = Constants.TEXTURE_CLAMP_ADDRESSMODE;
    texture.wrapV = Constants.TEXTURE_CLAMP_ADDRESSMODE;
    return { bitmap, radiusPx, texture };
  };

  const clearAll = (): void => {
    for (const renderer of renderers.values()) renderer.clear();
    queue = [];
    painted = false;
  };

  /** 월드 점에서 카메라 오른쪽·위로 `sizeM`만큼 떨어진 두 점을 NDC로 투영해 투영 한 변의 화면 크기를 구한다. */
  const screenSizeNdc = (worldPosition: readonly [number, number, number], sizeM: number): readonly [number, number] => {
    const origin = toVector3(worldPosition);
    const world = camera.getWorldMatrix();
    const viewProjection = camera.getTransformationMatrix();
    const base = Vector3.TransformCoordinates(origin, viewProjection);
    const right = Vector3.TransformCoordinates(origin.add(Vector3.TransformNormal(Vector3.Right(), world).normalize().scale(sizeM)), viewProjection);
    const up = Vector3.TransformCoordinates(origin.add(Vector3.TransformNormal(Vector3.Up(), world).normalize().scale(sizeM)), viewProjection);
    const width = Math.hypot(right.x - base.x, right.y - base.y);
    const height = Math.hypot(up.x - base.x, up.y - base.y);
    return width > 1e-6 && height > 1e-6 && Number.isFinite(width + height) ? [width, height] : PROJECTION_FALLBACK_SCREEN_NDC;
  };

  return {
    begin(next, width, height) {
      const rig = deps.rig();
      if (!rig) return false;
      const meshes = rig.parts.filter((entry) => entry.role === next && !entry.forceHidden).flatMap((entry) => entry.meshes);
      if (meshes.length === 0) return false;
      if (part !== next || layerWidth !== width || layerHeight !== height || meshes.some((mesh) => !renderers.has(mesh)) || renderers.size !== meshes.length) {
        disposeRenderers();
        part = next;
        layerWidth = width;
        layerHeight = height;
        for (const mesh of meshes) {
          renderers.set(mesh, new MeshUVSpaceRenderer(mesh, scene, { width, height, textureType: Constants.TEXTURETYPE_UNSIGNED_BYTE, generateMipMaps: false, optimizeUVAllocation: false, uvEdgeBlending: true }));
        }
      } else {
        clearAll();
      }
      return true;
    },
    setBrush(bitmap, radiusPx) {
      brush = uploadBrush(bitmap, radiusPx);
    },
    stamp(ndcX, ndcY): ProjectionStampOutcome {
      const miss: ProjectionStampOutcome = { hit: false, worldSizeM: 0, screenSizeNdc: [0, 0] };
      const rig = deps.rig();
      if (!rig || part === null || brush === null) return miss;
      const candidates = rig.parts.filter((entry) => !entry.forceHidden && entry.visible).flatMap((entry) => entry.meshes);
      const hit = pickCandidates(scene, camera, rig, candidates, ndcX, ndcY);
      if (!hit) return miss;
      const role = (hit.mesh.metadata as { readonly role?: unknown } | null)?.role;
      if (typeof role !== "string" || !isPartRole(role) || role !== part) return miss;
      const renderer = renderers.get(hit.mesh);
      if (!renderer) return miss;
      const triangle = hit.triangle;
      const texelM = (triangle ? metersPerTexel(triangle.world[0], triangle.world[1], triangle.world[2], triangle.uv[0], triangle.uv[1], triangle.uv[2], layerWidth, layerHeight) : null) ?? PROJECTION_FALLBACK_TEXEL_M;
      const sizeM = projectionSizeM(brush.radiusPx, texelM);
      const normal = toVector3(hit.worldNormal);
      // MeshUVSpaceRenderer는 투영 볼륨의 중심을 position + normal·size/2(= 표면 바깥쪽 한 칸)에 둔다. 볼록한 표면은 브러시 가장자리에서
      // 접평면 안쪽으로 휘므로 볼륨이 표면 점을 가운데로 오도록 position을 안쪽으로 size/2 옮겨 곡률 ±size/2를 포함시킨다.
      const position = toVector3(hit.worldPosition).subtract(normal.scale(sizeM * 0.5));
      const stamp: QueuedStamp = { renderer, position, normal, size: new Vector3(sizeM, sizeM, sizeM), brush: brush.texture };
      if (renderer.isReady() && queue.length === 0) {
        configureBlend();
        replay(stamp);
      } else {
        queue.push(stamp);
        painted = true;
      }
      return { hit: true, worldSizeM: sizeM, screenSizeNdc: screenSizeNdc(hit.worldPosition, sizeM) };
    },
    async flush(): Promise<ProjectionOverlay | null> {
      if (part === null || !painted) return null;
      const result = await waitUntilReady(
        [...renderers.values()].map((renderer) => () => renderer.isReady()),
        { timeoutMs: PROJECTION_READY_TIMEOUT_MS },
      );
      if (!result.ready) throw new Error(`투영 페인트 셰이더가 ${Math.round(PROJECTION_READY_TIMEOUT_MS / 1000)}초 안에 준비되지 않았습니다.`);
      configureBlend();
      const pending = queue;
      queue = [];
      for (const stamp of pending) replay(stamp);
      const out = new Uint8Array(layerWidth * layerHeight * 4);
      for (const renderer of renderers.values()) {
        const rtt = renderer.texture as RenderTargetTexture | null;
        const request = rtt && "readPixels" in rtt ? rtt.readPixels(0, 0, null, true, false) : null;
        if (request === null) {
          clearAll();
          throw new Error("이 엔진은 렌더 타깃 readback을 지원하지 않아 투영 결과를 읽을 수 없습니다.");
        }
        const buffer = await request;
        if (!(buffer instanceof Uint8Array || buffer instanceof Uint8ClampedArray) || buffer.length !== out.length) {
          clearAll();
          throw new Error(`투영 페인트 readback 형식이 RGBA8 ${layerWidth}×${layerHeight}이 아닙니다.`);
        }
        // 메시 여럿(UV가 겹치는 멀티 프리미티브)이면 premultiplied source-over로 합친다: out = src + out·(1 − src.a)
        for (let i = 0; i < out.length; i += 4) {
          const sa = (buffer[i + 3] ?? 0) / 255;
          if (sa === 0) continue;
          const keep = 1 - sa;
          out[i] = Math.min(255, Math.round((buffer[i] ?? 0) + (out[i] ?? 0) * keep));
          out[i + 1] = Math.min(255, Math.round((buffer[i + 1] ?? 0) + (out[i + 1] ?? 0) * keep));
          out[i + 2] = Math.min(255, Math.round((buffer[i + 2] ?? 0) + (out[i + 2] ?? 0) * keep));
          out[i + 3] = Math.min(255, Math.round((buffer[i + 3] ?? 0) + (out[i + 3] ?? 0) * keep));
        }
      }
      const snapshot: ProjectionOverlay = { part, width: layerWidth, height: layerHeight, rgba: out };
      clearAll();
      return snapshot;
    },
    cancel() {
      clearAll();
    },
    rendererCount: () => renderers.size,
    dispose() {
      disposeRenderers();
      brush?.texture.dispose();
      brush = null;
      part = null;
    },
  };
}
