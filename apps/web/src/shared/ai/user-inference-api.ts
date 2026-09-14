import { requireUserAiConnection } from "./user-ai-store";
import { userAiFetch, userAiJson } from "./user-ai-transport";

type Options = { signal?: AbortSignal; timeout?: number; headers?: HeadersInit };
/** Pin a request group to one personal Creator Runtime; changing connections fails closed. */
export function createUserInferenceApi() {
  const connection = requireUserAiConnection("inference");
  const optionsFor = (options: Options = {}) => ({
    signal: options.signal, connectionId: connection.id,
    headers: { ...Object.fromEntries(new Headers(options.headers)), "X-Creator-Owner": `personal:${connection.id}` },
  });
  const pathFor = (path: string) => {
    const local = path.replace(/^\/studio-ai\/inference(?=\/)/u, "");
    return local === "/status" ? "/capabilities" : local;
  };
  return {
    get: <T>(path: string, options?: Options) => userAiJson<T>("inference", pathFor(path), undefined, optionsFor(options)),
    post: <T>(path: string, body?: unknown, options?: Options) => userAiJson<T>("inference", pathFor(path), body ?? {}, { ...optionsFor(options), method: "POST" }),
    put: <T>(path: string, body?: unknown, options?: Options) => userAiJson<T>("inference", pathFor(path), body ?? {}, { ...optionsFor(options), method: "PUT" }),
    delete: <T>(path: string, options?: Options) => userAiJson<T>("inference", pathFor(path), undefined, { ...optionsFor(options), method: "DELETE" }),
    raw: { get: (path: string, options?: Options) => userAiFetch("inference", pathFor(path), undefined, optionsFor(options)) },
  };
}
