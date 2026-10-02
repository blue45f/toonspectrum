/**
 * 절차 스카이 IBL: procedural-sky.ts(순수)의 6면 float 큐브를 RawCubeTexture로 올리고 HDRFiltering.prefilter로
 * 거칠기별 프리필터 밉 + SH를 만든 뒤 scene.environmentTexture로 쓴다. 외부 HDR 없음.
 * NullEngine·float 큐브 미지원 엔진에서는 unavailable 상태와 사유를 돌려준다(무음 생략 금지). 브라우저 미검증.
 */
import { Constants } from "@babylonjs/core/Engines/constants.js";
import { HDRFiltering } from "@babylonjs/core/Materials/Textures/Filtering/hdrFiltering.js";
import { RawCubeTexture } from "@babylonjs/core/Materials/Textures/rawCubeTexture.js";

import { describeDetail } from "../../../contracts";
import { generateSkyFaces, skyAverageColor } from "../../procedural-sky";
import { featureActive, featureUnavailable } from "../../scene-features";

import type { SkyParams } from "../../procedural-sky";
import type { SceneFeatureState } from "../../scene-features";
import type { BaseTexture } from "@babylonjs/core/Materials/Textures/baseTexture.js";
import type { Scene } from "@babylonjs/core/scene.js";

export interface ProceduralIbl {
  readonly texture: BaseTexture | null;
  readonly state: SceneFeatureState;
  /** 툰 모드 ambient(태양 제외 평균 복사) */
  readonly averageColor: readonly [number, number, number];
  dispose(): void;
}

export const IBL_CUBE_SIZE = 64;

export async function createProceduralIbl(scene: Scene, params?: SkyParams, size = IBL_CUBE_SIZE): Promise<ProceduralIbl> {
  const averageColor = skyAverageColor(params);
  const engine = scene.getEngine();
  const caps = engine.getCaps();
  if (!caps.textureFloat && !caps.textureHalfFloat) {
    return { texture: null, state: featureUnavailable("엔진이 float 텍스처를 지원하지 않아 절차 스카이 IBL을 만들 수 없습니다."), averageColor, dispose: () => undefined };
  }
  let texture: RawCubeTexture | null = null;
  try {
    const faces = generateSkyFaces(size, params);
    texture = new RawCubeTexture(scene, faces, size, Constants.TEXTUREFORMAT_RGBA, Constants.TEXTURETYPE_FLOAT, false, false, Constants.TEXTURE_LINEAR_LINEAR);
    const filtering = new HDRFiltering(engine, { quality: Constants.TEXTURE_FILTERING_QUALITY_MEDIUM });
    await filtering.prefilter(texture);
    // 프리필터가 끝났는데도 준비되지 않은 환경 텍스처를 scene.environmentTexture로 쓰면 모든 PBR 재질이 isReady=false로 영원히 그려지지 않는다
    // (실브라우저 실측 결함). 준비되지 않았으면 쓰지 않고 사유를 보고한다.
    if (!texture.isReady()) {
      texture.dispose();
      return { texture: null, state: featureUnavailable("프리필터가 끝났지만 환경 텍스처가 준비되지 않아 IBL을 쓰지 않습니다(PBR이 텍스처 대기에서 멈추는 것을 막기 위함)."), averageColor, dispose: () => undefined };
    }
    return {
      texture,
      state: featureActive(`${size}² 절차 스카이, HDRFiltering 프리필터`),
      averageColor,
      dispose() {
        texture?.dispose();
      },
    };
  } catch (error) {
    texture?.dispose();
    return {
      texture: null,
      state: featureUnavailable(`절차 스카이 IBL 생성 실패(${describeDetail(error) ?? "알 수 없는 오류"})`),
      averageColor,
      dispose: () => undefined,
    };
  }
}
