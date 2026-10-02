/**
 * 월드 카메라 배치: 내장 장소는 고정(fit) 프레임, 캠퍼스·사용자 월드는 추종(follow) 카메라.
 * Canvas의 resize 처리에서 옮겨 온 코드다(W4·W12). 줌 계산은 순수 함수로 테스트한다.
 */
import type * as Phaser from "phaser";

import { studioSceneCameraFrame } from "./studio-virtual-space-scene-art-runtime";
import { studioCameraZoom, studioCoverRect } from "./studio-virtual-space-presentation";
import { studioCampusCameraZoom, studioVirtualWorldPresentation } from "./studio-virtual-space-world-presentation";
import type { StudioVirtualSpaceWorldManifest } from "./studio-virtual-space-world-manifest";

export type StudioWorldCameraPlacement =
  | { readonly mode: "fit"; readonly zoom: number; readonly bounds: { readonly x: number; readonly y: number; readonly width: number; readonly height: number } }
  | { readonly mode: "follow"; readonly zoom: number; readonly bounds: { readonly x: number; readonly y: number; readonly width: number; readonly height: number } };

/** CSS 크기와 렌더 배율로 카메라 모드·줌·경계를 정한다. */
export function studioWorldCameraPlacement(
  manifest: StudioVirtualSpaceWorldManifest,
  cssWidth: number,
  cssHeight: number,
  ratio: number,
): StudioWorldCameraPlacement {
  const frame = studioSceneCameraFrame(manifest, cssWidth, cssHeight, ratio);
  if (frame) return { mode: "fit", zoom: frame.zoom, bounds: frame.bounds };
  // 캠퍼스는 세로 약 12타일(모바일 세로형은 가로 약 7타일)이 보이게 해 월드가 화면을 꽉 채운다.
  const zoom = studioVirtualWorldPresentation(manifest)?.kind === "campus"
    ? studioCampusCameraZoom(cssWidth, cssHeight, ratio, manifest)
    : studioCameraZoom(cssWidth, cssHeight, ratio);
  return { mode: "follow", zoom, bounds: { x: 0, y: 0, width: manifest.width, height: manifest.height } };
}

/** 카메라에 배치를 적용하고 모드("fit" | "follow")를 돌려준다. */
export function applyStudioWorldCamera(
  camera: Pick<Phaser.Cameras.Scene2D.Camera, "setZoom" | "setBounds" | "centerOn">,
  manifest: StudioVirtualSpaceWorldManifest,
  cssWidth: number,
  cssHeight: number,
  ratio: number,
): StudioWorldCameraPlacement["mode"] {
  const placement = studioWorldCameraPlacement(manifest, cssWidth, cssHeight, ratio);
  camera.setZoom(placement.zoom);
  camera.setBounds(placement.bounds.x, placement.bounds.y, placement.bounds.width, placement.bounds.height);
  if (placement.mode === "fit") camera.centerOn(manifest.width / 2, manifest.height / 2);
  return placement.mode;
}

/** 생성 원경을 월드 세 배로 확대하지 않고 화면에 맞춰 선명도와 종횡비를 유지한다. */
export function fitStudioHorizonArtwork(
  artwork: Phaser.GameObjects.Image,
  gameSize: { readonly width: number; readonly height: number },
  zoom: number,
): void {
  const source = artwork.texture.getSourceImage();
  const rect = studioCoverRect(gameSize.width / zoom, gameSize.height / zoom, source.width, source.height);
  artwork.setOrigin(.5).setScrollFactor(0).setPosition(gameSize.width / 2, gameSize.height / 2).setDisplaySize(rect.width, rect.height);
}

/** 카메라 중심이 월드 경계에 가까워지는 구간(월드 px). 이 안에서 추종을 부드럽게 늦춘다. */
export const STUDIO_CAMERA_EDGE_SOFT_ZONE_PX = 160;
/** 경계에 완전히 붙었을 때 남기는 최소 추종 비율. 0이면 경계에서 카메라가 얼어붙는다. */
export const STUDIO_CAMERA_EDGE_MIN_LERP_FACTOR = 0.32;

function edgeSmoothstep(t: number): number {
  const clamped = Math.min(1, Math.max(0, t));
  return clamped * clamped * (3 - 2 * clamped);
}

/**
 * 한 축의 카메라 추종 배율(0~1 곱셈 계수).
 *
 * Phaser의 하드 bounds 클램프는 캐릭터가 월드 가장자리에 닿는 순간 카메라만
 * 갑자기 멈춰 화면이 튀어 보인다. 중심이 경계 소프트 존 안에 들어오면
 * 추종 lerp를 미리 늦춰 감속하면서 경계에 닿게 한다. 월드가 화면보다
 * 작거나 같은 축에서는 클램프 자체가 없어 1을 돌려준다.
 */
export function studioCameraEdgeLerpFactor(
  center: number,
  viewWorldSize: number,
  worldSize: number,
): number {
  if (!(viewWorldSize > 0) || !(worldSize > viewWorldSize)) return 1;
  const half = viewWorldSize / 2;
  const minCenter = half;
  const maxCenter = worldSize - half;
  const distanceToEdge = Math.min(center - minCenter, maxCenter - center);
  if (distanceToEdge >= STUDIO_CAMERA_EDGE_SOFT_ZONE_PX) return 1;
  const eased = edgeSmoothstep(distanceToEdge / STUDIO_CAMERA_EDGE_SOFT_ZONE_PX);
  return STUDIO_CAMERA_EDGE_MIN_LERP_FACTOR + (1 - STUDIO_CAMERA_EDGE_MIN_LERP_FACTOR) * eased;
}
