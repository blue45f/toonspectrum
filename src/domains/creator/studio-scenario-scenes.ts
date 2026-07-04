/**
 * Studio Scenario Scenes — 시나리오 자동 생성(투닝/투툰/WeToon 벤치마크, docs/studio-competitor-features.md
 * §4 로드맵 참고)의 "장면 분할" 1단계 프롬프트 구성/응답 파싱.
 *
 * 스토리 아이디어 텍스트 하나를 여러 장면(컷)으로 나누는 Chat Completions 호출 1회의 프롬프트와
 * 응답 파싱만 담당한다(순수 — fetch 없음, studio-ai-client.generateScenarioScenes가 실제 호출을
 * 담당). 각 장면의 dialogue 필드는 **새 JSON 스키마를 발명하지 않고**, 기존 "대사 한 번에"(코미포식
 * 말풍선 일괄 삽입) 기능이 이미 파싱하는 미니 문법을 그대로 쓰도록 프롬프트에 명시한다 —
 * studio-dialogue.parseDialogueScript("이름: 대사" 줄 / "(지문)" 줄)가 그대로 이 문자열을 소비한다
 * (studio-scenario-layout.ts가 그 파서를 재사용해 말풍선을 배치 — 이중 구현 없음).
 *
 * 이미지 생성은 이 모듈의 책임이 아니다 — 각 장면의 imagePrompt는 그 장면의 배경/상황/구도 묘사일
 * 뿐이고, 실제 이미지 생성(순차 호출·캐릭터 일관성 유지)은 StudioPage.tsx 오케스트레이션이 담당한다.
 *
 * 응답 파싱은 studio-dialogue-translate.ts의 "코드펜스·설명 문장이 섞여도 JSON 리터럴만 방어적으로
 * 뽑아내는" 전략과 동일 발상이되, 이쪽 최상위는 배열이 아니라 객체({characterDescription, scenes})라
 * 대괄호 대신 중괄호 짝을 맞춰 찾는다.
 */

export interface ScenarioSceneDraft {
  /** 이 장면의 배경·상황·구도 묘사(그림 생성용). 인물 외모 세부묘사는 반복하지 않는다 —
   *  그건 ScenarioScenesPlan.characterDescription 쪽 책임이다. 대사만 있고 배경 지시가 없는
   *  장면은 빈 문자열일 수 있다. */
  imagePrompt: string;
  /** studio-dialogue.parseDialogueScript 호환 미니 문법("이름: 대사" 줄 / "(지문)" 줄, 빈 줄 무시).
   *  대사가 없는 장면(지문 없는 순수 배경 컷)은 빈 문자열. */
  dialogue: string;
}

export interface ScenarioScenesPlan {
  /** 등장인물 외모 공통 묘사(헤어스타일·의상·특징 등 한 문장) — 특정 인물이 없으면 빈 문자열.
   *  첫 장면 이미지 생성 프롬프트에 합쳐져 "기준 캐릭터"의 외모를 확립하는 데 쓰이고, 이후 장면은
   *  그 이미지를 참고로 캐릭터 일관성 생성(generateConsistentCharacterImage)을 탄다. */
  characterDescription: string;
  scenes: ScenarioSceneDraft[];
}

export const SCENARIO_SCENE_COUNT_MIN = 2;
export const SCENARIO_SCENE_COUNT_MAX = 10;

/** 파싱 후 상한 — 모델이 지시를 어기고 수십 개를 반환해도 과금/시간 폭주를 막는다(넘치면 앞에서부터만). */
export const SCENARIO_MAX_PARSED_SCENES = 12;

function isValidSceneCountHint(n: number | undefined): n is number {
  return typeof n === "number" && Number.isFinite(n) && n >= SCENARIO_SCENE_COUNT_MIN && n <= SCENARIO_SCENE_COUNT_MAX;
}

const JSON_SHAPE_EXAMPLE =
  '{"characterDescription":"단발머리 여고생, 교복 차림","scenes":[{"imagePrompt":"아침 등굣길, 골목, 벚꽃","dialogue":"민수: 안녕!\\n(잠시 정적)"}]}';

/**
 * 장면 분할 프롬프트(system/user) — 순수·결정적. sceneCountHint가 유효 범위(2~10)면 "정확히 N개"로,
 * 아니면 스토리 길이에 맞게 3~8개 사이로 자연스럽게 나누라고 지시한다.
 */
export function buildScenarioScenesPrompt(
  storyText: string,
  sceneCountHint?: number
): { system: string; user: string } {
  const countInstruction = isValidSceneCountHint(sceneCountHint)
    ? `정확히 ${Math.round(sceneCountHint)}개의 장면으로 나누세요.`
    : "스토리 길이에 맞게 자연스럽게 3~8개의 장면으로 나누세요.";

  const system = [
    "당신은 한국 웹툰 시나리오 작가입니다. 사용자가 입력한 짧은 스토리 아이디어를 여러 개의 장면(컷)으로 나눕니다.",
    countInstruction,
    "다른 설명이나 마크다운 코드블록 없이, 반드시 아래 예시와 동일한 구조의 JSON 객체 하나만 응답하세요.",
    JSON_SHAPE_EXAMPLE,
    "characterDescription: 이야기에 등장하는 주요 인물의 외모(헤어스타일·의상·특징 등)를 한국어 한 문장으로. 특정 인물이 없으면 빈 문자열.",
    "각 장면의 imagePrompt: 그 장면의 배경·상황·구도를 그림으로 그리기 위한 묘사(인물 외모 묘사는 반복하지 마세요 — 상황·배경 위주).",
    '각 장면의 dialogue: 그 장면 대사를 한 줄에 한 마디씩 "이름: 대사" 형식으로 적으세요(지문·내레이션은 "(지문)"처럼 괄호로 감싸세요). 대사가 없는 장면은 빈 문자열("")로 두세요.',
  ].join("\n");

  return { system, user: storyText.trim() };
}

/** raw 문자열에서 첫 `{` 로 시작해 짝이 맞는(중첩 중괄호를 세어가며 찾은) `}` 까지를 잘라낸다.
 *  코드펜스(```json ... ```)나 앞뒤 설명 문장이 섞여 있어도 객체 부분만 뽑아낸다 — 짝이 맞는 `}` 를
 *  찾지 못하면(잘린 응답 등) null(studio-dialogue-translate.extractJsonArrayLiteral과 동일 전략,
 *  대괄호 대신 중괄호). */
function extractJsonObjectLiteral(raw: string): string | null {
  const start = raw.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  for (let i = start; i < raw.length; i++) {
    if (raw[i] === "{") depth++;
    else if (raw[i] === "}") {
      depth--;
      if (depth === 0) return raw.slice(start, i + 1);
    }
  }
  return null;
}

/**
 * 모델 응답(자유 텍스트, 코드펜스·설명 섞여 있을 수 있음)에서 첫 JSON 객체를 뽑아 ScenarioScenesPlan
 * 으로 파싱한다. 완전히 빈 장면(imagePrompt·dialogue 둘 다 빈 문자열)은 환각 방어로 건너뛴다.
 * 파싱 자체 실패·유효 장면 0개는 ok:false.
 */
export function parseScenarioScenesResponse(
  raw: string
): { ok: true; data: ScenarioScenesPlan } | { ok: false; error: string } {
  const jsonText = extractJsonObjectLiteral(raw);
  if (!jsonText) return { ok: false, error: "응답에서 장면 구성(JSON 객체)을 찾을 수 없습니다." };

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return { ok: false, error: "장면 구성 응답을 해석하지 못했습니다(JSON 형식이 아닙니다)." };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, error: "장면 구성 응답 형식이 올바르지 않습니다(JSON 객체가 아닙니다)." };
  }

  const obj = parsed as Record<string, unknown>;
  const scenesRaw = obj.scenes;
  if (!Array.isArray(scenesRaw) || scenesRaw.length === 0) {
    return { ok: false, error: "장면 구성 응답에 장면(scenes) 목록이 없습니다." };
  }

  const scenes: ScenarioSceneDraft[] = [];
  for (const entry of scenesRaw.slice(0, SCENARIO_MAX_PARSED_SCENES)) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    const imagePrompt = typeof e.imagePrompt === "string" ? e.imagePrompt.trim() : "";
    const dialogue = typeof e.dialogue === "string" ? e.dialogue.trim() : "";
    if (!imagePrompt && !dialogue) continue; // 완전히 빈 장면은 환각으로 간주해 건너뛴다.
    scenes.push({ imagePrompt, dialogue });
  }
  if (scenes.length === 0) {
    return { ok: false, error: "장면 구성 응답에서 유효한 장면을 찾지 못했습니다." };
  }

  const characterDescription = typeof obj.characterDescription === "string" ? obj.characterDescription.trim() : "";
  return { ok: true, data: { characterDescription, scenes } };
}
