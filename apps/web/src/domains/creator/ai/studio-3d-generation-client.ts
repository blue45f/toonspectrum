export type Studio3dGenerationMode =
  | "text-to-3d"
  | "image-to-3d"
  | "multiview-to-3d"
  | "texture-only";

export type Studio3dGenerationJobState =
  | "queued"
  | "uploading"
  | "generating-geometry"
  | "generating-texture"
  | "downloading"
  | "validating"
  | "importing"
  | "ready"
  | "failed"
  | "cancelled"
  | "expired";

export interface Studio3dGenerationArtifactRevision {
  readonly id: string;
  readonly modelId: string;
  readonly contentHashSha256: string;
  readonly byteLength: number;
  readonly mimeType: string;
  readonly createdAtMs: number;
  readonly sourceJobId: string;
}

export interface Studio3dGenerationJob {
  readonly id: string;
  readonly state: Studio3dGenerationJobState;
  readonly generation: number;
  readonly estimatedCredits: number;
  readonly actualCredits?: number;
  readonly createdAtMs: number;
  readonly updatedAtMs: number;
  readonly deadlineAtMs: number;
  readonly terminalReason?: string;
  readonly request: {
    readonly mode: Studio3dGenerationMode;
    readonly provider: string;
    readonly model: string;
    readonly tier: string;
    readonly seed?: number;
    readonly transport: "server" | "byok";
  };
  readonly artifactRevision?: Studio3dGenerationArtifactRevision;
}

export interface Studio3dGenerationBinaryInput {
  readonly filename: string;
  readonly mimeType: string;
  readonly dataBase64: string;
  readonly label?: string;
}

export interface Studio3dGenerationCreateInput {
  readonly mode: Studio3dGenerationMode;
  readonly prompt?: string;
  readonly images?: readonly Studio3dGenerationBinaryInput[];
  readonly model?: Studio3dGenerationBinaryInput;
  readonly transport?: "server" | "byok";
  readonly options?: Readonly<Record<string, string | number | boolean | readonly number[]>>;
  readonly estimatedCredits?: number;
}

export interface Studio3dGenerationStatus {
  readonly configured: boolean;
  readonly durable: boolean;
  readonly provider: string;
  readonly modes: readonly Studio3dGenerationMode[];
  readonly apiKeyExposedToClient: false;
}

export interface Studio3dGenerationClientOptions {
  readonly baseUrl?: string;
  readonly userId: string;
  readonly fetchImpl?: typeof fetch;
  readonly providerApiKey?: () => string | undefined;
}

async function responseJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  const payload = text ? (JSON.parse(text) as unknown) : undefined;
  if (!response.ok) {
    const message =
      payload && typeof payload === "object" && typeof (payload as { message?: unknown }).message === "string"
        ? (payload as { message: string }).message
        : `3D generation request failed with HTTP ${response.status}.`;
    throw new Error(message);
  }
  return payload as T;
}

function normalizedBaseUrl(value: string | undefined): string {
  const raw = value?.trim() || "/api/studio-ai/3d";
  return raw.replace(/\/$/u, "");
}

function requestHeaders(
  options: Studio3dGenerationClientOptions,
  idempotencyKey?: string,
): Headers {
  const headers = new Headers({
    Accept: "application/json",
    "Content-Type": "application/json",
    "X-User-Id": options.userId,
  });
  if (idempotencyKey) headers.set("Idempotency-Key", idempotencyKey);
  const providerKey = options.providerApiKey?.()?.trim();
  if (providerKey) headers.set("X-Studio-3D-Provider-Key", providerKey);
  return headers;
}

export class Studio3dGenerationHttpClient {
  readonly #baseUrl: string;
  readonly #fetch: typeof fetch;

  constructor(private readonly options: Studio3dGenerationClientOptions) {
    if (!options.userId.trim()) throw new TypeError("Studio 3D generation client requires a user identity.");
    this.#baseUrl = normalizedBaseUrl(options.baseUrl);
    this.#fetch = options.fetchImpl ?? fetch;
  }

  async status(signal?: AbortSignal): Promise<Studio3dGenerationStatus> {
    const response = await this.#fetch(`${this.#baseUrl}/status`, {
      headers: requestHeaders(this.options),
      credentials: "include",
      signal,
    });
    return responseJson<Studio3dGenerationStatus>(response);
  }

  async create(
    input: Studio3dGenerationCreateInput,
    idempotencyKey: string,
    signal?: AbortSignal,
  ): Promise<Studio3dGenerationJob> {
    const response = await this.#fetch(`${this.#baseUrl}/jobs`, {
      method: "POST",
      headers: requestHeaders(this.options, idempotencyKey),
      credentials: "include",
      body: JSON.stringify(input),
      signal,
    });
    return responseJson<Studio3dGenerationJob>(response);
  }

  async advance(jobId: string, signal?: AbortSignal): Promise<Studio3dGenerationJob> {
    const response = await this.#fetch(`${this.#baseUrl}/jobs/${encodeURIComponent(jobId)}/advance`, {
      method: "POST",
      headers: requestHeaders(this.options),
      credentials: "include",
      signal,
    });
    return responseJson<Studio3dGenerationJob>(response);
  }

  async cancel(jobId: string, signal?: AbortSignal): Promise<Studio3dGenerationJob> {
    const response = await this.#fetch(`${this.#baseUrl}/jobs/${encodeURIComponent(jobId)}/cancel`, {
      method: "POST",
      headers: requestHeaders(this.options),
      credentials: "include",
      signal,
    });
    return responseJson<Studio3dGenerationJob>(response);
  }

  async get(jobId: string, signal?: AbortSignal): Promise<Studio3dGenerationJob> {
    const response = await this.#fetch(`${this.#baseUrl}/jobs/${encodeURIComponent(jobId)}`, {
      headers: requestHeaders(this.options),
      credentials: "include",
      signal,
    });
    return responseJson<Studio3dGenerationJob>(response);
  }

  async list(signal?: AbortSignal): Promise<readonly Studio3dGenerationJob[]> {
    const response = await this.#fetch(`${this.#baseUrl}/jobs`, {
      headers: requestHeaders(this.options),
      credentials: "include",
      signal,
    });
    return responseJson<readonly Studio3dGenerationJob[]>(response);
  }

  async downloadArtifact(revisionId: string, signal?: AbortSignal): Promise<Blob> {
    const headers = requestHeaders(this.options);
    headers.delete("Content-Type");
    const response = await this.#fetch(
      `${this.#baseUrl}/artifacts/${encodeURIComponent(revisionId)}`,
      { headers, credentials: "include", signal },
    );
    if (!response.ok) throw new Error(`3D artifact download failed with HTTP ${response.status}.`);
    return response.blob();
  }
}

export async function studioFileToGenerationInput(
  file: File,
  maxBytes: number,
  label?: string,
): Promise<Studio3dGenerationBinaryInput> {
  if (file.size < 1 || file.size > maxBytes) {
    throw new RangeError(`File must be between 1 byte and ${maxBytes} bytes.`);
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  const chunkSize = 32_768;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return Object.freeze({
    filename: file.name,
    mimeType: file.type || "application/octet-stream",
    dataBase64: btoa(binary),
    ...(label ? { label } : {}),
  });
}
