import { createPortal } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo } from "react";
import * as THREE from "three";

import {
  buildAvatarForgeHairParts,
  sanitizeAvatarForgeState,
  type AvatarForgeFaceAccent,
  type AvatarForgeHairPart,
  type AvatarForgeState,
} from "./studio-vrm-avatar-forge";
import { classifyMeshName } from "./studio-vrm-costume";

import type { StudioVrmAvatarForgeFaceController } from "./studio-vrm-avatar-forge-face-controller";
import type { VRM } from "@pixiv/three-vrm";

const AVATAR_FORGE_MARKER = "toonSpectrumAvatarForge";
const HAIR_VISIBILITY_LEASES = new WeakMap<THREE.Object3D, { count: number; visible: boolean }>();

type HeadFit = {
  center: THREE.Vector3;
  eyeCenter: THREE.Vector3;
  radiusX: number;
  radiusY: number;
  radiusZ: number;
  frontSign: 1 | -1;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function materialNames(mesh: THREE.Mesh): string[] {
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  return materials.map((material) => material?.name?.trim()).filter((name): name is string => Boolean(name));
}

function isGeneratedForgeObject(object: THREE.Object3D) {
  let current: THREE.Object3D | null = object;
  while (current) {
    if (current.userData[AVATAR_FORGE_MARKER] === true) return true;
    current = current.parent;
  }
  return false;
}

/**
 * 보수적으로 "독립 교체 가능한" 헤어 메시만 찾는다.
 * Body/Face 하나에 skin+hair material이 함께 구워진 VRoid 메시 등은 절대 숨기지 않는다.
 */
function detectReplaceableHairMeshes(vrm: VRM | null): THREE.Mesh[] {
  if (!vrm) return [];
  const detected: THREE.Mesh[] = [];

  vrm.scene.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || isGeneratedForgeObject(mesh)) return;

    const names = materialNames(mesh);
    const meshClass = classifyMeshName(mesh.name);
    const materialClasses = names.map((name) => classifyMeshName(name));
    const hasContraryMaterial = materialClasses.some(
      (classification) =>
        (classification.protected !== null && classification.protected !== "hair") || classification.slot !== null
    );

    // 이름 자체가 얼굴/피부/눈/몸통이면 결합 메시로 간주한다. Hair 재질이 섞여 있어도 안전 우선.
    if (meshClass.protected !== null && meshClass.protected !== "hair") return;
    if (meshClass.slot !== null || hasContraryMaterial) return;

    if (meshClass.protected === "hair") {
      detected.push(mesh);
      return;
    }

    // 일반 노드명(Node_001 등)은 모든 명시적 재질이 헤어일 때만 허용한다.
    if (names.length > 0 && materialClasses.every((classification) => classification.protected === "hair")) {
      detected.push(mesh);
    }
  });

  return detected;
}

/** UI에서 "교체 가능한 원본 헤어 N개"를 안내할 때 쓰는 비파괴 탐지 헬퍼. */
// 이 파일에서 component와 함께 export해 인티그레이션 측의 추가 순회 import를 피한다.
// eslint-disable-next-line react-refresh/only-export-components
export function countDetectedVrmHairMeshes(vrm: VRM | null): number {
  return detectReplaceableHairMeshes(vrm).length;
}

/**
 * 헤어 메시 가시성 "리스"를 획득한다(참조 카운팅 + 원복).
 *
 * 계약:
 *  1) 첫 획득 시에만 원래 visible 값을 기억한다.
 *  2) 중첩 획득은 카운트만 올린다(같은 메시를 여러 이펙트가 숨겨도 안전).
 *  3) 마지막 반납에서만 원래 값으로 되돌린다 → 다른 시스템이 `mesh.visible = true`로
 *     덮어쓰는 사고를 막는다.
 *
 * 워드로브(studio-vrm-wardrobe-catalogue.ts)도 같은 규약을 쓰되 **대상 집합이 서로소**다.
 * 여기서는 `classifyMeshName().protected === "hair"`인 메시만, 워드로브는 `slot !== null`인
 * 메시만 잡는다. 그래서 두 시스템이 같은 메시의 visible을 두고 다투는 상황 자체가 없다.
 */
function acquireHiddenHair(meshes: readonly THREE.Mesh[]) {
  for (const mesh of meshes) {
    const lease = HAIR_VISIBILITY_LEASES.get(mesh);
    if (lease) {
      lease.count += 1;
    } else {
      HAIR_VISIBILITY_LEASES.set(mesh, { count: 1, visible: mesh.visible });
    }
    mesh.visible = false;
  }

  return () => {
    for (const mesh of meshes) {
      const lease = HAIR_VISIBILITY_LEASES.get(mesh);
      if (!lease) continue;
      lease.count -= 1;
      if (lease.count > 0) {
        mesh.visible = false;
        continue;
      }
      mesh.visible = lease.visible;
      HAIR_VISIBILITY_LEASES.delete(mesh);
    }
  };
}

function localPosition(head: THREE.Object3D, bone: THREE.Object3D | null) {
  if (!bone) return null;
  return head.worldToLocal(bone.getWorldPosition(new THREE.Vector3()));
}

function measureHeadFit(vrm: VRM, head: THREE.Object3D): HeadFit {
  vrm.scene.updateMatrixWorld(true);
  head.updateWorldMatrix(true, true);

  const leftEye = localPosition(head, vrm.humanoid?.getNormalizedBoneNode("leftEye") ?? null);
  const rightEye = localPosition(head, vrm.humanoid?.getNormalizedBoneNode("rightEye") ?? null);
  const hasEyePair = Boolean(leftEye && rightEye && leftEye.distanceTo(rightEye) > 1e-4);
  const eyeCenter = hasEyePair
    ? leftEye!.clone().add(rightEye!).multiplyScalar(0.5)
    : new THREE.Vector3(0, 0.061, 0.018);

  const explicitFront = vrm.lookAt?.faceFront?.z;
  const inferredFront = Math.abs(eyeCenter.z) > 0.002 ? Math.sign(eyeCenter.z) : 1;
  const frontSign: 1 | -1 = (Math.abs(explicitFront ?? 0) > 0.5 ? Math.sign(explicitFront!) : inferredFront) < 0 ? -1 : 1;

  const sceneSize = new THREE.Box3().setFromObject(vrm.scene).getSize(new THREE.Vector3());
  const worldScale = head.getWorldScale(new THREE.Vector3());
  const localHeight = clamp(sceneSize.y / Math.max(0.001, Math.abs(worldScale.y)), 0.75, 3.5);
  const eyeDistance = hasEyePair ? leftEye!.distanceTo(rightEye!) : 0;
  const radiusX = hasEyePair
    ? clamp(eyeDistance * 2.15, localHeight * 0.035, localHeight * 0.07)
    : localHeight * 0.044;
  const radiusY = radiusX * 1.18;
  const radiusZ = radiusX * 0.95;
  const center = new THREE.Vector3(
    eyeCenter.x,
    eyeCenter.y + radiusY * 0.18,
    eyeCenter.z - frontSign * radiusZ * 0.56
  );

  return { center, eyeCenter, radiusX, radiusY, radiusZ, frontSign };
}

function setGradientColors(geometry: THREE.BufferGeometry, baseColor: string, tipColor: string) {
  geometry.computeBoundingBox();
  const position = geometry.getAttribute("position");
  const box = geometry.boundingBox;
  if (!position || !box) return;

  const base = new THREE.Color(baseColor);
  const tip = new THREE.Color(tipColor);
  const height = Math.max(1e-5, box.max.y - box.min.y);
  const colors = new Float32Array(position.count * 3);
  for (let index = 0; index < position.count; index += 1) {
    const mix = clamp((box.max.y - position.getY(index)) / height, 0, 1);
    const color = base.clone().lerp(tip, mix);
    colors[index * 3] = color.r;
    colors[index * 3 + 1] = color.g;
    colors[index * 3 + 2] = color.b;
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
}

function createTaperedStrandGeometry(part: AvatarForgeHairPart) {
  const radialSegments = 10;
  const lengthSegments = 14;
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const base = new THREE.Color(part.baseColor);
  const tip = new THREE.Color(part.tipColor);
  // v2 웨이브. 계획에 wave 키가 없으면(=v1 계획) 아래 분기가 통째로 꺼져 v1과 동일한 부동소수
  // 결과가 나온다(+0 덧셈으로 -0 부호 비트가 바뀌는 일조차 없도록 분기로 차단).
  const waveAmount = part.wave ?? 0;
  const waveFrequency = part.waveFrequency ?? 2.4;
  // 가닥은 X/Z가 눌리고 Y가 늘어난 비등방 스케일로 배치된다. 웨이브 진폭을 "가닥 폭"이 아니라
  // "가닥 길이" 기준으로 잡아야 어떤 굵기에서도 같은 세기로 보인다 → 종횡비만큼 되돌려 준다.
  const aspectX = clamp(part.scale[1] / Math.max(1e-4, Math.abs(part.scale[0])), 1, 10);
  const aspectZ = clamp(part.scale[1] / Math.max(1e-4, Math.abs(part.scale[2])), 1, 10);

  for (let row = 0; row <= lengthSegments; row += 1) {
    const t = row / lengthSegments;
    const y = 1 - t * 2;
    const radius = Math.max(0.08, 1 - part.taper * Math.pow(t, 0.72));
    const spineCurveX = Math.sin(t * Math.PI * 2.15) * part.curl * 0.58 * t;
    const spineCurveZ = Math.sin(t * Math.PI) * part.curl * 0.34;
    const curveX = waveAmount > 0
      ? spineCurveX + Math.sin(t * Math.PI * waveFrequency) * waveAmount * 0.17 * aspectX * t
      : spineCurveX;
    const curveZ = waveAmount > 0
      ? spineCurveZ + Math.cos(t * Math.PI * waveFrequency) * waveAmount * 0.07 * aspectZ * t
      : spineCurveZ;
    const color = base.clone().lerp(tip, t);

    for (let column = 0; column < radialSegments; column += 1) {
      const angle = (column / radialSegments) * Math.PI * 2;
      positions.push(curveX + Math.cos(angle) * radius, y, curveZ + Math.sin(angle) * radius);
      colors.push(color.r, color.g, color.b);
    }
  }

  for (let row = 0; row < lengthSegments; row += 1) {
    for (let column = 0; column < radialSegments; column += 1) {
      const nextColumn = (column + 1) % radialSegments;
      const topLeft = row * radialSegments + column;
      const topRight = row * radialSegments + nextColumn;
      const bottomLeft = (row + 1) * radialSegments + column;
      const bottomRight = (row + 1) * radialSegments + nextColumn;
      indices.push(topLeft, bottomLeft, topRight, topRight, bottomLeft, bottomRight);
    }
  }

  const topCenter = positions.length / 3;
  positions.push(0, 1, 0);
  colors.push(base.r, base.g, base.b);
  const bottomCenter = positions.length / 3;
  positions.push(0, -1, 0);
  colors.push(tip.r, tip.g, tip.b);
  for (let column = 0; column < radialSegments; column += 1) {
    const nextColumn = (column + 1) % radialSegments;
    indices.push(topCenter, nextColumn, column);
    const bottom = lengthSegments * radialSegments;
    indices.push(bottomCenter, bottom + column, bottom + nextColumn);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

function createHairGeometry(part: AvatarForgeHairPart) {
  if (part.primitive === "tapered-capsule") return createTaperedStrandGeometry(part);
  const geometry = part.role === "cap"
    ? new THREE.SphereGeometry(1, 32, 18, 0, Math.PI * 2, 0, Math.PI * 0.7)
    : new THREE.SphereGeometry(1, 24, 16);
  setGradientColors(geometry, part.baseColor, part.tipColor);
  return geometry;
}

/**
 * 파츠 계획 하나를 실제 BufferGeometry로 굽는다. 컴포넌트 내부에서 쓰는 그대로를
 * 노출해 헤드리스 테스트가 정점 수·좌표를 직접 검증할 수 있게 한다(테스트용 별도 경로 없음).
 */
// eslint-disable-next-line react-refresh/only-export-components
export function createAvatarForgeHairGeometry(part: AvatarForgeHairPart) {
  return createHairGeometry(part);
}

function createHairMaterial(part: AvatarForgeHairPart) {
  return new THREE.MeshStandardMaterial({
    color: 0xffffff,
    vertexColors: true,
    roughness: clamp(0.82 - part.shine * 0.54, 0.22, 0.84),
    metalness: clamp(0.015 + part.shine * 0.11, 0, 0.14),
    side: THREE.DoubleSide,
  });
}

function transformHairPart(part: AvatarForgeHairPart, fit: HeadFit) {
  const scaleX = fit.radiusX / 0.56;
  const scaleY = fit.radiusY / 0.46;
  const scaleZ = fit.radiusZ / 0.54;
  const position = new THREE.Vector3(
    fit.center.x + part.position[0] * scaleX,
    fit.center.y + (part.position[1] - 0.18) * scaleY,
    fit.center.z + (part.position[2] - 0.015) * scaleZ * fit.frontSign
  );
  const rotation = new THREE.Euler(
    part.rotation[0] * fit.frontSign,
    part.rotation[1],
    part.rotation[2],
    "XYZ"
  );
  const scale = new THREE.Vector3(
    part.scale[0] * scaleX,
    part.scale[1] * scaleY,
    part.scale[2] * scaleZ
  );
  return { position, rotation, scale };
}

function addHairParts(group: THREE.Group, state: AvatarForgeState, fit: HeadFit) {
  for (const part of buildAvatarForgeHairParts(state)) {
    const geometry = createHairGeometry(part);
    const material = createHairMaterial(part);
    const mesh = new THREE.Mesh(geometry, material);
    const transform = transformHairPart(part, fit);
    mesh.name = `ToonSpectrumAvatarForgeHair_${part.id}`;
    mesh.position.copy(transform.position);
    mesh.rotation.copy(transform.rotation);
    mesh.scale.copy(transform.scale);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.renderOrder = 6;
    group.add(mesh);
  }
}

function faceSurfaceZ(fit: HeadFit, x: number, y: number, outset: number) {
  const normalizedX = (x - fit.center.x) / Math.max(1e-5, fit.radiusX);
  const normalizedY = (y - fit.center.y) / Math.max(1e-5, fit.radiusY);
  const surface = Math.sqrt(Math.max(0.06, 1 - normalizedX * normalizedX - normalizedY * normalizedY));
  return fit.center.z + fit.frontSign * (fit.radiusZ * surface + outset);
}

function createAccentMaterial(accent: AvatarForgeFaceAccent, opacityMultiplier = 1) {
  return new THREE.MeshBasicMaterial({
    color: accent.color,
    transparent: true,
    opacity: clamp(accent.intensity * opacityMultiplier, 0.04, 0.82),
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
}

function addFaceDisc(
  group: THREE.Group,
  fit: HeadFit,
  accent: AvatarForgeFaceAccent,
  id: string,
  x: number,
  y: number,
  radius: number,
  scaleX = 1,
  opacityMultiplier = 1
) {
  const geometry = new THREE.CircleGeometry(radius, 18);
  const material = createAccentMaterial(accent, opacityMultiplier);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = `ToonSpectrumAvatarForgeFaceAccent_${id}`;
  mesh.position.set(x, y, faceSurfaceZ(fit, x, y, radius * 0.06));
  mesh.scale.x = scaleX;
  if (fit.frontSign < 0) mesh.rotation.y = Math.PI;
  mesh.renderOrder = 12;
  group.add(mesh);
}

function addFaceAccents(group: THREE.Group, state: AvatarForgeState, fit: HeadFit) {
  for (const accent of state.faceAccents ?? []) {
    if (!accent.enabled || accent.intensity <= 0) continue;

    if (accent.id === "blush") {
      const cheekY = fit.eyeCenter.y - fit.radiusY * (0.22 + state.face.chinLength * 0.03);
      const cheekX = fit.radiusX * (0.52 + state.face.cheekVolume * 0.07);
      const radius = fit.radiusY * (0.105 + state.face.cheekVolume * 0.035);
      addFaceDisc(group, fit, accent, "blush-left", fit.center.x - cheekX, cheekY, radius, 1.75, 0.52);
      addFaceDisc(group, fit, accent, "blush-right", fit.center.x + cheekX, cheekY, radius, 1.75, 0.52);
      continue;
    }

    if (accent.id === "freckles") {
      const points = [
        [-0.38, -0.11], [-0.25, -0.16], [-0.11, -0.13],
        [0.12, -0.12], [0.26, -0.17], [0.39, -0.1],
      ] as const;
      points.forEach(([x, y], index) => {
        addFaceDisc(
          group,
          fit,
          accent,
          `freckle-${index}`,
          fit.center.x + fit.radiusX * x,
          fit.eyeCenter.y + fit.radiusY * y,
          fit.radiusX * (index % 2 === 0 ? 0.018 : 0.014),
          1,
          0.8
        );
      });
      continue;
    }

    if (accent.id === "beauty-mark") {
      addFaceDisc(
        group,
        fit,
        accent,
        "beauty-mark",
        fit.center.x + fit.radiusX * 0.34,
        fit.eyeCenter.y - fit.radiusY * 0.28,
        fit.radiusX * 0.026,
        1,
        0.9
      );
    }
  }
}

function buildAvatarForgeObject(state: AvatarForgeState, fit: HeadFit) {
  const group = new THREE.Group();
  group.name = "ToonSpectrumAvatarForge";
  group.userData[AVATAR_FORGE_MARKER] = true;
  addHairParts(group, state, fit);
  addFaceAccents(group, state, fit);
  return group;
}

function disposeAvatarForgeObject(object: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  object.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    geometries.add(mesh.geometry);
    const childMaterials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    childMaterials.forEach((material) => materials.add(material));
  });
  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => material.dispose());
}

export type StudioVrmAvatarForgeProps = {
  vrm: VRM;
  state: AvatarForgeState;
  rigRevision: number;
  faceController: StudioVrmAvatarForgeFaceController;
};

/**
 * rigged VRM을 유지한 채 normalized head에 절차형 헤어/페이스 디테일을 포털 부착한다.
 * 얼굴 조형은 raw+normalized head scale만 사용하며 원본 mesh/geometry는 변경하지 않는다.
 */
export function StudioVrmAvatarForge({
  vrm,
  state,
  rigRevision,
  faceController,
}: StudioVrmAvatarForgeProps) {
  const safeState = useMemo(() => sanitizeAvatarForgeState(state), [state]);
  const normalizedHead = vrm.humanoid?.getNormalizedBoneNode("head") ?? null;
  const rawHead = vrm.humanoid?.getRawBoneNode("head") ?? null;
  const fit = useMemo(
    () => {
      void rigRevision;
      return normalizedHead ? measureHeadFit(vrm, normalizedHead) : null;
    },
    [normalizedHead, rigRevision, vrm]
  );
  const object = useMemo(
    () => (fit ? buildAvatarForgeObject(safeState, fit) : null),
    [fit, safeState]
  );

  useEffect(() => {
    if (!object) return;
    return () => disposeAvatarForgeObject(object);
  }, [object]);

  useLayoutEffect(() => {
    faceController.replace({
      normalizedHead,
      rawHead,
      rigRevision,
      face: safeState.face,
    });
    return () => {
      faceController.release();
    };
  }, [faceController, normalizedHead, rawHead, rigRevision, safeState.face]);

  useEffect(() => {
    if (!safeState.hair.replaceOriginal || safeState.hair.style === "none") return;
    return acquireHiddenHair(detectReplaceableHairMeshes(vrm));
  }, [safeState.hair.replaceOriginal, safeState.hair.style, vrm]);

  if (!normalizedHead || !object) return null;
  return createPortal(<primitive object={object} />, normalizedHead);
}
