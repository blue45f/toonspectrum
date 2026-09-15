import { z } from "zod";

import {
  studioProductionJobSchema,
  type StudioProductionJob,
  type StudioProductionJobInput,
} from "./studio-production-jobs";

export const STUDIO_TOONBRIDGE_SESSION_KEY = "toonstudio:toonbridge-v2";
export const STUDIO_TOONBRIDGE_DEFAULT_URL = "http://127.0.0.1:49631";

const settingsSchema = z.object({
  baseUrl: z.string().min(1).max(400),
  token: z.string().regex(/^[A-Za-z0-9._~-]{32,256}$/u),
}).strict();
export type StudioToonBridgeSettings = z.infer<typeof settingsSchema>;

const toolProbeSchema = z.object({
  toolId: z.string().min(1),
  state: z.enum(["available", "missing", "manual", "connector", "blocked"]),
  version: z.string().max(500).nullable(),
  executable: z.boolean(),
  reason: z.string().max(1_000),
}).strict();
export type StudioToonBridgeToolProbe = z.infer<typeof toolProbeSchema>;

const statusSchema = z.object({
  protocol: z.literal("toonstudio.production-toolchain"),
  version: z.literal(2),
  serviceVersion: z.string().min(1),
  activeJobs: z.number().int().nonnegative(),
  retainedJobs: z.number().int().nonnegative(),
}).strict();
export type StudioToonBridgeStatus = z.infer<typeof statusSchema>;

function normalizeBaseUrl(raw: string): string {
  const url = new URL(raw.trim());
  if (url.username || url.password || url.search || url.hash) {
    throw new Error("실행기 주소에 자격증명·쿼리·fragment를 넣을 수 없습니다.");
  }
  const localHost = url.hostname === "127.0.0.1" || url.hostname === "localhost" || url.hostname === "[::1]";
  if (url.protocol !== "https:" && !(url.protocol === "http:" && localHost)) {
    throw new Error("HTTPS 또는 로컬 컴퓨터의 HTTP 주소만 사용할 수 있습니다.");
  }
  if (url.pathname !== "/" && url.pathname !== "") {
    throw new Error("실행기 주소에는 경로를 넣지 마세요.");
  }
  if (typeof location !== "undefined" && url.origin === location.origin) {
    throw new Error("사이트와 같은 origin을 실행기 주소로 사용할 수 없습니다.");
  }
  return url.origin;
}

export function validateStudioToonBridgeSettings(
  input: StudioToonBridgeSettings,
): StudioToonBridgeSettings {
  const settings = settingsSchema.parse(input);
  return Object.freeze({
    baseUrl: normalizeBaseUrl(settings.baseUrl),
    token: settings.token,
  });
}

export function loadStudioToonBridgeSettings(): StudioToonBridgeSettings | null {
  if (typeof sessionStorage === "undefined") return null;
  const raw = sessionStorage.getItem(STUDIO_TOONBRIDGE_SESSION_KEY);
  if (!raw) return null;
  try {
    return validateStudioToonBridgeSettings(JSON.parse(raw));
  } catch {
    sessionStorage.removeItem(STUDIO_TOONBRIDGE_SESSION_KEY);
    return null;
  }
}

export function saveStudioToonBridgeSettings(settings: StudioToonBridgeSettings): void {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.setItem(
    STUDIO_TOONBRIDGE_SESSION_KEY,
    JSON.stringify(validateStudioToonBridgeSettings(settings)),
  );
}

export function clearStudioToonBridgeSettings(): void {
  if (typeof sessionStorage !== "undefined") {
    sessionStorage.removeItem(STUDIO_TOONBRIDGE_SESSION_KEY);
  }
}

async function parseJsonResponse(response: Response): Promise<unknown> {
  const text = await response.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      throw new Error(`실행기가 JSON이 아닌 응답을 보냈습니다. (${response.status})`);
    }
  }
  if (!response.ok) {
    const message = typeof payload === "object" && payload !== null && "message" in payload
      ? String((payload as { message: unknown }).message)
      : `실행기 요청이 실패했습니다. (${response.status})`;
    throw new Error(message);
  }
  return payload;
}

export class StudioToonBridgeClient {
  readonly settings: StudioToonBridgeSettings;

  constructor(settings: StudioToonBridgeSettings) {
    this.settings = validateStudioToonBridgeSettings(settings);
  }

  private async request(
    path: string,
    init: RequestInit = {},
  ): Promise<Response> {
    const headers = new Headers(init.headers);
    headers.set("authorization", `Bearer ${this.settings.token}`);
    headers.set("x-toonbridge-version", "2");
    if (init.body && !(init.body instanceof Blob) && !headers.has("content-type")) {
      headers.set("content-type", "application/json");
    }
    return fetch(`${this.settings.baseUrl}${path}`, {
      ...init,
      cache: "no-store",
      credentials: "omit",
      redirect: "error",
      headers,
    });
  }

  async status(signal?: AbortSignal): Promise<StudioToonBridgeStatus> {
    const response = await this.request("/v2/status", { signal });
    return statusSchema.parse(await parseJsonResponse(response));
  }

  async tools(signal?: AbortSignal): Promise<readonly StudioToonBridgeToolProbe[]> {
    const response = await this.request("/v2/tools", { signal });
    return z.array(toolProbeSchema).parse(await parseJsonResponse(response));
  }

  async createJob(
    job: StudioProductionJob,
    signal?: AbortSignal,
  ): Promise<StudioProductionJob> {
    const response = await this.request("/v2/jobs", {
      method: "POST",
      body: JSON.stringify(job),
      signal,
    });
    return studioProductionJobSchema.parse(await parseJsonResponse(response));
  }

  async uploadInput(
    remoteJobId: string,
    input: StudioProductionJobInput,
    bytes: Blob,
    signal?: AbortSignal,
  ): Promise<StudioProductionJob> {
    if (bytes.size !== input.bytes) throw new Error("업로드 파일 크기가 작업 명세와 다릅니다.");
    const response = await this.request(
      `/v2/jobs/${encodeURIComponent(remoteJobId)}/inputs/${encodeURIComponent(input.id)}`,
      {
        method: "PUT",
        body: bytes,
        headers: {
          "content-type": input.mime,
          "x-toonbridge-filename": encodeURIComponent(input.name),
        },
        signal,
      },
    );
    return studioProductionJobSchema.parse(await parseJsonResponse(response));
  }

  async startJob(remoteJobId: string, signal?: AbortSignal): Promise<StudioProductionJob> {
    const response = await this.request(
      `/v2/jobs/${encodeURIComponent(remoteJobId)}/start`,
      { method: "POST", body: "{}", signal },
    );
    return studioProductionJobSchema.parse(await parseJsonResponse(response));
  }

  async getJob(remoteJobId: string, signal?: AbortSignal): Promise<StudioProductionJob> {
    const response = await this.request(
      `/v2/jobs/${encodeURIComponent(remoteJobId)}`,
      { signal },
    );
    return studioProductionJobSchema.parse(await parseJsonResponse(response));
  }

  async listJobs(signal?: AbortSignal): Promise<readonly StudioProductionJob[]> {
    const response = await this.request("/v2/jobs", { signal });
    return z.array(studioProductionJobSchema).parse(await parseJsonResponse(response));
  }

  async cancelJob(remoteJobId: string, signal?: AbortSignal): Promise<StudioProductionJob> {
    const response = await this.request(
      `/v2/jobs/${encodeURIComponent(remoteJobId)}/cancel`,
      { method: "POST", body: "{}", signal },
    );
    return studioProductionJobSchema.parse(await parseJsonResponse(response));
  }

  async downloadOutput(
    remoteJobId: string,
    outputId: string,
    signal?: AbortSignal,
  ): Promise<Blob> {
    const response = await this.request(
      `/v2/jobs/${encodeURIComponent(remoteJobId)}/outputs/${encodeURIComponent(outputId)}`,
      { signal },
    );
    if (!response.ok) await parseJsonResponse(response);
    return response.blob();
  }
}
