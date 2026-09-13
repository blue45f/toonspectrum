import { promoZip } from "../promo/promo-zip";
import { sha256HexPortable } from "../studio-sha256";
import { checkConversionAbort, flattenCharacterPng } from "./conversion-browser";
import { QUALITY_PROFILES, validateConversionSettings, validateReferenceSet, type CharacterRender, type ConversionSettings, type PreparedCharacterImage, type ShapeEngine } from "./conversion-contract";
import { buildCharacterImageGraph } from "./conversion-graph";
import runnerSource from "./run-character-ai.py?raw";

export interface CharacterKitInput {
  kind: "shape" | "image"; engine: ShapeEngine; settings: ConversionSettings;
  images: readonly PreparedCharacterImage[]; renders: readonly CharacterRender[];
  modelSha256?: string; camera?: { yaw: number; pitch: number; animationTime: number };
}
const README = `ToonStudio Character AI Kit v1
이 파일은 AI 작업 준비물입니다. 다운로드만으로 추론이 실행되지는 않습니다.
1. 압축을 별도 폴더에 풀고 run-character-ai.py를 검토합니다.
2. 해당 엔진의 공식 환경과 모델을 직접 준비합니다. 자동 설치·유료 API 호출은 없습니다.
3. 폴더에서 python3 run-character-ai.py . --check 로 먼저 검사합니다.
4. 아래 엔진별 실행 후 새 output-* 폴더의 GLB/PNG를 ToonStudio에 가져옵니다.

TripoSR: MIT, 단일 이미지, vertex-color GLB. 자동 리깅/UV/PBR은 제공하지 않습니다.
https://github.com/VAST-AI-Research/TripoSR
https://huggingface.co/stabilityai/TripoSR
공식 저장소 환경에서: python run-character-ai.py KIT_FOLDER --model-dir LOCAL_MODEL_FOLDER --device cpu
설치한 CUDA GPU는 --device cuda 를 명시합니다. MPS 지원은 주장하지 않습니다.
TRELLIS: MIT, 다중 참조 이미지, 텍스처 GLB. Linux/CUDA 환경과 공식 의존성이 필요합니다.
https://github.com/microsoft/TRELLIS
https://huggingface.co/microsoft/TRELLIS-image-large
python run-character-ai.py KIT_FOLDER --model-dir LOCAL_MODEL_FOLDER --device cuda --allow-model-download
TRELLIS의 보조 DINO 모델은 최초 실행 시 다운로드될 수 있어 명시적 동의가 필요합니다.

3D→2D: 로컬 ComfyUI에 SDXL 체크포인트를 설치하고 실행합니다.
python3 run-character-ai.py . --server http://127.0.0.1:8188 --check
python3 run-character-ai.py . --server http://127.0.0.1:8188
선택적 ControlNet은 반드시 SDXL용 depth 모델이어야 합니다. 노드·모델 존재를 전송 전에 검사합니다.
https://docs.comfy.org/tutorials/basic/image-to-image
SDXL 및 선택한 ControlNet의 라이선스는 각각 확인해 주세요. 모델을 이 키트에 포함하지 않습니다.

원본 이미지는 유료 API로 전송하지 않습니다. ComfyUI는 지정한 루프백 서버만 사용합니다.
로컬 추론도 전력·장비·저장 공간을 사용합니다. 클라우드 GPU 무료 제공을 의미하지 않습니다.
다중 뷰에서도 얼굴·뒷면·의상 일치를 보장하지 않습니다. 낮은 denoise와 depth 제어부터 비교하세요.
카메라와 seed를 고정해도 장치·라이브러리가 다르면 결과가 달라질 수 있습니다.
로컬 렌더 PNG는 투명도를 보존하며, AI PNG의 투명도와 자동 리깅은 보장하지 않습니다.
Ctrl+C는 이번 대기 작업만 삭제하며 다른 사용자의 GPU 작업을 전역 중단하지 않습니다.
실행 중이던 ComfyUI 작업은 계속될 수 있습니다. receipt.json의 prompt_id로 확인하세요.
`;
export async function buildCharacterKit(input: CharacterKitInput, signal: AbortSignal): Promise<Uint8Array> {
  validateConversionSettings(input.settings); checkConversionAbort(signal);
  const files: Record<string, string | Uint8Array> = {};
  const checksums: Record<string, string> = {};
  const add = (name: string, value: Uint8Array | string) => { files[name] = value; checksums[name] = sha256HexPortable(typeof value === "string" ? new TextEncoder().encode(value) : value); };
  let views: string[];
  if (input.kind === "shape") {
    validateReferenceSet(input.engine, input.images); views = input.images.map((image) => image.view);
    for (const image of input.images) add(`input/${image.view}.png`, image.png);
  } else {
    if (!input.renders.length || input.renders.length > 4 || new Set(input.renders.map((render) => render.view)).size !== input.renders.length) throw new Error("먼저 3D 렌더 패스를 만들어 주세요.");
    views = input.renders.map((render) => render.view);
    for (const render of input.renders) {
      checkConversionAbort(signal);
      add(`input/${render.view}.png`, await flattenCharacterPng(render.passes.beauty));
      add(`depth/${render.view}.png`, render.passes.depth);
      for (const [pass, png] of Object.entries(render.passes)) add(`passes/${render.view}-${pass}.png`, png);
      add(`workflow/${render.view}.json`, JSON.stringify(buildCharacterImageGraph(input.settings, render.view), null, 2));
    }
  }
  files["manifest.json"] = JSON.stringify({ schema: "toonstudio-character-kit", version: 1, status: "prepared-not-inferred", kind: input.kind, engine: input.kind === "shape" ? input.engine : "comfy-sdxl", settings: input.settings, profile: QUALITY_PROFILES[input.settings.quality], views, checksums, sourceModelSha256: input.modelSha256 ?? null, camera: input.camera ?? null, notes: input.images.flatMap((image) => image.notices) }, null, 2);
  files["README.txt"] = README; files["run-character-ai.py"] = runnerSource;
  checkConversionAbort(signal); return promoZip(files);
}
