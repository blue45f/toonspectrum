/**
 * 뷰포트 카메라 수학(순수). `ViewportCameraInfo`(엔진이 보고한 위치·기저·fov·렌더 크기)로 화면 픽셀 ↔ 월드를 오간다.
 * 관절 드래그가 포인터를 "피벗을 지나고 시선에 수직인 평면"으로 역투영하는 데 쓰고, 핸들 SVG 좌표 검증에도 쓴다.
 * 우수 좌표·Y-up. 픽셀 좌표는 렌더 크기 기준(좌상단 원점, y 아래쪽 양수).
 */
import { v3Add, v3Dot, v3Normalize, v3Scale, v3Sub } from "../shared/math";

import type { Vec3 } from "../contracts";
import type { ViewportCameraInfo } from "./viewport-camera";

export interface WorldRay {
  readonly origin: Vec3;
  /** 단위 벡터 */
  readonly direction: Vec3;
}

/** 렌더 픽셀을 지나는 월드 광선(투영 중심 = 카메라 위치) */
export function pixelRay(camera: ViewportCameraInfo, pixelX: number, pixelY: number): WorldRay {
  const aspect = camera.width > 0 && camera.height > 0 ? camera.width / camera.height : 1;
  const tanHalf = Math.tan(camera.fovY / 2);
  const ndcX = (pixelX / Math.max(1, camera.width)) * 2 - 1;
  const ndcY = 1 - (pixelY / Math.max(1, camera.height)) * 2;
  const direction = v3Normalize(v3Add(v3Add(camera.forward, v3Scale(camera.right, ndcX * tanHalf * aspect)), v3Scale(camera.up, ndcY * tanHalf)));
  return { origin: camera.position, direction };
}

/** 광선과 평면(점 + 법선)의 교차점. 평행하거나 평면이 광선 뒤쪽이면 null. */
export function intersectRayPlane(ray: WorldRay, planePoint: Vec3, planeNormal: Vec3): Vec3 | null {
  const denominator = v3Dot(ray.direction, planeNormal);
  if (Math.abs(denominator) < 1e-9) return null;
  const t = v3Dot(v3Sub(planePoint, ray.origin), planeNormal) / denominator;
  if (!(t > 0)) return null;
  return v3Add(ray.origin, v3Scale(ray.direction, t));
}

/** 렌더 픽셀을 "planePoint를 지나 시선에 수직인 평면"으로 역투영한다. */
export function unprojectToViewPlane(camera: ViewportCameraInfo, pixelX: number, pixelY: number, planePoint: Vec3): Vec3 | null {
  return intersectRayPlane(pixelRay(camera, pixelX, pixelY), planePoint, camera.forward);
}

/** 월드 점을 렌더 픽셀로 투영한다. 카메라 뒤쪽이면 null. (엔진 `jointHandles().screen`과 같은 값이어야 한다.) */
export function projectToPixel(camera: ViewportCameraInfo, world: Vec3): readonly [number, number] | null {
  const offset = v3Sub(world, camera.position);
  const depth = v3Dot(offset, camera.forward);
  if (!(depth > 1e-6)) return null;
  const aspect = camera.width > 0 && camera.height > 0 ? camera.width / camera.height : 1;
  const tanHalf = Math.tan(camera.fovY / 2);
  const ndcX = v3Dot(offset, camera.right) / (depth * tanHalf * aspect);
  const ndcY = v3Dot(offset, camera.up) / (depth * tanHalf);
  return [(ndcX * 0.5 + 0.5) * camera.width, (1 - (ndcY * 0.5 + 0.5)) * camera.height];
}

export interface ClientBox {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

/** 클라이언트(CSS 픽셀) 좌표 → 렌더 픽셀. 박스 크기가 0이면 null. */
export function clientToRenderPixel(clientX: number, clientY: number, box: ClientBox, camera: Pick<ViewportCameraInfo, "width" | "height">): readonly [number, number] | null {
  if (!(box.width > 0) || !(box.height > 0)) return null;
  return [((clientX - box.left) / box.width) * camera.width, ((clientY - box.top) / box.height) * camera.height];
}
