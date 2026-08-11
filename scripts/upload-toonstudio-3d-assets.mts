import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";

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
};

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
    "  --base-url https://...           API 기본 주소 (기본: " + DEFAULT_BASE_URL + ")",
    "  --manifest ./path/to/manifest.json  업로드 대상 manifest 경로 (기본: " + DEFAULT_MANIFEST + ")",
    "  --session-token <jwt>            x-user-id 로 사용할 session token (권장)",
    "  --session-cookie <cookie>         인증 cookie 값(예: toonsession=...)",
    "  --auto-demo-login                 토큰/쿠키가 없을 때 /api/auth/oauth/<provider>/demo 호출",
    "  --demo-provider google|kakao|naver  데모 로그인 프로바이더 (기본: google)",
    "  --work-id <id>                    기존 작품 ID 사용",
    "  --work-title " + '"작품 이름"' + "              새 작품 생성 시 제목 (기본: " + DEFAULT_WORK_TITLE + ")",
    "  --type auto|image|vrm|background3d  업로드 타입(기본: auto)",
    "  --concurrency N                   동시 업로드 개수 (기본: 2)",
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
    concurrency: parsePositiveIntegerOrDefault(process.env.STUDIO_CONCURRENCY, 2) ?? 2,
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
        const v = Number(next);
        if (!Number.isFinite(v) || v < 1) throw new Error("--concurrency must be an integer >= 1");
        options.concurrency = Math.floor(v);
        i += 1;
        break;
      }
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

  return options;
}

async function loadManifest(manifestPath: string): Promise<UploadPlanItem[]> {
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

function buildAssetId(plan: UploadPlanItem, index: number, used: Set<string>): string {
  const categoryPart = canonicalizeAssetId(plan.category || "asset").toLowerCase();
  const raw = canonicalizeAssetId(`${plan.name || plan.sourcePath}`).toLowerCase();
  const suffix = plan.seed != null ? `seed-${plan.seed}` : `idx-${index + 1}`;
  let candidate = `${categoryPart}-${raw}-${suffix}`;
  candidate = candidate.replace(/--+/gu, "-").replace(/^[-._]+|[-._]+$/gu, "");
  candidate = candidate || `asset-${index + 1}`;
  if (candidate.length > 120) {
    candidate = candidate.slice(0, 120);
  }
  while (used.has(candidate)) {
    const hash = createHash("sha256").update(plan.path + index).digest("hex").slice(0, 6);
    const tail = `-${hash}`;
    candidate = (candidate.slice(0, 120 - tail.length) + tail).replace(/[-._]+$/u, "");
    if (candidate.length < 4) {
      candidate = `asset-${hash}`;
    }
  }
  used.add(candidate);
  return candidate;
}

const TEXT_DECODER = new TextDecoder();

function readUInt32LE(bytes: Uint8Array, offset: number): number {
  return (
    (bytes[offset] || 0)
    + ((bytes[offset + 1] || 0) << 8)
    + ((bytes[offset + 2] || 0) << 16)
    + ((bytes[offset + 3] || 0) << 24)
  );
}

function detectVrmModelFromGlb(bytes: Uint8Array): boolean {
  if (bytes.length < 32) return false;
  if (readUInt32LE(bytes, 0) !== 0x46546c67) return false; // glTF magic
  if (readUInt32LE(bytes, 4) !== 2) return false;
  const jsonChunkLength = readUInt32LE(bytes, 12);
  if (readUInt32LE(bytes, 20) !== 0x4e4f534a) return false; // JSON
  const jsonStart = 28;
  const jsonEnd = jsonStart + jsonChunkLength;
  if (!Number.isSafeInteger(jsonEnd) || jsonEnd > bytes.length) return false;
  const rawJson = TEXT_DECODER.decode(bytes.slice(jsonStart, jsonEnd));

  let doc: unknown;
  try {
    doc = JSON.parse(rawJson);
  } catch {
    return false;
  }
  if (!(doc && typeof doc === "object")) return false;

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

function resolveAssetKind(plan: UploadPlanItem, override: AssetTypeFlag, bytes: Uint8Array, detect: boolean): AssetKind {
  const declaredKind = plan.subtype;
  if (declaredKind === "image" || declaredKind === "vrm" || declaredKind === "background3d") {
    return declaredKind;
  }

  if (override !== "auto") return override;
  const extension = path.extname(plan.path).toLowerCase();
  if (extension === ".png" || extension === ".jpg" || extension === ".jpeg" || extension === ".webp" || extension === ".gif" || extension === ".bmp" || extension === ".tif" || extension === ".tiff") {
    return "image";
  }
  if (extension === ".vrm") {
    return "vrm";
  }
  if ((extension === ".glb" || extension === ".gltf") && detect && detectVrmModelFromGlb(bytes)) {
    return "vrm";
  }
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

function makeFormData(fileBytes: Uint8Array, filename: string, kind: AssetKind, assetId: string): FormData {
  const formData = new FormData();
  const mime = kind === "image" ? "application/octet-stream" : "model/gltf-binary";
  const blobSource = Buffer.from(fileBytes).buffer;
  const blob = new Blob([blobSource], { type: mime });
  formData.append("file", blob, filename);
  formData.append("elementType", kind);
  formData.append("descriptor", createDescriptor(assetId, kind));
  return formData;
}

async function parseApiError(response: Response): Promise<string> {
  const raw = await response.text().catch(() => "");
  if (!raw) return `${response.status} ${response.statusText}`;
  try {
    const parsed = JSON.parse(raw) as { error?: string; message?: string };
    if (typeof parsed.error === "string" && parsed.error.length > 0) return parsed.error;
    if (typeof parsed.message === "string" && parsed.message.length > 0) return parsed.message;
    return raw;
  } catch {
    return raw.slice(0, 1_200);
  }
}

async function apiRequest(
  baseUrl: string,
  route: string,
  options: RequestInit,
  headers: Record<string, string>,
  useAuthCookie: boolean
): Promise<Response> {
  const init: RequestInit = {
    ...options,
    headers: {
      ...headers,
      ...(options.headers as Record<string, string> | undefined),
      accept: "application/json",
    },
  };

  const requestRoute = route.startsWith("http") ? route : `${baseUrl}${route.startsWith("/") ? "" : "/"}${route}`;
  const response = await fetch(requestRoute, init);

  if (!response.ok && useAuthCookie && response.status === 403 && response.url.includes("/auth/oauth")) {
    const reason = await parseApiError(response);
    throw new Error(`auth failed: ${reason}`);
  }
  return response;
}

async function loginByDemoProvider(baseUrl: string, provider: string): Promise<string> {
  const res = await fetch(`${baseUrl}/api/auth/oauth/${encodeURIComponent(provider)}/demo`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
  });
  if (!res.ok) {
    throw new Error(`demo login failed: ${await parseApiError(res)}`);
  }
  const setCookies = typeof (res.headers as Headers).getSetCookie === "function"
    ? res.headers.getSetCookie()
    : [];
  if (setCookies.length === 0) {
    throw new Error("demo login response had no Set-Cookie header");
  }
  const cookiePairs = setCookies
    .map((cookie) => cookie.split(";")[0] ?? "")
    .filter(Boolean)
    .join("; ");
  if (!cookiePairs.toLowerCase().includes("toonsession=")) {
    throw new Error("demo login cookie did not include toonsession token");
  }
  return cookiePairs;
}

async function ensureAuth(options: RawOptions): Promise<Record<string, string>> {
  if (options.sessionToken) {
    return { "x-user-id": options.sessionToken };
  }
  if (options.sessionCookie) {
    return { cookie: options.sessionCookie };
  }
  if (options.autoDemoLogin) {
    const cookie = await loginByDemoProvider(options.baseUrl, options.demoProvider);
    return { cookie };
  }
  throw new Error("인증 정보가 없습니다. --session-token 또는 --session-cookie 또는 --auto-demo-login 필요");
}

async function ensureWork(baseUrl: string, headers: Record<string, string>, options: RawOptions): Promise<string> {
  if (options.workId) {
    const res = await apiRequest(baseUrl, `/api/creator/works/${encodeURIComponent(options.workId)}`, {
      method: "GET",
    }, headers, false);
    if (!res.ok) {
      if (res.status === 404) {
        throw new Error(`지정한 작품ID가 없습니다: ${options.workId}`);
      }
      throw new Error(`작품 조회 실패: ${await parseApiError(res)}`);
    }
    return options.workId;
  }

  const res = await apiRequest(baseUrl, "/api/creator/works", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      title: options.workTitle,
      format: "upload",
    }),
  }, headers, true);
  if (!res.ok) {
    throw new Error(`작품 생성 실패: ${await parseApiError(res)}`);
  }
  const created = await res.json() as { id?: string; workId?: string };
  const workId = created.id || created.workId;
  if (!workId || typeof workId !== "string") {
    throw new Error("작품 생성 응답에 id가 없습니다.");
  }
  return workId;
}

async function hasExistingAsset(
  baseUrl: string,
  headers: Record<string, string>,
  workId: string,
  assetId: string,
  kind: AssetKind
): Promise<boolean> {
  const res = await apiRequest(baseUrl, `/api/creator/works/${encodeURIComponent(workId)}/assets/${encodeURIComponent(assetId)}?elementType=${encodeURIComponent(kind)}`, {
    method: "GET",
  }, headers, true);
  return res.ok;
}

async function uploadAsset(
  baseUrl: string,
  headers: Record<string, string>,
  workId: string,
  item: UploadPlanItem,
  kind: AssetKind,
  assetId: string,
  fileBytes: Uint8Array
): Promise<unknown> {
  const formData = makeFormData(fileBytes, path.basename(item.path), kind, assetId);
  const res = await apiRequest(baseUrl, `/api/creator/works/${encodeURIComponent(workId)}/assets/${encodeURIComponent(assetId)}`, {
    method: "PUT",
    body: formData,
  }, headers, true);
  if (!res.ok) {
    throw new Error(await parseApiError(res));
  }
  return res.json();
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

    const startId = 0;
    const authHeaders = await ensureAuth(options);
    const workId = await ensureWork(options.baseUrl, authHeaders, options);
    console.log(`업로드 대상 작업: ${workId}`);

    const usedIds = new Set<string>();
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
          const assetId = buildAssetId(plan, index + startId, usedIds);

          if (options.skipExisting && await hasExistingAsset(options.baseUrl, authHeaders, workId, assetId, assetType)) {
            console.log(`[${itemLabel}] skip (exists) ${assetId}`);
            results.push({
              path: plan.sourcePath,
              assetId,
              elementType: assetType,
              status: "skipped",
            });
            continue;
          }

          const manifest = await uploadAsset(options.baseUrl, authHeaders, workId, plan, assetType, assetId, fileBytes);
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

void main();
