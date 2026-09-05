import { createHash } from "node:crypto";
import { realpathSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { isIP } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

type ManifestEntry = {
  name?: unknown;
  filename?: unknown;
  category?: unknown;
  subtype?: unknown;
  seed?: unknown;
  path?: unknown;
};

type AssetKind = "image" | "vrm" | "background3d";
type AssetTypeFlag = "auto" | AssetKind;

type UploadPlanItem = {
  path: string;
  sourcePath: string;
  name: string;
  category: string;
  subtype?: string;
  seed?: number;
};

type UploadResult = {
  path: string;
  assetId: string;
  elementType: AssetKind;
  status: "uploaded" | "skipped" | "failed";
  manifest?: unknown;
  error?: string;
};

type RawOptions = {
  baseUrl: string;
  manifestPath: string;
  sessionToken?: string;
  sessionCookie?: string;
  autoDemoLogin: boolean;
  demoProvider: string;
  workId?: string;
  workTitle: string;
  elementType: AssetTypeFlag;
  concurrency: number;
  startAt: number;
  filterCategory?: Set<string>;
  skipExisting: boolean;
  dryRun: boolean;
  probeVrm: boolean;
  maxItems?: number;
  requestTimeoutMs: number;
};

export const DEFAULT_UPLOAD_REQUEST_TIMEOUT_MS = 120_000;
export const MAX_UPLOAD_RESPONSE_BYTES = 1024 * 1024;
const MAX_UPLOAD_CONCURRENCY = 8;

const DEFAULT_BASE_URL = (
  process.env.STUDIO_BASE_URL
  ?? process.env.NEST_API_URL
  ?? process.env.API_BASE_URL
  ?? "http://127.0.0.1:4001"
).replace(/\/$/, "");
const DEFAULT_MANIFEST = process.env.STUDIO_MANIFEST ?? "batch_generated/manifest.json";
const DEFAULT_SESSION_TOKEN = process.env.STUDIO_SESSION_TOKEN;
const DEFAULT_SESSION_COOKIE = process.env.STUDIO_SESSION_COOKIE;
const DEFAULT_WORK_TITLE = process.env.STUDIO_WORK_TITLE
  ?? `toonstudio-batch-${new Date().toISOString().replace(/[T:.]/g, "-").slice(0, 19)}`;
const DEFAULT_DEMO_PROVIDER = process.env.STUDIO_DEMO_PROVIDER ?? "google";

function boundedInteger(value: unknown, minimum: number, maximum: number, label: string): number {
  const parsed = typeof value === "number" ? value : typeof value === "string" && /^\d+$/u.test(value) ? Number(value) : NaN;
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${label} must be an integer from ${minimum} to ${maximum}`);
  }
  return parsed;
}

export function normalizeUploadBaseUrl(value: string): string {
  // Never echo a rejected URL: it can contain credentials or a signed query string.
  if (typeof value !== "string" || value.length > 2048 || /[\s\\?#]/u.test(value)
    || Array.from(value).some((character) => character.charCodeAt(0) <= 32 || character.charCodeAt(0) === 127)) {
    throw new Error("Invalid upload API base URL");
  }
  let url: URL;
  try { url = new URL(value); } catch { throw new Error("Invalid upload API base URL"); }
  const localHttp = url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "[::1]" || (isIP(url.hostname) === 4 && url.hostname.startsWith("127.")));
  if ((url.protocol !== "https:" && !localHttp) || url.username || url.password || url.search || url.hash) {
    throw new Error("Upload API requires HTTPS (HTTP is allowed only for loopback), without URL credentials/query/fragment");
  }
  return url.href.replace(/\/+$/u, "");
}

function uploadApiUrl(baseUrl: string, route: string): string {
  const base = normalizeUploadBaseUrl(baseUrl);
  if (!route.startsWith("/") || route.startsWith("//") || /[\s\\#]/u.test(route)) throw new Error("Invalid upload API route");
  try {
    for (const segment of route.split("?")[0]!.split("/")) {
      const decoded = decodeURIComponent(segment);
      if (decoded === "." || decoded === ".." || decoded.includes("/") || decoded.includes("\\")) throw new Error("unsafe segment");
    }
  } catch { throw new Error("Invalid upload API route"); }
  const url = new URL(base + route);
  const prefix = new URL(base).pathname.replace(/\/+$/u, "") + "/";
  if (url.origin !== new URL(base).origin || !url.pathname.startsWith(prefix)) throw new Error("Upload API route leaves configured base");
  return url.href;
}

function parsePositiveIntegerOrDefault(rawValue: string | undefined, fallback: number | undefined): number | undefined {
  if (rawValue == null) return fallback;
  const candidate = Number(rawValue);
  if (!Number.isInteger(candidate) || candidate < 1) return fallback;
  return candidate;
}

function parseNonNegativeIntegerOrDefault(rawValue: string | undefined, fallback: number): number {
  if (rawValue == null) return fallback;
  const candidate = Number(rawValue);
  if (!Number.isInteger(candidate) || candidate < 0) return fallback;
  return candidate;
}

function parseCategorySet(rawValue: string | undefined): Set<string> | undefined {
  if (!rawValue) return undefined;
  const values = rawValue.split(",").map((entry) => entry.trim()).filter(Boolean);
  if (values.length === 0) return undefined;
  return new Set(values);
}

function parseBooleanFlag(rawValue: string | undefined, fallback: boolean): boolean {
  if (rawValue == null) return fallback;
  const normalized = rawValue.trim().toLowerCase();
  if (["1", "true", "yes", "y", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "n", "off"].includes(normalized)) return false;
  return fallback;
}

function usage(exitCode = 1): never {
  const text = [
    "사용법",
    "  pnpm run studio:upload-assets -- [옵션]",
    "",
    "옵션",
    "  --base-url https://...           API 주소 (HTTPS; loopback만 HTTP 허용)",
    "  --manifest ./path/to/manifest.json  업로드 대상 manifest 경로 (기본: " + DEFAULT_MANIFEST + ")",
    "  --session-token <jwt>            x-user-id 로 사용할 session token (권장)",
    "  --session-cookie <cookie>         인증 cookie 값(예: toonsession=...)",
    "  --auto-demo-login                 토큰/쿠키가 없을 때 /api/auth/oauth/<provider>/demo 호출",
    "  --demo-provider google|kakao|naver  데모 로그인 프로바이더 (기본: google)",
    "  --work-id <id>                    기존 작품 ID 사용",
    "  --work-title " + '"작품 이름"' + "              새 작품 생성 시 제목 (기본: " + DEFAULT_WORK_TITLE + ")",
    "  --type auto|image|vrm|background3d  업로드 타입(기본: auto)",
    "  --concurrency N                   동시 업로드 개수 1~8 (기본: 2)",
    "  --request-timeout-ms N            응답 본문 포함 요청 제한 100~600000ms (기본: 120000)",
    "  --start-index N                   manifest index 시작 위치 (0-base, 기본: 0)",
    "  --max-items N                     start-index 기준 최대 업로드 개수",
    "  --filter-category cat1,cat2        category 필터(예: character,background,prop)",
    "  --skip-existing                   동일 assetId가 이미 있을 때 건너뜀",
    "  --dry-run                         API 호출 없이 예정 목록만 출력",
    "  --no-probe-vrm                    GLB 안의 VRM marker 검사 생략(모든 비이미지를 background3d로 처리)",
    "  --help                            이 도움말 출력",
    "",
    "예시",
    "  pnpm run studio:upload-assets -- --auto-demo-login --type auto --max-items 20 --dry-run",
    "  pnpm run studio:upload-assets -- --session-token <token> --work-title \"toon batch\" --filter-category background,character",
  ].join("\n");
  console.log(text);
  process.exit(exitCode);
}

function parseArgs(): RawOptions {
  const args = process.argv.slice(2);
  let authWasExplicit = DEFAULT_SESSION_TOKEN != null || DEFAULT_SESSION_COOKIE != null;
  let requestedConcurrency: unknown = process.env.STUDIO_CONCURRENCY ?? 2;
  let requestedTimeoutMs: unknown = process.env.STUDIO_REQUEST_TIMEOUT_MS ?? DEFAULT_UPLOAD_REQUEST_TIMEOUT_MS;
  const options: RawOptions = {
    baseUrl: DEFAULT_BASE_URL,
    manifestPath: DEFAULT_MANIFEST,
    autoDemoLogin: parseBooleanFlag(process.env.STUDIO_AUTO_DEMO_LOGIN, false),
    demoProvider: DEFAULT_DEMO_PROVIDER,
    sessionToken: DEFAULT_SESSION_TOKEN,
    sessionCookie: DEFAULT_SESSION_COOKIE,
    filterCategory: parseCategorySet(process.env.STUDIO_FILTER_CATEGORY),
    workTitle: DEFAULT_WORK_TITLE,
    elementType: "auto",
    concurrency: 2,
    requestTimeoutMs: DEFAULT_UPLOAD_REQUEST_TIMEOUT_MS,
    startAt: parseNonNegativeIntegerOrDefault(process.env.STUDIO_START_INDEX, 0),
    skipExisting: parseBooleanFlag(process.env.STUDIO_SKIP_EXISTING, false),
    dryRun: parseBooleanFlag(process.env.STUDIO_DRY_RUN, false),
    probeVrm: !parseBooleanFlag(process.env.STUDIO_NO_PROBE_VRM, false),
    maxItems: parsePositiveIntegerOrDefault(process.env.STUDIO_MAX_ITEMS, undefined),
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    const next = args[i + 1];

    if (arg === "--") {
      continue;
    }
    if (!arg.startsWith("--")) {
      continue;
    }
    if (arg === "--help") usage(0);

    switch (arg) {
      case "--base-url":
      case "--api-base":
      case "--base":
        if (!next) throw new Error(`${arg} requires a value`);
        options.baseUrl = next.replace(/\/$/, "");
        i += 1;
        break;
      case "--manifest":
        if (!next) throw new Error("--manifest requires a value");
        options.manifestPath = next;
        i += 1;
        break;
      case "--session-token":
        if (!next) throw new Error("--session-token requires a value");
        options.sessionToken = next;
        options.sessionCookie = undefined;
        authWasExplicit = true;
        i += 1;
        break;
      case "--session-cookie":
        if (!next) throw new Error("--session-cookie requires a value");
        options.sessionCookie = next;
        options.sessionToken = undefined;
        authWasExplicit = true;
        i += 1;
        break;
      case "--auto-demo-login":
        options.autoDemoLogin = true;
        break;
      case "--demo-provider":
        if (!next) throw new Error("--demo-provider requires a value");
        options.demoProvider = next;
        i += 1;
        break;
      case "--work-id":
        if (!next) throw new Error("--work-id requires a value");
        options.workId = next;
        i += 1;
        break;
      case "--work-title":
        if (!next) throw new Error("--work-title requires a value");
        options.workTitle = next;
        i += 1;
        break;
      case "--type": {
        if (!next) throw new Error("--type requires a value");
        const raw = next;
        if (raw !== "auto" && raw !== "image" && raw !== "vrm" && raw !== "background3d") {
          throw new Error("--type must be one of: auto, image, vrm, background3d");
        }
        options.elementType = raw;
        i += 1;
        break;
      }
      case "--concurrency": {
        if (!next) throw new Error("--concurrency requires a value");
        requestedConcurrency = next;
        i += 1;
        break;
      }
      case "--request-timeout-ms":
        if (!next) throw new Error("--request-timeout-ms requires a value");
        requestedTimeoutMs = next;
        i += 1;
        break;
      case "--start-index":
      case "--start": {
        if (!next) throw new Error(`${arg} requires a value`);
        const v = Number(next);
        if (!Number.isInteger(v) || v < 0) {
          throw new Error(`${arg} must be a non-negative integer`);
        }
        options.startAt = v;
        i += 1;
        break;
      }
      case "--max-items":
        if (!next) throw new Error("--max-items requires a value");
        {
          const v = Number(next);
          if (!Number.isInteger(v) || v < 1) throw new Error("--max-items must be an integer >= 1");
          options.maxItems = v;
          i += 1;
        }
        break;
      case "--filter-category":
        if (!next) throw new Error("--filter-category requires a value");
        options.filterCategory = parseCategorySet(next);
        if (!options.filterCategory || options.filterCategory.size === 0) {
          throw new Error("filter-category is empty");
        }
        i += 1;
        break;
      case "--skip-existing":
        options.skipExisting = true;
        break;
      case "--dry-run":
        options.dryRun = true;
        break;
      case "--no-probe-vrm":
        options.probeVrm = false;
        break;
      default:
        console.error(`Unknown option: ${arg}`);
        usage();
    }
  }

  if (
    !options.dryRun &&
    !authWasExplicit &&
    !options.autoDemoLogin &&
    !options.sessionCookie &&
    !options.sessionToken
  ) {
    throw new Error("인증 정보가 없습니다. --session-token 또는 --session-cookie 또는 --auto-demo-login 필요");
  }

  if (options.maxItems !== undefined && options.maxItems <= 0) {
    throw new Error("--max-items must be greater than 0");
  }

  options.concurrency = boundedInteger(requestedConcurrency, 1, MAX_UPLOAD_CONCURRENCY, "--concurrency");
  options.requestTimeoutMs = boundedInteger(requestedTimeoutMs, 100, 600_000, "--request-timeout-ms");
  options.baseUrl = normalizeUploadBaseUrl(options.baseUrl);
  return options;
}

export async function loadManifest(manifestPath: string): Promise<UploadPlanItem[]> {
  const manifestDirectory = path.dirname(path.resolve(manifestPath));
  const raw = JSON.parse(await readFile(manifestPath, "utf8"));
  if (!Array.isArray(raw)) {
    throw new Error("Manifest must be an array");
  }
  return raw.map((entry: ManifestEntry, index: number): UploadPlanItem => {
    if (typeof entry?.path !== "string") {
      throw new Error(`Manifest entry at index ${index} does not have a valid path`);
    }
    const category = typeof entry.category === "string" ? entry.category : "unclassified";
    const name =
      typeof entry.name === "string" && entry.name.length > 0
        ? entry.name
        : path.parse(entry.path).name || `asset-${index + 1}`;
    const sourcePath = entry.path;
    return {
      path: path.isAbsolute(sourcePath)
        ? sourcePath
        : path.resolve(manifestDirectory, sourcePath),
      sourcePath,
      name,
      category,
      subtype: typeof entry.subtype === "string" ? entry.subtype : undefined,
      seed: typeof entry.seed === "number" ? entry.seed : undefined,
    };
  });
}

function canonicalizeAssetId(input: string): string {
  const ascii = input
    .normalize("NFKD")
    .replace(/[\u0300-\u036F]/gu, "")
    .replace(/[^a-zA-Z0-9_.-]+/gu, "-");
  return ascii
    .replace(/-+/gu, "-")
    .replace(/^[-._]+|[-._]+$/gu, "")
    .slice(0, 150);
}

export function buildAssetId(plan: UploadPlanItem, index: number, used: Set<string>): string {
  const categoryPart = canonicalizeAssetId(plan.category || "asset").toLowerCase();
  const raw = canonicalizeAssetId(`${plan.name || plan.sourcePath}`).toLowerCase();
  const suffix = plan.seed != null ? `seed-${plan.seed}` : `idx-${index + 1}`;
  let candidate = `${categoryPart}-${raw}-${suffix}`;
  candidate = candidate.replace(/--+/gu, "-").replace(/^[-._]+|[-._]+$/gu, "");
  candidate = candidate || `asset-${index + 1}`;
  if (candidate.length > 120) {
    candidate = candidate.slice(0, 120);
  }
  const baseCandidate = candidate;
  const hash = createHash("sha256").update(plan.path + index).digest("hex").slice(0, 6);
  let collision = 0;
  while (used.has(candidate)) {
    collision += 1;
    // Appending the same hash repeatedly stops making progress at the length cap.
    const tail = `-${hash}${collision === 1 ? "" : `-${collision}`}`;
    candidate = baseCandidate.slice(0, 120 - tail.length) + tail;
  }
  used.add(candidate);
  return candidate;
}

const TEXT_DECODER = new TextDecoder("utf-8", { fatal: true });
const MAX_VRM_JSON_BYTES = 16 * 1024 * 1024;

/** Bounded GLB container probe, not a full glTF/VRM conformance validator. */
export function detectVrmModelFromGlb(bytes: Uint8Array): boolean {
  if (bytes.length < 24) return false;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== 0x46546c67 || view.getUint32(4, true) !== 2
    || view.getUint32(8, true) !== bytes.length) return false;
  // GLB: 12-byte file header + 8-byte chunk header, JSON type at 16, JSON data at 20.
  const jsonChunkLength = view.getUint32(12, true);
  if (!jsonChunkLength || jsonChunkLength % 4 || jsonChunkLength > MAX_VRM_JSON_BYTES
    || view.getUint32(16, true) !== 0x4e4f534a) return false;
  const jsonEnd = 20 + jsonChunkLength;
  if (jsonEnd > bytes.length) return false;
  let offset = jsonEnd;
  while (offset < bytes.length) {
    if (offset + 8 > bytes.length) return false;
    const length = view.getUint32(offset, true);
    const type = view.getUint32(offset + 4, true);
    if (length % 4 || offset + 8 + length > bytes.length || type === 0x4e4f534a) return false;
    if (type === 0x004e4942 && offset !== jsonEnd) return false;
    offset += 8 + length;
  }

  let doc: unknown;
  try {
    doc = JSON.parse(TEXT_DECODER.decode(bytes.subarray(20, jsonEnd)));
  } catch {
    return false;
  }
  if (!(doc && typeof doc === "object") || Array.isArray(doc)) return false;

  const asset = (doc as { asset?: unknown }).asset;
  const assetVersion =
    asset && typeof asset === "object" ? (asset as { version?: unknown }).version : undefined;
  if (assetVersion !== "2.0") return false;

  const extensionsUsed = Array.isArray((doc as { extensionsUsed?: unknown }).extensionsUsed)
    ? (doc as { extensionsUsed: unknown[] }).extensionsUsed.filter((entry) => typeof entry === "string")
    : [];
  const extensions = (doc as { extensions?: unknown }).extensions;
  const hasExtensions =
    extensionsUsed.includes("VRM") ||
    extensionsUsed.includes("VRMC_vrm") ||
    (typeof extensions === "object" && extensions !== null && (
      Object.hasOwn(extensions as Record<string, unknown>, "VRM") ||
      Object.hasOwn(extensions as Record<string, unknown>, "VRMC_vrm")
    ));
  return hasExtensions;
}

export function resolveAssetKind(plan: UploadPlanItem, override: AssetTypeFlag, bytes: Uint8Array, detect: boolean): AssetKind {
  // An explicit CLI override must not be silently defeated by generated manifest metadata.
  if (override !== "auto") return override;
  const declaredKind = plan.subtype;
  if (declaredKind === "image" || declaredKind === "vrm") return declaredKind;
  const extension = path.extname(plan.path).toLowerCase();
  if (extension === ".vrm" || (extension === ".glb" && detect && detectVrmModelFromGlb(bytes))) return "vrm";
  if (declaredKind === "background3d") return declaredKind;
  if ([".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".tif", ".tiff"].includes(extension)) return "image";
  return "background3d";
}

function createDescriptor(assetId: string, kind: AssetKind): string {
  const descriptor = {
    version: 1,
    element: {
      id: assetId,
      type: kind,
      x: 0,
      y: 0,
      width: 1024,
      height: 1024,
      rotation: 0,
    },
  };
  return JSON.stringify(descriptor);
}

export function makeFormData(fileBytes: Uint8Array, filename: string, kind: AssetKind, assetId: string): FormData {
  const formData = new FormData();
  const mime = kind === "image" ? "application/octet-stream" : "model/gltf-binary";
  // A pooled Buffer's .buffer can contain unrelated bytes before and after the file view.
  // Copy only the supplied view; Blob then snapshots that exact byte range.
  const blob = new Blob([Uint8Array.from(fileBytes)], { type: mime });
  formData.append("file", blob, filename);
  formData.append("elementType", kind);
  formData.append("descriptor", createDescriptor(assetId, kind));
  return formData;
}

function parseApiError(response: Response): string {
  // Server diagnostics can echo session tokens/cookies or signed URLs. Do not print verbatim remote diagnostic bodies.
  return `HTTP ${response.status}`;
}

/** Fetch and consume a bounded response under one deadline. Never follow redirects or retry writes. */
export async function requestUploadApi(
  baseUrl: string,
  route: string,
  options: RequestInit,
  headers: Record<string, string>,
  timeoutMs = DEFAULT_UPLOAD_REQUEST_TIMEOUT_MS
): Promise<Response> {
  boundedInteger(timeoutMs, 100, 600_000, "request-timeout-ms");
  const url = uploadApiUrl(baseUrl, route);
  const controller = new AbortController();
  const signal = options.signal ? AbortSignal.any([options.signal, controller.signal]) : controller.signal;
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  timer.unref();
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    const requestHeaders = new Headers(options.headers);
    for (const [name, value] of Object.entries(headers)) {
      if (/[\r\n]/u.test(name) || /[\r\n]/u.test(value)) throw new Error("Invalid upload authentication header");
      requestHeaders.set(name, value);
    }
    requestHeaders.set("accept", "application/json");
    const response = await fetch(url, { ...options, headers: requestHeaders, redirect: "manual", signal });
    reader = response.body?.getReader();
    if (response.status >= 300 && response.status < 400) throw new Error("Upload API redirect refused");
    const advertised = response.headers.get("content-length");
    if (advertised !== null && (!/^\d+$/u.test(advertised) || Number(advertised) > MAX_UPLOAD_RESPONSE_BYTES)) {
      throw new Error("Upload API response exceeds byte limit");
    }
    // The actual decoded stream is authoritative; Content-Length can be absent or compressed.
    const chunks: Uint8Array[] = [];
    let total = 0;
    if (reader) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > MAX_UPLOAD_RESPONSE_BYTES) throw new Error("Upload API response exceeds byte limit");
        chunks.push(value);
      }
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    // Consumers get only an already-drained snapshot, so even ignored GET bodies release connections.
    return new Response([204, 205, 304].includes(response.status) ? null : bytes, {
      status: response.status, statusText: "", headers: response.headers,
    });
  } catch (error) {
    if (controller.signal.aborted) throw new Error("Upload API request timed out (including response body); server outcome may be unknown");
    if (options.signal?.aborted) throw new Error("Upload API request cancelled; server outcome may be unknown");
    const message = error instanceof Error ? error.message : "";
    if (message === "Upload API redirect refused" || message === "Upload API response exceeds byte limit") throw new Error(message);
    // fetch/Headers/JSON exceptions may contain user-supplied authentication values. Do not relay them.
    throw new Error("Upload API transport failed; server outcome may be unknown");
  } finally {
    clearTimeout(timer);
    controller.abort();
    if (reader) { await reader.cancel().catch(() => undefined); reader.releaseLock(); }
  }
}

async function apiObject(response: Response): Promise<Record<string, unknown>> {
  try {
    const value: unknown = JSON.parse(await response.text());
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("not an object");
    return value as Record<string, unknown>;
  } catch {
    throw new Error("Upload API returned invalid JSON object; server outcome may be unknown");
  }
}

async function loginByDemoProvider(baseUrl: string, provider: string, timeoutMs: number): Promise<string> {
  const res = await requestUploadApi(baseUrl, `/api/auth/oauth/${encodeURIComponent(provider)}/demo`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
  }, {}, timeoutMs);
  if (!res.ok) {
    throw new Error(`demo login failed: ${parseApiError(res)}`);
  }
  const setCookies = typeof (res.headers as Headers).getSetCookie === "function"
    ? res.headers.getSetCookie()
    : [];
  if (setCookies.length === 0) {
    throw new Error("demo login response had no Set-Cookie header");
  }
  const sessionCookies = setCookies.map((cookie) => cookie.split(";")[0]?.trim() ?? "")
    .filter((cookie) => cookie.startsWith("toonsession="));
  if (sessionCookies.length !== 1 || sessionCookies[0]!.length <= "toonsession=".length) {
    throw new Error("demo login requires exactly one nonempty toonsession cookie");
  }
  return sessionCookies[0]!;
}

async function ensureAuth(options: RawOptions): Promise<Record<string, string>> {
  if (options.sessionToken) {
    return { "x-user-id": options.sessionToken };
  }
  if (options.sessionCookie) {
    return { cookie: options.sessionCookie };
  }
  if (options.autoDemoLogin) {
    const cookie = await loginByDemoProvider(options.baseUrl, options.demoProvider, options.requestTimeoutMs);
    return { cookie };
  }
  throw new Error("인증 정보가 없습니다. --session-token 또는 --session-cookie 또는 --auto-demo-login 필요");
}

async function ensureWork(baseUrl: string, headers: Record<string, string>, options: RawOptions): Promise<string> {
  if (options.workId) {
    const res = await requestUploadApi(baseUrl, `/api/creator/works/${encodeURIComponent(options.workId)}`, {
      method: "GET",
    }, headers, options.requestTimeoutMs);
    if (!res.ok) {
      if (res.status === 404) {
        throw new Error(`지정한 작품ID가 없습니다: ${options.workId}`);
      }
      throw new Error(`작품 조회 실패: ${parseApiError(res)}`);
    }
    return options.workId;
  }

  const res = await requestUploadApi(baseUrl, "/api/creator/works", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      title: options.workTitle,
      format: "upload",
    }),
  }, headers, options.requestTimeoutMs);
  if (!res.ok) {
    throw new Error(`작품 생성 실패: ${parseApiError(res)}`);
  }
  const created = await apiObject(res);
  const workId = created.id || created.workId;
  if (!workId || typeof workId !== "string") {
    throw new Error("작품 생성 응답에 id가 없습니다.");
  }
  return workId;
}

export async function hasExistingAsset(
  baseUrl: string,
  headers: Record<string, string>,
  workId: string,
  assetId: string,
  kind: AssetKind,
  timeoutMs = DEFAULT_UPLOAD_REQUEST_TIMEOUT_MS
): Promise<boolean> {
  const res = await requestUploadApi(baseUrl, `/api/creator/works/${encodeURIComponent(workId)}/assets/${encodeURIComponent(assetId)}?elementType=${encodeURIComponent(kind)}`, {
    method: "GET",
  }, headers, timeoutMs);
  if (res.ok) return true;
  if (res.status === 404) return false;
  // Auth, throttling and server errors are not evidence that an asset is absent.
  throw new Error(`기존 에셋 조회 실패 (${res.status}): ${parseApiError(res)}`);
}

async function uploadAsset(
  baseUrl: string,
  headers: Record<string, string>,
  workId: string,
  item: UploadPlanItem,
  kind: AssetKind,
  assetId: string,
  fileBytes: Uint8Array,
  timeoutMs: number
): Promise<unknown> {
  const formData = makeFormData(fileBytes, path.basename(item.path), kind, assetId);
  const res = await requestUploadApi(baseUrl, `/api/creator/works/${encodeURIComponent(workId)}/assets/${encodeURIComponent(assetId)}`, {
    method: "PUT",
    body: formData,
  }, headers, timeoutMs);
  if (!res.ok) {
    throw new Error(parseApiError(res));
  }
  const receipt = await apiObject(res);
  if (receipt.assetId !== assetId) throw new Error("Upload receipt asset ID mismatch; server outcome may be unknown");
  return receipt;
}

async function main(): Promise<void> {
  try {
    const options = parseArgs();
    const t0 = performance.now();

    const manifest = await loadManifest(options.manifestPath);
    let worklist = manifest;
    if (options.filterCategory && options.filterCategory.size > 0) {
      worklist = worklist.filter((entry) => options.filterCategory!.has(entry.category));
    }
    worklist = worklist.slice(options.startAt);
    if (options.maxItems !== undefined) {
      worklist = worklist.slice(0, options.maxItems);
    }

    console.log(`대상 항목: ${worklist.length}개`);
    if (options.dryRun) {
      const sample = worklist.slice(0, 20).map((entry, index) => ({
        idx: index,
        name: entry.name,
        path: entry.sourcePath,
        category: entry.category,
      }));
      console.log("DRY-RUN 항목 샘플:");
      console.table(sample);
      return;
    }

    if (worklist.length === 0) {
      console.log("업로드할 항목이 없어 인증·작품 생성·전송을 실행하지 않았습니다.");
      process.exitCode = 2;
      return;
    }

    // Allocate against the entire manifest in order, before filtering/resuming or concurrent reads.
    const usedIds = new Set<string>();
    const assetIds = new Map(manifest.map((entry, index) => [entry, buildAssetId(entry, index, usedIds)]));
    const authHeaders = await ensureAuth(options);
    const workId = await ensureWork(options.baseUrl, authHeaders, options);
    console.log(`업로드 대상 작업: ${workId}`);

    const results: UploadResult[] = [];
    let cursor = 0;

    const worker = async () => {
      while (cursor < worklist.length) {
        const index = cursor;
        cursor += 1;
        const plan = worklist[index] as UploadPlanItem;
        const itemLabel = `${index + options.startAt + 1}/${worklist.length + options.startAt}`;

        try {
          const fileBytes = new Uint8Array(await readFile(plan.path));
          const assetType = resolveAssetKind(plan, options.elementType, fileBytes, options.probeVrm);
          const assetId = assetIds.get(plan);
          if (!assetId) throw new Error("업로드 에셋 ID 계획이 없습니다.");

          if (options.skipExisting && await hasExistingAsset(options.baseUrl, authHeaders, workId, assetId, assetType, options.requestTimeoutMs)) {
            console.log(`[${itemLabel}] skip (exists) ${assetId}`);
            results.push({
              path: plan.sourcePath,
              assetId,
              elementType: assetType,
              status: "skipped",
            });
            continue;
          }

          const manifest = await uploadAsset(options.baseUrl, authHeaders, workId, plan, assetType, assetId, fileBytes, options.requestTimeoutMs);
          console.log(`[${itemLabel}] OK ${plan.name} (${assetType}) -> ${assetId}`);
          results.push({
            path: plan.sourcePath,
            assetId,
            elementType: assetType,
            status: "uploaded",
            manifest,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : "unknown";
          console.error(`[${itemLabel}] FAIL ${plan.name}: ${message}`);
          results.push({
            path: plan.sourcePath,
            assetId: "",
            elementType: "background3d",
            status: "failed",
            error: message,
          });
        }
      }
    };

    const workers = Array.from({ length: Math.max(1, options.concurrency) }, () => worker());
    await Promise.all(workers);

    const uploaded = results.filter((result) => result.status === "uploaded").length;
    const skipped = results.filter((result) => result.status === "skipped").length;
    const failed = results.filter((result) => result.status === "failed").length;
    const elapsedMs = performance.now() - t0;

    console.log("\n요약");
    console.log(`  업로드: ${uploaded}`);
    console.log(`  스킵: ${skipped}`);
    console.log(`  실패: ${failed}`);
    console.log(`  소요: ${(elapsedMs / 1000).toFixed(1)}초`);

    if (failed > 0) {
      console.log("\n실패 내역:");
      for (const entry of results.filter((result) => result.status === "failed")) {
        console.log(`- ${entry.path}: ${entry.error}`);
      }
      process.exitCode = 1;
    }
  } catch (error) {
    console.error("실행 실패:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}

function isDirectExecution(): boolean {
  try {
    const entrypoint = process.argv[1];
    return entrypoint !== undefined && realpathSync(entrypoint) === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
}

// Importing pure helpers in tests must never authenticate or create a work.
if (isDirectExecution()) void main();
