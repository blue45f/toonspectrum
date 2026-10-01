/**
 * Sumi 엔진 코어 배럴(승격 단위). 외부 import는 zod뿐이며 DOM 전역을 참조하지 않는다.
 * gpu/·webgl2/·wasm/ 하위 모듈은 각 레인 구현이 직접 경로로 import한다(브라우저 전용 타입 격리).
 * testing/은 테스트 전용 합성 입력이라 배럴에서 내보내지 않는다.
 */
export * from "./core/color";
export * from "./core/curve";
export * from "./core/dab-layout";
export * from "./core/errors";
export * from "./core/hash";
export * from "./core/rng";
export * from "./core/version";
export type * from "./core/types";

export * from "./input/calibration";
export * from "./input/corner-preserve";
export * from "./input/input-pipeline";
export * from "./input/one-euro";
export * from "./input/predictor";

export * from "./physics/bristle-bundle";
export * from "./physics/friction";
export * from "./physics/graphite-deposit";
export * from "./physics/nib-flex";
export * from "./physics/physics-model";
export * from "./physics/tip-contact";
export * from "./physics/velocity-deposit";

export * from "./dynamics/color-dynamics";
export * from "./dynamics/dab-emitter";
export * from "./dynamics/mapping-curves";
export * from "./dynamics/scatter";
export * from "./dynamics/stroke-pipeline";

export * from "./texture/mip-chain";
export * from "./texture/paper-grain";
export * from "./texture/sampling";
export * from "./texture/tip-generators";

export * from "./raster/composite";
export * from "./raster/coverage";
export * from "./raster/fine-raster";
export * from "./raster/reference-renderer";
export * from "./raster/stroke-layer";
export * from "./raster/tile-binning";
export * from "./raster/tile-pool";

export * from "./pigment/kubelka-munk";
export * from "./pigment/pigment-table";

export * from "./wet/active-tiles";
export * from "./wet/impasto";
export * from "./wet/params";
export * from "./wet/state";
export * from "./wet/step-dry";
export * from "./wet/step-pigment";
export * from "./wet/step-water";
export * from "./wet/wet-reference";

export * from "./presets/catalog";
export * from "./presets/families";
export * from "./presets/program-schema";
