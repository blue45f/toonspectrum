import { describe, expect, it, vi } from "vitest";

import {
  Studio3dGenerationHttpClient,
  type Studio3dGenerationJob,
} from "./studio-3d-generation-client";

const job: Studio3dGenerationJob = {
  id: "job-1",
  state: "generating-geometry",
  generation: 2,
  estimatedCredits: 1,
  createdAtMs: 1,
  updatedAtMs: 2,
  deadlineAtMs: 100,
  request: {
    mode: "text-to-3d",
    provider: "hyper3d-rodin",
    model: "Rodin Gen-2.5",
    tier: "Gen-2.5-Medium",
    seed: 7,
    transport: "server",
  },
};

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("Studio3dGenerationHttpClient", () => {
  it("uses authenticated idempotent endpoints without placing provider keys in JSON", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockImplementation(async () => jsonResponse(job));
    const client = new Studio3dGenerationHttpClient({
      userId: "user-1",
      fetchImpl: fetchMock,
      providerApiKey: () => "session-provider-key",
    });
    await client.create(
      {
        mode: "text-to-3d",
        prompt: "wooden stool",
        transport: "byok",
        options: { seed: 7 },
      },
      "idempotent-1",
    );
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url).endsWith("/api/studio-ai/3d/jobs")).toBe(true);
    const headers = new Headers(init?.headers);
    expect(headers.get("X-User-Id")).toBe("user-1");
    expect(headers.get("Idempotency-Key")).toBe("idempotent-1");
    expect(headers.get("X-Studio-3D-Provider-Key")).toBe("session-provider-key");
    expect(String(init?.body)).not.toContain("session-provider-key");
  });

  it("advances, cancels and restores jobs through stable URLs", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockImplementation(async () => jsonResponse(job));
    const client = new Studio3dGenerationHttpClient({ userId: "user-1", fetchImpl: fetchMock });
    await client.advance("job/1");
    await client.cancel("job/1");
    await client.get("job/1");
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
      "/api/studio-ai/3d/jobs/job%2F1/advance",
      "/api/studio-ai/3d/jobs/job%2F1/cancel",
      "/api/studio-ai/3d/jobs/job%2F1",
    ]);
  });

  it("surfaces bounded server error messages", async () => {
    const client = new Studio3dGenerationHttpClient({
      userId: "user-1",
      fetchImpl: vi
        .fn<typeof fetch>()
        .mockImplementation(async () =>
          jsonResponse({ message: "credit budget exceeded" }, 429),
        ),
    });
    await expect(client.list()).rejects.toThrow("credit budget exceeded");
  });
});
