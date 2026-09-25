import { STUDIO_BG3D_ENVIRONMENT_ASSETS } from "./studio-bg3d-environment-catalog";

import type { Bg3dModelLibraryEntry } from "./bg3d-model-library";

/**
 * Deployment-owned environments are available without opening the user's SQLite/OPFS library.
 * Keeping this projection free of persistence imports lets the Models panel remain useful when
 * local storage is unavailable, denied, or corrupt while upload/save operations still fail closed.
 */
export const STUDIO_BG3D_BUNDLED_ENVIRONMENT_LIBRARY_ENTRIES = Object.freeze(
  STUDIO_BG3D_ENVIRONMENT_ASSETS.map((asset): Bg3dModelLibraryEntry => Object.freeze({
    id: asset.id,
    name: asset.name,
    format: "glb",
    source: "sample",
    thumbnail: asset.thumbnailUrl,
    createdAt: 0,
    updatedAt: 0,
    status: "verified",
    canUse: true,
    statusMessage: asset.provenance.license === "CC0-1.0"
      ? "ToonSpectrum CC0 번들 · GLB 안전 검사 후 원본 미터 크기로 배치됩니다."
      : "Tripo 무료 API 지갑 생성물 · 비독점 상업 이용 조건과 GLB 안전 검사를 확인했습니다.",
    contentHash: asset.sha256,
    byteSize: asset.byteSize,
    commercialUse: true,
  })),
);

export function copyStudioBg3dBundledEnvironmentLibraryEntries(): Bg3dModelLibraryEntry[] {
  return [...STUDIO_BG3D_BUNDLED_ENVIRONMENT_LIBRARY_ENTRIES];
}
