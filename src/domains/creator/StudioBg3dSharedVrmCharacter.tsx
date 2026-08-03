import { useThree } from "@react-three/fiber";
import { useEffect, useEffectEvent, useLayoutEffect, useState } from "react";
import * as THREE from "three";

import { registerStudioBg3dCaptureExcludedObject } from "./studio-bg3d-capture-exclusion";
import {
  resolveStudioBg3dSharedCharacterGrounding,
  type StudioBg3dSharedCharacterGroundAnchor,
  type StudioBg3dSharedCharacterGroundingResult,
  type StudioBg3dSharedCharacterSurfaceHit,
} from "./studio-bg3d-shared-character-grounding";
import {
  applyStudioBg3dLinkedCharacterState,
  loadStudioBg3dLinkedVrm,
} from "./studio-bg3d-shared-vrm-runtime";
import { studioShared3dCharacterWorldTransform } from "./studio-shared-3d-scene-bridge";
import { disposeStudioVrmAsset } from "./studio-vrm-asset-runtime";

import type {
  StudioShared3dCharacterRuntimeStatus,
  StudioShared3dCharacterSource,
} from "./studio-shared-3d-scene-bridge";
import type { VRM } from "@pixiv/three-vrm";

export interface StudioBg3dSharedVrmCharacterProps {
  readonly source: StudioShared3dCharacterSource;
  /** Changes whenever a background transform, visibility, loaded model, or physics pose changes. */
  readonly surfaceRevision: string;
  readonly onStatus: (
    runtimeKey: string,
    status: StudioShared3dCharacterRuntimeStatus,
  ) => void;
  readonly selected?: boolean;
  readonly onSelect?: (elementId: string) => void;
  readonly onGrounding?: (
    runtimeKey: string,
    result: StudioBg3dSharedCharacterGroundingResult | null,
  ) => void;
}

const DOWN = new THREE.Vector3(0, -1, 0);
const SURFACE_NORMAL = new THREE.Vector3();
const SURFACE_NORMAL_MATRIX = new THREE.Matrix3();
const SURFACE_INSTANCE_MATRIX = new THREE.Matrix4();
const SURFACE_WORLD_MATRIX = new THREE.Matrix4();
const WORLD_POINT = new THREE.Vector3();
const MAX_SURFACE_ABOVE_SUPPORT_METERS = 0.15;
const GROUND_RAY_DISTANCE_METERS = 1.4;

function finiteVector(point: THREE.Vector3): boolean {
  return Number.isFinite(point.x) && Number.isFinite(point.y) && Number.isFinite(point.z);
}

function measuredGroundAnchors(vrm: VRM): StudioBg3dSharedCharacterGroundAnchor[] {
  vrm.scene.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(vrm.scene, true);
  const boundsValid = !bounds.isEmpty() && finiteVector(bounds.min) && finiteVector(bounds.max);
  const characterHeight = boundsValid ? Math.max(0.1, bounds.max.y - bounds.min.y) : 1.7;
  const anchors: StudioBg3dSharedCharacterGroundAnchor[] = [];

  const addFoot = (side: "left" | "right") => {
    const foot = vrm.humanoid?.getRawBoneNode(`${side}Foot`);
    if (!foot) return;
    const footPoint = foot.getWorldPosition(new THREE.Vector3());
    const toes = vrm.humanoid?.getRawBoneNode(`${side}Toes`);
    const toesPoint = toes?.getWorldPosition(new THREE.Vector3()) ?? null;
    const supportPoint = toesPoint && finiteVector(toesPoint) && toesPoint.y < footPoint.y
      ? toesPoint
      : footPoint;
    if (!finiteVector(supportPoint)) return;
    // VRM foot nodes normally sit slightly above the visible sole. Toes need only a small offset;
    // ankle-only rigs need a larger, height-relative estimate. Both stay bounded and deterministic.
    const soleOffset = toesPoint
      ? THREE.MathUtils.clamp(characterHeight * 0.008, 0.006, 0.025)
      : THREE.MathUtils.clamp(characterHeight * 0.028, 0.02, 0.065);
    anchors.push({
      kind: `${side}-foot`,
      point: [supportPoint.x, supportPoint.y - soleOffset, supportPoint.z],
    });
  };

  addFoot("left");
  addFoot("right");
  if (boundsValid && anchors.length < 3) {
    anchors.push({
      kind: "lower-bound",
      point: [
        (bounds.min.x + bounds.max.x) / 2,
        bounds.min.y,
        (bounds.min.z + bounds.max.z) / 2,
      ],
    });
  }
  if (anchors.length === 0) {
    const rootPoint = vrm.scene.getWorldPosition(new THREE.Vector3());
    anchors.push({ kind: "lower-bound", point: [rootPoint.x, rootPoint.y, rootPoint.z] });
  }
  return anchors;
}

function selectedSupportPoint(
  anchors: readonly StudioBg3dSharedCharacterGroundAnchor[],
): StudioBg3dSharedCharacterGroundAnchor["point"] {
  const feet = anchors.filter(({ kind }) => kind !== "lower-bound");
  const candidates = feet.length > 0 ? feet : anchors;
  return [...candidates].sort((left, right) => (
    left.point[1] - right.point[1]
      || (left.kind === "left-foot" ? -1 : right.kind === "left-foot" ? 1 : 0)
  ))[0]!.point;
}

function surfaceIdentity(object: THREE.Object3D, instanceId?: number):
  | { source: "background-surface"; targetEntityId: string }
  | { source: "stage-plane" }
  | null {
  let current: THREE.Object3D | null = object;
  let identity:
    | { source: "background-surface"; targetEntityId: string }
    | { source: "stage-plane" }
    | null = null;
  while (current) {
    // THREE.Raycaster also reports objects hidden by an ancestor. Hidden background layers must
    // never become an invisible floor for a shared character.
    if (!current.visible) return null;
    if (current.userData.studioBg3dSharedCharacterSelection === true) return null;
    if (!identity) {
      const resolveInstanceId = current.userData.studioBg3dResolveInstanceId;
      if (typeof resolveInstanceId === "function" && Number.isSafeInteger(instanceId)) {
        try {
          const resolvedId: unknown = resolveInstanceId(instanceId);
          if (typeof resolvedId === "string" && resolvedId.length > 0) {
            identity = { source: "background-surface", targetEntityId: resolvedId };
          }
        } catch {
          return null;
        }
      }
      const entityId = current.userData.studioBg3dEntityId;
      if (!identity && typeof entityId === "string" && entityId.length > 0) {
        identity = { source: "background-surface", targetEntityId: entityId };
      }
      if (!identity && current.userData.studioBg3dGroundSurfaceId === "stage-plane") {
        identity = { source: "stage-plane" };
      }
    }
    current = current.parent;
  }
  return identity;
}

function intersectionUsesVisibleSurfaceMaterial(intersection: THREE.Intersection): boolean {
  const mesh = intersection.object as THREE.Mesh;
  if (!mesh.isMesh) return false;
  const materials = mesh.material;
  const material = Array.isArray(materials)
    ? materials[intersection.face?.materialIndex ?? -1]
    : materials;
  if (!material || material.visible === false) return false;
  return !(material.transparent === true && material.opacity <= 0);
}

// eslint-disable-next-line react-refresh/only-export-components -- 순수 surface 판정은 R3F 컴포넌트와 동일한 raycast 경계의 회귀 테스트 계약이다.
export function raycastStudioBg3dSharedCharacterGroundSurface(
  scene: THREE.Scene,
  supportPoint: StudioBg3dSharedCharacterGroundAnchor["point"],
): StudioBg3dSharedCharacterSurfaceHit {
  // R3F commits transforms before layout effects, but raw Raycaster does not refresh matrices.
  // Force the exact committed background transforms into matrixWorld before measuring a surface.
  scene.updateMatrixWorld(true);
  const origin = new THREE.Vector3(
    supportPoint[0],
    supportPoint[1] + MAX_SURFACE_ABOVE_SUPPORT_METERS,
    supportPoint[2],
  );
  const raycaster = new THREE.Raycaster(origin, DOWN, 0, GROUND_RAY_DISTANCE_METERS);
  const intersections = raycaster.intersectObjects(scene.children, true);
  for (const intersection of intersections) {
    const identity = surfaceIdentity(intersection.object, intersection.instanceId);
    if (!identity || !intersection.face || !intersectionUsesVisibleSurfaceMaterial(intersection)) {
      continue;
    }
    const instanced = intersection.object as THREE.InstancedMesh;
    let normalWorldMatrix = intersection.object.matrixWorld;
    if (intersection.instanceId !== undefined && instanced.isInstancedMesh) {
      instanced.getMatrixAt(intersection.instanceId, SURFACE_INSTANCE_MATRIX);
      normalWorldMatrix = SURFACE_WORLD_MATRIX.multiplyMatrices(
        instanced.matrixWorld,
        SURFACE_INSTANCE_MATRIX,
      );
    }
    SURFACE_NORMAL
      .copy(intersection.face.normal)
      .applyNormalMatrix(SURFACE_NORMAL_MATRIX.getNormalMatrix(normalWorldMatrix));
    if (!finiteVector(SURFACE_NORMAL) || SURFACE_NORMAL.y < 0.25) continue;
    WORLD_POINT.copy(intersection.point);
    if (!finiteVector(WORLD_POINT)) continue;
    if (WORLD_POINT.y > supportPoint[1] + MAX_SURFACE_ABOVE_SUPPORT_METERS) continue;
    const point = [WORLD_POINT.x, WORLD_POINT.y, WORLD_POINT.z] as const;
    const normal = [SURFACE_NORMAL.x, SURFACE_NORMAL.y, SURFACE_NORMAL.z] as const;
    return identity.source === "background-surface"
      ? { source: identity.source, targetEntityId: identity.targetEntityId, point, normal }
      : { source: identity.source, point, normal };
  }
  return {
    source: "stage-plane",
    point: [supportPoint[0], 0, supportPoint[2]],
    normal: [0, 1, 0],
  };
}

/**
 * Runtime projection of one canonical VRM source into the BG3D R3F scene. The component owns only
 * its loaded runtime clone. Stage placement is an override owned by the page Stage while model,
 * pose and appearance remain source-owned; Three object state never becomes authority.
 */
export default function StudioBg3dSharedVrmCharacter({
  source,
  surfaceRevision,
  onStatus,
  selected = false,
  onSelect,
  onGrounding,
}: StudioBg3dSharedVrmCharacterProps) {
  const threeScene = useThree((state) => state.scene);
  const [vrm, setVrm] = useState<VRM | null>(null);
  const reportCurrentStatus = useEffectEvent(
    (status: StudioShared3dCharacterRuntimeStatus) =>
      onStatus(source.runtimeKey, status),
  );
  const loadCurrentModel = useEffectEvent(() => loadStudioBg3dLinkedVrm(source.scene));
  const reportCurrentGrounding = useEffectEvent(
    (result: StudioBg3dSharedCharacterGroundingResult | null) =>
      onGrounding?.(source.runtimeKey, result),
  );

  useEffect(() => {
    let cancelled = false;
    let ownedVrm: VRM | null = null;
    setVrm(null);
    reportCurrentStatus("loading");
    reportCurrentGrounding(null);

    void loadCurrentModel().then((loaded) => {
      ownedVrm = loaded;
      if (cancelled) {
        disposeStudioVrmAsset(loaded);
        ownedVrm = null;
        return;
      }
      setVrm(loaded);
    }).catch(() => {
      if (!cancelled) reportCurrentStatus("unavailable");
    });

    return () => {
      cancelled = true;
      setVrm(null);
      if (ownedVrm) {
        disposeStudioVrmAsset(ownedVrm);
        ownedVrm = null;
      }
      reportCurrentGrounding(null);
    };
  }, [source.elementId, source.modelRuntimeKey]);

  // Pose, expression and stage placement changes reapply to the owned clone without downloading
  // or reparsing the same VRM model. Readiness is announced only after the updated primitive has
  // committed, preventing capture in the small document→scene gap.
  useLayoutEffect(() => {
    if (!vrm) return;
    if (!applyStudioBg3dLinkedCharacterState(vrm, source)) {
      reportCurrentGrounding(null);
      reportCurrentStatus("unavailable");
      return;
    }
    const anchors = measuredGroundAnchors(vrm);
    const grounding = resolveStudioBg3dSharedCharacterGrounding({
      identity: {
        ...(source.stageId ? { stageId: source.stageId } : {}),
        elementId: source.elementId,
        modelRuntimeKey: source.modelRuntimeKey,
        placementHash: source.placementHash,
      },
      placementY: source.stageTransform.position[1],
      anchors,
      surfaceHit: raycastStudioBg3dSharedCharacterGroundSurface(
        threeScene,
        selectedSupportPoint(anchors),
      ),
      options: { soleClearanceMeters: 0.006 },
    });
    reportCurrentGrounding(grounding);
    reportCurrentStatus("ready");
  }, [source, surfaceRevision, threeScene, vrm]);

  if (!vrm) return null;
  const transform = studioShared3dCharacterWorldTransform(
    source.scene,
    source.stageTransform,
  );
  const helperPosition = [
    transform.position[0],
    transform.position[1] + 1.135 * transform.scale[1],
    transform.position[2],
  ] as const;
  const helperScale = [
    1.44 * transform.scale[0],
    2.43 * transform.scale[1],
    0.96 * transform.scale[2],
  ] as const;

  return (
    <group>
      <primitive object={vrm.scene} dispose={null} />
      {onSelect ? (
        <mesh
          ref={registerStudioBg3dCaptureExcludedObject}
          userData={{ studioBg3dSharedCharacterSelection: true }}
          position={helperPosition}
          rotation={[0, transform.rotation[1], 0]}
          scale={helperScale}
          renderOrder={selected ? 10 : 0}
          onClick={(event) => {
            event.stopPropagation();
            onSelect(source.elementId);
          }}
        >
          <boxGeometry args={[1, 1, 1]} />
          <meshBasicMaterial
            color="#8b5cf6"
            depthTest={!selected}
            depthWrite={false}
            opacity={selected ? 0.72 : 0.002}
            transparent
            wireframe
          />
        </mesh>
      ) : null}
    </group>
  );
}
