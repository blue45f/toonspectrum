import { STUDIO_BG3D_CAMERA_MAX_WORLD_COORDINATE } from "./studio-bg3d-camera-framing";
import { resolveStudioBg3dMinimumOrbitDistance } from "./studio-bg3d-camera-application";

import type { StudioBg3dCameraSettings } from "./studio-bg3d-scene-document";

export const STUDIO_BG3D_COMPOSITION_LENSES = [
  { fov: 90, label: "넓은 공간", description: "방 전체와 큰 배경을 담습니다." },
  { fov: 65, label: "대화 장면", description: "인물과 주변 공간을 함께 담습니다." },
  { fov: 50, label: "기본 구도", description: "일상 장면의 자연스러운 원근입니다." },
  { fov: 35, label: "인물 중심", description: "인물에 집중하고 배경을 정리합니다." },
  { fov: 20, label: "클로즈업", description: "먼 배경이 가까워 보이는 압축 원근입니다." },
] as const;

/** Preserve target-plane scale by moving along the existing view ray, without resetting roll/shift. */
export function composeStudioBg3dLens(
  camera: StudioBg3dCameraSettings,
  fovDegrees: number,
  preserveSubjectSize: boolean,
): StudioBg3dCameraSettings | null {
  if (camera.projection === "orthographic" || !Number.isFinite(fovDegrees) || fovDegrees < 10 || fovDegrees > 120) return null;
  const coordinates = [...camera.position, ...camera.target];
  if (!coordinates.every(Number.isFinite) || !Number.isFinite(camera.fovDegrees) || camera.fovDegrees < 10 || camera.fovDegrees > 120) return null;
  if (Math.abs(camera.fovDegrees - fovDegrees) < 1e-6) return camera;
  if (!preserveSubjectSize) return { ...camera, fovDegrees };
  const offset = camera.position.map((value, axis) => value - camera.target[axis]);
  const distance = Math.hypot(...offset);
  const ratio = Math.tan(camera.fovDegrees * Math.PI / 360) / Math.tan(fovDegrees * Math.PI / 360);
  const nextDistance = distance * ratio;
  // OrbitControls must be able to apply this exact distance. A near-plane clamp would change
  // subject size and leave the saved camera different from the live camera.
  const minDistance = resolveStudioBg3dMinimumOrbitDistance(camera.nearClip);
  if (!Number.isFinite(nextDistance) || distance < 1e-6 || nextDistance < minDistance || nextDistance > STUDIO_BG3D_CAMERA_MAX_WORLD_COORDINATE) return null;
  const position = offset.map((value, axis) => camera.target[axis] + value * ratio) as [number, number, number];
  if (position.some((value) => Math.abs(value) > STUDIO_BG3D_CAMERA_MAX_WORLD_COORDINATE)) return null;
  return { ...camera, position, fovDegrees };
}
