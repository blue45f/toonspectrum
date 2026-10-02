/**
 * 베타 기능 능력 판정(가벼운 모듈). 무거운 베타 모듈(OpenPBR·IBL Shadows 파이프라인)을 **불러오기 전에** 켤 수 있는지 판단해야 하므로
 * 엔진 속성만 읽는 이 함수들을 따로 둔다(동적 import 청크에 넣으면 능력 확인에도 모듈을 받아야 한다).
 */
import type { AbstractEngine } from "@babylonjs/core/Engines/abstractEngine.js";

export interface BetaSupport {
  readonly supported: boolean;
  readonly reasonKo?: string;
}

/** OpenPBRMaterial: WebGL2 이상 또는 WebGPU(Babylon 생성자와 같은 조건). NullEngine·WebGL1은 지원하지 않는다. */
export function openPbrSupport(engine: AbstractEngine): BetaSupport {
  // WebGPUEngine에는 webGLVersion이 없고(AbstractEngine 타입에도 없다) WebGL 계열 엔진(Engine·NullEngine)에만 있다.
  const webGLVersion = (engine as { readonly webGLVersion?: number }).webGLVersion ?? 1;
  if (engine.isWebGPU || webGLVersion >= 2) return { supported: true };
  return { supported: false, reasonKo: "OpenPBRMaterial은 WebGL2 이상 또는 WebGPU가 필요합니다(이 엔진은 WebGL1이거나 NullEngine입니다)." };
}

/** IBL Shadows: 엔진 기능 `supportIBLShadows`(WebGL2·WebGPU true, NullEngine·WebGL1 false) + float 렌더 타깃. */
export function iblShadowsSupport(engine: AbstractEngine): BetaSupport {
  if (!engine._features.supportIBLShadows) {
    return { supported: false, reasonKo: "이 엔진은 IBL Shadows를 지원하지 않습니다(복셀 그림자는 WebGL2·WebGPU 전용이고 NullEngine·WebGL1은 불가)." };
  }
  if (engine.getCaps().textureFloatRender !== true) {
    return { supported: false, reasonKo: "IBL Shadows는 float 렌더 타깃(textureFloatRender)이 필요한데 이 엔진은 지원하지 않습니다." };
  }
  return { supported: true };
}
