# Studio 대사 다국어 번역(BYOK) — StudioPage.tsx 통합 설계

> 이 문서만 작성 대상이다 — **이 세션에서는 새 파일을 만들지도, `StudioPage.tsx`/`studio-ai-client.ts`를
> 수정하지도 않았다.** 순수 설계 문서이며, 아래는 후속 구현·통합 패스가 정확히 어떤 파일을 어떤
> 데이터 모델로 만들고 기존 파일 어디에 무엇을 넣어야 하는지에 대한 지시서다. 라인 번호는 이 문서
> 작성 시점(`StudioPage.tsx` 15,050줄) 기준이며, 이 저장소는 병렬 세션이 `StudioPage.tsx`를 동시에
> 건드릴 수 있어 통합 시점엔 몇 줄 어긋나 있을 수 있다 — 각 항목의 "앵커 텍스트"(정확히 일치해야
> 하는 기존 코드 조각)로 검색해 위치를 재확인할 것.
>
> **선행 조건**: 이 기능은 `docs/studio-ai-assist-integration.md`가 먼저(또는 같은 패스에서 함께)
> 통합되어 있어야 한다 — `aiSettings`/`updateAiSettings`/`isStudioAiConfigured`/`runWithAiNotice`가
> 이미 `StudioPage.tsx`에 존재한다는 전제로 앵커를 잡는다. 아직 안 됐다면 그 문서를 먼저 적용할 것.

## 0. 배경 — 왜 이 기능인가, 무엇이 겹치지 않는가

WEBTOON이 2026년 실제로 출시한 AI 번역 프로그램(techbuzz.ai·screenrant.com·cbr.com·awn.com 교차 확인)은
"텍스트 레이어만 번역하고 그림은 건드리지 않는" 도구다. 이 앱엔 이미 5차 배치의 BYOK AI 어시스트
3종(배경 생성·자동 채색·장면 구성 제안, `studio-ai-client.ts`)이 있지만 **번역 기능은 없다** —
이번 갭은 그 4번째 BYOK 기능이다.

기존 `studio-dialogue-batch.ts`(코미포식 "배치된 대사 일괄 편집")가 이미 캔버스의 bubble/text 요소를
페이지 순서대로 목록화하는 `collectDialogueItems`를 갖고 있다 — 이 갭은 **그 목록화 로직을 그대로
재사용**하고, "찾아바꾸기"였던 후속 동작을 "AI 번역 생성 → 검토 → 적용"으로 바꾼 것이다. find/replace와
번역은 둘 다 "문서 전체 대사 텍스트를 일괄 패치하고 단일 히스토리 커밋으로 남긴다"는 동일한 뼈대를
공유하지만, UI/워크플로가 뚜렷이 달라(BYOK 설정 의존, 언어별 결과 보관, 생성 전 미리보기가 아니라
생성 후 검토) `StudioDialogueBatchPanel.tsx`에 얹지 않고 **별도 패널**로 분리한다(§5-1 근거 상세).

## 1. 새로 만들 파일

### 1.1 `src/domains/creator/studio-dialogue-translate.ts` (순수 로직, DOM/React/Konva 의존 없음)

`studio-dialogue-batch.ts`의 `collectDialogueItems`/`DialogueBatchItem`/`isDialogueElement`을 값
그대로 재사용(재구현하지 않음)한다. 이 파일이 새로 추가하는 것은 "번역 결과를 페이지별로 보관하고,
활성 언어를 캔버스 텍스트에 반영하는" 계층이다.

```ts
import { isDialogueElement, type DialogueBatchItem, type DialoguePageLike } from "./studio-dialogue-batch";

// ── 로케일 ────────────────────────────────────────────────────────────────
/** 원문(번역 이전 원본 텍스트)을 가리키는 예약 로케일 키. 사용자에게 노출 시 "원문"으로 표시. */
export const SOURCE_LOCALE = "source";

export interface LocalePreset { code: string; label: string }
/** UI 드롭다운의 기본 제시 목록 — 자유 입력(커스텀 코드)도 항상 허용한다(select+직접입력 병행,
 *  studio-ai-client.ts의 imageModel/textModel 자유 텍스트 입력과 동일 관례). */
export const DIALOGUE_LOCALE_PRESETS: LocalePreset[] = [
  { code: "en", label: "영어" },
  { code: "ja", label: "일본어" },
  { code: "zh-Hans", label: "중국어(간체)" },
  { code: "zh-Hant", label: "중국어(번체)" },
  { code: "es", label: "스페인어" },
  { code: "th", label: "태국어" },
  { code: "id", label: "인도네시아어" },
  { code: "fr", label: "프랑스어" },
];
export function localeLabel(code: string): string {
  return DIALOGUE_LOCALE_PRESETS.find((p) => p.code === code)?.label ?? code;
}

// ── 데이터 모델 ───────────────────────────────────────────────────────────
/** elementId → localeCode(SOURCE_LOCALE 포함) → 텍스트. PageState.dialogueI18n에 그대로 저장. */
export type DialogueLocaleMap = Record<string, Record<string, string>>;

/** studio-dialogue-batch.DialoguePageLike + 번역 저장소. StudioPage의 PageState가 구조적으로
 *  만족한다(§2 참고, 별도 캐스팅/변환 불필요). */
export interface DialogueTranslatePageLike extends DialoguePageLike {
  dialogueI18n?: DialogueLocaleMap;
}

/** 생성 결과 1건 — 어느 페이지 소속인지 함께 들고 있어야 applyDialogueTranslations가 페이지를
 *  다시 찾아 순회하지 않아도 된다(collectDialogueItems 결과의 pageId를 그대로 흘려보냄). */
export interface DialogueTranslationResultItem { id: string; pageId: string; text: string }

// ── 청크 분할(비용/지연 상한) ────────────────────────────────────────────
export interface ChunkOptions { maxItems?: number; maxChars?: number }
/** 대사 항목을 항목수/문자수 상한 중 먼저 닿는 기준으로 청크로 나눈다(순수·결정적).
 *  기본 maxItems=40, maxChars=6000 — 페이지 수백 개짜리 문서도 유한한 청크로 끊어 순차 요청한다. */
export function chunkDialogueItemsForTranslation(
  items: readonly DialogueBatchItem[],
  opts?: ChunkOptions
): DialogueBatchItem[][];

// ── 프롬프트 구성(순수 — fetch 없음, studio-ai-client.ts가 호출) ─────────
/** 시스템/유저 메시지 쌍을 만든다. 유저 메시지엔 각 항목을 `{"id":"...","text":"..."}` 형태로 나열해
 *  모델이 같은 id로 응답하게 강제한다(파싱 안정성). glossary(용어집)는 "이름: 번역" 자유 텍스트를
 *  그대로 시스템 프롬프트에 삽입한다(별도 파싱 없음 — 사용자가 원하는 형식으로 적어도 모델이
 *  맥락으로 활용하게 둔다). */
export function buildTranslationPrompt(
  items: readonly DialogueBatchItem[],
  targetLocaleLabel: string,
  glossary: string
): { system: string; user: string };

// ── 응답 파싱(순수 — 방어적) ──────────────────────────────────────────────
/** 모델 응답(자유 텍스트, 코드펜스·설명 섞여 있을 수 있음)에서 첫 `[...]` JSON 배열만 뽑아
 *  `{id,text}[]`로 파싱한다. expectedIds에 없는 id는 무시(환각 방어), 파싱 자체가 실패하면
 *  ok:false. **부분 성공은 실패로 취급하지 않는다** — 일부 id만 와도 그만큼만 반영하고 나머지는
 *  "다음 생성에서 재시도 가능"으로 안내한다(정직성 규약, studio-svg-export.ts의 skipped 목록과 같은
 *  태도). */
export function parseTranslationResponse(
  raw: string,
  expectedIds: readonly string[]
): { ok: true; translations: Map<string, string> } | { ok: false; error: string };

// ── 병합·전환(순수, 입력 배열 불변 — studio-dialogue-batch.ts와 동일 규율) ─
/** 번역 결과를 페이지의 dialogueI18n에 병합한다. 대상 요소에 dialogueI18n 엔트리가 아직 없으면
 *  이 요소의 **현재 el.text**(호출 시점 캔버스 텍스트, 즉 원문)를 SOURCE_LOCALE로 함께 시딩한다
 *  (그래야 나중에 "원문 보기"가 항상 가능 — 첫 번역 그 순간의 원문만 스냅샷하면 충분하고, 매
 *  프로젝트에 미리 원문 사본을 만들어 두는 낭비를 피한다). el.text 자체는 바꾸지 않는다(활성
 *  로케일 전환은 별도 단계 — switchDialogueLocale). 변경 없는 페이지는 참조 유지. */
export function applyDialogueTranslations<P extends DialogueTranslatePageLike>(
  pages: readonly P[],
  results: readonly DialogueTranslationResultItem[],
  locale: string
): readonly P[];

/** 문서 전체에서 dialogueI18n[el.id]?.[locale]이 있는 요소만 el.text를 그 값으로 바꾼다.
 *  **해당 로케일 번역이 없는 요소는 그대로 둔다**(부분 번역이 나머지를 빈 텍스트로 지우지 않음 —
 *  정직성 규약). locale===SOURCE_LOCALE이면 원문으로 되돌리는 동작이 된다(대칭적으로 동일 함수). */
export function switchDialogueLocale<P extends DialogueTranslatePageLike>(
  pages: readonly P[],
  locale: string
): readonly P[];

// ── 통계(패널 배지용) ──────────────────────────────────────────────────────
/** 문서 전체에 하나라도 존재하는 로케일 코드 목록(SOURCE_LOCALE 제외, 등장 순서). */
export function dialogueLocalesForPages(pages: readonly DialogueTranslatePageLike[]): string[];
/** 해당 로케일의 번역 커버리지 — { total: 전체 대사 요소 수, translated: 그중 번역 보유 수 }. */
export function dialogueTranslationCoverage(
  pages: readonly DialogueTranslatePageLike[],
  locale: string
): { total: number; translated: number };
```

**불변식(studio-dialogue-batch.ts와 동일 규율 승계)**: 입력 `pages`/`elements` 배열은 절대 변형하지
않는다. 바뀐 페이지·요소만 새 객체를 만들고, 실질적으로 바뀐 게 없으면 입력 참조를 그대로 반환한다
(`applyReplacePlanToPages`/`applyDialogueTextEdit`와 동일한 "no-op 시 참조 동일" 관례 — 호출부가
`next !== pages`로 불필요한 히스토리 커밋을 피할 수 있다).

### 1.2 `src/domains/creator/studio-dialogue-translate.test.ts` (계획 — 실제 구현 시 작성)

vitest, `studio-dialogue-batch.test.ts`/`studio-ai-client.test.ts`와 동일한 스타일. 계획된 케이스:

- `chunkDialogueItemsForTranslation`: 빈 배열 → `[]`; maxItems 경계(정확히 40개 → 청크 1개, 41개 →
  2개); maxChars 경계(항목당 text가 길면 항목수보다 먼저 잘림); 원본 아이템 순서·내용 보존(재조립하면
  원본과 동일).
- `buildTranslationPrompt`: 시스템 프롬프트에 targetLocaleLabel·glossary가 포함됨; 유저 메시지가
  유효한 JSON 배열 리터럴을 포함(각 항목 id/text 매칭); glossary 빈 문자열이면 관련 문구 생략.
- `parseTranslationResponse`: 정상 JSON 배열 → 전부 매핑; 코드펜스(\`\`\`json ... \`\`\`)로 감싼 응답도
  파싱; 존재하지 않는 id 무시(환각 방어); 배열이 아예 없는 텍스트 → `ok:false`; 부분(일부 id만) 응답 →
  `ok:true`이고 나머지는 Map에 없음.
- `applyDialogueTranslations`: 신규 병합 시 SOURCE_LOCALE 자동 시딩; 이미 SOURCE_LOCALE 있으면
  재시딩하지 않음(최초 스냅샷 보존); 대상 없는 페이지는 참조 동일 유지; 여러 로케일 반복 적용해도
  기존 로케일 데이터 보존(병합이지 교체가 아님).
- `switchDialogueLocale`: 번역 있는 요소만 el.text 교체, 없는 요소는 원문 그대로; `SOURCE_LOCALE`로
  전환 시 원문 복원; 존재하지 않는 로케일 지정 시 전체 참조 동일(no-op) 반환.
- `dialogueLocalesForPages`/`dialogueTranslationCoverage`: 빈 문서 → `[]`/`{total:0,translated:0}`;
  여러 페이지에 흩어진 동일 로케일 카운트 합산.

## 2. 데이터 모델 — `PageState` 확장 (StudioPage.tsx)

**앵커**: `PageState` 인터페이스(2857~2871행 부근). 현재:

```ts
interface PageState {
  id: string;
  elements: El[];
  bg: string;
  bgGrad: string[] | null;
  canvasH: number;
  grade?: PageGrade;
  groups?: LayerGroup[];
  animTimeline?: AnimationTimelineDoc;
  name?: string;
  note?: string;
  hideMaster?: boolean;
  shotType?: string;
  cameraAngle?: string;
}
```

필드 하나만 추가(기존 필드는 전부 그대로):

```ts
  cameraAngle?: string; // 카메라 앵글(로우/하이/더치 등) — studio-panel-shot-tags 관리. 미설정=태그 없음(빈 값 저장 시 키 제거).
  dialogueI18n?: DialogueLocaleMap; // 대사 번역 저장소(studio-dialogue-translate) — elId→로케일→텍스트. 미설정=번역 없음(기존 문서 100% 호환).
```

`PageState`는 이미 `{ id, elements: El[], groups?: LayerGroup[] }`를 갖고 있어 `dialogueI18n?`만
추가하면 `DialogueTranslatePageLike`를 **캐스팅 없이 구조적으로 만족**한다(기존 `ThumbPageLike`/
`DialoguePageLike`가 이미 같은 방식으로 만족되는 것과 동일).

`El` 타입(1047행) 자체는 수정하지 않는다 — 번역은 요소 필드가 아니라 페이지 단위 사이드 저장소로
관리된다(el.text는 여전히 "현재 화면에 보이는 언어"만 담고, 다른 언어 텍스트는 dialogueI18n에만
존재 — 캔버스 렌더 루프·SVG/PSD 내보내기·PDF 콘택트시트 등 el.text를 읽는 기존 코드 전부가
**전혀 수정 없이** 그대로 "지금 활성화된 로케일" 기준으로 동작한다).

## 3. 기존 파일 확장 — `studio-ai-client.ts`

기존 파일은 "3개 기능별 얇은 래퍼"(배경 생성·자동 채색·장면 구성 제안)를 갖고 있다. 4번째 래퍼를
같은 자리(파일 하단, `suggestSceneComposition` 다음)에 추가한다.

**앵커**: `suggestSceneComposition` 함수가 끝나는 지점(파일 마지막 `}`, 386행 부근) 다음.

```ts
import { buildTranslationPrompt, parseTranslationResponse } from "./studio-dialogue-translate";
// (파일 상단 import 블록에 추가)

/**
 * (4) 대사 번역 — 말풍선/텍스트 요소 배치(청크 1개 분량)를 OpenAI Chat Completions 형태 API로 보내
 * 대상 언어로 번역한 결과를 받는다. 기능(3)의 SCENE_COMPOSITION_SYSTEM_PROMPT와 동일하게 프롬프트
 * 구성은 studio-dialogue-translate.ts(순수·단위테스트 가능)에 맡기고, 이 함수는 fetch 오케스트레이션만
 * 담당한다(studio-ai-client.ts의 "얇은 래퍼" 성격 유지 — 파싱 실패해도 throw하지 않고 StudioAiResult로
 * 감싼다는 계약은 동일).
 */
export async function translateDialogueBatch(
  settings: StudioAiSettings,
  items: { id: string; text: string }[],
  targetLocaleLabel: string,
  glossary: string
): Promise<StudioAiResult<{ translations: { id: string; text: string }[] }>> {
  if (items.length === 0) return { ok: false, code: "invalid_input", error: "번역할 대사가 없습니다." };
  if (!isStudioAiConfigured(settings)) {
    return { ok: false, code: "not_configured", error: "설정에서 API 키를 등록하세요." };
  }
  // DialogueBatchItem 전체가 아니라 {id,text}만 받는다 — studio-dialogue-translate와의 결합을
  // "번역에 실제로 필요한 최소 필드"로 좁혀 이 함수의 테스트가 DialogueBatchItem 목업을 몰라도 되게 한다.
  const { system, user } = buildTranslationPrompt(
    items.map((it) => ({ id: it.id, text: it.text }) as DialogueBatchItem),
    targetLocaleLabel,
    glossary
  );
  const url = buildUrl(settings.baseUrl, settings.chatCompletionsPath);
  const result = await postJson(url, settings.apiKey, {
    model: settings.textModel,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    temperature: 0.3, // 창작적 변주보다 일관된 번역이 목적 — 장면 구성 제안(0.7)보다 낮춘다.
    max_tokens: Math.max(400, items.length * 120),
  });
  if (!result.ok) return result;
  const content = extractFirstChatContent(result.data);
  if (!content) return { ok: false, code: "parse_error", error: "응답에서 번역 텍스트를 찾을 수 없습니다." };
  const parsed = parseTranslationResponse(content, items.map((it) => it.id));
  if (!parsed.ok) return { ok: false, code: "parse_error", error: parsed.error };
  return {
    ok: true,
    data: { translations: [...parsed.translations].map(([id, text]) => ({ id, text })) },
  };
}
```

> `buildTranslationPrompt`가 `DialogueBatchItem`(pageId/pageIndex/elType/variant/hidden/locked 포함)을
> 요구하는 타입이라 위 스니펫처럼 얇은 `{id,text}`를 캐스팅해 넘긴다 — 실제 구현 시
> `buildTranslationPrompt`의 매개변수 타입을 `Pick<DialogueBatchItem, "id" | "text">[]`로 좁혀 이
> 캐스팅 자체를 없애는 편이 더 깔끔하다(설계 의도이며, 구현 패스가 그대로 반영해도 된다).

## 4. `StudioPage.tsx`에 추가할 것

### 4-1. import — 값 import 블록에 추가. 앵커: AI 어시스트 통합(`docs/studio-ai-assist-integration.md`
§2-1)이 넣은 `from "./studio-ai-client"` import 바로 다음 줄(아직 안 넣었다면 `ClipMaskGroup` import
다음).

```ts
import {
  translateDialogueBatch, // studio-ai-client.ts에 추가된 4번째 래퍼
  // ...기존 3개 그대로...
} from "./studio-ai-client";
import {
  applyDialogueTranslations,
  chunkDialogueItemsForTranslation,
  dialogueLocalesForPages,
  dialogueTranslationCoverage,
  localeLabel,
  switchDialogueLocale,
  DIALOGUE_LOCALE_PRESETS,
  SOURCE_LOCALE,
} from "./studio-dialogue-translate";
```

### 4-2. 지연(lazy) 패널 import — `StudioBrushLibraryPanel` lazyRetry 블록 바로 다음, `function
loadStudioReferencePanel()` 앞. 앵커(630~636행 부근):

```ts
const StudioBrushLibraryPanel = lazyRetry(
  () => import("./StudioBrushLibraryPanel").then((mod) => ({ default: mod.StudioBrushLibraryPanel })),
  "StudioBrushLibraryPanel"
);
const StudioDialogueTranslatePanel = lazyRetry(       // ← 추가
  () => import("./StudioDialogueTranslatePanel").then((mod) => ({ default: mod.StudioDialogueTranslatePanel })),
  "StudioDialogueTranslatePanel"
);
function loadStudioReferencePanel() {
```

### 4-3. 상태 훅 — `dialogueBatchOpen` 선언 바로 다음에 삽입. 앵커: `const [dialogueBatchOpen,
setDialogueBatchOpen] = useState(false);`(3004행 부근).

```ts
const [dialogueBatchOpen, setDialogueBatchOpen] = useState(false);
// 대사 번역(BYOK) — studio-dialogue-translate.ts 통합 상태.
const [dialogueTranslateOpen, setDialogueTranslateOpen] = useState(false);
// 문서 전체에 지금 "표시 중"인 로케일 — SOURCE_LOCALE(원문)이 기본. switchDialogueLocale로만 바뀐다.
const [activeDialogueLocale, setActiveDialogueLocale] = useState<string>(SOURCE_LOCALE);
const [translateTargetLocale, setTranslateTargetLocale] = useState<string>(DIALOGUE_LOCALE_PRESETS[0].code);
const [translateGlossary, setTranslateGlossary] = useState("");
const [translateBusy, setTranslateBusy] = useState(false);
const [translateProgress, setTranslateProgress] = useState<{ done: number; total: number } | null>(null);
const [translateError, setTranslateError] = useState<string | null>(null);
// 생성된 번역 초안 — "적용" 누르기 전까지는 페이지에 반영되지 않는다(검토·개별 수정 가능).
const [translateDraft, setTranslateDraft] = useState<Map<string, string> | null>(null);
```

### 4-4. 오케스트레이션 함수 — 위 상태 블록 바로 다음에 추가.

```ts
// 번역 생성(BYOK 호출, 청크 순차 처리) — 결과는 즉시 반영하지 않고 검토용 draft에만 모아둔다.
// 이미지 생성과 달리 결과가 텍스트라 AI 최초 사용 고지(runWithAiNotice) 대상이 아니다
// (StudioAiCompositionPanel과 동일한 판단 근거 — docs/studio-ai-assist-integration.md §0/§2-6 참고,
// "생성형 AI 이미지"에 한정된 고지이지 텍스트 생성 전반에 대한 고지가 아니다).
async function executeGenerateTranslations() {
  if (translateBusy) return;
  const items = collectDialogueItems(pages); // v1: 항상 문서 전체(스코프 "현재 페이지만"은 없음)
  if (items.length === 0) {
    setTranslateError("번역할 말풍선·텍스트가 없어요.");
    return;
  }
  const chunks = chunkDialogueItemsForTranslation(items);
  setTranslateBusy(true);
  setTranslateError(null);
  setTranslateProgress({ done: 0, total: chunks.length });
  const collected = new Map<string, string>();
  for (const chunk of chunks) {
    const result = await translateDialogueBatch(
      aiSettings,
      chunk.map((it) => ({ id: it.id, text: it.text })),
      localeLabel(translateTargetLocale),
      translateGlossary
    );
    if (!result.ok) {
      setTranslateError(result.error);
      setTranslateBusy(false);
      setTranslateProgress(null);
      return; // 이미 모인 앞 청크 결과는 버린다 — 부분 draft가 혼란을 주지 않게 전부 실패로 취급.
    }
    for (const t of result.data.translations) collected.set(t.id, t.text);
    setTranslateProgress((p) => (p ? { ...p, done: p.done + 1 } : p));
  }
  setTranslateDraft(collected);
  setTranslateBusy(false);
  setTranslateProgress(null);
}

// 검토 화면에서 개별 항목을 손으로 고칠 때(패널의 textarea onChange가 호출).
function patchTranslateDraft(id: string, text: string) {
  setTranslateDraft((prev) => {
    if (!prev) return prev;
    const next = new Map(prev);
    next.set(id, text);
    return next;
  });
}

// "적용" — dialogueI18n 병합 + 활성 로케일 전환을 단일 히스토리 커밋(⌘Z 1회)으로 실행.
function applyTranslationDraft() {
  if (!translateDraft || translateDraft.size === 0) return;
  const results = collectDialogueItems(pages)
    .filter((it) => translateDraft.has(it.id))
    .map((it) => ({ id: it.id, pageId: it.pageId, text: translateDraft.get(it.id)! }));
  const withTranslations = applyDialogueTranslations(pages, results, translateTargetLocale);
  const switched = switchDialogueLocale(withTranslations, translateTargetLocale);
  if (switched !== pages) commitPages(switched as PageState[]);
  setActiveDialogueLocale(translateTargetLocale);
  setTranslateDraft(null);
}

// 이미 번역된 로케일 사이를 재생성 없이 토글(패널의 로케일 칩 클릭).
function switchToDialogueLocale(locale: string) {
  const next = switchDialogueLocale(pages, locale);
  if (next !== pages) commitPages(next as PageState[]);
  setActiveDialogueLocale(locale);
}
```

### 4-5. 툴바 진입점 — "말풍선" 메뉴 팝오버 안, 기존 "배치된 대사 일괄 편집…" 버튼 바로 다음.

**앵커**(8867~8876행 부근):

```tsx
                <button
                  type="button"
                  onClick={() => {
                    setMenu(null);
                    setDialogueBatchOpen(true);
                  }}
                  className="mt-1.5 w-full rounded-lg border border-line bg-card py-1.5 text-xs font-medium text-fg-2 transition-colors hover:bg-raised"
                >
                  배치된 대사 일괄 편집…
                </button>
```

바로 다음에 추가:

```tsx
                <button
                  type="button"
                  onClick={() => {
                    setMenu(null);
                    setDialogueBatchOpen(false); // 우상단 위치가 겹치므로 다른 플로팅 패널은 닫는다.
                    setDialogueTranslateOpen(true);
                  }}
                  className="mt-1.5 w-full rounded-lg border border-line bg-card py-1.5 text-xs font-medium text-fg-2 transition-colors hover:bg-raised"
                >
                  대사 번역(내 API 키)…
                </button>
```

이 버튼은 기존 "배치된 대사 일괄 편집…"과 동일하게 텍스트 전용이라 `StudioPage.tsx`의
lucide-react import 블록에 새 아이콘을 추가할 필요가 없다(`Languages` 아이콘을 쓰고 싶다면
`StudioDialogueTranslatePanel.tsx` 자신의 헤더 안에서만 import하면 충분 — 그 파일은
`StudioPage.tsx`와 별도의 import 스코프를 갖는다).

### 4-6. 패널 마운트 — 기존 `{dialogueBatchOpen && (...)}` 블록 바로 다음.

**앵커**(11454~11466행 부근):

```tsx
          {dialogueBatchOpen && (
            <Suspense fallback={null}>
              <StudioDialogueBatchPanel
                pages={pages}
                currentPageId={activePage.id}
                selectedId={selectedId}
                onClose={() => setDialogueBatchOpen(false)}
                onSelectElement={selectDialogueElement}
                onPatchText={patchDialogueText}
                onApplyReplace={applyDialogueReplacePlan}
              />
            </Suspense>
          )}
```

바로 다음에 추가:

```tsx
          {dialogueTranslateOpen && (
            <Suspense fallback={null}>
              <StudioDialogueTranslatePanel
                pages={pages}
                configured={isStudioAiConfigured(aiSettings)}
                activeLocale={activeDialogueLocale}
                availableLocales={dialogueLocalesForPages(pages)}
                coverageFor={(locale) => dialogueTranslationCoverage(pages, locale)}
                targetLocale={translateTargetLocale}
                onTargetLocaleChange={setTranslateTargetLocale}
                glossary={translateGlossary}
                onGlossaryChange={setTranslateGlossary}
                busy={translateBusy}
                progress={translateProgress}
                error={translateError}
                draft={translateDraft}
                onGenerate={() => void executeGenerateTranslations()}
                onDraftChange={patchTranslateDraft}
                onApplyDraft={applyTranslationDraft}
                onDiscardDraft={() => setTranslateDraft(null)}
                onSwitchLocale={switchToDialogueLocale}
                onClose={() => setDialogueTranslateOpen(false)}
              />
            </Suspense>
          )}
```

## 5. 새 패널 — `src/domains/creator/StudioDialogueTranslatePanel.tsx` (설계, 미구현)

`StudioDialogueBatchPanel.tsx`와 동일한 셸(플로팅 카드, `absolute right-3 top-3`, Esc로 닫힘,
`role`/포커스 관례 동일)을 그대로 복제해 재사용한다. 내부는 두 화면으로 나뉜다(`draft` prop의
유무로 자동 전환 — 별도 탭 상태 불필요):

**A. 생성 화면**(`draft === null`일 때): (1) 대상 언어 select(`DIALOGUE_LOCALE_PRESETS` + "직접 입력"
옵션 → 텍스트 입력으로 전환), (2) 용어집(glossary) textarea("예: 주인공 이름은 항상 'Yuna'로
번역해줘" 같은 자유 텍스트, placeholder로 형식 예시 제공), (3) "번역 생성" 버튼(`configured`
아닐 때 비활성 + `StudioAiCompositionPanel`과 동일한 "API 키를 등록하세요" 안내 문구), (4)
`busy`일 때 `progress`(`{done}/{total} 청크 처리 중`) 표시, (5) `error` 표시.

**B. 검토·적용 화면**(`draft`가 채워지면 자동 전환): `collectDialogueItems`로 만든 목록을
`StudioDialogueBatchPanel`과 같은 "페이지별 그룹 헤더 + 항목 리스트" 레이아웃으로 보여주되, 각 행에
**원문**(el.text, 참고용 읽기전용)과 **번역**(draft에서 가져온 값, `onDraftChange`로 수정 가능한
textarea) 두 칼럼을 나란히 둔다. 상단에 "적용"(`onApplyDraft`) / "취소"(`onDiscardDraft`) 버튼.

**로케일 칩 바**(패널 최상단, 두 화면 공통): "원문"(`SOURCE_LOCALE`) + `availableLocales`(이미 번역
보유한 언어들, `coverageFor(locale)`로 "92%" 같은 커버리지 배지) 칩을 나열, 클릭 시
`onSwitchLocale(code)` — 재생성 없이 이미 만들어진 번역 사이를 즉시 토글한다. `activeLocale`과
일치하는 칩만 강조 표시.

## 6. 정책·스코프 결정 사항

1. **AI 생성형 콘텐츠 최초 사용 고지(`runWithAiNotice`/`AiAssetNotice`) 대상이 아니다.** 결과가
   이미지가 아니라 텍스트이기 때문 — `StudioAiCompositionPanel`(장면 구성 제안)과 완전히 동일한
   판단이다. 통합 패스가 실수로 이 기능을 고지 모달에 태우지 않도록 명시한다.
2. **번역 스코프는 항상 "문서 전체"다(현재 페이지만 옵션 없음).** `studio-dialogue-batch.ts`의
   찾아바꾸기는 "전체/현재 페이지" 스코프를 뒀지만, 번역은 자연스럽게 에피소드 전체를 한 번에
   처리하고 싶은 요구가 강하고(WEBTOON의 실제 기능도 에피소드 단위), 굳이 스코프 선택 UI를 넣어
   복잡도를 늘릴 실익이 적다고 판단했다. 필요해지면 `collectDialogueItems`를 페이지 하나로
   필터링하는 한 줄만 추가하면 된다.
3. **레이아웃/폰트 자동 재조정은 하지 않는다.** 번역문이 원문보다 길어져 말풍선 밖으로 넘쳐도
   이 기능은 텍스트만 바꾼다 — 기존 "말풍선 폰트 자동축소"(5차 배치, `studio-bubble-text-fit.ts`)가
   렌더 시점에 이미 처리하므로 추가 작업이 필요 없다(자동 축소가 이미 있다는 것 자체가 이 스코프
   축소를 안전하게 만든다).
4. **용어집(glossary)은 자유 텍스트다 — 캐릭터 목록에서 자동 추출하지 않는다.** `studio-characters.ts`의
   `CHARACTERS` 배열이 현재 빈 배열(`= []`)이라 자동 추출할 소스 자체가 없다 — 향후 캐릭터 관리
   기능이 생기면 자연스러운 확장 지점이 되겠지만, 이번 스코프에선 사용자가 직접 입력한다.
5. **번역 결과는 요소 필드가 아니라 페이지 사이드 저장소(`dialogueI18n`)에 둔다.** `El` 타입을
   건드리지 않으므로 캔버스 렌더·SVG/PSD/PDF 내보내기 등 el.text를 읽는 기존 코드 전부가
   무수정으로 "현재 활성 로케일"만 신경 쓰면 된다(§2 참고).
6. **PSD/SVG/PDF 등 내보내기 결과물에는 항상 "지금 화면에 보이는 로케일"만 반영된다.** 이는 새 동작이
   아니라 자연스러운 결과다 — 내보내기 모듈들은 전부 `el.text`를 읽고, `el.text`는 로케일 전환
   시에만 바뀌기 때문이다. 별도 "이 언어로 내보내기" 기능은 이번 스코프 밖(원하면 로케일 전환 →
   내보내기를 언어 수만큼 반복하는 수동 워크플로로 충분히 커버됨).

## 7. 이미 있음 / 스코프 밖 (재검토 방지)

- **찾아바꾸기 자체**(`StudioDialogueBatchPanel`) — 이미 구현 완료(경쟁사 1차 배치 인접 기능). 이
  번역 기능은 그 데이터 모델(`collectDialogueItems`)만 재사용하고 UI/워크플로는 별개다.
  일부러 하나로 합치지 않은 이유는 §0 참고.
- **캐릭터 일관성 AI 생성**(레퍼런스 기반 동일 얼굴 유지) — 조사 단계에서 이미 스코프 밖으로
  확정(연구단계 수준 품질 리스크). 번역과 무관.
- **실시간 협업/번역가 초대** — "$0 서버비용" 원칙 위반(서버 세션·권한 관리 필요) — 사용자 승인
  없이는 착수 금지.

## 8. 통합 후 수동 QA 체크리스트

- [ ] "말풍선" 메뉴 → "대사 번역(내 API 키)…" 클릭 → 패널이 열리고(다른 우상단 패널은 닫힘) 생성
      화면이 보인다.
- [ ] API 키 미입력 상태: "번역 생성" 버튼이 비활성화되고 안내 문구가 보인다(네트워크 요청 없음).
- [ ] 대상 언어 + 용어집 입력 → 생성 → 청크가 2개 이상일 만큼 대사가 많은 문서에서 진행률
      (`N/M`)이 올라간다 → 완료 후 검토 화면(원문/번역 나란히)으로 자동 전환된다.
- [ ] 검토 화면에서 번역 한 줄을 손으로 고친 뒤 "적용" → 캔버스의 해당 말풍선 텍스트가 즉시 그
      언어로 바뀐다 → ⌘Z 한 번으로 원문으로 되돌아간다(단일 히스토리 커밋 확인).
- [ ] 로케일 칩 바에서 "원문" ↔ 방금 만든 언어를 번갈아 클릭 → 재생성 없이 즉시 텍스트가 토글된다.
- [ ] 같은 문서에서 두 번째 언어를 생성 → 첫 번째 언어 번역이 사라지지 않고 칩 바에 둘 다 남는다.
- [ ] 번역 없는 로케일(방금 새 말풍선을 추가한 요소)은 로케일 전환 시 원문 그대로 남는다(빈
      텍스트로 지워지지 않음).
- [ ] 브라우저 네트워크 탭에서 요청이 이 앱 서버가 아니라 설정한 baseURL로 직접 나간다(BYOK 원칙
      재검증).
- [ ] PNG/PSD/PDF 내보내기가 "지금 활성 로케일"의 텍스트로 나온다(로케일 전환 후 내보내기 재확인).
