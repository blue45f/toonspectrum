import { createPortal, useFrame } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

import { PHYSICS_PREVIEW_MAX_DELTA } from "./studio-vrm-physics";
import {
  acquireStudioVrmPropAsset,
  type StudioVrmPropAssetLease,
} from "./studio-vrm-prop-asset-runtime";
import {
  applyVrmTwoBoneGrip,
  createVrmTwoBoneGripState,
  releaseVrmTwoBoneGripState,
} from "./studio-vrm-prop-ik";
import { applyStudioVrmPropTint } from "./studio-vrm-prop-material";
import {
  resolvePropAttachment,
  resolveSecondaryHandConstraint,
  resolveSecondaryPropTarget,
  type VrmPropRigMetrics,
} from "./studio-vrm-prop-rig";
import {
  buildPropObject,
  propDefById,
  type PropInstance,
} from "./studio-vrm-props";
import {
  buildStudioVrmGarmentGeometry,
  buildStudioVrmSkinnedGarment,
  type StudioVrmGarmentSkinBone,
  type StudioVrmSkinnedGarmentReceipt,
} from "./studio-vrm-skinned-garment";
import {
  WARDROBE_FABRICS,
  buildGarmentParts,
  sanitizeWardrobeMetrics,
  wardrobeFabricById,
  wardrobeItemById,
  type GarmentPart,
  type LimbMetric,
  type WardrobeBone,
  type WardrobeEquip,
  type WardrobeMetrics,
  type WardrobeSlot,
} from "./studio-vrm-wardrobe";
import {
  StudioVrmXpbdSkirtAttachment,
  type StudioVrmXpbdSkirtCaptureSync,
  type StudioVrmXpbdSkirtSurfaceReceipt,
} from "./StudioVrmXpbdSkirtAttachment";

import type { VRM, VRMHumanBoneName } from "@pixiv/three-vrm";

const pendingPropDisposals = new WeakMap<THREE.Object3D, object>();

function disposePropObject(object: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  object.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (mesh.geometry) geometries.add(mesh.geometry);
    const meshMaterials = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
    meshMaterials.forEach((material) => materials.add(material));
  });
  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => material.dispose());
}

/** StrictMode의 setup→cleanup→setup 재생에서는 두 번째 setup이 같은 object의 폐기를 취소한다. */
function cancelScheduledPropDisposal(object: THREE.Object3D) {
  pendingPropDisposals.delete(object);
}

function schedulePropDisposal(object: THREE.Object3D) {
  const token = {};
  pendingPropDisposals.set(object, token);
  queueMicrotask(() => {
    if (pendingPropDisposals.get(object) !== token) return;
    pendingPropDisposals.delete(object);
    disposePropObject(object);
  });
}

const VRM_FRAME_PROP_PRIORITY = -2;
const VRM_FRAME_COMMIT_PRIORITY = -1;
const STUDIO_VRM_SECONDARY_HAND_TARGET_DAMPING = 0.35;
const STUDIO_VRM_PROP_GEOMETRY_QUALITY = Object.freeze({
  roundedBox: (width: number, height: number, depth: number, radius: number) => (
    new RoundedBoxGeometry(width, height, depth, 3, radius)
  ),
});

export type StudioVrmProjectionAttachmentStatus = "ready" | "unavailable" | "detached";
export type StudioVrmWardrobeSurfaceReceipt =
  | StudioVrmSkinnedGarmentReceipt
  | StudioVrmXpbdSkirtSurfaceReceipt;
export type StudioVrmWardrobeCaptureSync = StudioVrmXpbdSkirtCaptureSync;

/**
 * V1은 기존 본 포털 좌표를 그대로 보존한다. V2는 본의 world 위치·회전만 추종하는 rigid follower로
 * 렌더해 body/head 비균일 스케일의 shear를 피하고, 실제 geometry anchor를 측정된 소켓에 맞춘다.
 */
export function StudioVrmPropAttachment({
  vrm,
  instance,
  metrics,
  rigRevision,
  onAttachmentStatus,
}: {
  vrm: VRM;
  instance: PropInstance;
  metrics: VrmPropRigMetrics;
  /** Re-resolves normalized bone identities after a humanoid rebuild. */
  rigRevision?: number;
  onAttachmentStatus?: (
    uid: string,
    propId: string,
    status: StudioVrmProjectionAttachmentStatus,
  ) => void;
}) {
  const boneNode = useMemo(
    () => {
      void rigRevision;
      return vrm.humanoid?.getNormalizedBoneNode(instance.bone) ?? null;
    },
    [instance.bone, rigRevision, vrm],
  );
  const smartGroupRef = useRef<THREE.Group | null>(null);
  const localPositionRef = useRef(new THREE.Vector3());
  const boneWorldQuaternionRef = useRef(new THREE.Quaternion());
  const localQuaternionRef = useRef(new THREE.Quaternion());
  const anchorWorldOffsetRef = useRef(new THREE.Vector3());
  const secondaryWorldTargetRef = useRef(new THREE.Vector3());
  const secondaryTargetQuaternionRef = useRef(new THREE.Quaternion());
  const secondaryTargetSmoothedRef = useRef(new THREE.Vector3());
  const secondaryTargetQuaternionSmoothedRef = useRef(new THREE.Quaternion());
  const secondaryTargetInitializedRef = useRef(false);
  const groupWorldPositionRef = useRef(new THREE.Vector3());
  const groupWorldQuaternionRef = useRef(new THREE.Quaternion());
  const groupWorldScaleRef = useRef(new THREE.Vector3());
  const handWorldScaleRef = useRef(new THREE.Vector3());
  const attachmentStatusRef = useRef<StudioVrmProjectionAttachmentStatus | null>(null);
  const [secondaryGripState] = useState(createVrmTwoBoneGripState);
  const [loadedGltfProp, setLoadedGltfProp] = useState<{
    readonly propId: string;
    readonly url: string;
    readonly lease: StudioVrmPropAssetLease;
  } | null>(null);
  const definition = propDefById(instance.propId);

  const proceduralObject = useMemo(() => {
    if (!definition || definition.geometrySource.kind !== "procedural") return null;
    return buildPropObject(
      THREE as unknown as Parameters<typeof buildPropObject>[0],
      definition,
      instance.color,
      STUDIO_VRM_PROP_GEOMETRY_QUALITY,
    ) as unknown as THREE.Object3D;
  }, [definition, instance.color]);
  const gltfUrl = definition?.geometrySource.kind === "gltf"
    ? definition.geometrySource.url
    : null;
  const gltfObject = loadedGltfProp?.propId === instance.propId
    && loadedGltfProp.url === gltfUrl
    && !loadedGltfProp.lease.released
    ? loadedGltfProp.lease.object
    : null;
  const object = proceduralObject ?? gltfObject;
  const resolved = definition ? resolvePropAttachment(definition, instance, metrics) : null;
  const secondary = definition ? resolveSecondaryPropTarget(definition, instance) : null;
  const secondaryActive = Boolean(secondary && secondary.influence > 0);
  const secondaryBone = secondary?.bone ?? null;

  useEffect(() => {
    if (!gltfObject || instance.color === null) return;
    return applyStudioVrmPropTint(gltfObject, instance.propId, instance.color);
  }, [gltfObject, instance.color, instance.propId]);

  function reportAttachmentStatus(status: StudioVrmProjectionAttachmentStatus) {
    if (attachmentStatusRef.current === status) return;
    attachmentStatusRef.current = status;
    onAttachmentStatus?.(instance.uid, instance.propId, status);
  }

  useEffect(() => {
    const source = definition?.geometrySource;
    if (!source || source.kind !== "gltf") return;
    let active = true;
    let lease: StudioVrmPropAssetLease | null = null;

    void acquireStudioVrmPropAsset(instance.propId, source)
      .then((loadedLease) => {
        if (!active) {
          loadedLease.release();
          return;
        }
        lease = loadedLease;
        setLoadedGltfProp({ propId: instance.propId, url: source.url, lease: loadedLease });
      })
      .catch(() => {
        // GLB 항목은 절차형 큐브로 위장하지 않는다. object=null이 attachment unavailable을 보고한다.
      });

    return () => {
      active = false;
      lease?.release();
    };
  }, [definition, instance.propId]);

  useLayoutEffect(() => {
    if (!onAttachmentStatus) return;
    const primaryReady = Boolean(
      boneNode
      && object
      && (!instance.rig || resolved?.usesSmartRig === true),
    );
    const initialStatus = !primaryReady
      ? "unavailable" as const
      : !secondaryActive
        ? "ready" as const
        : null;
    if (initialStatus && attachmentStatusRef.current !== initialStatus) {
      attachmentStatusRef.current = initialStatus;
      onAttachmentStatus(instance.uid, instance.propId, initialStatus);
    }
    return () => {
      onAttachmentStatus(instance.uid, instance.propId, "detached");
      attachmentStatusRef.current = null;
    };
  }, [
    boneNode,
    instance.propId,
    instance.rig,
    instance.uid,
    object,
    onAttachmentStatus,
    resolved?.usesSmartRig,
    secondaryActive,
  ]);

  useEffect(() => {
    if (!secondaryActive) {
      releaseVrmTwoBoneGripState(secondaryGripState);
      secondaryTargetInitializedRef.current = false;
      return;
    }
    return () => {
      releaseVrmTwoBoneGripState(secondaryGripState);
      vrm.scene.updateMatrixWorld(true);
    };
  }, [secondaryActive, secondaryBone, secondaryGripState, vrm]);

  useEffect(() => {
    if (!object) return;
    if (instance.rig) {
      object.position.set(0, 0, 0);
      object.rotation.set(0, 0, 0);
      object.scale.setScalar(1);
    } else {
      object.position.set(instance.position[0], instance.position[1], instance.position[2]);
      object.rotation.set(
        THREE.MathUtils.degToRad(instance.rotationDeg[0]),
        THREE.MathUtils.degToRad(instance.rotationDeg[1]),
        THREE.MathUtils.degToRad(instance.rotationDeg[2])
      );
      object.scale.setScalar(instance.scale);
    }
  }, [object, instance.position, instance.rig, instance.rotationDeg, instance.scale]);

  useEffect(() => {
    if (!proceduralObject) return;
    cancelScheduledPropDisposal(proceduralObject);
    return () => schedulePropDisposal(proceduralObject);
  }, [proceduralObject]);

  useFrame(() => {
    const group = smartGroupRef.current;
    if (!group || !boneNode || !resolved?.usesSmartRig) {
      if (instance.rig) reportAttachmentStatus("unavailable");
      return;
    }

    boneNode.updateWorldMatrix(true, false);
    // socket만 bone matrix로 world 변환하고, geometry anchor 보정은 scale이 제거된 rigid world
    // quaternion으로 계산한다. 부모의 비균일 body/head scale이 소품을 찌그러뜨리거나 접점을
    // 밀어내지 않으면서도 손바닥 위치 자체는 체형 변화를 정확히 따라간다.
    const socketWorldPosition = localPositionRef.current.set(...resolved.socketPosition);
    boneNode.localToWorld(socketWorldPosition);
    const boneWorldQuaternion = boneNode.getWorldQuaternion(boneWorldQuaternionRef.current);
    const localQuaternion = localQuaternionRef.current.setFromEuler(new THREE.Euler(
      THREE.MathUtils.degToRad(resolved.rotationDeg[0]),
      THREE.MathUtils.degToRad(resolved.rotationDeg[1]),
      THREE.MathUtils.degToRad(resolved.rotationDeg[2]),
      "XYZ"
    ));
    group.quaternion.copy(boneWorldQuaternion).multiply(localQuaternion).normalize();
    group.scale.setScalar(resolved.scale);
    const anchorWorldOffset = anchorWorldOffsetRef.current
      .set(...resolved.anchor.position)
      .multiplyScalar(resolved.scale)
      .applyQuaternion(group.quaternion);
    group.position.copy(socketWorldPosition).sub(anchorWorldOffset);
    group.updateMatrixWorld(true);

    if (secondary && secondary.influence > 0) {
      const secondaryHandNode = vrm.humanoid?.getNormalizedBoneNode(secondary.bone) ?? null;
      if (!secondaryHandNode) {
        releaseVrmTwoBoneGripState(secondaryGripState);
        reportAttachmentStatus("unavailable");
        return;
      }
      secondaryHandNode.updateWorldMatrix(true, false);
      const groupWorldPosition = group.getWorldPosition(groupWorldPositionRef.current);
      const groupWorldQuaternion = group.getWorldQuaternion(groupWorldQuaternionRef.current);
      const groupWorldScale = group.getWorldScale(groupWorldScaleRef.current);
      const handWorldScale = secondaryHandNode.getWorldScale(handWorldScaleRef.current);
      const constraint = resolveSecondaryHandConstraint(
        secondary.anchor,
        [groupWorldPosition.x, groupWorldPosition.y, groupWorldPosition.z],
        [groupWorldQuaternion.x, groupWorldQuaternion.y, groupWorldQuaternion.z, groupWorldQuaternion.w],
        groupWorldScale.x,
        metrics.handSockets[secondary.bone],
        [handWorldScale.x, handWorldScale.y, handWorldScale.z]
      );
      if (!constraint) {
        releaseVrmTwoBoneGripState(secondaryGripState);
        reportAttachmentStatus("unavailable");
        return;
      }
      const rawTarget = secondaryWorldTargetRef.current.set(...constraint.wristWorldPosition);
      const rawTargetQuaternion = secondaryTargetQuaternionRef.current.set(...constraint.targetHandWorldQuaternion);
      if (
        !Number.isFinite(rawTarget.x)
        || !Number.isFinite(rawTarget.y)
        || !Number.isFinite(rawTarget.z)
        || !Number.isFinite(rawTargetQuaternion.x)
        || !Number.isFinite(rawTargetQuaternion.y)
        || !Number.isFinite(rawTargetQuaternion.z)
        || !Number.isFinite(rawTargetQuaternion.w)
      ) {
        secondaryTargetInitializedRef.current = false;
        reportAttachmentStatus("unavailable");
        releaseVrmTwoBoneGripState(secondaryGripState);
        return;
      }

      if (!secondaryTargetInitializedRef.current) {
        secondaryTargetSmoothedRef.current.copy(rawTarget);
        secondaryTargetQuaternionSmoothedRef.current.copy(rawTargetQuaternion);
        secondaryTargetInitializedRef.current = true;
      } else {
        const maxStep = 0.12;
        const next = secondaryTargetSmoothedRef.current.clone()
          .lerp(rawTarget, STUDIO_VRM_SECONDARY_HAND_TARGET_DAMPING);
        const jump = next.distanceTo(secondaryTargetSmoothedRef.current);
        if (jump > maxStep) {
          next.sub(secondaryTargetSmoothedRef.current).setLength(maxStep).add(secondaryTargetSmoothedRef.current);
        }
        secondaryTargetSmoothedRef.current.copy(next);
        secondaryTargetQuaternionSmoothedRef.current.slerp(
          rawTargetQuaternion,
          STUDIO_VRM_SECONDARY_HAND_TARGET_DAMPING,
        );
      }
      const target = secondaryTargetSmoothedRef.current;
      const targetQuaternion = secondaryTargetQuaternionSmoothedRef.current;
      const applied = applyVrmTwoBoneGrip(
        vrm,
        secondary.bone === "leftHand" ? "left" : "right",
        target,
        Math.max(0, Math.min(1, secondary.influence)),
        secondary.elbowHint,
        { targetQuaternion, state: secondaryGripState }
      );
      reportAttachmentStatus(applied ? "ready" : "unavailable");
    }
  }, VRM_FRAME_PROP_PRIORITY);

  if (!boneNode || !object) return null;
  if (resolved?.usesSmartRig) {
    return (
      <group ref={smartGroupRef}>
        <primitive object={object} />
      </group>
    );
  }
  return createPortal(<primitive object={object} />, boneNode);
}

/* ── 실장착 워드로브(studio-vrm-wardrobe) — 측정·조립·본 부착 ────────── */

/**
 * 실제 스킨을 움직이는 raw 휴머노이드에서 본 로컬 치수를 잰다.
 * Avatar Forge가 raw 체형을 바꾼 뒤에도 같은 좌표계를 사용하므로 의상과 몸이 갈라지지 않는다.
 */
// eslint-disable-next-line react-refresh/only-export-components -- Shared Stage and Poser must measure the same pristine VRM rig.
export function measureStudioVrmWardrobeMetrics(vrm: VRM): WardrobeMetrics {
  const humanoid = vrm.humanoid;
  const fallback = sanitizeWardrobeMetrics(null);
  if (!humanoid) return fallback;
  vrm.scene.updateMatrixWorld(true);

  const node = (name: VRMHumanBoneName) => humanoid.getRawBoneNode(name);
  const world = (name: VRMHumanBoneName): THREE.Vector3 | null => {
    const n = node(name);
    return n ? n.getWorldPosition(new THREE.Vector3()) : null;
  };
  // 부착 본의 로컬 공간에서 목표 관절까지의 벡터. raw 본 스케일을 다시 곱하지 않도록
  // world 길이가 아니라 이 로컬 길이로 geometry를 만든다.
  const localVector = (from: VRMHumanBoneName, toWorld: THREE.Vector3): THREE.Vector3 | null => {
    const n = node(from);
    if (!n) return null;
    const vector = n.worldToLocal(toWorld.clone());
    return Number.isFinite(vector.x) && vector.lengthSq() > 1e-8 ? vector : null;
  };
  const toVec3 = (v: THREE.Vector3 | null): [number, number, number] | null => (v ? [v.x, v.y, v.z] : null);
  const localDistanceBetween = (
    anchor: VRMHumanBoneName,
    a: THREE.Vector3 | null,
    b: THREE.Vector3 | null,
  ): number | undefined => {
    const anchorNode = node(anchor);
    if (!anchorNode || !a || !b) return undefined;
    return anchorNode.worldToLocal(a.clone()).distanceTo(anchorNode.worldToLocal(b.clone()));
  };

  const hips = world("hips");
  const spine = world("spine");
  const neckW = world("neck") ?? world("head");
  const limb = (from: VRMHumanBoneName, to: VRMHumanBoneName, fb: LimbMetric): LimbMetric => {
    const b = world(to);
    const vector = b ? localVector(from, b) : null;
    if (!vector) return fb;
    const len = vector.length();
    const axis = vector.normalize();
    return { len, axis: toVec3(axis) ?? fb.axis };
  };

  const lUpArm = world("leftUpperArm");
  const rUpArm = world("rightUpperArm");
  const lUpLeg = world("leftUpperLeg");
  const rUpLeg = world("rightUpperLeg");
  const lFoot = world("leftFoot");
  const rFoot = world("rightFoot");
  const rigSource: WardrobeMetrics["source"] = ([
    "hips", "spine", "leftUpperArm", "rightUpperArm", "leftLowerArm", "rightLowerArm",
    "leftHand", "rightHand", "leftUpperLeg", "rightUpperLeg", "leftLowerLeg", "rightLowerLeg",
    "leftFoot", "rightFoot",
  ] as const).every((boneName) => node(boneName)) && neckW
    ? "raw-rig"
    : "partial-rig";

  // 몸통 위 방향(spine 로컬) + 발 앞 방향(해부학: 왼쪽×위 = 앞).
  const upVector = spine && neckW ? localVector("spine", neckW) : null;
  const upLocal = upVector?.normalize() ?? null;
  let footForward = fallback.footForward;
  if (lUpLeg && rUpLeg && hips && neckW && lFoot && rFoot) {
    const leftWorld = lUpLeg.clone().sub(rUpLeg).normalize();
    const upWorld = neckW.clone().sub(hips).normalize();
    const fwdWorld = leftWorld.clone().cross(upWorld).normalize();
    const footLocalDir = (name: VRMHumanBoneName, at: THREE.Vector3): [number, number, number] | null => {
      const n = node(name);
      if (!n) return null;
      const origin = n.worldToLocal(at.clone());
      const tip = n.worldToLocal(at.clone().add(fwdWorld));
      const dir = tip.sub(origin).normalize();
      return Number.isFinite(dir.x) && dir.lengthSq() > 1e-8 ? [dir.x, dir.y, dir.z] : null;
    };
    footForward = {
      left: footLocalDir("leftFoot", lFoot) ?? fallback.footForward.left,
      right: footLocalDir("rightFoot", rFoot) ?? fallback.footForward.right,
    };
  }

  return sanitizeWardrobeMetrics({
    source: rigSource,
    shoulderW: localDistanceBetween("spine", lUpArm, rUpArm),
    hipW: localDistanceBetween("hips", lUpLeg, rUpLeg),
    hipsToSpine: spine ? localVector("hips", spine)?.length() : undefined,
    spineToNeck: neckW ? localVector("spine", neckW)?.length() : undefined,
    // Ground height is not represented by a humanoid bone. A lower-leg-relative value remains
    // stable under overall character scale and avoids measuring posed world Y as local geometry.
    ankleH: Math.max(
      0.02,
      (limb("leftLowerLeg", "leftFoot", fallback.lowerLeg.left).len
        + limb("rightLowerLeg", "rightFoot", fallback.lowerLeg.right).len) * 0.1,
    ),
    up: upLocal ? (toVec3(upLocal) ?? undefined) : undefined,
    footForward,
    upperArm: {
      left: limb("leftUpperArm", "leftLowerArm", fallback.upperArm.left),
      right: limb("rightUpperArm", "rightLowerArm", fallback.upperArm.right),
    },
    lowerArm: {
      left: limb("leftLowerArm", "leftHand", fallback.lowerArm.left),
      right: limb("rightLowerArm", "rightHand", fallback.lowerArm.right),
    },
    upperLeg: {
      left: limb("leftUpperLeg", "leftLowerLeg", fallback.upperLeg.left),
      right: limb("rightUpperLeg", "rightLowerLeg", fallback.upperLeg.right),
    },
    lowerLeg: {
      left: limb("leftLowerLeg", "leftFoot", fallback.lowerLeg.left),
      right: limb("rightLowerLeg", "rightFoot", fallback.lowerLeg.right),
    },
  });
}

const GARMENT_Y = new THREE.Vector3(0, 1, 0);
const GARMENT_Z = new THREE.Vector3(0, 0, 1);

function createGarmentWeaveTexture(fabricId: WardrobeEquip["fabricId"]): THREE.DataTexture | null {
  const fabric = wardrobeFabricById(fabricId);
  if (!fabric || fabric.weaveStrength <= 0) return null;
  const size = 48;
  const data = new Uint8Array(size * size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const u = x / size;
      const v = y / size;
      const warp = Math.sin(u * Math.PI * 2 * fabric.weaveFrequency);
      const weft = Math.sin(v * Math.PI * 2 * fabric.weaveFrequency * 0.92);
      const diagonal = fabricId === "denim"
        ? Math.sin((u + v) * Math.PI * fabric.weaveFrequency * 1.35) * 0.55
        : 0;
      const knit = fabricId === "knit"
        ? Math.cos((u - v) * Math.PI * fabric.weaveFrequency) * 0.38
        : 0;
      data[y * size + x] = Math.round(THREE.MathUtils.clamp(
        128 + warp * 34 + weft * 26 + diagonal * 28 + knit * 28,
        0,
        255,
      ));
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RedFormat, THREE.UnsignedByteType);
  texture.name = `wardrobe-weave:${fabricId}`;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

function createGarmentMaterial(
  part: GarmentPart,
  itemColor: string,
  fabricId: WardrobeEquip["fabricId"],
  weaveTexture: THREE.DataTexture | null,
): THREE.MeshPhysicalMaterial {
  const material = new THREE.MeshPhysicalMaterial({ side: THREE.DoubleSide });
  applyGarmentMaterialStyle(material, part, itemColor, fabricId, weaveTexture);
  return material;
}

function applyGarmentMaterialStyle(
  material: THREE.MeshPhysicalMaterial,
  part: GarmentPart,
  itemColor: string,
  fabricId: WardrobeEquip["fabricId"],
  weaveTexture: THREE.DataTexture | null,
) {
  const fabric = wardrobeFabricById(fabricId) ?? WARDROBE_FABRICS[0];
  const color = new THREE.Color(part.color ?? itemColor);
  const roughness = part.metalness !== undefined && part.metalness > 0.35
    ? part.roughness ?? fabric.roughness
    : fabric.roughness;
  const metalness = part.metalness ?? fabric.metalness;
  const fabricSurface = metalness < 0.35;
  material.color.copy(color);
  material.roughness = roughness;
  material.metalness = metalness;
  material.sheen = fabricSurface ? fabric.sheen : 0;
  material.sheenRoughness = fabricSurface ? fabric.sheenRoughness : 1;
  material.sheenColor.copy(color).lerp(new THREE.Color("#ffffff"), 0.12);
  material.clearcoat = fabric.clearcoat;
  material.clearcoatRoughness = fabric.clearcoatRoughness;
  material.bumpMap = fabricSurface ? weaveTexture : null;
  material.bumpScale = fabricSurface ? fabric.weaveStrength : 0;
  material.userData.studioVrmGarmentPart = part;
  material.userData.studioVrmGarmentFabricId = fabricId;
  material.needsUpdate = true;
}

function disposeGarmentMaterials(materials: readonly THREE.Material[]) {
  const textures = new Set<THREE.Texture>();
  for (const material of materials) {
    const physical = material as THREE.MeshPhysicalMaterial;
    if (physical.bumpMap) textures.add(physical.bumpMap);
    material.dispose();
  }
  textures.forEach((texture) => texture.dispose());
}

/** 파츠 스펙 목록을 본별 three 그룹으로 조립한다. */
function assembleGarmentGroups(
  parts: GarmentPart[],
  itemColor: string,
  fabricId: WardrobeEquip["fabricId"],
  name: string,
): Map<WardrobeBone, THREE.Group> {
  const groups = new Map<WardrobeBone, THREE.Group>();
  const weaveTexture = createGarmentWeaveTexture(fabricId);
  for (const part of parts) {
    let group = groups.get(part.bone);
    if (!group) {
      group = new THREE.Group();
      group.name = `${name}:${part.bone}`;
      groups.set(part.bone, group);
    }
    const material = createGarmentMaterial(part, itemColor, fabricId, weaveTexture);
    const geometry = buildStudioVrmGarmentGeometry(part.shape);
    geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.position.set(part.offset[0], part.offset[1], part.offset[2]);
    if (part.align) {
      // 실린더/박스/구는 +Y, 토러스는 링 축(+Z)을 목표 방향으로 정렬.
      const source = part.shape.kind === "torus" ? GARMENT_Z : GARMENT_Y;
      const target = new THREE.Vector3(part.align[0], part.align[1], part.align[2]).normalize();
      if (target.lengthSq() > 1e-8) mesh.quaternion.setFromUnitVectors(source, target);
    }
    if (part.squash) mesh.scale.set(part.squash[0], part.squash[1], part.squash[2]);
    group.add(mesh);
  }
  return groups;
}

function collectVrmSourceSkeletonBones(vrm: VRM): Set<THREE.Bone> {
  const bones = new Set<THREE.Bone>();
  vrm.scene.traverse((object) => {
    const skinned = object as THREE.SkinnedMesh;
    if (!skinned.isSkinnedMesh) return;
    skinned.skeleton.bones.forEach((bone) => bones.add(bone));
  });
  return bones;
}

function assembleSkinnedGarment(
  vrm: VRM,
  parts: readonly GarmentPart[],
  itemColor: string,
  fabricId: WardrobeEquip["fabricId"],
  name: string,
) {
  const weaveTexture = createGarmentWeaveTexture(fabricId);
  const materials = parts.map((part) => createGarmentMaterial(part, itemColor, fabricId, weaveTexture));
  const sourceBones = collectVrmSourceSkeletonBones(vrm);
  const built = buildStudioVrmSkinnedGarment({
    name,
    root: vrm.scene,
    parts,
    materials,
    resolveBone: (boneName: StudioVrmGarmentSkinBone) => {
      const node = vrm.humanoid?.getRawBoneNode(boneName as VRMHumanBoneName) ?? null;
      return node && sourceBones.has(node as THREE.Bone) ? node : null;
    },
  });
  if (!built.surface) disposeGarmentMaterials(materials);
  return built;
}

function disposeGarmentObject(group: THREE.Object3D) {
  const textures = new Set<THREE.Texture>();
  group.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    if ((mesh as THREE.SkinnedMesh).isSkinnedMesh) {
      (mesh as THREE.SkinnedMesh).skeleton.dispose();
    }
    mesh.geometry?.dispose();
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    materials.forEach((m) => {
      const physical = m as THREE.MeshPhysicalMaterial | undefined;
      if (physical?.bumpMap) textures.add(physical.bumpMap);
      m?.dispose();
    });
  });
  textures.forEach((texture) => texture.dispose());
}

const pendingGarmentDisposals = new WeakMap<THREE.Object3D, object>();

function cancelScheduledGarmentDisposal(group: THREE.Object3D) {
  pendingGarmentDisposals.delete(group);
}

function scheduleGarmentDisposal(group: THREE.Object3D) {
  const token = {};
  pendingGarmentDisposals.set(group, token);
  queueMicrotask(() => {
    if (pendingGarmentDisposals.get(group) !== token) return;
    pendingGarmentDisposals.delete(group);
    disposeGarmentObject(group);
  });
}

export interface StudioVrmWardrobeAttachmentProps {
  readonly vrm: VRM;
  readonly slot: WardrobeSlot;
  readonly equip: WardrobeEquip;
  readonly metrics: WardrobeMetrics;
  readonly effectiveFit: number;
  readonly rigRevision?: number;
  readonly onSurfaceReceipt: (
    slot: WardrobeSlot,
    receipt: StudioVrmWardrobeSurfaceReceipt | null,
  ) => void;
  readonly onAttachmentStatus?: (
    slot: WardrobeSlot,
    itemId: string,
    status: StudioVrmProjectionAttachmentStatus,
  ) => void;
  readonly onXpbdCaptureSyncChange?: (
    slot: WardrobeSlot,
    sync: StudioVrmWardrobeCaptureSync,
    active: boolean,
  ) => void;
}

/** Selects bounded XPBD for audited skirts and keeps the existing garment as a fail-safe. */
export function StudioVrmWardrobeAttachment(props: StudioVrmWardrobeAttachmentProps) {
  const def = wardrobeItemById(props.equip.itemId);
  if (def?.geometrySource === "xpbd-skirt-v1") {
    return (
      <StudioVrmXpbdSkirtAttachment
        vrm={props.vrm}
        slot={props.slot}
        equip={props.equip}
        metrics={props.metrics}
        effectiveFit={props.effectiveFit}
        topologyGeneration={props.rigRevision}
        onSurfaceReceipt={props.onSurfaceReceipt}
        onAttachmentStatus={props.onAttachmentStatus}
        onCaptureSyncChange={props.onXpbdCaptureSyncChange}
        fallback={<StudioVrmProceduralWardrobeAttachment {...props} />}
      />
    );
  }
  return <StudioVrmProceduralWardrobeAttachment {...props} />;
}

/** Existing skinned/rigid procedural path, retained as the XPBD unavailable fallback. */
function StudioVrmProceduralWardrobeAttachment({
  vrm,
  slot,
  equip,
  metrics,
  effectiveFit,
  onSurfaceReceipt,
  onAttachmentStatus,
}: StudioVrmWardrobeAttachmentProps) {
  const renderable = useMemo(() => {
    const def = wardrobeItemById(equip.itemId);
    if (!def) return { entries: [], receipt: null, complete: false };
    const parts = buildGarmentParts(equip.itemId, metrics, effectiveFit);
    const name = `wardrobe:${def.slot}:${def.id}`;
    if (def.geometrySource === "skinned-procedural-v1") {
      const built = assembleSkinnedGarment(
        vrm,
        parts,
        def.defaultColor,
        def.defaultFabricId,
        name,
      );
      if (built.surface) {
        return {
          entries: [{
            key: `${equip.itemId}:skinned`,
            node: vrm.scene as THREE.Object3D,
            object: built.surface.mesh as THREE.Object3D,
          }],
          receipt: built.receipt,
          complete: true,
        };
      }
      const groups = assembleGarmentGroups(
        parts,
        def.defaultColor,
        def.defaultFabricId,
        name,
      );
      const entries: { key: string; node: THREE.Object3D; object: THREE.Object3D }[] = [];
      for (const [bone, object] of groups) {
        const boneNode = vrm.humanoid?.getRawBoneNode(bone as VRMHumanBoneName) ?? null;
        if (boneNode) entries.push({ key: `${equip.itemId}:${bone}`, node: boneNode, object });
      }
      return {
        entries,
        receipt: built.receipt,
        // A skinned catalog contract may render its rigid compatibility fallback for preview, but
        // Shared Stage must not certify that downgrade as a full-fidelity attachment.
        complete: false,
      };
    }

    const groups = assembleGarmentGroups(
      parts,
      def.defaultColor,
      def.defaultFabricId,
      `wardrobe:${def.slot}:${def.id}`,
    );
    const entries: { key: string; node: THREE.Object3D; object: THREE.Object3D }[] = [];
    for (const [bone, object] of groups) {
      const boneNode = vrm.humanoid?.getRawBoneNode(bone as VRMHumanBoneName) ?? null;
      if (boneNode) entries.push({ key: `${equip.itemId}:${bone}`, node: boneNode, object });
    }
    return {
      entries,
      receipt: null,
      // XPBD-authored skirts may show this rigid geometry as a local preview fallback, but it is
      // not the authored cloth surface and must never certify Shared Stage/capture fidelity.
      complete: def.geometrySource !== "xpbd-skirt-v1"
        && groups.size > 0
        && entries.length === groups.size,
    };
  }, [vrm, equip.itemId, effectiveFit, metrics]);

  const entries = renderable.entries;

  useLayoutEffect(() => {
    if (!onAttachmentStatus) return;
    onAttachmentStatus(
      slot,
      equip.itemId,
      renderable.complete ? "ready" : "unavailable",
    );
    return () => onAttachmentStatus(slot, equip.itemId, "detached");
  }, [equip.itemId, onAttachmentStatus, renderable.complete, slot]);

  // 색상·원단만 바뀔 때 geometry/Skeleton을 다시 만들면 현재 포즈가 새 bind pose가 된다.
  // 재질만 제자리에서 갱신해 포즈·핏·스키닝 표면을 그대로 유지한다.
  useLayoutEffect(() => {
    const materials = new Set<THREE.MeshPhysicalMaterial>();
    for (const entry of entries) {
      entry.object.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (!mesh.isMesh) return;
        const meshMaterials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const material of meshMaterials) {
          if ((material as THREE.MeshPhysicalMaterial).isMeshPhysicalMaterial) {
            materials.add(material as THREE.MeshPhysicalMaterial);
          }
        }
      });
    }
    if (materials.size === 0) return;

    const fabricChanged = [...materials].some(
      (material) => material.userData.studioVrmGarmentFabricId !== equip.fabricId,
    );
    const replacementWeave = fabricChanged ? createGarmentWeaveTexture(equip.fabricId) : null;
    const retiredTextures = new Set<THREE.Texture>();
    let replacementUsed = false;

    for (const material of materials) {
      const part = material.userData.studioVrmGarmentPart as GarmentPart | undefined;
      if (!part) continue;
      const previousBump = material.bumpMap;
      const nextWeave = fabricChanged ? replacementWeave : previousBump as THREE.DataTexture | null;
      applyGarmentMaterialStyle(material, part, equip.color, equip.fabricId, nextWeave);
      if (replacementWeave && material.bumpMap === replacementWeave) replacementUsed = true;
      if (previousBump && previousBump !== material.bumpMap) retiredTextures.add(previousBump);
    }

    retiredTextures.forEach((texture) => texture.dispose());
    if (replacementWeave && !replacementUsed) replacementWeave.dispose();
  }, [entries, equip.color, equip.fabricId]);

  // GPU 버퍼 정리 — StrictMode의 setup→cleanup→setup에서는 같은 object 폐기를 취소하고,
  // 실제 아이템/색/핏 교체나 언마운트에서만 다음 microtask에 해제한다.
  useEffect(() => {
    entries.forEach((entry) => cancelScheduledGarmentDisposal(entry.object));
    return () => entries.forEach((entry) => scheduleGarmentDisposal(entry.object));
  }, [entries]);

  useEffect(() => {
    onSurfaceReceipt(slot, renderable.receipt);
  }, [onSurfaceReceipt, renderable.receipt, slot]);

  return (
    <>
      {entries.map((entry) => (
        <group key={entry.key}>{createPortal(<primitive object={entry.object} />, entry.node)}</group>
      ))}
    </>
  );
}

/** base pose/tracking과 모든 소품 IK가 끝난 뒤 normalized pose를 raw VRM에 한 번만 전달한다. */
export function StudioVrmRuntimeCommit({
  vrm,
  physicsPreview,
  webcamActive,
  onCommitFrame,
}: {
  vrm: VRM;
  physicsPreview: boolean;
  webcamActive: boolean;
  onCommitFrame?: (frame: number) => void;
}) {
  const frameRef = useRef(0);
  useFrame((_, delta) => {
    // 흔들림 미리보기·웹캠 트래킹 중에만 스프링본을 전진시키고, 탭 복귀 폭주는 상한 처리한다.
    const springDelta = webcamActive || physicsPreview
      ? Math.min(delta, PHYSICS_PREVIEW_MAX_DELTA)
      : 0;
    vrm.update(springDelta);
    const frame = frameRef.current;
    frameRef.current += 1;
    onCommitFrame?.(frame);
  }, VRM_FRAME_COMMIT_PRIORITY);
  return null;
}
