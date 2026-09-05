import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import * as THREE from "three";

import { findCameraPreset } from "./studio-vrm-poser-helpers";
import { fitStudioVrmPreviewCamera } from "./studio-vrm-preview-framing";
import { applyCameraPreset, type OrbitLike } from "./StudioVrmPoserTypes";

import type { VRM } from "@pixiv/three-vrm";

/** Refresh skinned bounds only on a framing command; hidden costume meshes do not enlarge the shot. */
function visibleCharacterBounds(scene: THREE.Object3D): THREE.Box3 {
  const bounds = new THREE.Box3();
  const transformed = new THREE.Box3();
  scene.updateWorldMatrix(true, true);
  scene.traverseVisible((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    const skinned = mesh as THREE.SkinnedMesh;
    if (skinned.isSkinnedMesh) {
      skinned.computeBoundingBox();
      if (skinned.boundingBox) bounds.union(transformed.copy(skinned.boundingBox).applyMatrix4(mesh.matrixWorld));
    } else {
      mesh.geometry.computeBoundingBox();
      if (mesh.geometry.boundingBox) bounds.union(transformed.copy(mesh.geometry.boundingBox).applyMatrix4(mesh.matrixWorld));
    }
  });
  return bounds;
}

export function CameraDirector({
  presetId,
  resetNonce,
  vrm,
}: {
  presetId: string;
  resetNonce: number;
  vrm?: VRM | null;
}) {
  const camera = useThree((state) => state.camera);
  const invalidate = useThree((state) => state.invalidate);
  const controls = useThree((state) => state.controls) as OrbitLike;
  const pendingRef = useRef(false);
  const preset = findCameraPreset(presetId);

  useEffect(() => {
    pendingRef.current = presetId !== "custom";
    if (pendingRef.current) invalidate();
  }, [camera, controls, invalidate, preset, presetId, resetNonce, vrm]);

  // Base pose (-3), props (-2) and VRM commit (-1) finish before this one-shot
  // measurement. An effect-time rest-pose box makes a bent/short character jump
  // or shrink on load. Size is read at command time, not treated as a command:
  // resizing a panel, editing a hand or orbiting must not reset an authored view.
  useFrame(({ size }) => {
    if (!pendingRef.current || presetId === "custom") return;
    pendingRef.current = false;
    let effectivePreset = preset;
    let fitDistance: number | null = null;
    let boundsRadius = 0;
    if (vrm?.scene) {
      const box = visibleCharacterBounds(vrm.scene);
      const fitted = fitStudioVrmPreviewCamera(preset, {
        min: [box.min.x, box.min.y, box.min.z],
        max: [box.max.x, box.max.y, box.max.z],
      }, size.height > 0 ? size.width / size.height : 1);
      if (fitted) {
        effectivePreset = { ...preset, position: fitted.position, target: fitted.target };
        fitDistance = fitted.distance;
        boundsRadius = box.getSize(new THREE.Vector3()).length() / 2;
      } else {
        // Preserve intentionally cropped portrait shots and the previous safe
        // fallback for incomplete/unusual models; do not turn a face shot into a full-body shot.
        const height = box.max.y - box.min.y;
        if (Number.isFinite(height) && height > 0.3 && height < 10 && Math.abs(height - 1.6) > 0.12) {
          const shift = (height - 1.6) * 0.62;
          const scale = Math.min(1.25, Math.max(0.75, Math.sqrt(height / 1.6)));
          effectivePreset = {
            ...preset,
            target: [preset.target[0], Math.max(box.min.y + 0.1, preset.target[1] + shift), preset.target[2]],
            position: [preset.position[0] * scale, Math.max(box.min.y + 0.2, preset.position[1] + shift), preset.position[2] * scale],
          };
        }
      }
    }
    camera.up.set(0, 1, 0);
    if (fitDistance !== null) {
      // Fixed orbit limits otherwise undo a correct fit on small or wide models.
      if (controls) {
        controls.minDistance = Math.min(controls.minDistance ?? 1.3, fitDistance * 0.25);
        controls.maxDistance = Math.max(controls.maxDistance ?? 5.2, fitDistance * 3);
      }
      if (camera instanceof THREE.PerspectiveCamera) {
        camera.near = Math.min(camera.near, Math.max(0.001, fitDistance * 0.005));
        camera.far = Math.max(camera.far, fitDistance + boundsRadius * 3);
      }
    }
    applyCameraPreset(camera, effectivePreset, invalidate);
    if (controls?.target) {
      controls.target.set(...effectivePreset.target);
      controls.update?.();
    }
  });

  return null;
}
