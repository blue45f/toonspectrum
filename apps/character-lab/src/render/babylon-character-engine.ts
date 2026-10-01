/**
 * 렌더 엔진 진입점 — `app/composition.ts`의 **단 하나의 동적 import**(`import("../render/babylon-character-engine")`)가 로드하는
 * 청크 경계다. 요청한 backend(WebGPU 또는 WebGL2) 하나만 `babylon/engine-factory.ts`로 명시 생성하고, 그 엔진을
 * `BabylonCharacterEngine`에 꽂는다. 자동 전환·자동 fallback은 없다(ADR-0018): 초기화 실패·timeout·fallback 어댑터는
 * LabFailure로 reject하며 다른 backend를 시도하지 않는다.
 *
 * 클래스 본체는 `babylon/character-engine.ts`(DOM 전용 Babylon 모듈 없음, NullEngine 하네스가 Node에서 재사용)다.
 * 브라우저(GPU) 경로는 이 컨테이너에서 실행하지 못했다 — docs/parity/render.md '브라우저 미검증'.
 */
import { failVisible, isLabFailure } from "../contracts";

import { BabylonCharacterEngine } from "./babylon/character-engine";
import { createBabylonEngine } from "./babylon/engine-factory";

import type { CharacterEngineFactory } from "../contracts";

export { BabylonCharacterEngine, FACE_SDF_SIZE, TOON_EDGE_EPSILON, TOON_OUTLINE_WIDTH } from "./babylon/character-engine";
export type { BabylonCharacterEngineDeps } from "./babylon/character-engine";
export type { ReadbackLane } from "./readback";

/**
 * 앱 팩토리: 요청 backend 하나만 만든다. 실패·timeout·fallback 어댑터는 LabFailure로 reject하며 다른 backend를 시도하지 않는다.
 * engine-session이 timeout 뒤 늦게 도착한 엔진을 dispose하므로 여기서는 생성만 책임진다.
 */
export const createBabylonCharacterEngine: CharacterEngineFactory = async (options) => {
  const handle = await createBabylonEngine({ canvas: options.canvas, backend: options.backend, initTimeoutMs: options.initTimeoutMs, onLost: options.onLost });
  try {
    const engine = await BabylonCharacterEngine.create({
      engine: handle.engine,
      lane: options.backend,
      diagnostics: handle.diagnostics,
      physicsProviders: options.physicsProviders,
      disposeEngine: () => handle.dispose(),
    });
    engine.attachCameraControl(options.canvas);
    engine.resize(options.canvas.width, options.canvas.height);
    return engine;
  } catch (error) {
    handle.dispose();
    throw isLabFailure(error) ? error : failVisible("engine-scene-init-failed", "엔진은 만들어졌지만 장면 초기화에 실패했습니다. 자동 전환 없이 중단합니다.", error);
  }
};
