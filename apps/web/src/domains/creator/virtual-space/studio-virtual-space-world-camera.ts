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
