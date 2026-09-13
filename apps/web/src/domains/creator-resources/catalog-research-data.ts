import { parseResearchSnapshot } from "@/shared/lib/catalog-research";
import type { ResearchDataset } from "@/shared/lib/catalog-research";

export interface LoadedResearch { dataset: ResearchDataset; mode: "network" | "saved"; offlineReady: boolean }
const INDEX_URL = "/data/research-index.json";
const CACHE_NAME = "toonstudio-catalog-research-v1";
const MAX_BYTES = 32 * 1024 * 1024;
let current: LoadedResearch | null = null;
async function boundedText(response: Response): Promise<string> {
  if (!response.ok || response.redirected || !response.headers.get("content-type")?.includes("json")) throw new Error("리서치 색인을 불러오지 못했습니다.");
  if (Number(response.headers.get("content-length")) > MAX_BYTES) throw new Error("색인 크기 제한을 초과했습니다.");
  const reader = response.body?.getReader(); if (!reader) throw new Error("색인 응답이 비어 있습니다.");
  const decoder = new TextDecoder(); let size = 0; let raw = "";
  try {
    for (;;) {
      const chunk = await reader.read(); if (chunk.done) break;
      size += chunk.value.byteLength; if (size > MAX_BYTES) throw new Error("색인 크기 제한을 초과했습니다.");
      raw += decoder.decode(chunk.value, { stream: true });
    }
    return raw + decoder.decode();
  } finally { await reader.cancel().catch(() => undefined); reader.releaseLock(); }
}
async function within<T>(operation: Promise<T>, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { return await Promise.race([operation.catch(() => fallback), new Promise<T>((resolve) => { timer = setTimeout(() => resolve(fallback), 1500); })]); }
  finally { clearTimeout(timer); }
}
async function fetchCatalogResearch(force = false, fetcher: typeof fetch = fetch, storage: CacheStorage | undefined = typeof caches === "undefined" ? undefined : caches): Promise<LoadedResearch> {
  if (current && !force) return current;
  const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetcher(INDEX_URL, { signal: controller.signal, cache: force ? "no-cache" : "default" });
    const raw = await boundedText(response); const dataset = parseResearchSnapshot(JSON.parse(raw));
    const offlineReady = storage ? await within(storage.open(CACHE_NAME).then(async (cache) => {
      await cache.put(INDEX_URL, new Response(raw, { headers: { "content-type": "application/json" } })); return true;
    }), false) : false;
    current = { dataset, mode: "network", offlineReady }; return current;
  } catch (error) {
    const saved = storage ? await within(storage.open(CACHE_NAME).then((cache) => cache.match(INDEX_URL)), undefined) : undefined;
    if (saved) {
      try {
        const dataset = parseResearchSnapshot(JSON.parse(await boundedText(saved)));
        current = { dataset, mode: "saved", offlineReady: true }; return current;
      } catch { /* A damaged cache is never substituted for valid data. */ }
    }
    if (current) { current = { ...current, mode: "saved" }; return current; }
    throw new Error(error instanceof Error && error.name !== "AbortError" ? error.message : "리서치 색인 연결 시간이 초과되었습니다. 연결 후 다시 시도하세요.", { cause: error });
  } finally { clearTimeout(timeout); }
}
export function downloadResearchFile(filename: string, content: string, type: string): void {
  const url = URL.createObjectURL(new Blob([content], { type })); const anchor = document.createElement("a");
  anchor.href = url; anchor.download = filename; document.body.append(anchor); anchor.click(); anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

let inFlight: Promise<LoadedResearch> | null = null;
/** Deduplicate StrictMode mounts and simultaneous consumers of the same index. */
export function loadCatalogResearch(force = false, fetcher: typeof fetch = fetch, storage: CacheStorage | undefined = typeof caches === "undefined" ? undefined : caches): Promise<LoadedResearch> {
  inFlight ??= fetchCatalogResearch(force, fetcher, storage).finally(() => { inFlight = null; });
  return inFlight;
}
