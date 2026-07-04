# Studio AI 어시스트(BYOK) — StudioPage.tsx 통합 설계

> 이 문서만 작성 대상이다 — **StudioPage.tsx는 이 세션에서 수정하지 않았다.** 순수 로직/프레젠테이션
> 신규 파일(`studio-ai-client.ts`, `studio-ai-client.test.ts`, `StudioAiSettingsPanel.tsx`,
> `StudioAiBackgroundPanel.tsx`, `StudioAiColorizePanel.tsx`, `StudioAiCompositionPanel.tsx`)만
> 만들었고, 아래는 후속 통합 패스가 정확히 어디에 무엇을 넣어야 하는지에 대한 지시서다. 라인 번호는
> **커밋 `1dcd7b6819ad708564b93ae75f124d53a41bd478` 기준**(이 저장소는 병렬 세션이 `StudioPage.tsx`를
> 동시에 건드릴 수 있어 라인이 밀렸을 수 있다 — 각 절의 "앵커 텍스트"로 실제 위치를 다시 찾아라).

## 0. 배경 — BYOK(Bring Your Own Key) 원칙과 기존 기능과의 관계

사용자가 명시적으로 지시한 제약:

1. **특정 AI 벤더 종속 금지** — OpenAI Chat Completions / Images(Generations·Edits) API와 "호환되는"
   엔드포인트라면 무엇이든 붙을 수 있게, baseURL + apiKey를 사용자가 직접 입력한다.
2. **API 키는 서버로 절대 전송하지 않는다** — `localStorage`에만 저장하고, 브라우저 →
   AI 제공자로 직접 `fetch`한다(이 앱 백엔드를 거치지 않음 — "$0 서버비용" 원칙과 일치).
3. **키 미설정 시 에러가 아니라 "설정 필요" 안내** — 버튼이 비활성화되고, fetch 자체가 나가지
   않는다.

**중요 — 기존 "AI 에셋 생성" 기능과는 완전히 별개의 독립 경로다.** `StudioPage.tsx`에는 이미
`onGenerateAsset`(4601행 부근, `assetPrompt`/`assetGenerating` 상태, `StudioAssetMenuPanel`의
"내 에셋 > AI 에셋 생성" 탭)이 있는데, 이건 `src/infrastructure/creator-client.ts`의 `generateAsset`을
통해 **이 앱의 NestJS 백엔드가 서버 보유 키로 대신 호출**하는(로그인 필요, 서버가 비용을 대납하는)
유료 기능이다. 이번 BYOK 기능은 로그인 불필요·사용자가 자기 키로 직접 호출하는 완전히 다른 경로이니
통합 시 두 경로를 섞거나 재사용하지 않는다. 다만 **"생성형 AI 최초 사용 고지" 모달(`aiNoticeOpen`/
`AiAssetNotice`/`readAiNoticeAck`/`storeAiNoticeAck`, 1256~1276행·1990행)은 공유한다** — 이미지를
생성한다는 정책적 의미는 두 경로 다 동일하기 때문이다(§2-4 참고).

## 1. 새로 만든 파일

- `src/domains/creator/studio-ai-client.ts` — 순수 로직(DOM/Konva 의존 없음). 설정 저장/조회
  (`loadStudioAiSettings`/`saveStudioAiSettings`/`isStudioAiConfigured`), fetch 래퍼, 3개 기능별
  래퍼 함수(`generateBackgroundImage`/`colorizeLineArt`/`suggestSceneComposition`), 연결 테스트
  (`testAiConnection`). 모든 async 함수는 **throw하지 않고** `StudioAiResult<T>`(`{ok:true,data}` /
  `{ok:false,code,error}`)를 resolve한다 — 키 미설정·빈 입력은 fetch를 호출하지 않고 즉시
  `ok:false`를 반환한다.
- `src/domains/creator/studio-ai-client.test.ts` — 24개 유닛 테스트, 전부 통과
  (`npx vitest run src/domains/creator/studio-ai-client.test.ts`). fetch는 전부 모킹(실제 네트워크
  호출 없음) — 키 없을 때 호출 자체가 안 나가는지, 키 있을 때 정확한 URL/헤더/바디로 나가는지,
  응답(b64_json/chat content) 파싱이 올바른지, 4xx/5xx·네트워크 예외·JSON 아닌 응답 각각의 에러
  코드를 검증한다.
- `src/domains/creator/StudioAiSettingsPanel.tsx` — 설정 UI(baseURL·API 키·이미지/텍스트 모델·고급
  경로 override·테스트 버튼). **완전히 제어되는(controlled) 패널**이다(`settings`+`onChange` prop) —
  이유는 §2-2 참고.
- `src/domains/creator/StudioAiBackgroundPanel.tsx` — 배경 생성 UI(프롬프트 textarea + 크기 선택 +
  생성 버튼). prompt/size/busy/error 전부 prop(부모가 소유).
- `src/domains/creator/StudioAiColorizePanel.tsx` — 자동 채색 UI(프롬프트 입력 + 채색 버튼). 역시
  전부 prop.
- `src/domains/creator/StudioAiCompositionPanel.tsx` — 장면 구성 제안 UI. **자기완결형**이다(local
  `useState`로 sceneText/busy/error/suggestion 소유) — 결과가 이미지가 아니라 텍스트라 AI 고지
  대상이 아니고, 캔버스 상태에도 개입하지 않아 부모와 공유할 상태가 없기 때문(§5-3 참고).

전부 이 상태(기존 파일 무수정)에서 `npx tsc --noEmit -p .`/`npx eslint`/`npx vitest run
src/domains/creator/studio-ai-client.test.ts` 클린 통과했다.

## 2. `StudioPage.tsx`에 추가할 것

### 2-1. import — 값 import(파일 최상단 값-import 블록, `ClipMaskGroup` 바로 다음이자
`studio-alpha-lock` 바로 앞 — 알파벳순 "ai" < "al"). 앵커: `import { ClipMaskGroup } from
"./ClipMaskGroup";` 바로 다음 줄.

```ts
import {
  colorizeLineArt,
  DEFAULT_STUDIO_AI_IMAGE_SIZE,
  generateBackgroundImage,
  isStudioAiConfigured,
  loadStudioAiSettings,
  saveStudioAiSettings,
  suggestSceneComposition,
  type StudioAiImageSize,
  type StudioAiSettings,
} from "./studio-ai-client";
```

(`testAiConnection`은 `StudioPage.tsx`가 직접 호출하지 않는다 — `StudioAiSettingsPanel`이 내부에서
호출하므로 여기 import할 필요 없다.)

### 2-2. 상태 훅 — 기존 "에셋 라이브러리 고도화 상태 및 함수" 블록의 `aiNoticeOpen` 선언 바로 다음에
삽입. 앵커: `const [aiNoticeOpen, setAiNoticeOpen] = useState(false);` 다음 줄(`async function
handleRenameAsset` 앞).

```ts
// AI 어시스트(BYOK) — studio-ai-client.ts 통합 상태. aiSettings는 이 컴포넌트가 유일하게 소유하는
// "단일 진실 공급원"이다 — 설정/배경/채색 패널 셋 다 이 값을 prop으로만 받는다. 각 패널이 마운트
// 시점에 localStorage를 개별로 읽게 하면, 같은 "AI 어시스트" 팝오버 안에서 설정 패널에 방금 입력한
// 키를 배경 생성 패널이 못 보는 stale-read 문제가 생긴다(둘 다 menu==="aiAssist"가 될 때 함께
// 마운트되므로, prop 갱신만이 유일하게 신뢰할 수 있는 전파 경로다).
const [aiSettings, setAiSettings] = useState<StudioAiSettings>(() => loadStudioAiSettings(globalThis.localStorage));
function updateAiSettings(next: StudioAiSettings) {
  setAiSettings(next);
  saveStudioAiSettings(globalThis.localStorage, next);
}
const [aiBgPrompt, setAiBgPrompt] = useState("");
const [aiBgSize, setAiBgSize] = useState<StudioAiImageSize>(DEFAULT_STUDIO_AI_IMAGE_SIZE);
const [aiBgBusy, setAiBgBusy] = useState(false);
const [aiBgError, setAiBgError] = useState<string | null>(null);
const [aiColorizePrompt, setAiColorizePrompt] = useState("파스텔톤 웹툰 셀 채색, 부드러운 그림자와 하이라이트");
const [aiColorizeBusy, setAiColorizeBusy] = useState(false);
const [aiColorizeError, setAiColorizeError] = useState<string | null>(null);
// 생성형 AI 최초 사용 고지의 "확인 후 실행할 동작" — acknowledgeAiNotice가 확인 시 이 ref를
// 실행한다. 기존엔 onGenerateAsset()만 하드코딩돼 있었는데(§2-4), AI 배경 생성/자동 채색도 같은
// 고지를 타야 해서 일반화한다.
const aiNoticePendingActionRef = useRef<(() => void) | null>(null);
```

`useRef`는 이미 파일 상단에서 react로부터 import돼 있다(91행, `{ Fragment, Suspense, useEffect,
useRef, useState, ... }`) — 추가 import 불필요.

### 2-3. `runWithAiNotice` 헬퍼 — 위 상태 블록 바로 다음에 추가(정의 위치는 JS 함수 선언 호이스팅
덕분에 실제로는 파일 어디에 둬도 동작하지만, 가독성을 위해 상태 선언 옆에 둔다).

```ts
// 생성형 AI 콘텐츠를 만드는 동작(이미지 생성/편집) 전부가 이 게이트를 통과한다 — 최초 1회만
// 고지하고(readAiNoticeAck), 이후엔 바로 실행한다. 사용자가 고지 모달을 취소하면 아무 일도
// 일어나지 않는다(pending ref가 조용히 버려짐 — busy 상태를 미리 세팅하지 않았으므로 "취소했는데
// 계속 로딩 스피너가 도는" 문제가 없다).
function runWithAiNotice(action: () => void) {
  if (!readAiNoticeAck()) {
    aiNoticePendingActionRef.current = action;
    setAiNoticeOpen(true);
    return;
  }
  action();
}
```

### 2-4. 기존 `onGenerateAsset`/`acknowledgeAiNotice` 일반화(기존 코드 수정)

**앵커**: `async function onGenerateAsset() { … }`(4601~4644행 부근). 현재:

```ts
async function onGenerateAsset() {
  const prompt = assetPrompt.trim();
  if (!prompt || assetGenerating) return;
  if (!studioAuthUserId) {
    setError("AI 에셋을 생성하려면 로그인이 필요해요.");
    return;
  }
  if (!readAiNoticeAck()) {
    setAiNoticeOpen(true);
    return;
  }
  setAssetGenerating(true);
  setError(null);
  try {
    /* ...기존 본문... */
  } catch (err) {
    setError(err instanceof Error ? err.message : "AI 에셋 생성 실패");
  } finally {
    setAssetGenerating(false);
  }
}
```

**다음과 같이 바꾼다** — 인증 체크는 그대로 먼저 두고(고지보다 우선), 그 아래 "고지 체크 +
나머지 전부"를 `runWithAiNotice`로 감싼 별도 함수로 뺀다(동작은 100% 동일, 위임 경로만 바뀐다):

```ts
async function onGenerateAsset() {
  const prompt = assetPrompt.trim();
  if (!prompt || assetGenerating) return;
  if (!studioAuthUserId) {
    setError("AI 에셋을 생성하려면 로그인이 필요해요.");
    return;
  }
  runWithAiNotice(() => void executeGenerateAsset(prompt));
}
async function executeGenerateAsset(prompt: string) {
  setAssetGenerating(true);
  setError(null);
  try {
    /* ...기존 본문 그대로(변경 없음)... */
  } catch (err) {
    setError(err instanceof Error ? err.message : "AI 에셋 생성 실패");
  } finally {
    setAssetGenerating(false);
  }
}
```

**앵커**: `function acknowledgeAiNotice() { … }`(4647~4651행). 현재:

```ts
function acknowledgeAiNotice() {
  storeAiNoticeAck();
  setAiNoticeOpen(false);
  void onGenerateAsset();
}
```

**다음과 같이 바꾼다** — 하드코딩된 `onGenerateAsset()` 호출을 pending ref 디스패치로 교체한다:

```ts
function acknowledgeAiNotice() {
  storeAiNoticeAck();
  setAiNoticeOpen(false);
  const action = aiNoticePendingActionRef.current;
  aiNoticePendingActionRef.current = null;
  action?.();
}
```

이 변경 후에도 기존 "AI 에셋 생성" 흐름은 바이트 동일하게 동작한다(고지 미확인 시 모달이 뜨고,
확인하면 `executeGenerateAsset(prompt)`가 실행된다 — 이전엔 `onGenerateAsset()`을 다시 불러 prompt를
`assetPrompt` state에서 다시 읽었는데, 이제는 클로저로 캡처한 `prompt` 값을 그대로 쓴다는 미세한
차이가 있다. 사용자가 모달이 뜬 그 짧은 순간 `assetPrompt`를 바꿀 일은 실질적으로 없어 동작 차이는
없다).

### 2-5. AI 배경 삽입 + 오케스트레이션 함수 — `addBgScene` 함수가 끝나는 지점에 추가.

**앵커**: `addBgScene` 함수의 마지막 줄(`setTool("select");` 다음의 닫는 `}`) 다음, `function
addFrame() {` 앞. (addBgScene은 6005~6035행 부근 — "패널 선택 시 그 칸만, 프레임들 있으면 전부에,
없으면 새 배경 요소"라는 동일한 배치 정책을 그대로 재사용한다.)

```ts
// AI로 생성된 배경 이미지를 삽입 — addBgScene과 동일한 배치 정책(선택된 프레임이 있으면 그 칸만,
// 프레임이 여럿이면 전부, 없으면 캔버스 전체 배경으로 맨 뒤에 새 요소 추가). width/height는
// generateBackgroundImage가 요청한 size 문자열에서 그대로 파생한 값이라 이미지 로드 없이 동기적으로
// 안다.
function insertAiBackgroundImage(dataUrl: string, width: number, height: number) {
  if (selected?.type === "frame") {
    patchEl(selected.id, { bg: dataUrl } as Partial<El>);
    setTool("select");
    return;
  }
  const frames = elements.filter((e) => e.type === "frame");
  if (frames.length > 0) {
    commit(elements.map((e) => (e.type === "frame" ? ({ ...e, bg: dataUrl } as El) : e)));
    setTool("select");
    return;
  }
  const el = createCanvasImageElement({
    id: uid(),
    src: dataUrl,
    canvasWidth: CANVAS_W,
    canvasHeight: canvasH,
    sourceWidth: width,
    sourceHeight: height,
    horizontalInset: 0,
    minY: 0,
  });
  commit([el, ...elements]);
  setSelectedId(el.id);
  setTool("select");
}

// 배경 생성 실행 — 이미 runWithAiNotice로 게이팅된 상태에서만 호출된다(§2-6). 실패해도 throw하지
// 않는다(studio-ai-client.ts 계약) — result.ok만 분기하면 된다.
async function executeAiBackgroundGenerate(prompt: string, size: StudioAiImageSize) {
  setAiBgBusy(true);
  setAiBgError(null);
  const result = await generateBackgroundImage(aiSettings, prompt, { size });
  if (!result.ok) {
    setAiBgError(result.error);
    setAiBgBusy(false);
    return;
  }
  insertAiBackgroundImage(result.data.dataUrl, result.data.width, result.data.height);
  setAiBgBusy(false);
  setMenu(null); // 다른 "생성 후 팝오버 닫기" 흐름(addBgScene 등)과 동일 UX.
}
// StudioAiBackgroundPanel의 "생성" 버튼이 호출하는 진입점 — 여기서만 AI 고지 게이트를 통과시킨다
// (executeAiBackgroundGenerate를 직접 패널에 넘기지 않는 이유 — 고지 우회 방지).
function onGenerateAiBackground() {
  const prompt = aiBgPrompt.trim();
  if (!prompt || aiBgBusy || !isStudioAiConfigured(aiSettings)) return;
  runWithAiNotice(() => void executeAiBackgroundGenerate(prompt, aiBgSize));
}

// AI 자동 채색 실행 — elId/srcAtRequestTime을 호출 시점에 캡처해 넘긴다(await 도중 선택이 바뀌어도
// 엉뚱한 요소를 덮어쓰지 않는다 — captureAnimFrame/bakeLiquifyStroke와 동일한 관례).
async function executeAiColorize(elId: string, srcAtRequestTime: string, prompt: string) {
  setAiColorizeBusy(true);
  setAiColorizeError(null);
  const result = await colorizeLineArt(aiSettings, srcAtRequestTime, prompt);
  if (!result.ok) {
    setAiColorizeError(result.error);
    setAiColorizeBusy(false);
    return;
  }
  const target = elementById.get(elId);
  if (target && target.type === "image") patchEl(elId, { src: result.data.dataUrl });
  setAiColorizeBusy(false);
}
function onColorizeSelected() {
  if (!selected || selected.type !== "image" || aiColorizeBusy || !isStudioAiConfigured(aiSettings)) return;
  const prompt = aiColorizePrompt.trim();
  if (!prompt) return;
  const elId = selected.id;
  const srcAtRequestTime = selected.src;
  runWithAiNotice(() => void executeAiColorize(elId, srcAtRequestTime, prompt));
}
```

### 2-6. "장면 메모를 캔버스에 추가" 콜백 — `StudioAiCompositionPanel`의 `onInsertAsNote` prop에
넘길 함수. 위 블록 바로 다음에 추가.

```ts
// 장면 구성 제안 텍스트를 일반 텍스트 요소로 캔버스에 추가한다 — addText()와 동일한 스폰 위치 규칙
// (선택된 패널이 있으면 그 중앙, 없으면 캔버스 중앙), 다만 제안 텍스트는 여러 줄 불릿이라 addText
// 기본값(fontSize 40, width 220)보다 작은 글자 크기·넓은 폭을 쓴다.
function insertAiCompositionNote(text: string) {
  const [cx, cy] = spawnCenter();
  addEl({ id: uid(), type: "text", text, x: cx - 130, y: cy - 70, width: 260, fontSize: 16, fill: color, rotation: 0 });
}
```

## 3. 지연(lazy) 패널 import — `StudioBrushLibraryPanel` lazyRetry 블록 바로 다음, `function
loadStudioReferencePanel()` 앞. 앵커: `const StudioBrushLibraryPanel = lazyRetry(() =>
import("./StudioBrushLibraryPanel").then((mod) => ({ default: mod.StudioBrushLibraryPanel })),
"StudioBrushLibraryPanel");` 다음 줄.

```ts
const StudioAiSettingsPanel = lazyRetry(
  () => import("./StudioAiSettingsPanel").then((mod) => ({ default: mod.StudioAiSettingsPanel })),
  "StudioAiSettingsPanel"
);
const StudioAiBackgroundPanel = lazyRetry(
  () => import("./StudioAiBackgroundPanel").then((mod) => ({ default: mod.StudioAiBackgroundPanel })),
  "StudioAiBackgroundPanel"
);
const StudioAiColorizePanel = lazyRetry(
  () => import("./StudioAiColorizePanel").then((mod) => ({ default: mod.StudioAiColorizePanel })),
  "StudioAiColorizePanel"
);
const StudioAiCompositionPanel = lazyRetry(
  () => import("./StudioAiCompositionPanel").then((mod) => ({ default: mod.StudioAiCompositionPanel })),
  "StudioAiCompositionPanel"
);
```

## 4. `StudioMenu` 타입 — 새 메뉴 종류 추가

앵커(1048행): `type StudioMenu = "template" | "bubble" | "sticker" | "char" | "bgScene" | "asset" |
"emeres" | "tone" | "scene" | "clip" | "palette" | "brandKit";`

```ts
type StudioMenu =
  | "template" | "bubble" | "sticker" | "char" | "bgScene" | "asset" | "emeres" | "tone" | "scene"
  | "clip" | "palette" | "brandKit" | "aiAssist"; // ← 추가
```

## 5. 툴바 진입점 — "AI 어시스트" 버튼 + 팝오버(설정 + 배경 생성 + 구도 제안)

**앵커**: `brandKit` 툴바 버튼 블록이 끝나는 지점(`</div>` 닫는 줄) 다음, `<button type="button"
onClick={addText} …>` 앞(8799~8820행 부근 — 브랜드 킷과 마찬가지로 "글로벌/전역 도구" 그룹에 속하는
버튼이라 인접시킨다. 캔버스 선택 상태와 무관하게 항상 보여야 하는 버튼이라는 점도 brandKit과 같다).
`Sparkles`는 이미 12번째 줄 근처 아이콘 import 블록에서 import돼 있다(1990행 `AiAssetNotice`가 이미
쓰는 중) — 추가 import 불필요.

```tsx
<div ref={menu === "aiAssist" ? menuRef : undefined} className="relative">
  <button
    type="button"
    onClick={() => setMenu(menu === "aiAssist" ? null : "aiAssist")}
    aria-haspopup="menu"
    aria-expanded={menu === "aiAssist"}
    className={toolBtn(menu === "aiAssist")}
    title="내 API 키로 배경 생성·구도 제안(BYOK, 서버 비용 없음)"
  >
    <Sparkles size={14} /> AI 어시스트
  </button>
  {menu === "aiAssist" && (
    <div className="fixed inset-x-2 top-[4.5rem] z-30 max-h-[calc(100dvh-9.5rem)] w-auto overflow-y-auto rounded-xl border border-line bg-panel p-2 shadow-xl lg:absolute lg:inset-x-auto lg:left-0 lg:top-full lg:mt-1 lg:max-h-none lg:w-80 lg:max-w-[calc(100vw-1.5rem)] lg:overflow-visible lg:shadow-lg">
      <Suspense fallback={<StudioPanelLoading label="AI 어시스트 패널을 여는 중..." />}>
        <div className="flex flex-col gap-2">
          <StudioAiSettingsPanel settings={aiSettings} onChange={updateAiSettings} />
          <StudioAiBackgroundPanel
            configured={isStudioAiConfigured(aiSettings)}
            prompt={aiBgPrompt}
            onPromptChange={setAiBgPrompt}
            size={aiBgSize}
            onSizeChange={setAiBgSize}
            busy={aiBgBusy}
            error={aiBgError}
            onGenerate={onGenerateAiBackground}
          />
          <StudioAiCompositionPanel
            settings={aiSettings}
            configured={isStudioAiConfigured(aiSettings)}
            onInsertAsNote={insertAiCompositionNote}
          />
        </div>
      </Suspense>
    </div>
  )}
</div>
```

이 popover 컨테이너 class는 `tone`/`emeres` 메뉴와 완전히 동일한 것을 그대로 복붙했다(반응형
위치/최대높이 규칙이 이미 검증된 패턴). 바깥 클릭/Esc로 닫히는 것도 기존 `menuRef` 아웃사이드클릭
핸들러(4143행 `if (!menuRef.current?.contains(e.target as Node)) setMenu(null);`)가 `menu` 상태 하나만
보고 동작하므로 **추가 배선 없이 그대로 적용된다**.

## 6. "선택한 이미지" 사이드바 — AI 자동 채색 패널 마운트

**앵커**: `selected.type === "image"` 분기 안, `<StudioBgRemoveButton …/>` 바로 다음(13443~13448행
부근 — "선택 이미지를 변환하는 도구" 그룹 중 가장 먼저 배치한다. BgRemoveButton과 마찬가지로
"이미지 통째로 변환"류이기 때문).

```tsx
{selected.type === "image" && (
  <>
    <StudioBgRemoveButton
      src={selected.src}
      onResult={(dataUrl) => patchEl(selected.id, { src: dataUrl })}
    />
    <StudioAiColorizePanel
      configured={isStudioAiConfigured(aiSettings)}
      prompt={aiColorizePrompt}
      onPromptChange={setAiColorizePrompt}
      busy={aiColorizeBusy}
      error={aiColorizeError}
      onColorize={onColorizeSelected}
    />
    {/* 주요 색상 추출 — 스와치를 누르면... 이하 기존 코드 그대로 */}
    <StudioColorPalettePanel src={selected.src} onPickColor={(hex) => setColor(hex)} />
    {/* ...기존 나머지... */}
  </>
)}
```

## 7. 생성형 AI 최초 사용 고지 모달 — 변경 없음(재확인용)

`{aiNoticeOpen && (<AiAssetNotice onCancel={...} onAcknowledge={acknowledgeAiNotice} />)}`
(11497~11499행)는 **그대로 둔다** — `acknowledgeAiNotice` 내부 구현만 §2-4에서 일반화했을 뿐,
JSX 마운트 자체는 바뀌지 않는다. `AiAssetNotice`의 문구("생성형 AI(OpenAI)로 이미지를 만들어요")도
이미 벤더 중립적으로 일반적이라(OpenAI 호환 서비스 전반을 포괄) 텍스트 수정이 필요 없다.

## 8. 통합 후 수동 QA 체크리스트

- [ ] 툴바 "AI 어시스트" 버튼 → 팝오버가 열리고 설정/배경 생성/구도 제안 3개 패널이 보인다.
- [ ] API 키 미입력 상태에서: 배경 생성/구도 제안 버튼이 비활성화되고 "설정에서 API 키를
      등록하세요" 안내가 보인다(네트워크 탭에 요청이 전혀 안 나감을 확인).
- [ ] 설정 패널에 baseURL+API 키를 입력하면(팝오버를 닫지 않고) 곧바로 배경 생성 패널의 버튼이
      활성화된다(§2-2에서 우려한 stale-read가 실제로 없는지 확인하는 핵심 시나리오).
- [ ] "연결 테스트" 버튼 → 성공 시 초록 체크+지연시간, 실패(잘못된 키) 시 빨간 X+에러 메시지.
- [ ] 배경 생성: 프롬프트 입력 → 생성 → **최초 1회** "생성형 AI 이미지 안내" 모달이 뜬다 → 확인 →
      배경 이미지가 캔버스에 삽입된다(패널 선택 안 한 상태 = 전체 배경, 패널 선택 상태 = 그 칸만).
      두 번째 생성부터는 모달 없이 바로 실행된다.
- [ ] 이미지 요소 선택 → "AI 자동 채색" 프롬프트 입력 → 채색 → 같은 요소의 src만 바뀌고
      위치/크기는 그대로다. ⌘Z로 채색 이전 상태로 되돌아간다.
- [ ] 장면 구성 제안: 시나리오 입력 → 제안 텍스트 수신(모달 고지 없음 — 텍스트라 게이트 대상 아님)
      → "복사" 버튼으로 클립보드 복사됨 → "캔버스에 메모로 추가"로 텍스트 요소가 캔버스에 생긴다.
- [ ] 브라우저 개발자 도구 네트워크 탭에서, 세 기능 모두 요청이 **이 앱의 자체 오리진이 아니라
      설정한 baseURL로 직접** 나가는 것을 확인한다(서버를 거치지 않는다는 원칙 검증).
- [ ] 기존 "내 에셋 > AI 에셋 생성"(로그인 필요, 서버 비용) 플로우가 §2-4 리팩터 이후에도 그대로
      동작한다(고지 모달 최초 1회, 이후 생략, 로그인 안 했으면 여전히 에러 메시지).
- [ ] localStorage `toonspectrum-studio-ai-settings` 키를 개발자 도구에서 지우고 새로고침하면
      설정 패널이 기본값(`https://api.openai.com/v1`, 빈 키)으로 돌아온다.

## 9. 스케치 대비 편차(§5, 의도적 스코프 축소·구현 선택)

1. **채색 API는 "이미지 전체 + 텍스트 프롬프트"만 보낸다(마스크 없음).** OpenAI Images Edit API는
   `mask` 파라미터로 편집 영역을 한정할 수 있지만, 그러려면 캔버스 위에 별도 마스크 그리기 UI가
   필요해 스코프 밖이라 판단했다(사용자 프롬프트가 이 단순화를 명시적으로 허용했다). 전체 이미지를
   다시 채색해 돌려받는 형태다 — 부분 채색이 필요하면 결과를 받은 뒤 레이어 마스크(기존
   `studio-layer-mask.ts`)로 원본과 블렌드하는 수동 워크플로가 대안이다.
2. **콘티→그림 변환은 "장면 구성 제안"(텍스트)으로 좁혔다.** 완전한 "글→그림 자동생성"은 배경 생성
   기능(1)과 기능이 겹치므로, 사용자 프롬프트가 요구한 대로 "구도/카메라앵글/인물배치 제안 텍스트"로
   차별화했다. 이미지 삽입 로직이 없다(선택적으로 텍스트 메모로만 캔버스에 추가 가능).
3. **`StudioAiCompositionPanel`만 자기완결형(self-contained)이고 나머지 둘은 완전히 제어된다.**
   비대칭적으로 보이지만 의도적이다 — 배경 생성/채색은 (a) AI 고지 모달 게이팅과 (b) 캔버스
   addEl/patchEl 부수효과가 있어 부모가 오케스트레이션해야 하고, 구도 제안은 순수 텍스트 결과라
   부모와 공유할 상태가 전혀 없다(§2-6의 "메모 추가"는 선택적 콜백일 뿐 필수 배선이 아니다).
4. **이미지 생성 응답은 `response_format:"b64_json"`만 지원한다.** 제공자가 이걸 무시하고 `url`만
   반환하면 `parse_error`로 실패한다(§`studio-ai-client.ts` docstring 참고) — 원격 URL을 그대로 쓰면
   caveat 두 가지가 생긴다: (a) CORS 헤더가 없는 제공자면 이후 캔버스 export(`toDataURL` 등)가 오염
   (tainted canvas)될 수 있고, (b) "항상 data URL"이라는 이 앱의 다른 모든 이미지 삽입 경로의 불변식이
   깨진다. 두 문제 모두 피하려고 URL 폴백을 아예 구현하지 않았다 — b64_json 미지원 제공자는 이번
   스코프 밖.
5. **"테스트" 버튼은 Chat Completions 엔드포인트만 검증한다.** 이미지 생성/편집 엔드포인트까지 각각
   실제로 호출해 검증하면 사용자 동의 없는 추가 비용이 발생해 부담스럽다고 판단했다 — baseURL+API
   키 조합이 유효하면 같은 제공자의 나머지 엔드포인트도 대개 함께 유효하다는 가정을 문서화해뒀다.
6. **채색은 `data:` URL 소스만 지원한다(원격 http(s)/blob: URL 불가).** `dataUrlToBlob`이 순수 문자열
   파싱(디코딩)만 하고 임의 URL을 별도로 `fetch`하지 않는다 — 그렇게 하면 CORS 의존이 생기고, 이
   함수가 "결정적 파싱"이라는 순수 로직 성격을 잃는다. 이 앱에서 사용자가 업로드/붙여넣기한 이미지는
   전부 `downscaleImageFile`을 거쳐 이미 `data:` URL이라 실제로는 이 제약에 거의 부딪히지 않는다
   (드물게 커뮤니티 공유 에셋을 그대로 쓴 이미지라면 막힐 수 있다 — `invalid_input` 에러로 명확히
   안내됨).
7. **설정 화면의 "고급: 엔드포인트 경로 직접 지정"은 기본값(OpenAI 표준 경로)을 그대로 두면 전혀
   조작할 필요가 없다.** Azure OpenAI처럼 경로 구조가 다른 제공자를 위한 탈출구로만 노출했다 — 기본
   사용자 경험(그냥 baseURL+키만 입력)을 이 세 필드가 어지럽히지 않도록 `<details>`(기본 접힘)로
   숨겼다.
8. **생성된 배경/채색 결과를 에셋 라이브러리(`studio-asset-library.ts`)에 자동 저장하지 않는다.**
   사용자 프롬프트가 "생성된 이미지를 addEl 또는 patchEl로 캔버스에 반영"까지만 요구했다 — 캔버스에
   바로 반영하고 끝이다. 필요하면 통합 담당자가 `insertAiBackgroundImage`/`executeAiColorize` 안에서
   `saveAsset({..., kind: "ai"})`를 추가로 호출하도록 확장할 수 있다(기존 "AI 에셋 생성" 배지 규약과
   동일하게 `kind:"ai"`를 재사용할 수 있음 — 다만 이러면 §0에서 설명한 "완전히 별개 경로" 원칙과
   에셋 라이브러리 저장 지점에서만 교차하게 된다는 점을 인지하고 결정할 것).
