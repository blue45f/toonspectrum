/**
 * Studio Lift 3D — 원화 한 장을 3D 모델로 바꾸는 전체 경로.
 *
 * 픽셀 → 작업 격자 → 실루엣 마스크 → 깊이장 → 편집 가능 메시 → 텍스처 GLB.
 * 각 단계는 옆 모듈에 순수 함수로 들어 있고, 여기서는 프리셋과 예산, 진단만 엮는다.
 *
 * 결과에는 메시 권위 해시가 함께 실린다. 같은 원화·같은 설정이면 항상 같은 해시가 나오므로
 * 재생성 여부를 바이트 비교 없이 판정할 수 있고, DCC 워크벤치의 GLB 내보내기 계약과도 맞물린다.
 */

import {
  diagnoseStudioEditableMesh,
  hashStudioEditableMesh,
  studioEditableMeshStats,
} from "../studio-editable-half-edge-mesh";

import {
  STUDIO_LIFT3D_LIMITS,
  STUDIO_LIFT3D_REVISION,
  clampStudioLift3dResolution,
  studioLift3dFailure,
  studioLift3dSuccess,
  studioLift3dWarning,
  validateStudioLift3dSource,
  type StudioLift3dDepthProfile,
  type StudioLift3dGeometryMode,
  type StudioLift3dMaskMode,
  type StudioLift3dResult,
  type StudioLift3dSourceImage,
  type StudioLift3dSubject,
  type StudioLift3dTexture,
  type StudioLift3dWarning,
} from "./studio-lift3d-contract";
import { buildStudioLift3dDepthField, type StudioLift3dDepthField } from "./studio-lift3d-depth";
import { encodeStudioLift3dGlb, type StudioLift3dGlbFile } from "./studio-lift3d-glb";
import {
  extractStudioLift3dMask,
  resampleStudioLift3dImage,
  type StudioLift3dMask,
} from "./studio-lift3d-mask";
import { buildStudioLift3dGeometry, type StudioLift3dGeometry } from "./studio-lift3d-mesh";

import type { StudioLift3dRenderBuffers } from "./studio-lift3d-render-buffers";

export interface StudioLift3dPreset {
  readonly geometryMode: StudioLift3dGeometryMode;
  readonly depthProfile: StudioLift3dDepthProfile;
  /** 피사체 최대 변 대비 두께 비율. */
  readonly depthScale: number;
  readonly baseScale: number;
  readonly resolution: number;
  readonly smoothing: number;
  readonly maskMode: StudioLift3dMaskMode;
  readonly keepLargestPart: boolean;
  /** scene unit 기준 완성 높이. */
  readonly targetHeight: number;
  readonly alphaMode: "MASK" | "OPAQUE";
  readonly label: string;
  readonly hint: string;
}

/**
 * 프리셋 수치는 웹툰 원화의 실제 사용 맥락에서 잡았다.
 * - character: 사람 키 1.7 scene unit, 실루엣 폭의 30% 두께 — 옆에서 봐도 종이 인형이 아니다.
 * - prop: 손에 드는 소품 40cm, 더 두툼하게(55%).
 * - background: 배경은 뒤집어 볼 일이 없으므로 부조 슬래브. 얕은 돌출(10%)이 원근을 살린다.
 */
export const STUDIO_LIFT3D_PRESETS: Readonly<Record<StudioLift3dSubject, StudioLift3dPreset>> =
  Object.freeze({
    character: Object.freeze({
      geometryMode: "inflate",
      depthProfile: "round",
      depthScale: 0.3,
      baseScale: 0,
      resolution: 176,
      smoothing: 3,
      maskMode: "auto",
      keepLargestPart: true,
      targetHeight: 1.7,
      alphaMode: "MASK",
      label: "캐릭터",
      hint: "배경을 지운 PNG 를 넣으면 실루엣을 앞뒤로 부풀려 닫힌 입체로 만듭니다",
    }),
    prop: Object.freeze({
      geometryMode: "inflate",
      depthProfile: "round",
      depthScale: 0.55,
      baseScale: 0,
      resolution: 144,
      smoothing: 2,
      maskMode: "auto",
      keepLargestPart: true,
      targetHeight: 0.4,
      alphaMode: "MASK",
      label: "소품 · 오브젝트",
      hint: "컵·의자·무기처럼 손에 드는 물건. 캐릭터보다 두툼하게 부풀립니다",
    }),
    background: Object.freeze({
      geometryMode: "relief",
      depthProfile: "relief",
      depthScale: 0.1,
      baseScale: 0.02,
      resolution: 224,
      smoothing: 1,
      maskMode: "full",
      keepLargestPart: false,
      targetHeight: 6,
      alphaMode: "OPAQUE",
      label: "배경",
      hint: "명암을 높이로 읽어 부조로 세웁니다. 카메라를 움직이면 원근이 살아납니다",
    }),
  });

export interface StudioLift3dRequest {
  readonly subject: StudioLift3dSubject;
  readonly resolution?: number;
  readonly depthScale?: number;
  readonly smoothing?: number;
  readonly depthProfile?: StudioLift3dDepthProfile;
  readonly maskMode?: StudioLift3dMaskMode;
  readonly alphaThreshold?: number;
  readonly keyTolerance?: number;
  readonly targetHeight?: number;
  /** 어두운 면이 앞으로 나오게 뒤집는다(역광 배경). relief 프로파일에서만 의미가 있다. */
  readonly invertRelief?: boolean;
  readonly keepLargestPart?: boolean;
}

export interface StudioLift3dMetrics {
  readonly gridWidth: number;
  readonly gridHeight: number;
  readonly coverage: number;
  readonly vertexCount: number;
  readonly faceCount: number;
  readonly triangleCount: number;
  readonly boundaryEdgeCount: number;
  /** 남은 비다양체/나비 진단 건수. 0 이어야 유효한 solid 다. */
  readonly topologyErrorCount: number;
  readonly closed: boolean;
}

export interface StudioLift3dLift {
  readonly revision: typeof STUDIO_LIFT3D_REVISION;
  readonly subject: StudioLift3dSubject;
  readonly mask: StudioLift3dMask;
  readonly depth: StudioLift3dDepthField;
  readonly geometry: StudioLift3dGeometry;
  readonly metrics: StudioLift3dMetrics;
  /** `hashStudioEditableMesh` 권위 다이제스트. 같은 입력이면 같은 값. */
  readonly meshHash: string;
}

function resolveRequest(request: StudioLift3dRequest): {
  readonly preset: StudioLift3dPreset;
  readonly resolution: number;
  readonly warnings: StudioLift3dWarning[];
} {
  const preset = STUDIO_LIFT3D_PRESETS[request.subject];
  const warnings: StudioLift3dWarning[] = [];
  const clamped = clampStudioLift3dResolution(request.resolution ?? preset.resolution);
  if (clamped.warning !== null) warnings.push(clamped.warning);
  return { preset, resolution: clamped.resolution, warnings };
}

/** 남은 위상 오류(비다양체 변·나비 정점) 개수. `closed` 판정과 경고가 함께 쓴다. */
function countStudioLift3dTopologyErrors(geometry: StudioLift3dGeometry): number {
  let errors = 0;
  for (const diagnostic of diagnoseStudioEditableMesh(geometry.mesh)) {
    if (diagnostic.severity === "error") errors += 1;
  }
  return errors;
}

/** 면 루프 길이 합에서 삼각형 수를 센다(부채꼴 분할 기준: n각형 → n−2개). */
function countStudioLift3dTriangles(geometry: StudioLift3dGeometry): number {
  let loopHalfEdges = 0;
  for (const halfEdge of geometry.mesh.halfEdges) {
    if (halfEdge.face >= 0) loopHalfEdges += 1;
  }
  return Math.max(0, loopHalfEdges - 2 * geometry.mesh.faces.length);
}

/**
 * 원화 한 장을 3D 지오메트리로 들어올린다.
 *
 * 실패는 예외가 아니라 사유 코드로 돌려준다 — 업로드한 그림이 파이프라인과 안 맞는 것은
 * 버그가 아니라 흔한 입력이고, UI 는 그 사유를 그대로 보여줘야 한다.
 */
export function liftStudioImageTo3d(
  source: StudioLift3dSourceImage,
  request: StudioLift3dRequest,
): StudioLift3dResult<StudioLift3dLift> {
  const validated = validateStudioLift3dSource(source);
  if (!validated.ok) return validated;
  if (!(request.subject in STUDIO_LIFT3D_PRESETS)) {
    return studioLift3dFailure("invalid-option", "알 수 없는 피사체 종류입니다");
  }

  const { preset, resolution, warnings } = resolveRequest(request);
  const grid = resampleStudioLift3dImage(validated.value, resolution);
  const mask = extractStudioLift3dMask(grid, {
    mode: request.maskMode ?? preset.maskMode,
    alphaThreshold: request.alphaThreshold,
    keyTolerance: request.keyTolerance,
    keepLargestPart: request.keepLargestPart ?? preset.keepLargestPart,
  });
  warnings.push(...mask.warnings);

  if (mask.bounds === null || mask.coverage <= 0) {
    return studioLift3dFailure(
      "empty-subject",
      "피사체를 찾지 못했습니다. 배경을 지운 PNG 를 쓰거나 마스크 방식을 바꿔 보세요",
    );
  }
  if (mask.coverage < STUDIO_LIFT3D_LIMITS.minSubjectCoverage) {
    return studioLift3dFailure(
      "empty-subject",
      "피사체가 화면에서 너무 작습니다. 원화를 잘라 확대한 뒤 다시 시도해 주세요",
    );
  }

  const profile = request.depthProfile ?? preset.depthProfile;
  const depth = buildStudioLift3dDepthField(mask, grid, {
    profile,
    smoothing: request.smoothing ?? preset.smoothing,
    invertRelief: request.invertRelief,
    edgeTaper: profile === "relief" && mask.mode !== "full" ? 0.35 : 0,
  });
  if (profile !== "relief" && depth.maxDistance < 2) {
    warnings.push(studioLift3dWarning(
      "shallow-subject",
      "실루엣이 가늘어 두께가 거의 나오지 않습니다. 해상도를 올려 보세요",
    ));
  }

  const built = buildStudioLift3dGeometry(mask, depth, {
    mode: preset.geometryMode,
    depthScale: request.depthScale ?? preset.depthScale,
    baseScale: preset.baseScale,
    targetHeight: request.targetHeight ?? preset.targetHeight,
  });
  if (!built.ok) return built;
  warnings.push(...built.warnings);

  const geometry = built.value;
  const topologyErrors = countStudioLift3dTopologyErrors(geometry);
  if (topologyErrors > 0) {
    warnings.push(studioLift3dWarning(
      "non-manifold-residual",
      `위상 경고 ${topologyErrors}건이 남았습니다. 3D 프린팅용으로 쓰려면 해상도를 낮춰 다시 만들어 보세요`,
    ));
  }
  const stats = studioEditableMeshStats(geometry.mesh);

  return studioLift3dSuccess(
    {
      revision: STUDIO_LIFT3D_REVISION,
      subject: request.subject,
      mask,
      depth,
      geometry,
      metrics: {
        gridWidth: grid.width,
        gridHeight: grid.height,
        coverage: mask.coverage,
        vertexCount: stats.vertexCount,
        faceCount: stats.faceCount,
        triangleCount: countStudioLift3dTriangles(geometry),
        boundaryEdgeCount: stats.boundaryEdgeCount,
        topologyErrorCount: topologyErrors,
        // 열린 변이 없다고 곧바로 solid 인 것은 아니다. 비다양체 변이 남아 있으면 경계는
        // 닫혀 있어도 유효한 solid 가 아니므로, 두 조건을 모두 만족할 때만 닫혔다고 말한다.
        closed: stats.boundaryEdgeCount === 0 && topologyErrors === 0,
      },
      meshHash: hashStudioEditableMesh(geometry.mesh),
    },
    warnings,
  );
}

export interface StudioLift3dExport {
  readonly lift: StudioLift3dLift;
  readonly glb: StudioLift3dGlbFile;
  /**
   * GLB 에 실린 것과 **같은** 버퍼. 화면 미리보기가 이걸 그대로 쓰면 삼각형화와 법선 계산을
   * 두 번 하지 않고, 파일과 화면이 어긋날 여지도 없다.
   */
  readonly buffers: StudioLift3dRenderBuffers;
}

export interface StudioLift3dExportOptions {
  readonly name: string;
  readonly texture?: StudioLift3dTexture | null;
  /** 원화를 조명 없이 그대로 보여줄지. 웹툰 원화는 대개 켜 두는 편이 원본에 가깝다. */
  readonly unlit?: boolean;
}

/** 리프트 + GLB 인코딩을 한 번에. UI 의 "3D 로 변환" 버튼이 부르는 진입점이다. */
export function liftStudioImageTo3dGlb(
  source: StudioLift3dSourceImage,
  request: StudioLift3dRequest,
  options: StudioLift3dExportOptions,
): StudioLift3dResult<StudioLift3dExport> {
  const lifted = liftStudioImageTo3d(source, request);
  if (!lifted.ok) return lifted;
  const preset = STUDIO_LIFT3D_PRESETS[request.subject];
  const encoded = encodeStudioLift3dGlb(lifted.value.geometry, {
    name: options.name,
    texture: options.texture ?? null,
    alphaMode: preset.alphaMode,
    unlit: options.unlit,
  });
  if (!encoded.ok) return encoded;
  return studioLift3dSuccess(
    { lift: lifted.value, glb: encoded.value, buffers: encoded.value.buffers },
    [...lifted.warnings, ...encoded.warnings],
  );
}
