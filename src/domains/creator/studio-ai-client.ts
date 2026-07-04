/**
 * Studio AI 어시스트 — BYOK(Bring Your Own Key) 범용 REST 클라이언트.
 *
 * 특정 AI 벤더에 종속되지 않는다 — OpenAI Chat Completions / Images(Generations·Edits) API와
 * "호환되는" 엔드포인트라면 무엇이든 붙일 수 있다(대부분의 이미지/텍스트 생성 서비스가 OpenAI 호환
 * 엔드포인트를 제공하거나 유사한 요청/응답 구조를 쓴다). 사용자가 baseUrl + apiKey를 직접 입력하고,
 * 이 모듈은 baseUrl 뒤에 표준 OpenAI 경로(/images/generations, /images/edits, /chat/completions)를
 * 붙여 호출한다 — OpenAI SDK들이 "baseURL + 경로" 구조를 쓰는 것과 동일한 관례(Azure OpenAI처럼
 * 경로가 다른 제공자를 위해 세 경로 모두 개별적으로 override 가능하게 설정에 노출해뒀다).
 *
 * **서버를 거치지 않는다** — API 키는 절대 이 앱의 백엔드로 전송되지 않고 브라우저
 * localStorage에만 저장되며, fetch도 브라우저 → AI 제공자로 직접 나간다("$0 서버비용" 원칙과
 * 일치 — 사용자가 자기 키로 자기 비용을 낸다). 코드 어디에도 API 키를 하드코딩하지 않는다.
 *
 * 이 파일은 순수 로직이다(DOM/Konva 의존 없음, 결정적) — 유일한 예외는 fetch/localStorage
 * 자체지만, 둘 다 인터페이스 뒤에 있어 테스트에서 완전히 모킹 가능하다(studio-brand-kit.ts의
 * "저장소를 주입받는" 패턴과 동일).
 *
 * 이 모듈이 앱의 기존 "AI 에셋 생성"(studio-asset-library.ts 의 kind:"ai", 실제로는
 * src/infrastructure/creator-client.ts → 이 앱의 NestJS 백엔드가 서버 보유 키로 대신 호출)과는
 * **완전히 별개의 독립 경로**다 — 그건 로그인 필요·서버가 비용을 대납하는 유료 기능이고, 이건
 * 로그인 불필요·사용자가 자기 키로 직접 호출하는 무료(앱 입장에서 $0) 기능이다. 통합 시 두 경로를
 * 섞지 않는다(docs/studio-ai-assist-integration.md 참고).
 *
 * 에러 계약: 이 모듈의 모든 async 함수는 **절대 throw하지 않는다** — 항상
 * `StudioAiResult<T>`(성공 { ok:true, data } / 실패 { ok:false, code, error })를 resolve한다.
 * 키 미설정·빈 입력은 fetch를 아예 호출하지 않고 즉시 `{ ok:false, code:"not_configured" | ...}`을
 * 반환한다(호출부가 매번 try/catch를 두지 않아도 되고, "키 없으면 요청 자체가 안 나간다"를
 * 테스트하기도 쉽다).
 */

// ── 설정 저장 ──────────────────────────────────────────────────────────────

/** localStorage 호환 인터페이스 — studio-brand-kit.ts BrandKitStorage와 동일한 DI 패턴. */
export interface StudioAiStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const STUDIO_AI_SETTINGS_KEY = "toonspectrum-studio-ai-settings";

export interface StudioAiSettings {
  /** 예: "https://api.openai.com/v1" (끝에 슬래시 없이). 아래 세 경로가 이 뒤에 그대로 붙는다. */
  baseUrl: string;
  /** 절대 서버로 전송하지 않는다 — localStorage에만 저장, 브라우저→제공자 직접 fetch에만 사용. */
  apiKey: string;
  imageModel: string;
  textModel: string;
  /** 배경 생성(POST, JSON body) 경로. 기본값은 OpenAI Images Generations. */
  imageGenerationPath: string;
  /** 자동 채색(POST, multipart/form-data) 경로. 기본값은 OpenAI Images Edits. */
  imageEditPath: string;
  /** 콘티→구도 제안(POST, JSON body) 경로. 기본값은 OpenAI Chat Completions. */
  chatCompletionsPath: string;
}

export const STUDIO_AI_DEFAULT_SETTINGS: StudioAiSettings = {
  baseUrl: "https://api.openai.com/v1",
  apiKey: "",
  imageModel: "dall-e-3",
  textModel: "gpt-4o-mini",
  imageGenerationPath: "/images/generations",
  imageEditPath: "/images/edits",
  chatCompletionsPath: "/chat/completions",
};

/**
 * 저장된 설정 로드 — 저장소 부재·손상 JSON·필드 누락은 필드 단위로 기본값 폴백한다
 * (studio-reference-panel.deserializeReferencePanelSettings와 동일한 "관대한" 정책 — baseUrl
 * 하나가 깨졌다고 apiKey까지 통째로 잃게 하지 않는다).
 */
export function loadStudioAiSettings(storage: StudioAiStorage | null | undefined): StudioAiSettings {
  if (!storage) return { ...STUDIO_AI_DEFAULT_SETTINGS };
  try {
    const raw = storage.getItem(STUDIO_AI_SETTINGS_KEY);
    if (!raw) return { ...STUDIO_AI_DEFAULT_SETTINGS };
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return { ...STUDIO_AI_DEFAULT_SETTINGS };
    const o = parsed as Record<string, unknown>;
    const str = (key: keyof StudioAiSettings, allowEmpty = false): string => {
      const v = o[key];
      if (typeof v !== "string") return STUDIO_AI_DEFAULT_SETTINGS[key];
      if (!allowEmpty && v.trim().length === 0) return STUDIO_AI_DEFAULT_SETTINGS[key];
      return v;
    };
    return {
      baseUrl: str("baseUrl"),
      apiKey: str("apiKey", true), // 빈 문자열(미설정 상태)도 유효한 값이다.
      imageModel: str("imageModel"),
      textModel: str("textModel"),
      imageGenerationPath: str("imageGenerationPath"),
      imageEditPath: str("imageEditPath"),
      chatCompletionsPath: str("chatCompletionsPath"),
    };
  } catch {
    return { ...STUDIO_AI_DEFAULT_SETTINGS };
  }
}

/** 저장 — 실패(쿼터 초과·시크릿 모드 등)는 조용히 무시한다(studio-brand-kit.ts persist와 동일 정책). */
export function saveStudioAiSettings(storage: StudioAiStorage | null | undefined, settings: StudioAiSettings): void {
  if (!storage) return;
  try {
    storage.setItem(STUDIO_AI_SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // 무시.
  }
}

/** baseUrl과 apiKey가 둘 다 채워져 있어야 "설정 완료"로 간주한다(모델/경로는 기본값으로도 동작). */
export function isStudioAiConfigured(settings: StudioAiSettings): boolean {
  return settings.baseUrl.trim().length > 0 && settings.apiKey.trim().length > 0;
}

// ── 공통 타입 ──────────────────────────────────────────────────────────────

export type StudioAiErrorCode =
  | "not_configured" // API 키/baseUrl 미설정 — fetch를 아예 호출하지 않는다.
  | "invalid_input" // 빈 프롬프트, data URL이 아닌 채색 소스 등 호출 전 검증 실패.
  | "network_error" // fetch 자체가 reject(오프라인, CORS, DNS 등).
  | "http_error" // 2xx 아닌 응답(401/429/500 등).
  | "parse_error"; // 2xx이지만 JSON이 아니거나 기대한 필드가 없음.

export type StudioAiResult<T> = { ok: true; data: T } | { ok: false; code: StudioAiErrorCode; error: string };

export type StudioAiImageSize = "1024x1024" | "1024x1792" | "1792x1024";

export const STUDIO_AI_IMAGE_SIZES: ReadonlyArray<{ value: StudioAiImageSize; label: string }> = [
  { value: "1024x1024", label: "정사각형 (1024×1024)" },
  { value: "1024x1792", label: "세로형 (1024×1792)" },
  { value: "1792x1024", label: "가로형 (1792×1024)" },
];

export const DEFAULT_STUDIO_AI_IMAGE_SIZE: StudioAiImageSize = "1024x1024";

// ── 내부 HTTP 헬퍼(테스트에서 fetch만 모킹하면 URL/헤더/바디를 전부 검증할 수 있다) ──────────

function trimBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, "");
}

function buildUrl(baseUrl: string, path: string): string {
  return `${trimBaseUrl(baseUrl)}${path.startsWith("/") ? path : `/${path}`}`;
}

/** 응답 바디를 텍스트로 먼저 읽고(2xx/에러 양쪽에서 재사용), 상태코드/JSON 유효성을 순서대로 판정한다. */
async function parseHttpResponse(res: Response): Promise<StudioAiResult<unknown>> {
  let text: string;
  try {
    text = await res.text();
  } catch {
    return { ok: false, code: "parse_error", error: "응답 본문을 읽지 못했습니다." };
  }
  if (!res.ok) {
    const message = extractErrorMessage(text) ?? (res.statusText || "알 수 없는 오류");
    return { ok: false, code: "http_error", error: `요청이 실패했습니다 (HTTP ${res.status}): ${message}` };
  }
  if (!text) return { ok: true, data: {} };
  try {
    return { ok: true, data: JSON.parse(text) };
  } catch {
    return { ok: false, code: "parse_error", error: "응답을 해석하지 못했습니다(JSON 형식이 아닙니다)." };
  }
}

/** OpenAI류 에러 응답의 관례적 형태(`{ error: { message } }` 또는 `{ error: "..." }`)를 최대한 뽑아본다. */
function extractErrorMessage(text: string): string | null {
  try {
    const parsed: unknown = JSON.parse(text);
    if (parsed && typeof parsed === "object") {
      const err = (parsed as Record<string, unknown>).error;
      if (typeof err === "string") return err;
      if (err && typeof err === "object" && typeof (err as Record<string, unknown>).message === "string") {
        return (err as Record<string, unknown>).message as string;
      }
    }
  } catch {
    // 본문이 JSON이 아니면(HTML 에러 페이지 등) 무시하고 null.
  }
  return null;
}

async function postJson(url: string, apiKey: string, body: unknown): Promise<StudioAiResult<unknown>> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (e) {
    return { ok: false, code: "network_error", error: e instanceof Error ? e.message : "네트워크 요청에 실패했습니다." };
  }
  return parseHttpResponse(res);
}

async function postForm(url: string, apiKey: string, form: FormData): Promise<StudioAiResult<unknown>> {
  let res: Response;
  try {
    // Content-Type을 직접 지정하지 않는다 — FormData를 body로 넘기면 fetch가 boundary를 포함한
    // multipart/form-data Content-Type을 자동으로 설정한다(직접 지정하면 boundary가 빠져 서버가
    // 파싱하지 못한다).
    res = await fetch(url, { method: "POST", headers: { Authorization: `Bearer ${apiKey}` }, body: form });
  } catch (e) {
    return { ok: false, code: "network_error", error: e instanceof Error ? e.message : "네트워크 요청에 실패했습니다." };
  }
  return parseHttpResponse(res);
}

function extractFirstB64Json(json: unknown): string | null {
  if (!json || typeof json !== "object") return null;
  const data = (json as Record<string, unknown>).data;
  if (!Array.isArray(data) || data.length === 0) return null;
  const first = data[0] as Record<string, unknown> | undefined;
  const b64 = first?.b64_json;
  return typeof b64 === "string" && b64.length > 0 ? b64 : null;
}

function extractFirstChatContent(json: unknown): string | null {
  if (!json || typeof json !== "object") return null;
  const choices = (json as Record<string, unknown>).choices;
  if (!Array.isArray(choices) || choices.length === 0) return null;
  const message = (choices[0] as Record<string, unknown> | undefined)?.message as Record<string, unknown> | undefined;
  const content = message?.content;
  return typeof content === "string" && content.trim().length > 0 ? content.trim() : null;
}

function parseImageSize(size: StudioAiImageSize): { width: number; height: number } {
  const m = /^(\d+)x(\d+)$/.exec(size);
  if (!m) return { width: 1024, height: 1024 };
  return { width: Number(m[1]), height: Number(m[2]) };
}

/**
 * data: URL을 Blob으로 되돌린다(순수 문자열 파싱 + atob, DOM 없이 동작). base64/URL-encoded 둘 다
 * 지원한다. data: URL이 아니면 throw한다 — 원격(http/https/blob:) URL은 의도적으로 지원하지 않는다
 * (§5 스코프 축소: 임의 URL을 fetch해 바이트로 바꾸는 건 이 순수 클라이언트의 책임 밖 — CORS 의존이
 * 생기고, "결정적 파싱"이라는 이 함수의 성격도 깨진다).
 *
 * 헤더(`data:` 다음~첫 콤마 전)는 RFC 2397처럼 `;`로 구분된 여러 파라미터를 가질 수 있다(예:
 * `data:text/plain;charset=utf-8;base64,...`) — 첫 세미콜론/콤마까지만 mime으로 읽고 `;base64`만
 * 정확히 매치하던 이전 정규식은 이런 추가 파라미터가 하나라도 끼면 유효한 data URL도 형식 불일치로
 * 오판해 throw했다(예: 대부분의 브라우저 canvas.toDataURL()/FileReader.readAsDataURL() 출력엔 없지만,
 * 외부에서 들어온 이미지에는 charset/name 같은 파라미터가 붙어 있을 수 있다). 첫 콤마로 헤더/페이로드를
 * 먼저 분리한 뒤 헤더를 `;`로 쪼개 파싱하면 파라미터 개수·순서와 무관하게 mime과 base64 플래그를
 * 안정적으로 뽑아낼 수 있다.
 */
export function dataUrlToBlob(dataUrl: string): Blob {
  const commaIndex = dataUrl.indexOf(",");
  if (!dataUrl.startsWith("data:") || commaIndex === -1) {
    throw new Error("data URL 형식이 아닙니다(원격 URL 이미지는 지원하지 않습니다).");
  }
  const header = dataUrl.slice("data:".length, commaIndex);
  const payload = dataUrl.slice(commaIndex + 1);
  const params = header.split(";");
  const mime = params[0] || "application/octet-stream";
  const isBase64 = params.slice(1).some((p) => p.trim().toLowerCase() === "base64");
  if (isBase64) {
    const binary = atob(payload);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  }
  return new Blob([decodeURIComponent(payload)], { type: mime });
}

// ── 3개 기능별 얇은 래퍼 ─────────────────────────────────────────────────────

/**
 * (1) 배경 생성 — 텍스트 프롬프트를 OpenAI Images Generations 형태 API로 보내 배경 이미지를 받는다.
 * response_format:"b64_json"을 항상 요청한다 — 응답이 바로 data URL로 변환 가능해 원격 이미지
 * URL을 별도로 fetch할 필요가 없고(CORS/캔버스 오염 위험 원천 차단), 캔버스 export(toDataURL 등)도
 * 항상 안전하다. 제공자가 b64_json을 지원하지 않고 url만 반환하면 parse_error로 실패한다(§5).
 */
export async function generateBackgroundImage(
  settings: StudioAiSettings,
  prompt: string,
  opts: { size?: StudioAiImageSize } = {}
): Promise<StudioAiResult<{ dataUrl: string; width: number; height: number }>> {
  const trimmed = prompt.trim();
  if (!trimmed) return { ok: false, code: "invalid_input", error: "배경 프롬프트를 입력하세요." };
  if (!isStudioAiConfigured(settings)) {
    return { ok: false, code: "not_configured", error: "설정에서 API 키를 등록하세요." };
  }
  const size = opts.size ?? DEFAULT_STUDIO_AI_IMAGE_SIZE;
  const url = buildUrl(settings.baseUrl, settings.imageGenerationPath);
  const result = await postJson(url, settings.apiKey, {
    model: settings.imageModel,
    prompt: trimmed,
    n: 1,
    size,
    response_format: "b64_json",
  });
  if (!result.ok) return result;
  const b64 = extractFirstB64Json(result.data);
  if (!b64) return { ok: false, code: "parse_error", error: "응답에서 이미지 데이터(b64_json)를 찾을 수 없습니다." };
  const { width, height } = parseImageSize(size);
  return { ok: true, data: { dataUrl: `data:image/png;base64,${b64}`, width, height } };
}

/**
 * (2) 자동 채색 — 선화 이미지(data URL) + 채색 지시 프롬프트를 OpenAI Images Edits 형태 API로
 * 보낸다. §5 스코프 축소: 마스크(mask) 파라미터는 보내지 않는다 — "이미지 전체 + 텍스트 프롬프트"만
 * 보내는 단순화 버전이다(원본 API는 마스크로 편집 영역을 한정할 수 있지만, 그러려면 캔버스 위에 별도
 * 마스크 그리기 UI가 필요해 스코프를 넘어선다). 결과 dataUrl은 호출부가 **같은 요소의 src만
 * 교체**하는 데 쓴다(위치/크기는 그대로 — studio-bg-remove.ts/StudioLineCleanupPanel과 동일 관례).
 */
export async function colorizeLineArt(
  settings: StudioAiSettings,
  lineArtSrc: string,
  prompt: string
): Promise<StudioAiResult<{ dataUrl: string }>> {
  const trimmed = prompt.trim();
  if (!trimmed) return { ok: false, code: "invalid_input", error: "채색 지시 프롬프트를 입력하세요." };
  if (!lineArtSrc) return { ok: false, code: "invalid_input", error: "채색할 이미지가 없습니다." };
  if (!isStudioAiConfigured(settings)) {
    return { ok: false, code: "not_configured", error: "설정에서 API 키를 등록하세요." };
  }
  let blob: Blob;
  try {
    blob = dataUrlToBlob(lineArtSrc);
  } catch (e) {
    return { ok: false, code: "invalid_input", error: e instanceof Error ? e.message : "이미지를 읽지 못했습니다." };
  }
  const form = new FormData();
  form.set("image", blob, "lineart.png");
  form.set("prompt", trimmed);
  form.set("model", settings.imageModel);
  form.set("n", "1");
  form.set("response_format", "b64_json");
  const url = buildUrl(settings.baseUrl, settings.imageEditPath);
  const result = await postForm(url, settings.apiKey, form);
  if (!result.ok) return result;
  const b64 = extractFirstB64Json(result.data);
  if (!b64) return { ok: false, code: "parse_error", error: "응답에서 이미지 데이터(b64_json)를 찾을 수 없습니다." };
  return { ok: true, data: { dataUrl: `data:image/png;base64,${b64}` } };
}

/** 콘티→그림 변환의 "장면 구성 제안" 시스템 프롬프트 — 완전한 이미지 생성이 아니라(기능 1과
 *  중복되므로) 구도/카메라앵글/인물배치 텍스트 조언으로 의도적으로 좁혔다. */
const SCENE_COMPOSITION_SYSTEM_PROMPT =
  "당신은 한국 웹툰 연출을 돕는 어시스턴트입니다. 사용자가 입력한 짧은 시나리오나 대사를 읽고, " +
  "이 장면을 그릴 때 참고할 구도(롱샷/미디엄샷/클로즈업 등), 카메라 앵글, 등장인물 배치, 컷 분할 " +
  "아이디어를 한국어 짧은 불릿 3~5개로 제안하세요. 실제 이미지나 그림을 생성하지 말고, 연출 " +
  "아이디어를 담은 텍스트 제안만 하세요.";

/**
 * (3) 콘티→그림 변환(장면 구성 제안) — 시나리오/대사 텍스트를 OpenAI Chat Completions 형태 API로
 * 보내 구도·카메라앵글·인물배치 제안 텍스트를 받는다. 이미지 생성 기능(1)과의 차별화를 위해
 * "그림 자동 생성"이 아니라 "연출 조언"으로 스코프를 좁혔다(§5).
 */
export async function suggestSceneComposition(
  settings: StudioAiSettings,
  sceneText: string
): Promise<StudioAiResult<{ suggestion: string }>> {
  const trimmed = sceneText.trim();
  if (!trimmed) return { ok: false, code: "invalid_input", error: "장면 시나리오/대사를 입력하세요." };
  if (!isStudioAiConfigured(settings)) {
    return { ok: false, code: "not_configured", error: "설정에서 API 키를 등록하세요." };
  }
  const url = buildUrl(settings.baseUrl, settings.chatCompletionsPath);
  const result = await postJson(url, settings.apiKey, {
    model: settings.textModel,
    messages: [
      { role: "system", content: SCENE_COMPOSITION_SYSTEM_PROMPT },
      { role: "user", content: trimmed },
    ],
    temperature: 0.7,
    max_tokens: 400,
  });
  if (!result.ok) return result;
  const content = extractFirstChatContent(result.data);
  if (!content) return { ok: false, code: "parse_error", error: "응답에서 제안 텍스트를 찾을 수 없습니다." };
  return { ok: true, data: { suggestion: content } };
}

/**
 * 설정 화면의 "테스트" 버튼용 — 가장 저렴한 호출(Chat Completions, max_tokens:1)로 baseUrl+apiKey
 * 조합이 실제로 유효한지 확인한다. 이미지 생성/편집 엔드포인트까지 각각 검증하진 않는다(§5 — 셋 다
 * 검증하려면 실제 이미지 호출 비용이 들어 사용자 동의 없이 실행하기 부담스럽다. 공유 baseUrl/apiKey
 * 조합이 유효하면 나머지 두 엔드포인트도 대개 함께 유효하다는 가정).
 */
export async function testAiConnection(
  settings: StudioAiSettings
): Promise<StudioAiResult<{ latencyMs: number }>> {
  if (!isStudioAiConfigured(settings)) {
    return { ok: false, code: "not_configured", error: "설정에서 API 키를 등록하세요." };
  }
  const url = buildUrl(settings.baseUrl, settings.chatCompletionsPath);
  const startedAt = Date.now();
  const result = await postJson(url, settings.apiKey, {
    model: settings.textModel,
    messages: [{ role: "user", content: "ping" }],
    max_tokens: 1,
  });
  if (!result.ok) return result;
  return { ok: true, data: { latencyMs: Date.now() - startedAt } };
}
