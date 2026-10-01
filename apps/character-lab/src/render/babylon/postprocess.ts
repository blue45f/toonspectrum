/**
 * 후처리 스택: DefaultRenderingPipeline(fxaa·bloom·sharpen·imageProcessing·MSAA) + SSAO2(베타) + TAA(베타).
 * 뷰포트 카메라에만 붙인다(캡처 카메라에는 붙이지 않는다 — 캡처는 lit 패스 원 재질만).
 * 지원하지 않는 엔진(NullEngine·WebGL1)은 unavailable 사유를 남기고 무음으로 넘어가지 않는다.
 */
import { DefaultRenderingPipeline } from "@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline.js";
import { SSAO2RenderingPipeline } from "@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/ssao2RenderingPipeline.js";
import { TAARenderingPipeline } from "@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/taaRenderingPipeline.js";

import { describeDetail } from "../../contracts";
import { featureActive, featureOff, featureUnavailable } from "../scene-features";

import type { ShadingProfile } from "../../contracts";
import type { SceneFeatureState } from "../scene-features";
import type { Camera } from "@babylonjs/core/Cameras/camera.js";
import type { Scene } from "@babylonjs/core/scene.js";

export interface PostProcessStates {
  readonly taa: SceneFeatureState;
  readonly ssao: SceneFeatureState;
  readonly msaa: SceneFeatureState;
}

export interface PostProcessStack {
  apply(postfx: ShadingProfile["postfx"]): void;
  states(): PostProcessStates;
  dispose(): void;
}

export const MSAA_SAMPLES = 4;

export function createPostProcessStack(scene: Scene, camera: Camera): PostProcessStack {
  const engine = scene.getEngine();
  const caps = engine.getCaps();
  const msaa = Math.max(1, Math.min(MSAA_SAMPLES, caps.maxMSAASamples || 1));
  let pipeline: DefaultRenderingPipeline | null = null;
  let pipelineState: SceneFeatureState = featureOff();
  try {
    pipeline = new DefaultRenderingPipeline("cl-default", caps.textureHalfFloatRender === true, scene, [camera]);
    pipeline.samples = msaa;
    pipeline.imageProcessingEnabled = true;
    pipeline.bloomThreshold = 0.85;
    pipeline.bloomWeight = 0.2;
    pipeline.bloomKernel = 48;
    pipelineState = featureActive(`${msaa} 샘플`);
  } catch (error) {
    pipelineState = featureUnavailable(`DefaultRenderingPipeline 생성 실패(${describeDetail(error) ?? "알 수 없는 오류"}).`);
  }

  let ssao: SSAO2RenderingPipeline | null = null;
  let ssaoState: SceneFeatureState = featureOff();
  let taa: TAARenderingPipeline | null = null;
  let taaState: SceneFeatureState = featureOff();

  const setSsao = (enabled: boolean): void => {
    if (!enabled) {
      ssao?.dispose(false);
      ssao = null;
      ssaoState = featureOff();
      return;
    }
    if (ssao) return;
    // IsSupported는 마지막으로 만든 엔진의 기능 표를 본다. 이 장면 엔진의 능력(다중 렌더 타깃·texelFetch)도 함께 확인한다.
    if (!SSAO2RenderingPipeline.IsSupported || caps.drawBuffersExtension !== true || caps.texelFetch !== true) {
      ssaoState = featureUnavailable("SSAO2는 다중 렌더 타깃과 texelFetch가 있는 WebGL2/WebGPU가 필요합니다.");
      return;
    }
    try {
      ssao = new SSAO2RenderingPipeline("cl-ssao", scene, 0.75, [camera]);
      ssao.radius = 0.35;
      ssao.totalStrength = 1;
      ssao.samples = 16;
      ssaoState = featureActive("베타");
    } catch (error) {
      ssao = null;
      ssaoState = featureUnavailable(`SSAO2 생성 실패(${describeDetail(error) ?? "알 수 없는 오류"}).`);
    }
  };

  const setTaa = (enabled: boolean): void => {
    if (!enabled) {
      taa?.dispose();
      taa = null;
      taaState = featureOff();
      return;
    }
    if (taa) return;
    // TAARenderingPipeline.isSupported = caps.texelFetch. 미지원 엔진(NullEngine·WebGL1)에서는 생성자가 반쯤 만든 파이프라인을
    // 돌려주고 dispose가 던지므로 만들기 전에 능력을 확인하고 사유를 남긴다(거짓 active 금지).
    if (caps.texelFetch !== true) {
      taaState = featureUnavailable("TAA는 texelFetch를 지원하는 WebGL2/WebGPU가 필요합니다.");
      return;
    }
    try {
      taa = new TAARenderingPipeline("cl-taa", scene, [camera]);
      taa.samples = 8;
      taa.factor = 0.1;
      taaState = featureActive("베타");
    } catch (error) {
      taa = null;
      taaState = featureUnavailable(`TAA 생성 실패(${describeDetail(error) ?? "알 수 없는 오류"}).`);
    }
  };

  return {
    apply(postfx) {
      if (pipeline) {
        pipeline.fxaaEnabled = postfx.fxaa;
        pipeline.bloomEnabled = postfx.bloom;
        pipeline.sharpenEnabled = postfx.sharpen;
      }
      setSsao(postfx.ssao);
      setTaa(postfx.taa);
    },
    states: () => ({ taa: taaState, ssao: ssaoState, msaa: pipelineState }),
    dispose() {
      setSsao(false);
      setTaa(false);
      pipeline?.dispose();
      pipeline = null;
    },
  };
}
