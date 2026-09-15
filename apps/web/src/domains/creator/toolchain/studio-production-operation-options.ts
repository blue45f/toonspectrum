export type StudioProductionOptionValue = string | number;

interface StudioProductionOptionBase {
  readonly key: string;
  readonly label: string;
  readonly description: string;
}

export interface StudioProductionNumberOption extends StudioProductionOptionBase {
  readonly kind: "number";
  readonly defaultValue: number;
  readonly min: number;
  readonly max: number;
  readonly step: number;
}

export interface StudioProductionTextOption extends StudioProductionOptionBase {
  readonly kind: "text";
  readonly defaultValue: string;
  readonly placeholder?: string;
  readonly maxLength: number;
  readonly pattern?: RegExp;
}

export interface StudioProductionSelectOption extends StudioProductionOptionBase {
  readonly kind: "select";
  readonly defaultValue: StudioProductionOptionValue;
  readonly choices: readonly {
    readonly value: StudioProductionOptionValue;
    readonly label: string;
  }[];
}

export type StudioProductionOptionDescriptor =
  | StudioProductionNumberOption
  | StudioProductionTextOption
  | StudioProductionSelectOption;

const numberOption = (
  key: string,
  label: string,
  description: string,
  defaultValue: number,
  min: number,
  max: number,
  step: number,
): StudioProductionNumberOption => Object.freeze({
  kind: "number",
  key,
  label,
  description,
  defaultValue,
  min,
  max,
  step,
});

const textOption = (
  key: string,
  label: string,
  description: string,
  defaultValue: string,
  maxLength: number,
  pattern?: RegExp,
  placeholder?: string,
): StudioProductionTextOption => Object.freeze({
  kind: "text",
  key,
  label,
  description,
  defaultValue,
  maxLength,
  pattern,
  placeholder,
});

const selectOption = (
  key: string,
  label: string,
  description: string,
  defaultValue: StudioProductionOptionValue,
  choices: readonly { readonly value: StudioProductionOptionValue; readonly label: string }[],
): StudioProductionSelectOption => Object.freeze({
  kind: "select",
  key,
  label,
  description,
  defaultValue,
  choices: Object.freeze([...choices]),
});

const OPTIONS: Readonly<Record<string, readonly StudioProductionOptionDescriptor[]>> = Object.freeze({
  "gegl/render-graph": Object.freeze([
    selectOption("operation", "효과", "GEGL allowlist 안에서 최종 효과를 선택합니다.", "gegl:gaussian-blur", [
      { value: "gegl:gaussian-blur", label: "가우시안 블러" },
      { value: "gegl:shadows-highlights", label: "그림자·하이라이트" },
      { value: "gegl:unsharp-mask", label: "언샤프 마스크" },
    ]),
    numberOption("radius", "블러 반경", "가우시안 블러의 표준 편차입니다.", 3, 0, 100, 0.5),
  ]),
  "tesseract/ocr-text": Object.freeze([
    textOption("language", "OCR 언어", "설치된 Tesseract 언어 코드를 +로 연결합니다.", "kor+eng", 80, /^[A-Za-z0-9_+.-]+$/u, "kor+eng"),
    selectOption("pageSegmentation", "페이지 분석", "원고 구조에 맞는 Tesseract PSM을 선택합니다.", 3, [
      { value: 3, label: "자동 페이지 분석" },
      { value: 6, label: "한 덩어리 텍스트" },
      { value: 11, label: "흩어진 텍스트" },
      { value: 12, label: "흩어진 텍스트 + 방향" },
    ]),
  ]),
  "potrace/bitmap-to-svg": Object.freeze([
    numberOption("tolerance", "곡선 허용오차", "작을수록 원본을 세밀하게 따라가며 경로가 늘어납니다.", 0.2, 0, 1, 0.01),
  ]),
  "synfig/render-animation": Object.freeze([
    numberOption("fps", "프레임률", "최종 애니메이션 프레임률입니다.", 24, 1, 120, 1),
  ]),
  "ffmpeg/encode-gif": Object.freeze([
    numberOption("fps", "GIF 프레임률", "용량과 움직임 품질의 균형을 조정합니다.", 12, 1, 30, 1),
  ]),
  "ffmpeg/proxy-video": Object.freeze([
    selectOption("width", "프록시 폭", "편집용 저해상도 영상의 가로 크기입니다.", 1280, [
      { value: 640, label: "640px" },
      { value: 960, label: "960px" },
      { value: 1280, label: "1280px" },
      { value: 1920, label: "1920px" },
    ]),
  ]),
  "ffmpeg/extract-frame": Object.freeze([
    numberOption("seconds", "추출 시각", "영상 시작점부터의 초 단위 위치입니다.", 0, 0, 86_400, 0.1),
  ]),
  "qgis/run-model": Object.freeze([
    textOption("algorithm", "QGIS 알고리즘", "qgis_process에 전달할 검토된 알고리즘 ID입니다.", "native:package", 120, /^[a-z0-9:_-]+$/u, "native:package"),
  ]),
  "espeak-ng/synthesize-wav": Object.freeze([
    textOption("voice", "음성 코드", "설치된 eSpeak NG 음성 코드를 입력합니다.", "ko", 80, /^[A-Za-z0-9_+.-]+$/u, "ko"),
    numberOption("speed", "말하기 속도", "분당 단어 수에 가까운 음성 속도 값입니다.", 175, 80, 450, 5),
  ]),
  "rubberband/time-stretch": Object.freeze([
    numberOption("ratio", "시간 배율", "1보다 크면 길어지고 작으면 짧아집니다.", 1, 0.25, 4, 0.05),
  ]),
  "rubberband/pitch-shift": Object.freeze([
    numberOption("semitones", "반음 이동", "음높이를 반음 단위로 이동합니다.", 0, -24, 24, 1),
  ]),
});

function operationKey(toolId: string, operationId: string): string {
  return `${toolId}/${operationId}`;
}

export function studioProductionOperationOptions(
  toolId: string,
  operationId: string,
): readonly StudioProductionOptionDescriptor[] {
  const direct = OPTIONS[operationKey(toolId, operationId)];
  if (direct) return direct;
  if (toolId === "tesseract") return OPTIONS["tesseract/ocr-text"] ?? Object.freeze([]);
  return Object.freeze([]);
}

export function defaultStudioProductionOperationOptions(
  toolId: string,
  operationId: string,
): Readonly<Record<string, StudioProductionOptionValue>> {
  return Object.freeze(Object.fromEntries(
    studioProductionOperationOptions(toolId, operationId).map((option) => [
      option.key,
      option.defaultValue,
    ]),
  ));
}

export function validateStudioProductionOperationOptions(
  toolId: string,
  operationId: string,
  value: Readonly<Record<string, StudioProductionOptionValue>>,
): Readonly<Record<string, StudioProductionOptionValue>> {
  const descriptors = studioProductionOperationOptions(toolId, operationId);
  const result: Record<string, StudioProductionOptionValue> = {};
  for (const descriptor of descriptors) {
    const current = value[descriptor.key] ?? descriptor.defaultValue;
    if (descriptor.kind === "number") {
      const number = Number(current);
      if (!Number.isFinite(number) || number < descriptor.min || number > descriptor.max) {
        throw new Error(`${descriptor.label} 값은 ${descriptor.min}~${descriptor.max} 범위여야 합니다.`);
      }
      result[descriptor.key] = number;
      continue;
    }
    if (descriptor.kind === "text") {
      const text = String(current).trim();
      if (!text || text.length > descriptor.maxLength || (descriptor.pattern && !descriptor.pattern.test(text))) {
        throw new Error(`${descriptor.label} 값을 확인하세요.`);
      }
      result[descriptor.key] = text;
      continue;
    }
    const choice = descriptor.choices.find(({ value: choiceValue }) => String(choiceValue) === String(current));
    if (!choice) throw new Error(`${descriptor.label} 선택값을 확인하세요.`);
    result[descriptor.key] = choice.value;
  }
  return Object.freeze(result);
}

export function mergeStudioProductionOperationOptions(
  toolId: string,
  operationId: string,
  advanced: Readonly<Record<string, unknown>>,
  quick: Readonly<Record<string, StudioProductionOptionValue>>,
): Readonly<Record<string, unknown>> {
  return Object.freeze({
    ...advanced,
    ...validateStudioProductionOperationOptions(toolId, operationId, quick),
  });
}
