import { describe, expect, it, vi } from "vitest";

import {
  STUDIO_3D_GENERATION_PROVIDER_CONTRACT_VERSION,
  Studio3dGenerationProviderError,
  type Studio3dGenerationBinary,
  type Studio3dGenerationImage,
  type Studio3dGenerationJobIdentity,
  type Studio3dGenerationRequest,
} from "./studio-3d-generation-provider";
import {
  HYPER3D_RODIN_PROVIDER_ID,
  createHyper3dRodinProvider,
  parseHyper3dRetryAfterMs,
  type Hyper3dRodinFetch,
} from "./studio-hyper3d-rodin-provider";

function jsonResponse(
  payload: unknown,
  status = 200,
  headers: Record<string, string> = {}
): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

function image(filename: string, label?: Studio3dGenerationImage["label"]): Studio3dGenerationImage {
  return {
    filename,
    mimeType: "image/png",
    bytes: new Uint8Array([137, 80, 78, 71, 1, 2, 3]),
    ...(label ? { label } : {}),
  };
}

function model(filename = "source.glb"): Studio3dGenerationBinary {
  return {
    filename,
    mimeType: "model/gltf-binary",
    bytes: new Uint8Array([103, 108, 84, 70, 2, 0, 0, 0]),
  };
}

function generationRequest(
  overrides: Partial<Studio3dGenerationRequest> = {}
): Studio3dGenerationRequest {
  return {
    schemaVersion: STUDIO_3D_GENERATION_PROVIDER_CONTRACT_VERSION,
    requestId: "request-1",
    mode: "text-to-3d",
    prompt: "A small wooden treasure chest",
    ...overrides,
  };
}

function jobIdentity(): Studio3dGenerationJobIdentity {
  return {
    providerId: HYPER3D_RODIN_PROVIDER_ID,
    requestId: "request-1",
    taskUuid: "task-uuid-for-download",
    subscriptionKey: "subscription-key-for-status",
    jobUuids: ["job-1"],
  };
}

function responseSequence(
  responses: Array<Response | Error>,
  requests: Array<{ input: string; init: RequestInit }>
): Hyper3dRodinFetch {
  return async (input, init = {}) => {
    requests.push({ input: String(input), init });
    const response = responses.shift();
    if (!response) throw new Error("Unexpected fetch call");
    if (response instanceof Error) throw response;
    return response;
  };
}

function acceptedSubmission() {
  return jsonResponse({
    message: "Submitted.",
    uuid: "task-uuid-for-download",
    jobs: {
      uuids: ["job-1"],
      subscription_key: "subscription-key-for-status",
    },
    consumed: 0.5,
  }, 201);
}

describe("Hyper3dRodinProvider", () => {
  it("submits text-to-3D with an explicit Gen-2.5 tier", async () => {
    const requests: Array<{ input: string; init: RequestInit }> = [];
    const provider = createHyper3dRodinProvider({
      apiKey: "secret-key",
      fetchImpl: responseSequence([acceptedSubmission()], requests),
      now: () => Date.UTC(2026, 8, 8),
    });

    const result = await provider.submit(generationRequest(), new AbortController().signal);

    expect(result).toEqual({
      schemaVersion: STUDIO_3D_GENERATION_PROVIDER_CONTRACT_VERSION,
      providerId: HYPER3D_RODIN_PROVIDER_ID,
      requestId: "request-1",
      taskUuid: "task-uuid-for-download",
      subscriptionKey: "subscription-key-for-status",
      jobUuids: ["job-1"],
      consumedCredits: 0.5,
      submittedAt: "2026-09-08T00:00:00.000Z",
    });
    expect(requests).toHaveLength(1);
    expect(requests[0]?.input).toBe("https://api.hyper3d.com/api/v2/rodin");
    const form = requests[0]?.init.body as FormData;
    expect(form.get("prompt")).toBe("A small wooden treasure chest");
    expect(form.get("tier")).toBe("Gen-2.5-Medium");
    expect(form.getAll("images")).toHaveLength(0);
    expect(requests[0]?.init.headers).toEqual({ Authorization: "Bearer secret-key" });
  });

  it("preserves multi-view image and direction order", async () => {
    const requests: Array<{ input: string; init: RequestInit }> = [];
    const provider = createHyper3dRodinProvider({
      apiKey: "secret-key",
      fetchImpl: responseSequence([acceptedSubmission()], requests),
    });

    await provider.submit(generationRequest({
      mode: "multiview-to-3d",
      prompt: "Keep the silhouette symmetric",
      images: [image("front.png", "F"), image("left.png", "L"), image("back.png", "B")],
      options: {
        tier: "Gen-2.5-High",
        meshMode: "Quad",
        quality: "high",
        targetFaceCount: 120_000,
        geometryFormat: "glb",
        material: "Hybrid",
        textureMode: "high",
        seed: 42,
        boundingBox: [100, 180, 80],
        symmetry: "balanced",
        taPose: true,
        preserveAlpha: true,
        previewRender: true,
        highPack: true,
      },
    }), new AbortController().signal);

    const form = requests[0]?.init.body as FormData;
    expect(form.getAll("images")).toHaveLength(3);
    expect(form.getAll("image_label")).toEqual(["F", "L", "B"]);
    expect(form.get("tier")).toBe("Gen-2.5-High");
    expect(form.get("mesh_mode")).toBe("Quad");
    expect(form.get("quality_override")).toBe("120000");
    expect(form.getAll("bbox_condition")).toEqual(["100", "180", "80"]);
    expect(form.get("addons")).toBe("HighPack");
    expect(form.get("TAPose")).toBe("true");
  });

  it("maps texture-only files and settings to the dedicated endpoint", async () => {
    const requests: Array<{ input: string; init: RequestInit }> = [];
    const provider = createHyper3dRodinProvider({
      apiKey: "secret-key",
      fetchImpl: responseSequence([acceptedSubmission()], requests),
    });

    await provider.submit(generationRequest({
      mode: "texture-only",
      prompt: "Hand-painted blue ceramic",
      images: [image("reference.png")],
      model: model(),
      options: {
        material: "PBR",
        geometryFormat: "glb",
        textureMode: "extreme-high",
        textureResolution: "High",
        textureReferenceScale: 0.85,
        textureComplexity: 4.5,
        textureDelight: true,
      },
    }), new AbortController().signal);

    expect(requests[0]?.input).toBe("https://api.hyper3d.com/api/v2/rodin_texture_only");
    const form = requests[0]?.init.body as FormData;
    expect(form.get("image")).toBeInstanceOf(Blob);
    expect(form.get("model")).toBeInstanceOf(Blob);
    expect(form.get("material")).toBe("PBR");
    expect(form.get("resolution")).toBe("High");
    expect(form.get("reference_scale")).toBe("0.85");
    expect(form.get("escore")).toBe("4.5");
  });

  it("rejects a body-level error even when submission returns HTTP 201", async () => {
    const requests: Array<{ input: string; init: RequestInit }> = [];
    const provider = createHyper3dRodinProvider({
      apiKey: "secret-key",
      fetchImpl: responseSequence([
        jsonResponse({
          error: "API_INSUFFICIENT_FUNDS",
          message: "The fund in your wallet is insufficient.",
        }, 201),
      ], requests),
    });

    await expect(provider.submit(generationRequest(), new AbortController().signal))
      .rejects.toMatchObject<Partial<Studio3dGenerationProviderError>>({
        code: "provider-rejected",
        providerCode: "API_INSUFFICIENT_FUNDS",
        retryable: false,
      });
    expect(requests).toHaveLength(1);
  });

  it("uses subscription_key only for status and task_uuid only for download", async () => {
    const requests: Array<{ input: string; init: RequestInit }> = [];
    const provider = createHyper3dRodinProvider({
      apiKey: "secret-key",
      fetchImpl: responseSequence([
        jsonResponse({ jobs: [{ uuid: "job-1", status: "Done", progress: 100 }] }),
        jsonResponse({ list: [{ name: "model.glb", url: "https://download.example/model.glb" }] }, 201),
      ], requests),
    });

    const progress = await provider.poll(jobIdentity(), new AbortController().signal);
    const artifacts = await provider.download(jobIdentity(), new AbortController().signal);

    expect(progress.state).toBe("succeeded");
    expect(artifacts.artifacts).toEqual([
      { name: "model.glb", url: "https://download.example/model.glb" },
    ]);
    expect(JSON.parse(String(requests[0]?.init.body))).toEqual({
      subscription_key: "subscription-key-for-status",
    });
    expect(JSON.parse(String(requests[1]?.init.body))).toEqual({
      task_uuid: "task-uuid-for-download",
    });
  });

  it("honors Retry-After for status polling before a bounded retry", async () => {
    const requests: Array<{ input: string; init: RequestInit }> = [];
    const sleeps: number[] = [];
    const provider = createHyper3dRodinProvider({
      apiKey: "secret-key",
      retryAttempts: 2,
      fetchImpl: responseSequence([
        jsonResponse({ error: null }, 429, { "Retry-After": "7" }),
        jsonResponse({ jobs: [{ uuid: "job-1", status: "Running", percentage: 37 }] }),
      ], requests),
      sleep: async (delayMs) => {
        sleeps.push(delayMs);
      },
    });

    const result = await provider.poll(jobIdentity(), new AbortController().signal);

    expect(result.state).toBe("running");
    expect(result.jobs[0]?.progressPercent).toBe(37);
    expect(sleeps).toEqual([7_000]);
    expect(requests).toHaveLength(2);
  });

  it.each(["poll", "download"] as const)("retries a transient transport failure in %s without changing the job query", async (operation) => {
    const requests: Array<{ input: string; init: RequestInit }> = [];
    const sleeps: number[] = [];
    const provider = createHyper3dRodinProvider({
      apiKey: "secret-key",
      retryAttempts: 2,
      fetchImpl: responseSequence([
        new TypeError("mock transient connection reset"),
        jsonResponse(operation === "poll"
          ? { jobs: [{ uuid: "job-1", status: "Done" }] }
          : { list: [{ name: "model.glb", url: "https://download.example/model.glb" }] }),
      ], requests),
      sleep: async (delayMs) => { sleeps.push(delayMs); },
    });

    await expect(provider[operation](jobIdentity(), new AbortController().signal)).resolves.toMatchObject({
      providerId: HYPER3D_RODIN_PROVIDER_ID,
    });
    expect(requests).toHaveLength(2);
    expect(sleeps).toEqual([5_000]);
    expect(requests.map((request) => request.input)).toEqual([
      `https://api.hyper3d.com/api/v2/${operation === "poll" ? "status" : "download"}`,
      `https://api.hyper3d.com/api/v2/${operation === "poll" ? "status" : "download"}`,
    ]);
    expect(requests[1]?.init.body).toBe(requests[0]?.init.body);
  });

  it.each(["poll", "download"] as const)("stops %s transport retries at the configured attempt budget", async (operation) => {
    const requests: Array<{ input: string; init: RequestInit }> = [];
    const sleeps: number[] = [];
    const provider = createHyper3dRodinProvider({
      apiKey: "secret-key",
      retryAttempts: 3,
      fetchImpl: responseSequence(Array.from({ length: 3 }, () => new TypeError("mock network failure")), requests),
      sleep: async (delayMs) => { sleeps.push(delayMs); },
    });

    await expect(provider[operation](jobIdentity(), new AbortController().signal)).rejects.toMatchObject({
      code: "provider-unavailable", retryable: true,
    });
    expect(requests).toHaveLength(3);
    expect(sleeps).toEqual([5_000, 10_000]);
  });

  it("shares one attempt budget across transport failures and HTTP Retry-After responses", async () => {
    const requests: Array<{ input: string; init: RequestInit }> = [];
    const sleeps: number[] = [];
    const provider = createHyper3dRodinProvider({
      apiKey: "secret-key",
      retryAttempts: 3,
      fetchImpl: responseSequence([
        new TypeError("mock connection reset"),
        jsonResponse({ error: null }, 429, { "Retry-After": "7" }),
        jsonResponse({ jobs: [{ uuid: "job-1", status: "Done" }] }),
      ], requests),
      sleep: async (delayMs) => { sleeps.push(delayMs); },
    });

    await expect(provider.poll(jobIdentity(), new AbortController().signal)).resolves.toMatchObject({ state: "succeeded" });
    expect(requests).toHaveLength(3);
    expect(sleeps).toEqual([5_000, 7_000]);
  });

  it.each(["poll", "download"] as const)("retries an internal %s request timeout within the same bounded query budget", async (operation) => {
    vi.useFakeTimers();
    try {
      let calls = 0;
      const sleeps: number[] = [];
      const provider = createHyper3dRodinProvider({
        apiKey: "secret-key",
        timeoutMs: 5_000,
        retryAttempts: 2,
        fetchImpl: async (_input, init) => {
          calls += 1;
          if (calls === 1) {
            return new Promise<Response>((_resolve, reject) => {
              init?.signal?.addEventListener("abort", () => reject(new Error("mock request aborted")), { once: true });
            });
          }
          return jsonResponse(operation === "poll"
            ? { jobs: [{ uuid: "job-1", status: "Done" }] }
            : { list: [{ name: "model.glb", url: "https://download.example/model.glb" }] });
        },
        sleep: async (delayMs) => { sleeps.push(delayMs); },
      });
      const outcome = provider[operation](jobIdentity(), new AbortController().signal)
        .then(() => "success", (error: unknown) => error);

      await vi.advanceTimersByTimeAsync(5_000);

      expect(await outcome).toBe("success");
      expect(calls).toBe(2);
      expect(sleeps).toEqual([5_000]);
    } finally {
      vi.useRealTimers();
    }
  });

  it.each(["poll", "download"] as const)("never classifies caller cancellation as a retryable %s timeout", async (operation) => {
    let calls = 0;
    const sleeps: number[] = [];
    const controller = new AbortController();
    const provider = createHyper3dRodinProvider({
      apiKey: "secret-key",
      retryAttempts: 3,
      fetchImpl: async (_input, init) => {
        calls += 1;
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new Error("mock transport abort")), { once: true });
        });
      },
      sleep: async (delayMs) => { sleeps.push(delayMs); },
    });
    const pending = provider[operation](jobIdentity(), controller.signal);
    controller.abort(new Error("timeout"));

    await expect(pending).rejects.toMatchObject({ code: "cancelled", retryable: false });
    expect(calls).toBe(1);
    expect(sleeps).toEqual([]);
  });

  it("does not issue another request after cancellation during transport backoff", async () => {
    const requests: Array<{ input: string; init: RequestInit }> = [];
    const sleeps: number[] = [];
    const controller = new AbortController();
    const provider = createHyper3dRodinProvider({
      apiKey: "secret-key",
      retryAttempts: 3,
      fetchImpl: responseSequence([new TypeError("mock connection reset")], requests),
      sleep: async (delayMs) => {
        sleeps.push(delayMs);
        controller.abort();
      },
    });

    await expect(provider.poll(jobIdentity(), controller.signal)).rejects.toMatchObject({ code: "cancelled", retryable: false });
    expect(requests).toHaveLength(1);
    expect(sleeps).toEqual([5_000]);
  });

  it.each(["authentication", "invalid-response", "provider-rejected"] as const)("does not expand transport retries to %s failures", async (code) => {
    const requests: Array<{ input: string; init: RequestInit }> = [];
    const sleeps: number[] = [];
    const response = code === "authentication" ? jsonResponse({ error: null }, 401)
      : code === "invalid-response" ? new Response("not JSON", { status: 200 })
        : jsonResponse({ error: "API_INVALID_JOB" }, 200);
    const provider = createHyper3dRodinProvider({
      apiKey: "secret-key",
      retryAttempts: 3,
      fetchImpl: responseSequence([response], requests),
      sleep: async (delayMs) => { sleeps.push(delayMs); },
    });

    await expect(provider.poll(jobIdentity(), new AbortController().signal)).rejects.toMatchObject({ code, retryable: false });
    expect(requests).toHaveLength(1);
    expect(sleeps).toEqual([]);
  });

  it.each([
    ["text-to-3d", "transport"],
    ["texture-only", "transport"],
    ["text-to-3d", "http"],
    ["texture-only", "http"],
  ] as const)("never automatically resubmits an ambiguously failed paid %s request after a %s error", async (mode, failure) => {
    const requests: Array<{ input: string; init: RequestInit }> = [];
    const sleeps: number[] = [];
    const provider = createHyper3dRodinProvider({
      apiKey: "secret-key",
      retryAttempts: 5,
      fetchImpl: responseSequence([failure === "transport"
        ? new Error("connection reset after upload")
        : jsonResponse({ error: null }, 503)], requests),
      sleep: async (delayMs) => {
        sleeps.push(delayMs);
      },
    });

    const request = mode === "texture-only"
      ? generationRequest({ mode, images: [image("reference.png")], model: model() })
      : generationRequest();
    await expect(provider.submit(request, new AbortController().signal))
      .rejects.toMatchObject<Partial<Studio3dGenerationProviderError>>({
        code: "provider-unavailable",
        retryable: true,
      });
    expect(requests).toHaveLength(1);
    expect(sleeps).toEqual([]);
  });

  it.each(["", "   ", "../reference.png", "..\\reference.png", "bad\0name.png", "a".repeat(181)])(
    "rejects invalid image filename %j before contacting the provider",
    async (filename) => {
      const requests: Array<{ input: string; init: RequestInit }> = [];
      const provider = createHyper3dRodinProvider({
        apiKey: "secret-key",
        fetchImpl: responseSequence([], requests),
      });

      await expect(provider.submit(generationRequest({
        mode: "image-to-3d",
        images: [image(filename)],
      }), new AbortController().signal)).rejects.toMatchObject({
        code: "invalid-request",
      });
      expect(requests).toHaveLength(0);
    },
  );

  it.each(["reference.png", `${"a".repeat(176)}.png`])(
    "trims a valid filename without changing its multipart name: %s",
    async (filename) => {
      const requests: Array<{ input: string; init: RequestInit }> = [];
      const provider = createHyper3dRodinProvider({
        apiKey: "secret-key",
        fetchImpl: responseSequence([acceptedSubmission()], requests),
      });

      await provider.submit(generationRequest({
        mode: "image-to-3d",
        images: [image(`  ${filename}  `)],
      }), new AbortController().signal);

      expect(requests).toHaveLength(1);
      const form = requests[0]?.init.body as FormData;
      expect((form.get("images") as File).name).toBe(filename);
    },
  );

  it("rejects more than five images before contacting the provider", async () => {
    const requests: Array<{ input: string; init: RequestInit }> = [];
    const provider = createHyper3dRodinProvider({
      apiKey: "secret-key",
      fetchImpl: responseSequence([], requests),
    });

    await expect(provider.submit(generationRequest({
      mode: "multiview-to-3d",
      images: Array.from({ length: 6 }, (_, index) => image(`view-${index}.png`)),
    }), new AbortController().signal)).rejects.toMatchObject({
      code: "invalid-request",
    });
    expect(requests).toHaveLength(0);
  });
});

describe("parseHyper3dRetryAfterMs", () => {
  it("accepts seconds and HTTP dates with a bounded minimum", () => {
    expect(parseHyper3dRetryAfterMs("3", 0)).toBe(3_000);
    expect(parseHyper3dRetryAfterMs("Thu, 01 Jan 1970 00:00:08 GMT", 5_000)).toBe(3_000);
    expect(parseHyper3dRetryAfterMs("0", 0)).toBe(1_000);
    expect(parseHyper3dRetryAfterMs("not-a-date", 0)).toBeNull();
  });
});
