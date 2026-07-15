// "3D 배경" 도구에 업로드한 커스텀 3D 모델(.glb/.gltf/.obj)의 씬 배치 순수 헬퍼 + 로더.
// studio-background-3d-primitives.ts(도형 프리미티브)의 관례를 그대로 따르되 그 파일은 이번 작업
// 범위(새 파일만 생성)상 절대 수정하지 않는다 — BgCustomModelInstance는 BgPrimitive의 새 kind가
// 아니라 완전히 별도인 인스턴스 목록으로, 씬 상태 상에서 구조적으로 구분된다(§5 통합 문서 참고,
// docs/studio-bg3d-custom-model-upload.md).
import * as THREE from "three";

import type { Bg3dModelFormat } from "./bg3d-model-library";
import type { BgPrimitive } from "./studio-background-3d-primitives";
import type { StudioBg3dGlbValidationSuccess } from "./studio-bg3d-glb-validation";
import type {
  StudioBg3dParsedGlbMetrics,
  StudioBg3dSceneBudgets,
} from "./studio-bg3d-scene-document";

export interface BgCustomModelInstance {
  id: string;
  /** bg3d-model-library.ts IndexedDB 레코드 id — 모델 바이너리 자체는 절대 씬 상태/직렬화에 포함되지 않는다. */
  modelId: string;
  position: [number, number, number];
  rotation: [number, number, number]; // Euler XYZ, 라디안 — BgPrimitive와 동일 계약
  scale: [number, number, number];
  /** When false, mesh is hidden in viewport/capture but kept in the scene graph. Default true. */
  visible?: boolean;
  /** When true, transform gizmo and numeric edits are blocked. Default false. */
  locked?: boolean;
}

// PRIMITIVE_DEFS 도형들의 대략적인 크기 감각(반경 0.5~1m대)과 맞춘 오토핏 목표 치수.
const DEFAULT_AUTO_FIT_TARGET_SIZE = 2;
// .obj가 .mtl 없이 올라왔을 때 씌우는 무광 중립색 — 도형 프리셋 팔레트(예: box "#c9a876",
// cylinder "#9fb4c9")와 톤을 맞추되 특정 프리셋과 겹치지 않는 회색조를 고른다.
const BG3D_CUSTOM_MODEL_NEUTRAL_COLOR = "#b8b8c2";

function uid(): string {
  return `bg3dmodel-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

// 반복 추가 시 매번 원점에 완전히 겹쳐 쌓이지 않도록 x축 결정적 지터를 준다 — createPrimitive와
// 동일한 패턴(studio-background-3d-primitives.ts). 정확한 위치는 사용자가 TransformControls로 잡는다.
export function createBgCustomModelInstance(
  modelId: string,
  existingCount: number,
  scale: [number, number, number] = [1, 1, 1]
): BgCustomModelInstance {
  const offsetX = (existingCount % 5) * 0.8;
  return {
    id: uid(),
    modelId,
    position: [offsetX, 0, 0],
    rotation: [0, 0, 0],
    scale: [...scale],
  };
}

export function duplicateBgCustomModelInstance(instance: BgCustomModelInstance): BgCustomModelInstance {
  return {
    ...instance,
    id: uid(),
    position: [instance.position[0] + 0.4, instance.position[1], instance.position[2] + 0.4],
    // 복제본은 편집 가능·표시 상태로 둔다(잠긴 원본을 복제해 곧바로 못 움직이는 함정 방지).
    locked: false,
    visible: instance.visible !== false,
  };
}

// undo/redo 스냅샷용 깊은 복제 — clonePrimitives와 동일한 이유로 필드별 스프레드를 쓴다
// (배열/문자열/숫자만 갖는 평평한 구조라 JSON 왕복보다 저렴).
export function cloneBgCustomModelInstances(instances: BgCustomModelInstance[]): BgCustomModelInstance[] {
  return instances.map((inst) => ({
    ...inst,
    position: [...inst.position] as [number, number, number],
    rotation: [...inst.rotation] as [number, number, number],
    scale: [...inst.scale] as [number, number, number],
    visible: inst.visible,
    locked: inst.locked,
  }));
}

/**
 * 로드 직후 측정한 바운딩 박스 크기(measureBg3dObjectSize 참고)로부터, 모델의 최대 변이
 * targetSize(기본 2m — 도형 프리셋 감각과 맞춤)에 맞도록 균일 스케일 배율을 역산한다.
 * SketchUp(대개 인치 단위 원본을 그대로 내보냄)·Blender(미터)·기타 툴마다 내보내기 단위 관례가
 * 제각각이라, 업로드된 모델의 크기가 사방 몇 mm~몇 km까지 널뛸 수 있다 — 이 함수가 그 격차를
 * 보정하는 유일한 지점이다. 치수가 유한하지 않거나 0 이하(빈/퇴화 지오메트리 방어)면 1(무변경)을
 * 반환한다.
 */
export function computeAutoFitScale(boundingSize: [number, number, number], targetSize: number = DEFAULT_AUTO_FIT_TARGET_SIZE): number {
  const maxDimension = Math.max(...boundingSize.map((v) => Math.abs(v)));
  if (!Number.isFinite(maxDimension) || maxDimension <= 0 || !Number.isFinite(targetSize) || targetSize <= 0) {
    return 1;
  }
  return targetSize / maxDimension;
}

/** 로드된 모델 루트의 월드축 정렬 바운딩 박스 변 길이(x/y/z)를 측정한다 — computeAutoFitScale의 입력. */
export function measureBg3dObjectSize(object: THREE.Object3D): [number, number, number] {
  const box = new THREE.Box3().setFromObject(object);
  if (box.isEmpty()) return [0, 0, 0];
  const size = box.getSize(new THREE.Vector3());
  return [size.x, size.y, size.z];
}

/**
 * .obj는 .mtl(머티리얼 정의) 없이 업로드되면 OBJLoader가 재질 없이(또는 검은색으로) 메시를 만들어
 * 배경 도형들과 톤이 완전히 어긋난다(.mtl 지원은 이번 작업 범위 밖 — docs/studio-bg3d-custom-model-upload.md
 * §8 참고). 대신 모든 메시에 도형 프리셋과 같은 계열의 무광 중립색 MeshStandardMaterial 하나를
 * 공유시켜 "실루엣은 정확하되 색은 신경 안 써도 되는" 블록아웃 톤을 보장한다. 교체되는 원본
 * 머티리얼(들)은 즉시 dispose해 GPU 리소스가 새지 않게 한다.
 */
export function applyBg3dFallbackMaterial(root: THREE.Object3D, color: string = BG3D_CUSTOM_MODEL_NEUTRAL_COLOR): void {
  const material = new THREE.MeshStandardMaterial({ color });
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    const prevMaterial = mesh.material;
    mesh.material = material;
    for (const mat of Array.isArray(prevMaterial) ? prevMaterial : [prevMaterial]) {
      mat.dispose();
    }
  });
}

/**
 * IndexedDB에서 꺼낸 blob을 GLTFLoader(.glb/.gltf)/OBJLoader(.obj)로 파싱해 씬에 넣을 수 있는
 * Object3D 루트를 만든다. StudioVrmPoser.tsx의 loadVrmAsset과 동일하게 로더를 동적 import
 * (three/examples/jsm)해 초기 번들을 무겁게 만들지 않는다.
 *
 * blob: URL은 이미 로컬 메모리에 있는 데이터(방금 IndexedDB에서 꺼낸 값)라, loadVrmAsset과 달리
 * resolveAssetUrl/HEAD 프리플라이트(HTML 폴백 감지)가 필요 없다 — 그 대상은 배포 오리진이 다를 수
 * 있는 root-relative 정적 경로(/vrm/..)뿐이고, blob: 스킴은 애초에 그 대상이 아니다
 * (loadVrmAsset의 shouldPreflightVrmUrl도 blob:을 프리플라이트 대상에서 제외한다).
 */
export async function loadBg3dCustomModelFromBlob(blob: Blob, format: Bg3dModelFormat): Promise<THREE.Object3D> {
  const objectUrl = URL.createObjectURL(blob);
  try {
    if (format === "obj") {
      const { OBJLoader } = await import("three/examples/jsm/loaders/OBJLoader.js");
      const root = await new OBJLoader().loadAsync(objectUrl);
      applyBg3dFallbackMaterial(root);
      return root;
    }

    // GLTFLoader는 .glb(바이너리)/.gltf(JSON) 콘텐츠를 자동 판별하므로 둘을 따로 분기할 필요가 없다.
    const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js");
    const gltf = await new GLTFLoader().loadAsync(objectUrl);
    return gltf.scene;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

/* ── 검증 완료 GLB → Three.js 안전 경계 ─────────────────────────────────────────────
   위 loadBg3dCustomModelFromBlob은 기존 프로젝트 호환을 위해 남겨 둔 레거시 경로다. 새 상용 경로는
   반드시 studio-bg3d-glb-validation.ts가 돌려준 성공 객체만 받고, URL·파일명·포맷 문자열을 받지
   않는다. 따라서 JSON glTF/OBJ나 외부 네트워크 리소스를 이 API로 우회해 넣을 수 없다. */

const GLB_HEADER_BYTES = 12;
const GLB_MAGIC = 0x46546c67;
const GLB_VERSION = 2;

export type StudioBg3dThreeFailureCode =
  | "invalid-verified-glb"
  | "invalid-budgets"
  | "model-byte-budget-exceeded"
  | "renderer-unavailable"
  | "parse-failed"
  | "clone-failed"
  | "invalid-scene"
  | "unsafe-scene-metrics"
  | "node-budget-exceeded"
  | "triangle-budget-exceeded"
  | "draw-call-budget-exceeded"
  | "material-budget-exceeded"
  | "light-budget-exceeded"
  | "texture-count-budget-exceeded"
  | "texture-byte-budget-exceeded"
  | "texture-dimension-budget-exceeded";

export interface StudioBg3dThreeFailure {
  readonly ok: false;
  readonly code: StudioBg3dThreeFailureCode;
  /** 파일명, 파서 예외, 모델 메타데이터를 절대 섞지 않는 고정 UI 문구. */
  readonly message: string;
}

export interface StudioBg3dThreeMetricsSuccess {
  readonly ok: true;
  readonly metrics: StudioBg3dParsedGlbMetrics;
}

export type StudioBg3dThreeMetricsResult =
  | StudioBg3dThreeMetricsSuccess
  | StudioBg3dThreeFailure;

export interface StudioBg3dThreeDisposeSummary {
  readonly geometries: number;
  readonly materials: number;
  readonly textures: number;
  readonly renderTargets: number;
  readonly imageBitmaps: number;
}

export interface StudioBg3dThreeLoadSuccess {
  readonly ok: true;
  readonly code: "loaded";
  readonly message: string;
  /** glTF 기본 장면. 보조 장면까지 포함한 모든 소유 자원은 dispose()가 정리한다. */
  readonly root: THREE.Object3D;
  readonly animations: readonly THREE.AnimationClip[];
  readonly metrics: StudioBg3dParsedGlbMetrics;
  /** React Strict Mode 정리처럼 여러 번 호출해도 실제 Three 자원은 한 번만 해제한다. */
  readonly dispose: () => StudioBg3dThreeDisposeSummary;
}

export type StudioBg3dThreeLoadResult =
  | StudioBg3dThreeLoadSuccess
  | StudioBg3dThreeFailure;

const THREE_FAILURE_MESSAGES: Readonly<Record<StudioBg3dThreeFailureCode, string>> =
  Object.freeze({
    "invalid-verified-glb": "검증 완료된 GLB 2.0 모델만 불러올 수 있습니다. 모델을 다시 등록해 주세요.",
    "invalid-budgets": "3D 모델 안전 기준을 확인할 수 없습니다. 작업공간을 새로고침해 주세요.",
    "model-byte-budget-exceeded": "이 장면의 3D 모델 용량 기준을 초과했습니다. 더 작은 모델을 사용해 주세요.",
    "renderer-unavailable": "3D 모델 처리기를 시작하지 못했습니다. 최신 브라우저에서 다시 시도해 주세요.",
    "parse-failed": "3D 모델을 안전하게 해석하지 못했습니다. GLB 2.0으로 다시 내보내 주세요.",
    "clone-failed": "3D 모델 인스턴스를 복제하지 못했습니다. 모델을 다시 불러와 주세요.",
    "invalid-scene": "3D 모델에 표시할 수 있는 기본 장면이 없습니다. 모델을 다시 내보내 주세요.",
    "unsafe-scene-metrics": "3D 모델의 렌더링 복잡도를 안전하게 계산할 수 없습니다. 모델을 단순화해 주세요.",
    "node-budget-exceeded": "이 장면의 3D 노드 수 기준을 초과했습니다. 모델 계층을 단순화해 주세요.",
    "triangle-budget-exceeded": "이 장면의 삼각형 수 기준을 초과했습니다. 메시를 경량화해 주세요.",
    "draw-call-budget-exceeded": "이 장면의 드로콜 기준을 초과했습니다. 메시와 재질을 병합해 주세요.",
    "material-budget-exceeded": "이 장면의 재질 수 기준을 초과했습니다. 재질을 정리하거나 병합해 주세요.",
    "light-budget-exceeded": "이 장면의 조명 수 기준을 초과했습니다. 조명 수를 줄여 주세요.",
    "texture-count-budget-exceeded": "이 장면의 텍스처 개수 기준을 초과했습니다. 텍스처를 정리해 주세요.",
    "texture-byte-budget-exceeded": "이 장면의 디코딩 텍스처 메모리 기준을 초과했습니다. 텍스처를 축소해 주세요.",
    "texture-dimension-budget-exceeded": "이 장면의 텍스처 해상도 기준을 초과했습니다. 텍스처 크기를 낮춰 주세요.",
  });

function threeFailure(code: StudioBg3dThreeFailureCode): StudioBg3dThreeFailure {
  return Object.freeze({ ok: false, code, message: THREE_FAILURE_MESSAGES[code] });
}

function isSafeCount(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function safeAdd(left: number, right: number): number | null {
  if (!isSafeCount(left) || !isSafeCount(right) || left > Number.MAX_SAFE_INTEGER - right) {
    return null;
  }
  return left + right;
}

function safeMultiply(left: number, right: number): number | null {
  if (!isSafeCount(left) || !isSafeCount(right)) return null;
  if (left === 0 || right === 0) return 0;
  if (left > Math.floor(Number.MAX_SAFE_INTEGER / right)) return null;
  return left * right;
}

function isObject3d(value: unknown): value is THREE.Object3D {
  return Boolean(
    value &&
      typeof value === "object" &&
      (value as { isObject3D?: unknown }).isObject3D === true &&
      typeof (value as { traverse?: unknown }).traverse === "function"
  );
}

function uniqueRoots(rootOrRoots: THREE.Object3D | readonly THREE.Object3D[]): readonly THREE.Object3D[] {
  return [...new Set(Array.isArray(rootOrRoots) ? rootOrRoots : [rootOrRoots])];
}

function normalizedElementRange(
  geometry: THREE.BufferGeometry
): { readonly start: number; readonly end: number } | null {
  const elementCount = geometry.index?.count ?? geometry.getAttribute("position")?.count ?? 0;
  if (!isSafeCount(elementCount)) return null;
  const start = geometry.drawRange.start;
  const count = geometry.drawRange.count;
  if (!isSafeCount(start) || !(count === Number.POSITIVE_INFINITY || isSafeCount(count))) return null;
  const clampedStart = Math.min(start, elementCount);
  if (count === Number.POSITIVE_INFINITY) return { start: clampedStart, end: elementCount };
  const unclampedEnd = safeAdd(clampedStart, count);
  if (unclampedEnd === null) return null;
  return { start: clampedStart, end: Math.min(unclampedEnd, elementCount) };
}

function groupIntersectionElements(
  group: THREE.BufferGeometry["groups"][number],
  range: { readonly start: number; readonly end: number }
): number | null {
  if (!isSafeCount(group.start) || !isSafeCount(group.count)) return null;
  const groupEnd = safeAdd(group.start, group.count);
  if (groupEnd === null) return null;
  return Math.max(0, Math.min(groupEnd, range.end) - Math.max(group.start, range.start));
}

interface MeshRenderWork {
  readonly triangles: number;
  readonly drawCalls: number;
}

interface GroupedRenderWork {
  readonly elements: number;
  readonly drawCalls: number;
}

function measureGroupedRenderWork(
  geometry: THREE.BufferGeometry,
  material: THREE.Material | THREE.Material[]
): GroupedRenderWork | null {
  const range = normalizedElementRange(geometry);
  if (!range) return null;

  let elements = range.end - range.start;
  let drawCalls = elements > 0 ? 1 : 0;
  if (Array.isArray(material) && geometry.groups.length > 0) {
    elements = 0;
    drawCalls = 0;
    for (const group of geometry.groups) {
      const groupElements = groupIntersectionElements(group, range);
      if (groupElements === null) return null;
      if (groupElements > 0) {
        const nextDrawCalls = safeAdd(drawCalls, 1);
        if (nextDrawCalls === null) return null;
        drawCalls = nextDrawCalls;
      }
      const nextElements = safeAdd(elements, groupElements);
      if (nextElements === null) return null;
      elements = nextElements;
    }
  }
  return { elements, drawCalls };
}

function measureMeshRenderWork(mesh: THREE.Mesh): MeshRenderWork | null {
  const geometry = mesh.geometry;
  if (!(geometry instanceof THREE.BufferGeometry)) return null;
  const grouped = measureGroupedRenderWork(geometry, mesh.material);
  if (!grouped) return null;

  // glTF/Three Mesh는 삼각형 목록이며, 완성되지 않은 마지막 1~2개 인덱스는 그려지지 않는다.
  const baseTriangles = Math.floor(grouped.elements / 3);
  const instanceCount = mesh instanceof THREE.InstancedMesh ? mesh.count : 1;
  if (!isSafeCount(instanceCount)) return null;
  const triangles = safeMultiply(baseTriangles, instanceCount);
  if (triangles === null) return null;
  return { triangles, drawCalls: grouped.drawCalls };
}

function measureNonTriangleRenderWork(
  object: THREE.Line | THREE.Points
): MeshRenderWork | null {
  if (!(object.geometry instanceof THREE.BufferGeometry)) return null;
  const grouped = measureGroupedRenderWork(object.geometry, object.material);
  return grouped ? { triangles: 0, drawCalls: grouped.drawCalls } : null;
}

interface TextureMetric {
  readonly decodedBytes: number;
  readonly maxDimension: number;
}

interface ImageSourceMetric extends TextureMetric {
  readonly width: number;
  readonly height: number;
  readonly depth: number;
}

const MIPMAP_MIN_FILTERS: ReadonlySet<number> = new Set([
  THREE.NearestMipmapNearestFilter,
  THREE.NearestMipmapLinearFilter,
  THREE.LinearMipmapNearestFilter,
  THREE.LinearMipmapLinearFilter,
]);

function dimension(value: unknown, fallbackKeys: readonly string[]): number | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  let largest = 0;
  for (const key of fallbackKeys) {
    const candidate = record[key];
    if (isSafeCount(candidate) && candidate > largest) largest = candidate;
  }
  return largest > 0 ? largest : null;
}

function bufferByteLength(value: unknown): number {
  if (value instanceof ArrayBuffer) return value.byteLength;
  if (ArrayBuffer.isView(value)) return value.byteLength;
  return 0;
}

function measureImageSource(value: unknown): ImageSourceMetric | null {
  if (!value || typeof value !== "object") return null;
  const width = dimension(value, ["width", "naturalWidth", "videoWidth"]);
  const height = dimension(value, ["height", "naturalHeight", "videoHeight"]);
  if (width === null || height === null) return null;
  const record = value as Record<string, unknown>;
  const depthValue = record.depth;
  const depth = depthValue === undefined ? 1 : depthValue;
  if (!isSafeCount(depth) || depth < 1) return null;
  const pixels = safeMultiply(width, height);
  const volumePixels = pixels === null ? null : safeMultiply(pixels, depth);
  const rgbaBytes = volumePixels === null ? null : safeMultiply(volumePixels, 4);
  if (rgbaBytes === null) return null;
  return {
    decodedBytes: Math.max(rgbaBytes, bufferByteLength(record.data)),
    maxDimension: Math.max(width, height),
    width,
    height,
    depth,
  };
}

function measureAutomaticMipChain(source: ImageSourceMetric, reduceDepth: boolean): number | null {
  const basePixels = safeMultiply(source.width, source.height);
  const baseTexels = basePixels === null ? null : safeMultiply(basePixels, source.depth);
  if (baseTexels === null || baseTexels === 0) return null;
  const bytesPerTexel = Math.ceil(source.decodedBytes / baseTexels);
  if (!isSafeCount(bytesPerTexel) || bytesPerTexel < 1) return null;

  let width = source.width;
  let height = source.height;
  let depth = source.depth;
  let total = 0;
  while (true) {
    const pixels = safeMultiply(width, height);
    const texels = pixels === null ? null : safeMultiply(pixels, depth);
    const levelBytes = texels === null ? null : safeMultiply(texels, bytesPerTexel);
    const nextTotal = levelBytes === null ? null : safeAdd(total, levelBytes);
    if (nextTotal === null) return null;
    total = nextTotal;
    if (width === 1 && height === 1 && (!reduceDepth || depth === 1)) return total;
    width = Math.max(1, Math.floor(width / 2));
    height = Math.max(1, Math.floor(height / 2));
    if (reduceDepth) depth = Math.max(1, Math.floor(depth / 2));
  }
}

function measureTexture(texture: THREE.Texture): TextureMetric | null {
  // Three.js는 수동 mipmap 배열의 0번 항목을 base level로 업로드하고 source image는 업로드하지
  // 않는다. 따라서 명시된 체인은 그 배열만 합산해 source/자동 체인과 중복 계산하지 않는다.
  if (texture.mipmaps.length > 0) {
    let decodedBytes = 0;
    let maxDimension = 0;
    for (const mipmap of texture.mipmaps) {
      const measured = measureImageSource(mipmap);
      if (!measured) return null;
      const nextBytes = safeAdd(decodedBytes, measured.decodedBytes);
      if (nextBytes === null) return null;
      decodedBytes = nextBytes;
      maxDimension = Math.max(maxDimension, measured.maxDimension);
    }
    return { decodedBytes, maxDimension };
  }

  const sourceData = texture.source?.data ?? texture.image;
  const sources = sourceData === null || sourceData === undefined
    ? []
    : Array.isArray(sourceData) ? sourceData : [sourceData];
  if (sources.length === 0) return null;
  const automaticMipmaps = texture.generateMipmaps && MIPMAP_MIN_FILTERS.has(texture.minFilter);
  const reduceDepth = (texture as THREE.Texture & { isData3DTexture?: boolean }).isData3DTexture === true;
  let decodedBytes = 0;
  let maxDimension = 0;
  for (const source of sources) {
    const measured = measureImageSource(source);
    if (!measured) return null;
    const sourceBytes = automaticMipmaps
      ? measureAutomaticMipChain(measured, reduceDepth)
      : measured.decodedBytes;
    if (sourceBytes === null) return null;
    const nextBytes = safeAdd(decodedBytes, sourceBytes);
    if (nextBytes === null) return null;
    decodedBytes = nextBytes;
    maxDimension = Math.max(maxDimension, measured.maxDimension);
  }
  return { decodedBytes, maxDimension };
}

interface ThreeResources {
  readonly geometries: Set<THREE.BufferGeometry>;
  readonly materials: Set<THREE.Material>;
  readonly textures: Set<THREE.Texture>;
  readonly renderTargets: Set<THREE.RenderTarget>;
  readonly imageBitmaps: Set<ImageBitmap>;
}

function isImageBitmap(value: unknown): value is ImageBitmap {
  if (!value || typeof value !== "object" || typeof (value as { close?: unknown }).close !== "function") {
    return false;
  }
  const ImageBitmapConstructor = globalThis.ImageBitmap;
  if (typeof ImageBitmapConstructor === "function" && value instanceof ImageBitmapConstructor) return true;
  return Object.prototype.toString.call(value) === "[object ImageBitmap]";
}

function addImageBitmaps(value: unknown, imageBitmaps: Set<ImageBitmap>, seen: WeakSet<object>): void {
  if (!value || typeof value !== "object" || seen.has(value)) return;
  seen.add(value);
  if (isImageBitmap(value)) {
    imageBitmaps.add(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) addImageBitmaps(item, imageBitmaps, seen);
  }
}

function collectThreeResources(roots: readonly THREE.Object3D[]): ThreeResources {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  const renderTargets = new Set<THREE.RenderTarget>();
  const imageBitmaps = new Set<ImageBitmap>();
  const scannedValues = new WeakSet<object>();
  const scannedImages = new WeakSet<object>();

  const scanValue = (value: unknown): void => {
    if (!value || typeof value !== "object" || scannedValues.has(value)) return;
    scannedValues.add(value);
    if (value instanceof THREE.Texture) {
      textures.add(value);
      addImageBitmaps(value.source?.data ?? value.image, imageBitmaps, scannedImages);
      addImageBitmaps(value.mipmaps, imageBitmaps, scannedImages);
      if (value.renderTarget) scanValue(value.renderTarget);
      return;
    }
    if (value instanceof THREE.RenderTarget) {
      renderTargets.add(value);
      for (const texture of value.textures) scanValue(texture);
      if (value.depthTexture) scanValue(value.depthTexture);
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value) scanValue(item);
      return;
    }
    if (value instanceof Map || value instanceof Set) {
      for (const item of value.values()) scanValue(item);
      return;
    }
    // ShaderMaterial uniforms는 { value: Texture }의 중첩 레코드다. 순환은 WeakSet으로 끊는다.
    const prototype = Object.getPrototypeOf(value);
    if (prototype === Object.prototype || prototype === null || "value" in value) {
      for (const item of Object.values(value as Record<string, unknown>)) scanValue(item);
    }
  };

  const addMaterial = (material: THREE.Material): void => {
    if (materials.has(material)) return;
    materials.add(material);
    for (const value of Object.values(material as unknown as Record<string, unknown>)) scanValue(value);
  };

  const seenObjects = new Set<THREE.Object3D>();
  for (const root of roots) {
    root.traverse((object) => {
      if (seenObjects.has(object)) return;
      seenObjects.add(object);
      const renderable = object as THREE.Object3D & {
        geometry?: unknown;
        material?: unknown;
        skeleton?: THREE.Skeleton;
      };
      if (renderable.geometry instanceof THREE.BufferGeometry) geometries.add(renderable.geometry);
      const objectMaterials = Array.isArray(renderable.material) ? renderable.material : [renderable.material];
      for (const material of objectMaterials) {
        if (material instanceof THREE.Material) addMaterial(material);
      }
      if (renderable.skeleton?.boneTexture) scanValue(renderable.skeleton.boneTexture);
    });
  }
  return { geometries, materials, textures, renderTargets, imageBitmaps };
}

/**
 * 파싱된 Three 장면의 실제 렌더 작업량을 다시 측정한다. 공유 geometry도 각 배치/인스턴스의
 * 삼각형 작업에는 반복 반영하되, 재질·텍스처 GPU 자원은 객체 동일성 기준으로 한 번만 센다.
 */
export function measureStudioBg3dThreeMetrics(
  rootOrRoots: THREE.Object3D | readonly THREE.Object3D[]
): StudioBg3dThreeMetricsResult {
  const roots = uniqueRoots(rootOrRoots);
  if (roots.length === 0 || roots.some((root) => !isObject3d(root))) return threeFailure("invalid-scene");

  const resources = collectThreeResources(roots);
  let nodes = 0;
  let triangles = 0;
  let drawCalls = 0;
  let lights = 0;
  const seenObjects = new Set<THREE.Object3D>();
  let unsafe = false;
  for (const root of roots) {
    root.traverse((object) => {
      if (unsafe || seenObjects.has(object)) return;
      seenObjects.add(object);
      const nextNodes = safeAdd(nodes, 1);
      if (nextNodes === null) {
        unsafe = true;
        return;
      }
      nodes = nextNodes;
      if ((object as THREE.Light).isLight) {
        const nextLights = safeAdd(lights, 1);
        if (nextLights === null) {
          unsafe = true;
          return;
        }
        lights = nextLights;
      }
      let work: MeshRenderWork | null;
      if ((object as THREE.Mesh).isMesh) work = measureMeshRenderWork(object as THREE.Mesh);
      else if ((object as THREE.Line).isLine || (object as THREE.Points).isPoints) {
        work = measureNonTriangleRenderWork(object as THREE.Line | THREE.Points);
      } else return;
      if (!work) {
        unsafe = true;
        return;
      }
      const nextTriangles = safeAdd(triangles, work.triangles);
      const nextDrawCalls = safeAdd(drawCalls, work.drawCalls);
      if (nextTriangles === null || nextDrawCalls === null) {
        unsafe = true;
        return;
      }
      triangles = nextTriangles;
      drawCalls = nextDrawCalls;
    });
  }
  if (unsafe) return threeFailure("unsafe-scene-metrics");

  let textureBytes = 0;
  let maxTextureDimension = 0;
  for (const texture of resources.textures) {
    const measured = measureTexture(texture);
    if (!measured) return threeFailure("unsafe-scene-metrics");
    const nextTextureBytes = safeAdd(textureBytes, measured.decodedBytes);
    if (nextTextureBytes === null) return threeFailure("unsafe-scene-metrics");
    textureBytes = nextTextureBytes;
    maxTextureDimension = Math.max(maxTextureDimension, measured.maxDimension);
  }

  return Object.freeze({
    ok: true,
    metrics: Object.freeze({
      nodes,
      triangles,
      drawCalls,
      materials: resources.materials.size,
      lights,
      textures: resources.textures.size,
      textureBytes,
      maxTextureDimension,
    }),
  });
}

function validBudgets(budgets: StudioBg3dSceneBudgets): boolean {
  if (!budgets || typeof budgets !== "object") return false;
  const values = [
    budgets.complexity?.maxNodes,
    budgets.complexity?.maxTriangles,
    budgets.complexity?.maxDrawCalls,
    budgets.complexity?.maxMaterials,
    budgets.complexity?.maxLights,
    budgets.complexity?.maxModelBytes,
    budgets.textures?.maxTextures,
    budgets.textures?.maxTotalBytes,
    budgets.textures?.maxDimension,
  ];
  return values.every(isSafeCount);
}

function validParsedMetrics(metrics: StudioBg3dParsedGlbMetrics): boolean {
  if (!metrics || typeof metrics !== "object") return false;
  return [
    metrics.nodes,
    metrics.triangles,
    metrics.drawCalls,
    metrics.materials,
    metrics.lights,
    metrics.textures,
    metrics.textureBytes,
    metrics.maxTextureDimension,
  ].every(isSafeCount);
}

/** 검사 결과가 null이면 예산을 통과했다. */
export function checkStudioBg3dThreeBudgets(
  metrics: StudioBg3dParsedGlbMetrics,
  budgets: StudioBg3dSceneBudgets
): StudioBg3dThreeFailure | null {
  if (!validBudgets(budgets)) return threeFailure("invalid-budgets");
  if (!validParsedMetrics(metrics)) return threeFailure("unsafe-scene-metrics");
  if (metrics.nodes > budgets.complexity.maxNodes) return threeFailure("node-budget-exceeded");
  if (metrics.triangles > budgets.complexity.maxTriangles) return threeFailure("triangle-budget-exceeded");
  if (metrics.drawCalls > budgets.complexity.maxDrawCalls) return threeFailure("draw-call-budget-exceeded");
  if (metrics.materials > budgets.complexity.maxMaterials) return threeFailure("material-budget-exceeded");
  if (metrics.lights > budgets.complexity.maxLights) return threeFailure("light-budget-exceeded");
  if (metrics.textures > budgets.textures.maxTextures) return threeFailure("texture-count-budget-exceeded");
  if (metrics.textureBytes > budgets.textures.maxTotalBytes) return threeFailure("texture-byte-budget-exceeded");
  if (metrics.maxTextureDimension > budgets.textures.maxDimension) {
    return threeFailure("texture-dimension-budget-exceeded");
  }
  return null;
}

function disposeThreeResourceSnapshot(resources: ThreeResources): StudioBg3dThreeDisposeSummary {
  for (const geometry of resources.geometries) {
    try { geometry.dispose(); } catch { /* 다음 자원을 계속 정리한다. */ }
  }
  for (const material of resources.materials) {
    try { material.dispose(); } catch { /* 다음 자원을 계속 정리한다. */ }
  }
  for (const texture of resources.textures) {
    try { texture.dispose(); } catch { /* 다음 자원을 계속 정리한다. */ }
  }
  for (const renderTarget of resources.renderTargets) {
    try { renderTarget.dispose(); } catch { /* 다음 자원을 계속 정리한다. */ }
  }
  for (const bitmap of resources.imageBitmaps) {
    try { bitmap.close(); } catch { /* 이미 닫혔어도 전체 정리를 중단하지 않는다. */ }
  }
  return Object.freeze({
    geometries: resources.geometries.size,
    materials: resources.materials.size,
    textures: resources.textures.size,
    renderTargets: resources.renderTargets.size,
    imageBitmaps: resources.imageBitmaps.size,
  });
}

/**
 * 호출 시점 장면의 geometry/material/texture/렌더타깃/ImageBitmap을 객체 동일성 기준으로
 * 정확히 한 번씩 정리하는 편의 API. 로더 소유권 정리에는 아래 성공 시점 snapshot을 사용한다.
 */
export function disposeStudioBg3dThreeResources(
  rootOrRoots: THREE.Object3D | readonly THREE.Object3D[]
): StudioBg3dThreeDisposeSummary {
  return disposeThreeResourceSnapshot(collectThreeResources(uniqueRoots(rootOrRoots)));
}

/** 스킨 메시가 있으면 SkeletonUtils.clone으로 뼈/스켈레톤 바인딩까지 독립 복제한다. */
export async function cloneStudioBg3dThreeObject(root: THREE.Object3D): Promise<THREE.Object3D> {
  try {
    let hasSkinnedContent = false;
    root.traverse((object) => {
      if ((object as THREE.SkinnedMesh).isSkinnedMesh) hasSkinnedContent = true;
    });
    if (!hasSkinnedContent) return root.clone(true);
    const { clone } = await import("three/examples/jsm/utils/SkeletonUtils.js");
    return clone(root);
  } catch {
    throw new StudioBg3dThreeOperationError("clone-failed");
  }
}

/** 결과 union을 쓰기 어려운 clone 호출부에도 고정 코드/한국어 문구만 전달하는 안전 예외. */
export class StudioBg3dThreeOperationError extends Error {
  readonly code: StudioBg3dThreeFailureCode;

  constructor(code: StudioBg3dThreeFailureCode) {
    super(THREE_FAILURE_MESSAGES[code]);
    this.name = "StudioBg3dThreeOperationError";
    this.code = code;
  }
}

function copyVerifiedGlbBytes(verification: StudioBg3dGlbValidationSuccess): ArrayBuffer | null {
  if (
    !verification ||
    typeof verification !== "object" ||
    verification.ok !== true ||
    !(verification.verifiedBytes instanceof Uint8Array)
  ) return null;
  const bytes = verification.verifiedBytes;
  if (bytes.byteLength < GLB_HEADER_BYTES) return null;
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  const view = new DataView(copy);
  if (
    view.getUint32(0, true) !== GLB_MAGIC ||
    view.getUint32(4, true) !== GLB_VERSION ||
    view.getUint32(8, true) !== copy.byteLength
  ) {
    return null;
  }
  return copy;
}

/**
 * 검증기가 소유한 성공 스냅샷만 Three.js로 넘기는 상용 로더. parseAsync의 base path는 반드시
 * 빈 문자열이며 이 경계에는 URL.createObjectURL/loadAsync/fetch 경로가 존재하지 않는다.
 */
export async function loadVerifiedStudioBg3dGlbWithThree(
  verification: StudioBg3dGlbValidationSuccess,
  budgets: StudioBg3dSceneBudgets
): Promise<StudioBg3dThreeLoadResult> {
  if (!validBudgets(budgets)) return threeFailure("invalid-budgets");
  const buffer = copyVerifiedGlbBytes(verification);
  if (!buffer) return threeFailure("invalid-verified-glb");
  if (buffer.byteLength > budgets.complexity.maxModelBytes) {
    return threeFailure("model-byte-budget-exceeded");
  }

  let loader: import("three/examples/jsm/loaders/GLTFLoader.js").GLTFLoader;
  try {
    const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js");
    loader = new GLTFLoader();
  } catch {
    return threeFailure("renderer-unavailable");
  }

  let parsed: import("three/examples/jsm/loaders/GLTFLoader.js").GLTF;
  try {
    parsed = await loader.parseAsync(buffer, "");
  } catch {
    return threeFailure("parse-failed");
  }

  const parsedScenes = Array.isArray(parsed.scenes) ? parsed.scenes.filter(isObject3d) : [];
  const ownedRoots = uniqueRoots(isObject3d(parsed.scene) ? [parsed.scene, ...parsedScenes] : parsedScenes);
  if (!isObject3d(parsed.scene)) {
    if (ownedRoots.length > 0) disposeStudioBg3dThreeResources(ownedRoots);
    return threeFailure("invalid-scene");
  }

  const measured = measureStudioBg3dThreeMetrics(ownedRoots);
  if (!measured.ok) {
    disposeStudioBg3dThreeResources(ownedRoots);
    return measured;
  }
  const budgetFailure = checkStudioBg3dThreeBudgets(measured.metrics, budgets);
  if (budgetFailure) {
    disposeStudioBg3dThreeResources(ownedRoots);
    return budgetFailure;
  }

  // 소유권 경계는 성공 Promise가 사용자 코드에 전달되기 전에 고정한다. 이후 root에서 파서 메시를
  // 떼어 내거나 앱 소유 helper를 붙여도 dispose()는 이 snapshot 외 자원을 재탐색하지 않는다.
  const ownedResourceSnapshot = collectThreeResources(ownedRoots);
  let disposed = false;
  let summary: StudioBg3dThreeDisposeSummary | null = null;
  const dispose = (): StudioBg3dThreeDisposeSummary => {
    if (!disposed) {
      summary = disposeThreeResourceSnapshot(ownedResourceSnapshot);
      disposed = true;
    }
    return summary as StudioBg3dThreeDisposeSummary;
  };
  return Object.freeze({
    ok: true,
    code: "loaded",
    message: "검증된 3D 모델을 안전하게 불러왔습니다.",
    root: parsed.scene,
    animations: Object.freeze([...(Array.isArray(parsed.animations) ? parsed.animations : [])]),
    metrics: measured.metrics,
    dispose,
  });
}

/* ── 씬 해시 직렬화(customModels 확장) ───────────────────────────────────────────────
   studio-background-3d-primitives.ts의 encodeBg3dSceneHash/parseBg3dSceneFromDataUrl(프리미티브
   전용, 무변경)과 별개로, 여기서는 customModels(인스턴스 배치 + modelId 참조만 — 모델 바이너리
   자체는 절대 포함하지 않음)까지 함께 실어 나르는 새 버전을 추가한다. 캡처된 PNG data URL 뒤에
   `#`으로 장면 그래프를 붙이는 트릭은 동일(VRM 포저/도형 프리미티브와 공유하는 round-trip 계약).
   customModels 필드가 없는 기존(프리미티브 전용) 해시도 계속 파싱되도록(빈 배열로 취급) 하위
   호환을 지킨다. */

interface Bg3dSceneWithModelsMetadata {
  tool: "bg3d";
  primitives: BgPrimitive[];
  customModels: BgCustomModelInstance[];
}

export interface Bg3dSceneWithModels {
  primitives: BgPrimitive[];
  customModels: BgCustomModelInstance[];
}

export function encodeBg3dSceneWithModelsHash(primitives: BgPrimitive[], customModels: BgCustomModelInstance[]): string {
  const metadata: Bg3dSceneWithModelsMetadata = { tool: "bg3d", primitives, customModels };
  return encodeURIComponent(JSON.stringify(metadata));
}

export function parseBg3dSceneWithModelsFromDataUrl(dataUrl: string | undefined): Bg3dSceneWithModels | null {
  if (!dataUrl) return null;
  const hashIndex = dataUrl.indexOf("#");
  if (hashIndex < 0) return null;
  try {
    const raw = JSON.parse(decodeURIComponent(dataUrl.slice(hashIndex + 1))) as Partial<Bg3dSceneWithModelsMetadata>;
    if (raw.tool !== "bg3d" || !Array.isArray(raw.primitives)) return null;
    return {
      primitives: raw.primitives,
      customModels: Array.isArray(raw.customModels) ? raw.customModels : [],
    };
  } catch {
    return null;
  }
}
