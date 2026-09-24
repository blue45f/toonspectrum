import { Buffer } from "node:buffer";

export type CreatorIntelligenceProviderStatus = "ready" | "not_configured" | "disabled";
export type CreatorIntelligenceReferenceProvider = "openverse" | "pexels" | "pixabay";
export type CreatorIntelligenceTranslationProvider = "deepl" | "libretranslate";
export type CreatorIntelligenceVoiceProvider = "gemini" | "deepgram";

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;
type Env = Record<string, string | undefined>;
type JsonRecord = Record<string, unknown>;

export interface CreatorIntelligenceCoreOptions {
  readonly fetch: Fetcher;
  readonly env: () => Env;
  readonly now?: () => number;
}

export class CreatorIntelligenceInputError extends Error {}

const MAX_JSON_BYTES = 2 * 1024 * 1024;
const MAX_AUDIO_BYTES = 4 * 1024 * 1024;
const MAX_TTS_JSON_BYTES = Math.ceil(MAX_AUDIO_BYTES * 4 / 3) + 128 * 1024;
const REQUEST_TIMEOUT_MS = 10_000;
const TTS_REQUEST_TIMEOUT_MS = 45_000;
const PAGE_SIZE = 12;
const USER_AGENT = "ToonSpectrum/1.0 (+https://www.toonstudio.cloud/about/crawler)";

const GEMINI_TTS_MODELS = new Set([
  "gemini-3.8-flash-lite-tts",
  "gemini-3.8-flash-tts",
]);

const GEMINI_TTS_VOICES = new Set([
  "Zephyr",
  "Puck",
  "Charon",
  "Kore",
  "Fenrir",
  "Leda",
  "Orus",
  "Aoede",
  "Callirrhoe",
  "Autonoe",
  "Enceladus",
  "Iapetus",
  "Umbriel",
  "Algieba",
  "Despina",
  "Erinome",
  "Algenib",
  "Rasalgethi",
  "Laomedeia",
  "Achernar",
  "Alnilam",
  "Schedar",
  "Gacrux",
  "Pulcherrima",
  "Achird",
  "Zubenelgenubi",
  "Vindemiatrix",
  "Sadachbia",
  "Sadaltager",
  "Sulafat",
]);

function record(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : {};
}

function rows(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function text(value: unknown, max = 500): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/<[^>]*>/gu, " ")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, max);
}

function finite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function enabled(env: Env, name: string): boolean {
  return env[name]?.trim().toLowerCase() === "true";
}

function key(env: Env, name: string): string {
  return env[name]?.trim() ?? "";
}

function cleanQuery(value: unknown, label = "검색어", max = 120): string {
  if (typeof value !== "string") throw new CreatorIntelligenceInputError(`${label} 형식이 올바르지 않습니다.`);
  const normalized = value.trim().replace(/\s+/gu, " ");
  const hasControl = [...normalized].some((character) => {
    const code = character.codePointAt(0) ?? 0;
    return code <= 31 || code === 127;
  });
  if (normalized.length < 2 || normalized.length > max || hasControl) {
    throw new CreatorIntelligenceInputError(`${label}는 2~${max}자로 입력하세요.`);
  }
  return normalized;
}

function cleanPage(value: unknown): number {
  if (value === undefined || value === null || value === "") return 1;
  const page = Number(value);
  if (!Number.isInteger(page) || page < 1 || page > 20) {
    throw new CreatorIntelligenceInputError("페이지는 1~20 범위여야 합니다.");
  }
  return page;
}

function safeHttps(value: unknown): string {
  if (typeof value !== "string" || value.length > 3000) return "";
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) return "";
    const host = url.hostname.toLowerCase();
    if (
      host === "localhost"
      || host.endsWith(".local")
      || /^(?:127\.|0\.|10\.|192\.168\.|169\.254\.)/u.test(host)
      || /^172\.(?:1[6-9]|2\d|3[01])\./u.test(host)
      || /^\[?(?:fc|fd|fe80):/iu.test(host)
    ) return "";
    return url.href;
  } catch {
    return "";
  }
}

function configuredEndpoint(raw: string, fallbackPath = ""): URL | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    if (fallbackPath && (url.pathname === "/" || url.pathname === "")) url.pathname = fallbackPath;
    return url;
  } catch {
    return null;
  }
}

async function readJson(response: Response, maximumBytes = MAX_JSON_BYTES): Promise<unknown> {
  if (!response.ok || response.redirected) {
    await response.body?.cancel().catch(() => undefined);
    throw new Error("upstream_response");
  }
  const type = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (!type.includes("json")) {
    await response.body?.cancel().catch(() => undefined);
    throw new Error("upstream_type");
  }
  const length = Number(response.headers.get("content-length"));
  if (Number.isFinite(length) && length > maximumBytes) {
    await response.body?.cancel().catch(() => undefined);
    throw new Error("upstream_size");
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error("upstream_body");
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let total = 0;
  let output = "";
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      total += chunk.value.byteLength;
      if (total > maximumBytes) throw new Error("upstream_size");
      output += decoder.decode(chunk.value, { stream: true });
    }
    output += decoder.decode();
    return JSON.parse(output) as unknown;
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

async function readAudio(response: Response): Promise<string> {
  if (!response.ok || response.redirected) {
    await response.body?.cancel().catch(() => undefined);
    throw new Error("upstream_response");
  }
  const type = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (!type.includes("audio") && !type.includes("mpeg") && !type.includes("octet-stream")) {
    await response.body?.cancel().catch(() => undefined);
    throw new Error("upstream_type");
  }
  const length = Number(response.headers.get("content-length"));
  if (Number.isFinite(length) && length > MAX_AUDIO_BYTES) {
    await response.body?.cancel().catch(() => undefined);
    throw new Error("upstream_size");
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > MAX_AUDIO_BYTES) throw new Error("upstream_size");
  return Buffer.from(bytes).toString("base64");
}

function requestSignal(timeoutMs: number, externalSignal?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs);
  return externalSignal ? AbortSignal.any([externalSignal, timeout]) : timeout;
}

function requestInit(
  init: RequestInit = {},
  timeoutMs = REQUEST_TIMEOUT_MS,
  externalSignal?: AbortSignal,
): RequestInit {
  return {
    ...init,
    redirect: "error",
    credentials: "omit",
    signal: requestSignal(timeoutMs, externalSignal),
    headers: {
      Accept: "application/json",
      "User-Agent": USER_AGENT,
      ...(init.headers ?? {}),
    },
  };
}

function status(statusValue: CreatorIntelligenceProviderStatus, reason: string) {
  return { status: statusValue, reason } as const;
}

function voiceText(value: unknown): string {
  if (typeof value !== "string") {
    throw new CreatorIntelligenceInputError("음성으로 읽을 문장 형식이 올바르지 않습니다.");
  }
  const normalized = value.trim().replace(/\s+/gu, " ");
  const hasControl = [...normalized].some((character) => {
    const code = character.codePointAt(0) ?? 0;
    return code <= 31 || code === 127;
  });
  if (normalized.length < 1 || normalized.length > 1_500 || hasControl) {
    throw new CreatorIntelligenceInputError("음성으로 읽을 문장은 1~1,500자로 입력하세요.");
  }
  return normalized;
}

function voiceStyle(value: unknown): string {
  if (value === undefined || value === null || value === "") return "";
  return cleanQuery(value, "음성 연기 지시", 240);
}

function geminiTtsModel(env: Env): string {
  const configured = key(env, "GEMINI_TTS_MODEL") || "gemini-3.8-flash-lite-tts";
  return GEMINI_TTS_MODELS.has(configured) ? configured : "gemini-3.8-flash-lite-tts";
}

function geminiTtsVoice(value: unknown): string {
  const requested = typeof value === "string" ? value.trim() : "";
  if (!requested) return "Kore";
  if (!GEMINI_TTS_VOICES.has(requested)) {
    throw new CreatorIntelligenceInputError("지원하지 않는 Gemini 음성입니다.");
  }
  return requested;
}

function deepgramTtsModel(env: Env): string {
  const configured = key(env, "DEEPGRAM_TTS_MODEL") || "aura-2-thalia-en";
  return configured.startsWith("aura-") && configured.length <= 120
    ? configured
    : "aura-2-thalia-en";
}

function normalizedBase64Audio(value: unknown, expectedWave = false): string {
  if (typeof value !== "string") throw new Error("upstream_schema");
  const normalized = value.split(/\s+/u).join("");
  if (
    normalized.length === 0
    || normalized.length > Math.ceil(MAX_AUDIO_BYTES * 4 / 3) + 8
    || normalized.length % 4 !== 0
    || !/^[A-Za-z0-9+/]+={0,2}$/u.test(normalized)
  ) {
    throw new Error("upstream_schema");
  }
  const bytes = Buffer.from(normalized, "base64");
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_AUDIO_BYTES) throw new Error("upstream_size");
  if (expectedWave && (bytes.byteLength < 12 || bytes.subarray(0, 4).toString("ascii") !== "RIFF" || bytes.subarray(8, 12).toString("ascii") !== "WAVE")) {
    throw new Error("upstream_schema");
  }
  return normalized;
}

function geminiOutputAudio(payload: JsonRecord): { data: unknown; mimeType: string } {
  const legacy = record(payload.output_audio);
  if (typeof legacy.data === "string") {
    return {
      data: legacy.data,
      mimeType: text(legacy.mime_type, 80).toLowerCase(),
    };
  }

  for (const stepValue of rows(payload.steps)) {
    const step = record(stepValue);
    for (const contentValue of rows(step.content)) {
      const content = record(contentValue);
      if (content.type !== "audio" || typeof content.data !== "string") continue;
      return {
        data: content.data,
        mimeType: text(content.mime_type, 80).toLowerCase(),
      };
    }
  }
  throw new Error("upstream_schema");
}

export function createCreatorIntelligenceCore(options: CreatorIntelligenceCoreOptions) {
  const now = options.now ?? Date.now;

  function describe() {
    const env = options.env();
    const openMeteoReady = enabled(env, "CREATOR_INTELLIGENCE_OPEN_METEO_ENABLED")
      && Boolean(configuredEndpoint(key(env, "OPEN_METEO_ARCHIVE_BASE_URL")));
    const geocodeReady = Boolean(
      configuredEndpoint(key(env, "NOMINATIM_BASE_URL"))
      || configuredEndpoint(key(env, "OPEN_METEO_GEOCODING_BASE_URL")),
    );
    return {
      schema: "toonspectrum.creator-intelligence.status.v1",
      references: {
        openverse: status("ready", "discovery-only; verify source rights before reuse"),
        pexels: key(env, "PEXELS_API_KEY") ? status("ready", "server key configured") : status("not_configured", "PEXELS_API_KEY required"),
        pixabay: key(env, "PIXABAY_API_KEY") ? status("ready", "server key configured") : status("not_configured", "PIXABAY_API_KEY required"),
      },
      translation: {
        deepl: key(env, "DEEPL_API_KEY") ? status("ready", "server key configured") : status("not_configured", "DEEPL_API_KEY required"),
        libretranslate: configuredEndpoint(key(env, "LIBRETRANSLATE_BASE_URL")) ? status("ready", "custom endpoint configured") : status("not_configured", "LIBRETRANSLATE_BASE_URL required"),
      },
      voice: {
        gemini: enabled(env, "CREATOR_INTELLIGENCE_VOICE_ENABLED") && key(env, "GEMINI_TTS_API_KEY")
          ? status("ready", "Gemini Korean and multilingual TTS enabled with server-side credentials")
          : status("disabled", "voice feature flag and GEMINI_TTS_API_KEY required"),
        deepgram: enabled(env, "CREATOR_INTELLIGENCE_VOICE_ENABLED") && key(env, "DEEPGRAM_API_KEY")
          ? status("ready", "Deepgram Aura-2 English TTS enabled; Korean routes stay on Gemini or local speech")
          : status("disabled", "voice feature flag and DEEPGRAM_API_KEY required"),
      },
      scene: openMeteoReady && geocodeReady
        ? status("ready", "contracted geocoder/weather endpoint configured")
        : status("disabled", "commercial geocoding/weather endpoint must be configured explicitly"),
      anilist: enabled(env, "CREATOR_INTELLIGENCE_ANILIST_ENABLED")
        ? status("ready", "operator confirmed commercial/API terms")
        : status("disabled", "commercial use requires explicit operator enablement"),
      freesound: enabled(env, "CREATOR_INTELLIGENCE_FREESOUND_ENABLED") && key(env, "FREESOUND_API_KEY")
        ? status("ready", "operator confirmed API terms; per-sound license still required")
        : status("disabled", "enable flag and FREESOUND_API_KEY required"),
      soundEffects: enabled(env, "CREATOR_INTELLIGENCE_ELEVENLABS_SFX_ENABLED") && key(env, "ELEVENLABS_API_KEY")
        ? status("ready", "paid generation enabled by operator")
        : status("disabled", "explicit paid SFX enablement required"),
      meshy: enabled(env, "CREATOR_INTELLIGENCE_MESHY_ENABLED") && key(env, "MESHY_API_KEY")
        ? status("ready", "paid image-to-3D enabled by operator")
        : status("disabled", "explicit Meshy enablement and MESHY_API_KEY required"),
      safeSearch: enabled(env, "CREATOR_INTELLIGENCE_SAFESEARCH_ENABLED") && key(env, "GOOGLE_CLOUD_VISION_API_KEY")
        ? status("ready", "external image moderation enabled by operator")
        : status("disabled", "optional external moderation is disabled"),
    } as const;
  }

  async function searchReferences(providerRaw: unknown, queryRaw: unknown, pageRaw?: unknown) {
    const provider = providerRaw as CreatorIntelligenceReferenceProvider;
    if (!(["openverse", "pexels", "pixabay"] as const).includes(provider)) {
      throw new CreatorIntelligenceInputError("지원하지 않는 레퍼런스 제공처입니다.");
    }
    const query = cleanQuery(queryRaw);
    const page = cleanPage(pageRaw);
    const env = options.env();
    if (provider === "pexels" && !key(env, "PEXELS_API_KEY")) return { provider, status: "not_configured", page, items: [], hasMore: false };
    if (provider === "pixabay" && !key(env, "PIXABAY_API_KEY")) return { provider, status: "not_configured", page, items: [], hasMore: false };

    if (provider === "openverse") {
      const url = new URL("https://api.openverse.org/v1/images/");
      url.search = new URLSearchParams({ q: query, page: String(page), page_size: String(PAGE_SIZE), mature: "false" }).toString();
      const payload = record(await readJson(await options.fetch(url.href, requestInit())));
      const totalPages = Math.max(1, Math.ceil((finite(payload.result_count) ?? 0) / PAGE_SIZE));
      const items = rows(payload.results).slice(0, PAGE_SIZE).map((value) => {
        const item = record(value);
        const id = text(item.id, 160);
        const sourceUrl = safeHttps(item.foreign_landing_url);
        if (!id || !sourceUrl) return null;
        return {
          id: `openverse:${id}`,
          provider,
          title: text(item.title, 300) || "Untitled reference",
          creator: text(item.creator, 200),
          sourceUrl,
          previewUrl: safeHttps(item.thumbnail) || safeHttps(item.url),
          license: [text(item.license, 40).toUpperCase(), text(item.license_version, 20)].filter(Boolean).join(" "),
          licenseUrl: safeHttps(item.license_url),
          width: finite(item.width),
          height: finite(item.height),
          rightsStatus: "verify-source",
          importable: false,
          fetchedAt: new Date(now()).toISOString(),
        };
      }).filter(Boolean);
      return { provider, status: "ready", page, items, hasMore: page < Math.min(totalPages, 20), notice: "Openverse is discovery-only. Verify the original source and current license before reuse." };
    }

    if (provider === "pexels") {
      const url = new URL("https://api.pexels.com/v1/search");
      url.search = new URLSearchParams({ query, page: String(page), per_page: String(PAGE_SIZE) }).toString();
      const payload = record(await readJson(await options.fetch(url.href, requestInit({ headers: { Authorization: key(env, "PEXELS_API_KEY") } }))));
      const items = rows(payload.photos).slice(0, PAGE_SIZE).map((value) => {
        const item = record(value);
        const src = record(item.src);
        const id = finite(item.id);
        const sourceUrl = safeHttps(item.url);
        if (id === null || !sourceUrl) return null;
        return {
          id: `pexels:${Math.trunc(id)}`,
          provider,
          title: text(item.alt, 300) || "Pexels photo",
          creator: text(item.photographer, 200),
          sourceUrl,
          creatorUrl: safeHttps(item.photographer_url),
          previewUrl: safeHttps(src.medium) || safeHttps(src.small),
          license: "Pexels License",
          licenseUrl: "https://www.pexels.com/license/",
          width: finite(item.width),
          height: finite(item.height),
          rightsStatus: "provider-license",
          importable: false,
          fetchedAt: new Date(now()).toISOString(),
        };
      }).filter(Boolean);
      const total = finite(payload.total_results) ?? 0;
      return { provider, status: "ready", page, items, hasMore: total > page * PAGE_SIZE, notice: "Keep photographer/Pexels attribution metadata and re-check current provider terms before publishing." };
    }

    const url = new URL("https://pixabay.com/api/");
    url.search = new URLSearchParams({ key: key(env, "PIXABAY_API_KEY"), q: query, page: String(page), per_page: String(PAGE_SIZE), safesearch: "true", image_type: "all" }).toString();
    const payload = record(await readJson(await options.fetch(url.href, requestInit())));
    const items = rows(payload.hits).slice(0, PAGE_SIZE).map((value) => {
      const item = record(value);
      const id = finite(item.id);
      const sourceUrl = safeHttps(item.pageURL);
      if (id === null || !sourceUrl) return null;
      return {
        id: `pixabay:${Math.trunc(id)}`,
        provider,
        title: text(item.tags, 300) || "Pixabay image",
        creator: text(item.user, 200),
        sourceUrl,
        previewUrl: safeHttps(item.webformatURL) || safeHttps(item.previewURL),
        license: "Pixabay Content License",
        licenseUrl: "https://pixabay.com/service/license-summary/",
        width: finite(item.imageWidth),
        height: finite(item.imageHeight),
        rightsStatus: "provider-license",
        importable: false,
        fetchedAt: new Date(now()).toISOString(),
      };
    }).filter(Boolean);
    const total = finite(payload.totalHits) ?? 0;
    return { provider, status: "ready", page, items, hasMore: total > page * PAGE_SIZE, notice: "Treat search results as references; verify the current Pixabay Content License and third-party rights before reuse." };
  }

  async function translate(providerRaw: unknown, body: JsonRecord) {
    const provider = providerRaw as CreatorIntelligenceTranslationProvider;
    if (provider !== "deepl" && provider !== "libretranslate") throw new CreatorIntelligenceInputError("지원하지 않는 번역 제공처입니다.");
    const sourceText = cleanQuery(body.text, "번역할 문장", 5000);
    const target = text(body.targetLanguage, 20).toUpperCase();
    if (!/^[A-Z]{2,10}(?:-[A-Z]{2,10})?$/u.test(target)) throw new CreatorIntelligenceInputError("대상 언어 코드가 올바르지 않습니다.");
    const env = options.env();
    if (provider === "deepl") {
      const apiKey = key(env, "DEEPL_API_KEY");
      if (!apiKey) return { provider, status: "not_configured" };
      const base = configuredEndpoint(key(env, "DEEPL_API_BASE_URL") || "https://api.deepl.com");
      if (!base) throw new Error("provider_configuration");
      const url = new URL("/v2/translate", base);
      const requestBody: JsonRecord = { text: [sourceText], target_lang: target };
      const source = text(body.sourceLanguage, 20).toUpperCase();
      if (source) requestBody.source_lang = source;
      const glossaryId = text(body.glossaryId, 100);
      if (glossaryId) requestBody.glossary_id = glossaryId;
      const payload = record(await readJson(await options.fetch(url.href, requestInit({ method: "POST", headers: { Authorization: `DeepL-Auth-Key ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify(requestBody) }))));
      const first = record(rows(payload.translations)[0]);
      const translated = text(first.text, 7000);
      if (!translated) throw new Error("upstream_schema");
      return { provider, status: "ready", text: translated, detectedSourceLanguage: text(first.detected_source_language, 30) };
    }
    const base = configuredEndpoint(key(env, "LIBRETRANSLATE_BASE_URL"));
    if (!base) return { provider, status: "not_configured" };
    const url = new URL("/translate", base);
    const source = text(body.sourceLanguage, 20).toLowerCase() || "auto";
    const requestBody: JsonRecord = { q: sourceText, source, target: target.toLowerCase(), format: "text" };
    const apiKey = key(env, "LIBRETRANSLATE_API_KEY");
    if (apiKey) requestBody.api_key = apiKey;
    const payload = record(await readJson(await options.fetch(url.href, requestInit({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(requestBody) }))));
    const translated = text(payload.translatedText, 7000);
    if (!translated) throw new Error("upstream_schema");
    return { provider, status: "ready", text: translated, detectedSourceLanguage: text(record(payload.detectedLanguage).language, 30) };
  }

  async function searchAniList(queryRaw: unknown, mediaTypeRaw: unknown) {
    const env = options.env();
    if (!enabled(env, "CREATOR_INTELLIGENCE_ANILIST_ENABLED")) return { status: "disabled", items: [] };
    const queryText = cleanQuery(queryRaw);
    const mediaType = mediaTypeRaw === "ANIME" ? "ANIME" : "MANGA";
    const query = `query($search:String!,$type:MediaType!){Page(page:1,perPage:12){media(search:$search,type:$type,sort:SEARCH_MATCH){id type format status siteUrl seasonYear startDate{year month day} title{romaji english native} genres description(asHtml:false)}}}`;
    const payload = record(await readJson(await options.fetch("https://graphql.anilist.co", requestInit({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query, variables: { search: queryText, type: mediaType } }) }))));
    if (rows(payload.errors).length) throw new Error("upstream_response");
    const media = rows(record(record(payload.data).Page).media);
    const items = media.slice(0, PAGE_SIZE).map((value) => {
      const item = record(value);
      const id = finite(item.id);
      const title = record(item.title);
      const sourceUrl = safeHttps(item.siteUrl);
      if (id === null || !sourceUrl) return null;
      return {
        id: `anilist:${Math.trunc(id)}`,
        type: text(item.type, 20),
        format: text(item.format, 30),
        status: text(item.status, 30),
        title: text(title.english, 300) || text(title.romaji, 300) || text(title.native, 300),
        nativeTitle: text(title.native, 300),
        year: finite(item.seasonYear) ?? finite(record(item.startDate).year),
        genres: rows(item.genres).map((genre) => text(genre, 60)).filter(Boolean).slice(0, 12),
        description: text(item.description, 1000),
        sourceUrl,
        rightsStatus: "metadata-only",
      };
    }).filter(Boolean);
    return { status: "ready", items, notice: "Metadata reference only. Do not treat AniList metadata or artwork as reuse permission." };
  }

  async function geocode(place: string): Promise<{ latitude: number; longitude: number; label: string } | null> {
    const env = options.env();
    const nominatim = configuredEndpoint(key(env, "NOMINATIM_BASE_URL"));
    if (nominatim) {
      const url = new URL(nominatim.href);
      if (url.pathname === "/") url.pathname = "/search";
      url.search = new URLSearchParams({ q: place, format: "jsonv2", limit: "1" }).toString();
      const payload = await readJson(await options.fetch(url.href, requestInit()));
      const first = record(rows(payload)[0]);
      const latitude = Number(first.lat);
      const longitude = Number(first.lon);
      if (Number.isFinite(latitude) && Number.isFinite(longitude)) return { latitude, longitude, label: text(first.display_name, 500) || place };
      return null;
    }
    const geocoding = configuredEndpoint(key(env, "OPEN_METEO_GEOCODING_BASE_URL"));
    if (!geocoding) return null;
    const url = new URL(geocoding.href);
    url.searchParams.set("name", place);
    url.searchParams.set("count", "1");
    url.searchParams.set("language", "ko");
    url.searchParams.set("format", "json");
    const apiKey = key(env, "OPEN_METEO_API_KEY");
    if (apiKey) url.searchParams.set("apikey", apiKey);
    const payload = record(await readJson(await options.fetch(url.href, requestInit())));
    const first = record(rows(payload.results)[0]);
    const latitude = finite(first.latitude);
    const longitude = finite(first.longitude);
    if (latitude === null || longitude === null) return null;
    return { latitude, longitude, label: [text(first.name, 100), text(first.admin1, 100), text(first.country, 100)].filter(Boolean).join(", ") || place };
  }

  async function sceneReference(placeRaw: unknown, dateRaw: unknown) {
    const env = options.env();
    if (!enabled(env, "CREATOR_INTELLIGENCE_OPEN_METEO_ENABLED")) return { status: "disabled" };
    const archive = configuredEndpoint(key(env, "OPEN_METEO_ARCHIVE_BASE_URL"));
    if (!archive) return { status: "not_configured" };
    const place = cleanQuery(placeRaw, "장소", 160);
    const date = text(dateRaw, 20);
    if (!/^\d{4}-\d{2}-\d{2}$/u.test(date) || !Number.isFinite(Date.parse(`${date}T00:00:00Z`))) throw new CreatorIntelligenceInputError("날짜는 YYYY-MM-DD 형식이어야 합니다.");
    const location = await geocode(place);
    if (!location) return { status: "ready", location: null, weather: null, message: "장소를 찾지 못했습니다." };
    const url = new URL(archive.href);
    url.searchParams.set("latitude", String(location.latitude));
    url.searchParams.set("longitude", String(location.longitude));
    url.searchParams.set("start_date", date);
    url.searchParams.set("end_date", date);
    url.searchParams.set("timezone", "auto");
    url.searchParams.set("daily", "weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,sunrise,sunset,daylight_duration,sunshine_duration");
    const apiKey = key(env, "OPEN_METEO_API_KEY");
    if (apiKey) url.searchParams.set("apikey", apiKey);
    const payload = record(await readJson(await options.fetch(url.href, requestInit())));
    const daily = record(payload.daily);
    const first = (name: string) => rows(daily[name])[0] ?? null;
    return {
      status: "ready",
      location,
      date,
      timezone: text(payload.timezone, 80),
      weather: {
        weatherCode: finite(first("weather_code")),
        temperatureMaxC: finite(first("temperature_2m_max")),
        temperatureMinC: finite(first("temperature_2m_min")),
        precipitationMm: finite(first("precipitation_sum")),
        sunrise: text(first("sunrise"), 80),
        sunset: text(first("sunset"), 80),
        daylightSeconds: finite(first("daylight_duration")),
        sunshineSeconds: finite(first("sunshine_duration")),
      },
      fetchedAt: new Date(now()).toISOString(),
      attribution: "Weather: Open-Meteo configured commercial endpoint. Geocoding attribution depends on the configured provider.",
    };
  }

  async function searchSoundEffects(queryRaw: unknown, pageRaw?: unknown) {
    const env = options.env();
    if (!enabled(env, "CREATOR_INTELLIGENCE_FREESOUND_ENABLED") || !key(env, "FREESOUND_API_KEY")) return { status: "disabled", items: [] };
    const query = cleanQuery(queryRaw);
    const page = cleanPage(pageRaw);
    const url = new URL("https://freesound.org/apiv2/search/");
    url.search = new URLSearchParams({ query, page: String(page), page_size: String(PAGE_SIZE), fields: "id,name,url,username,license,duration,previews,tags" }).toString();
    const payload = record(await readJson(await options.fetch(url.href, requestInit({ headers: { Authorization: `Token ${key(env, "FREESOUND_API_KEY")}` } }))));
    const items = rows(payload.results).slice(0, PAGE_SIZE).map((value) => {
      const item = record(value);
      const id = finite(item.id);
      const sourceUrl = safeHttps(item.url);
      if (id === null || !sourceUrl) return null;
      const previews = record(item.previews);
      return {
        id: `freesound:${Math.trunc(id)}`,
        title: text(item.name, 300),
        creator: text(item.username, 200),
        sourceUrl,
        previewUrl: safeHttps(previews["preview-hq-mp3"]) || safeHttps(previews["preview-lq-mp3"]),
        license: safeHttps(item.license) || text(item.license, 500),
        durationSeconds: finite(item.duration),
        tags: rows(item.tags).map((tag) => text(tag, 60)).filter(Boolean).slice(0, 20),
        rightsStatus: "verify-item-license",
      };
    }).filter(Boolean);
    return { status: "ready", page, items, hasMore: Boolean(payload.next), notice: "Preview/search only. Verify the individual sound license before project inclusion." };
  }

  async function synthesizeVoice(
    providerRaw: unknown,
    body: JsonRecord,
    externalSignal?: AbortSignal,
  ) {
    const provider = providerRaw as CreatorIntelligenceVoiceProvider;
    if (provider !== "gemini" && provider !== "deepgram") {
      throw new CreatorIntelligenceInputError("지원하지 않는 음성 제공처입니다.");
    }
    const env = options.env();
    if (!enabled(env, "CREATOR_INTELLIGENCE_VOICE_ENABLED")) {
      return { provider, status: "disabled" } as const;
    }

    const sourceText = voiceText(body.text);
    const style = voiceStyle(body.style);
    const language = text(body.language, 20).toLowerCase();
    if (language && !/^[a-z]{2,3}(?:-[a-z0-9]{2,8})?$/u.test(language)) {
      throw new CreatorIntelligenceInputError("음성 언어 코드가 올바르지 않습니다.");
    }

    if (provider === "gemini") {
      const apiKey = key(env, "GEMINI_TTS_API_KEY");
      if (!apiKey) return { provider, status: "not_configured" } as const;
      const model = geminiTtsModel(env);
      const voice = geminiTtsVoice(body.voice);
      const annotation: JsonRecord = { type: "speech_metadata" };
      if (style) annotation.style = style;
      const response = await options.fetch(
        "https://generativelanguage.googleapis.com/v1beta/interactions",
        requestInit({
          method: "POST",
          headers: {
            "x-goog-api-key": apiKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model,
            input: [{
              type: "user_input",
              content: [{
                type: "text",
                text: sourceText,
                annotations: [annotation],
              }],
            }],
            response_format: { type: "audio" },
            generation_config: { speech_config: [{ voice }] },
            store: false,
          }),
        }, TTS_REQUEST_TIMEOUT_MS, externalSignal),
      );
      const payload = record(await readJson(response, MAX_TTS_JSON_BYTES));
      const outputAudio = geminiOutputAudio(payload);
      if (outputAudio.mimeType && outputAudio.mimeType !== "audio/wav") {
        throw new Error("upstream_type");
      }
      const audioBase64 = normalizedBase64Audio(outputAudio.data, true);
      return {
        status: "ready",
        provider,
        model,
        voice,
        mimeType: "audio/wav",
        audioBase64,
        generatedAt: new Date(now()).toISOString(),
      } as const;
    }

    const deepgramEnglish = language === "en" || language.startsWith("en-");
    if (!deepgramEnglish || /[가-힣ㄱ-ㅎㅏ-ㅣぁ-んァ-ヶ一-龯]/u.test(sourceText)) {
      throw new CreatorIntelligenceInputError(
        "현재 연결된 Deepgram Aura 영어 모델은 영문 대사만 지원합니다. 한국어·일본어 등은 Gemini 또는 무료 로컬 음성을 사용하세요.",
      );
    }
    const apiKey = key(env, "DEEPGRAM_API_KEY");
    if (!apiKey) return { provider, status: "not_configured" } as const;
    const model = deepgramTtsModel(env);
    const url = new URL("https://api.deepgram.com/v1/speak");
    url.searchParams.set("model", model);
    url.searchParams.set("encoding", "mp3");
    const response = await options.fetch(url.href, requestInit({
      method: "POST",
      headers: {
        Authorization: `Token ${apiKey}`,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({ text: sourceText }),
    }, TTS_REQUEST_TIMEOUT_MS, externalSignal));
    const audioBase64 = await readAudio(response);
    return {
      status: "ready",
      provider,
      model,
      voice: model,
      mimeType: "audio/mpeg",
      audioBase64,
      generatedAt: new Date(now()).toISOString(),
    } as const;
  }

  async function generateSoundEffect(body: JsonRecord) {
    const env = options.env();
    if (!enabled(env, "CREATOR_INTELLIGENCE_ELEVENLABS_SFX_ENABLED") || !key(env, "ELEVENLABS_API_KEY")) return { status: "disabled" };
    const prompt = cleanQuery(body.prompt, "효과음 설명", 450);
    const duration = body.durationSeconds === undefined ? undefined : Number(body.durationSeconds);
    if (duration !== undefined && (!Number.isFinite(duration) || duration < 0.5 || duration > 15)) throw new CreatorIntelligenceInputError("효과음 길이는 0.5~15초 범위여야 합니다.");
    const response = await options.fetch("https://api.elevenlabs.io/v1/sound-generation", requestInit({
      method: "POST",
      headers: { "xi-api-key": key(env, "ELEVENLABS_API_KEY"), "Content-Type": "application/json", Accept: "audio/mpeg" },
      body: JSON.stringify({ text: prompt, ...(duration !== undefined ? { duration_seconds: duration } : {}), loop: body.loop === true, model_id: "eleven_text_to_sound_v2" }),
    }));
    const audioBase64 = await readAudio(response);
    return { status: "ready", provider: "elevenlabs", mimeType: "audio/mpeg", audioBase64, prompt, generatedAt: new Date(now()).toISOString() };
  }

  async function createMeshyJob(body: JsonRecord) {
    const env = options.env();
    if (!enabled(env, "CREATOR_INTELLIGENCE_MESHY_ENABLED") || !key(env, "MESHY_API_KEY")) return { status: "disabled" };
    const imageUrl = safeHttps(body.imageUrl);
    if (!imageUrl) throw new CreatorIntelligenceInputError("Meshy 입력은 공개 HTTPS 이미지 URL이어야 합니다. 로컬 이미지는 기기 내 2D→3D 변환을 사용하세요.");
    const payload = record(await readJson(await options.fetch("https://api.meshy.ai/openapi/v1/image-to-3d", requestInit({
      method: "POST",
      headers: { Authorization: `Bearer ${key(env, "MESHY_API_KEY")}`, "Content-Type": "application/json" },
      body: JSON.stringify({ image_url: imageUrl, target_formats: ["glb"], moderation: true, should_remesh: true, should_texture: true }),
    }))));
    const id = text(payload.result, 120) || text(payload.id, 120);
    if (!/^[A-Za-z0-9_-]{6,120}$/u.test(id)) throw new Error("upstream_schema");
    return { status: "ready", provider: "meshy", jobId: id };
  }

  async function getMeshyJob(jobIdRaw: unknown) {
    const env = options.env();
    if (!enabled(env, "CREATOR_INTELLIGENCE_MESHY_ENABLED") || !key(env, "MESHY_API_KEY")) return { status: "disabled" };
    const jobId = text(jobIdRaw, 120);
    if (!/^[A-Za-z0-9_-]{6,120}$/u.test(jobId)) throw new CreatorIntelligenceInputError("3D 작업 ID가 올바르지 않습니다.");
    const payload = record(await readJson(await options.fetch(`https://api.meshy.ai/openapi/v1/image-to-3d/${encodeURIComponent(jobId)}`, requestInit({ headers: { Authorization: `Bearer ${key(env, "MESHY_API_KEY")}` } }))));
    const urls = record(payload.model_urls);
    return {
      status: "ready",
      provider: "meshy",
      jobId,
      jobStatus: text(payload.status, 40),
      progress: finite(payload.progress),
      glbUrl: safeHttps(urls.glb),
      thumbnailUrl: safeHttps(payload.thumbnail_url),
      taskError: text(record(payload.task_error).message, 500),
    };
  }

  async function safeSearch(body: JsonRecord) {
    const env = options.env();
    if (!enabled(env, "CREATOR_INTELLIGENCE_SAFESEARCH_ENABLED") || !key(env, "GOOGLE_CLOUD_VISION_API_KEY")) return { status: "disabled" };
    const dataUrl = typeof body.dataUrl === "string" ? body.dataUrl : "";
    const match = /^data:image\/(?:png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/u.exec(dataUrl);
    if (!match) throw new CreatorIntelligenceInputError("PNG/JPEG/WebP 이미지 데이터만 검사할 수 있습니다.");
    const bytes = Buffer.from(match[1], "base64");
    if (bytes.byteLength === 0 || bytes.byteLength > 2 * 1024 * 1024) throw new CreatorIntelligenceInputError("외부 민감도 검사는 2MB 이하 이미지에만 사용할 수 있습니다.");
    const payload = record(await readJson(await options.fetch("https://vision.googleapis.com/v1/images:annotate", requestInit({
      method: "POST",
      headers: { "x-goog-api-key": key(env, "GOOGLE_CLOUD_VISION_API_KEY"), "Content-Type": "application/json" },
      body: JSON.stringify({ requests: [{ image: { content: match[1] }, features: [{ type: "SAFE_SEARCH_DETECTION", maxResults: 1 }] }] }),
    }))));
    const annotation = record(record(rows(payload.responses)[0]).safeSearchAnnotation);
    const likelihood = (name: string) => text(annotation[name], 30) || "UNKNOWN";
    const values = {
      adult: likelihood("adult"),
      spoof: likelihood("spoof"),
      medical: likelihood("medical"),
      violence: likelihood("violence"),
      racy: likelihood("racy"),
    };
    const reviewRequired = [values.adult, values.violence, values.racy].some((value) => value === "LIKELY" || value === "VERY_LIKELY");
    return { status: "ready", provider: "google-vision", values, reviewRequired, policy: "flag-for-human-review" };
  }

  return {
    describe,
    searchReferences,
    translate,
    searchAniList,
    sceneReference,
    searchSoundEffects,
    synthesizeVoice,
    generateSoundEffect,
    createMeshyJob,
    getMeshyJob,
    safeSearch,
  };
}

export type CreatorIntelligenceCore = ReturnType<typeof createCreatorIntelligenceCore>;
