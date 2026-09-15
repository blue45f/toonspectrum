/** Network-first navigation with a bounded, validated offline fallback. */
export const STUDIO_NAVIGATION_TIMEOUT_MS = 4_000;

export function isUsableStudioShell(response: Response, isolated: boolean): boolean {
  if (response.status !== 200 || response.redirected
    || !response.headers.get("content-type")?.toLowerCase().includes("text/html")) return false;
  return !isolated || (
    response.headers.get("cross-origin-opener-policy") === "same-origin"
    && ["credentialless", "require-corp"].includes(
      response.headers.get("cross-origin-embedder-policy") ?? "",
    )
  );
}

export interface StudioNavigationOptions {
  readonly request: Request;
  readonly preloadResponse?: Promise<Response | undefined>;
  readonly isolated: boolean;
  readonly shellUrls: readonly string[];
  readonly readPreparedShell?: () => Promise<Response | undefined>;
  readonly readRescue?: () => Promise<Response | undefined>;
  readonly readShell: () => Promise<Response | undefined>;
  readonly refreshShell: (response: Response) => Promise<void>;
  readonly waitUntil: (promise: Promise<unknown>) => void;
  readonly fetcher?: typeof fetch;
  readonly timeoutMs?: number;
}

function markedFallback(response: Response): Response {
  const headers = new Headers(response.headers);
  // Diagnostic only; this is NOT a claim that the document or its assets are saved.
  headers.append("server-timing", "toonstudio-offline;desc=\"cached-shell\"");
  return new Response(response.body, { status: response.status, headers });
}

async function readSafeFallback(options: StudioNavigationOptions): Promise<Response | undefined> {
  try {
    const prepared = await options.readPreparedShell?.().catch(() => undefined);
    if (prepared && isUsableStudioShell(prepared, options.isolated)) return markedFallback(prepared);
    // Preserve the same Studio surface even when the optional full-pack audit is incomplete.
    // Runtime cache misses fail feature-by-feature; they must not redirect the artist into a
    // separate local editor with a different document model.
    const response = await options.readShell();
    if (response && isUsableStudioShell(response, options.isolated)) return markedFallback(response);
    // Last-ditch recovery only when no usable Studio document shell survives.
    const rescue = await options.readRescue?.().catch(() => undefined);
    return rescue && isUsableStudioShell(rescue, false)
      ? markedFallback(rescue) : undefined;
  } catch {
    // Storage denial must not replace a real HTTP response with a cache exception.
    return undefined;
  }
}

export async function resolveStudioNavigation(options: StudioNavigationOptions): Promise<Response> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      reject(new Error("Studio navigation timed out"));
      controller.abort();
    }, options.timeoutMs ?? STUDIO_NAVIGATION_TIMEOUT_MS);
  });
  const network = async (): Promise<Response> => {
    // A rejected preload is not proof that an ordinary fetch will fail too.
    const preloaded = await options.preloadResponse?.catch(() => undefined);
    if (controller.signal.aborted) throw new Error("Studio navigation cancelled");
    return preloaded ?? (options.fetcher ?? fetch)(options.request, { signal: controller.signal });
  };

  let response: Response;
  try {
    response = await Promise.race([network(), timeout]);
  } catch (cause) {
    const cached = await readSafeFallback(options);
    if (cached) return cached;
    throw cause;
  } finally {
    clearTimeout(timer);
  }

  // HTTP failures do not reject fetch. Do NOT conceal permission failures or 404s.
  if (response.status === 408 || response.status >= 500) {
    return (await readSafeFallback(options)) ?? response;
  }

  const url = new URL(options.request.url);
  if (!url.search && options.shellUrls.includes(url.pathname)
    && isUsableStudioShell(response, options.isolated)) {
    // Clone synchronously before the browser can consume the response body.
    const copy = response.clone();
    options.waitUntil(Promise.resolve().then(() => options.refreshShell(copy)).catch(() => undefined));
  }
  return response;
}
