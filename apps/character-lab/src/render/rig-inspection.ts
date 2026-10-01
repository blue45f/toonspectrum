/**
 * 리그 점검 보고(순수 타입). Babylon 객체를 밖으로 내보내지 않고(React state 금지 규칙) 파츠·본·morph 수를 평문으로 노출한다.
 * NullEngine 테스트는 이 보고로 "메시 이름·morph 수·본 수"를 실제 GLB와 대조하고, UI는 진단 표에 쓸 수 있다.
 */
import type { MaterialPresetId, PartRole } from "../contracts";

export interface RigPartInspection {
  readonly id: string;
  readonly partId: number;
  readonly materialId: number;
  readonly role: PartRole;
  readonly materialPreset: MaterialPresetId;
  readonly colorHex: string;
  readonly visible: boolean;
  /** 헤어 LOD 정책 등으로 항상 숨김 */
  readonly forceHidden: boolean;
  readonly forceHiddenReasonKo: string | null;
  /** 이 파츠를 이루는 메시 이름(멀티 프리미티브면 여러 개) */
  readonly meshNames: readonly string[];
  readonly outlineMeshNames: readonly string[];
  readonly vertexCount: number;
  readonly triangleCount: number;
  /** 메시별 MorphTargetManager의 타깃 수 합 */
  readonly morphTargetCount: number;
  /** 메시별 타깃 수(멀티 프리미티브가 각자 매니저를 갖는지 확인) */
  readonly morphTargetCountsByMesh: readonly number[];
  /** 메시별로 influence > 0인 타깃 수(멀티 프리미티브에 morph가 모두 적용됐는지 확인) */
  readonly activeMorphTargetsByMesh: readonly number[];
  /** 패키지 알베도 텍스처가 있는지(있으면 레시피 색 틴트를 적용하지 않는다) */
  readonly hasAlbedoTexture: boolean;
  /** 메시별 `metadata.partId`(규약 밖 metadata면 -1) */
  readonly meshMetadataPartIds: readonly number[];
  /** `_Outline` 셸 메시별 `metadata.partId`·outline 플래그 */
  readonly outlineMetadataPartIds: readonly number[];
  readonly skinned: boolean;
  /** 현재 재질 클래스 이름(PBRMaterial·ShaderMaterial …) */
  readonly materialClass: string;
  readonly hasToonMaterial: boolean;
  /** 메시 `renderOutline`(툰 hull 모드) */
  readonly renderOutline: boolean;
  /** 엣지 렌더러가 붙어 있는지(툰 edge 모드) */
  readonly edgesRendering: boolean;
  /** `_Outline` 셸 가시 여부(툰 hull 모드에서만 true) */
  readonly outlineShellVisible: boolean;
}

export interface RigInspection {
  readonly kind: "procedural" | "package";
  readonly poseConvention: "bone-local" | "model-space";
  readonly parts: readonly RigPartInspection[];
  readonly boneCount: number;
  readonly humanoidBoneCount: number;
  readonly auxiliaryBoneCount: number;
  readonly skeletonBoneCount: number;
  readonly morphNames: readonly string[];
  /** 매핑된 morph 이름(타깃 객체 수가 아니라 이름 수) */
  readonly morphNameCount: number;
  /** morph 이름 → 현재 influence(같은 이름의 타깃이 여럿이면 최댓값) */
  readonly morphInfluences: Readonly<Record<string, number>>;
  readonly chainCount: number;
  readonly colliderCount: number;
  readonly notes: readonly string[];
}

/** 장면 설정 평문 보고(scene-builder `inspectCharacterScene`). 우수 좌표·투명 clear·톤맵·광원·그림자 생성기를 확인한다. */
export interface SceneInspection {
  readonly rightHanded: boolean;
  readonly clearColor: readonly [number, number, number, number];
  readonly toneMappingEnabled: boolean;
  /** `ImageProcessingConfiguration.TONEMAPPING_*` 상수 값 */
  readonly toneMappingType: number;
  readonly exposure: number;
  readonly environmentIntensity: number;
  readonly cameraNames: readonly string[];
  readonly activeCamera: string | null;
  readonly lightNames: readonly string[];
  /** 그림자 생성기 클래스(CascadedShadowGenerator | ShadowGenerator | none) */
  readonly shadowGenerator: string;
  readonly shadowCascades: number | null;
  /** key 광원의 그림자 사용 여부 */
  readonly shadowEnabled: boolean;
  readonly shadowMapSize: number | null;
  readonly sssPrePass: boolean;
  /** 장면 객체 수(소스 재로드 때 누수가 없는지 확인) */
  readonly meshCount: number;
  /** 메인(뷰포트) 카메라가 그릴 메시 수(가시·활성·레이어 마스크 통과). 썸네일 임시 리그는 여기 포함되지 않는다. */
  readonly viewportMeshCount: number;
  readonly skeletonCount: number;
  readonly materialCount: number;
  readonly textureCount: number;
  readonly transformNodeCount: number;
}

/** 부위별 페인트 텍스처 점검 보고 */
export interface PaintInspection {
  readonly part: PartRole;
  readonly width: number;
  readonly height: number;
  readonly revision: number;
  /** 텍스처 `invertY` — 페인트 규약은 false(레이어 첫 행 = UV v 0) */
  readonly invertY: boolean;
  /** 텍스처가 decalMap으로 연결된 메시 수 */
  readonly decalMeshes: number;
  /** 해당 부위 PBR 재질의 decalMap이 켜졌는지 */
  readonly decalEnabled: boolean;
}
