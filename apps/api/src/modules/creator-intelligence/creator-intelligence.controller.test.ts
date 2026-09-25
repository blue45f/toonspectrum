import { HttpException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import { CreatorIntelligenceAdmissionGuard } from "./creator-intelligence-admission";
import { CreatorIntelligenceController } from "./creator-intelligence.module";

async function statusOf(run: () => unknown | Promise<unknown>): Promise<number> {
  try {
    await run();
  } catch (error) {
    if (error instanceof HttpException) return error.getStatus();
    throw error;
  }
  throw new Error("expected controller to reject");
}

function createCore(overrides: Record<string, unknown> = {}) {
  return {
    describe: vi.fn(() => ({
      schema: "toonspectrum.creator-intelligence.status.v1" as const,
      references: {
        openverse: { status: "ready", reason: "public discovery" },
        pexels: { status: "disabled", reason: "not configured" },
        pixabay: { status: "disabled", reason: "not configured" },
      },
      translation: {
        deepl: { status: "ready", reason: "configured" },
        libretranslate: { status: "disabled", reason: "not configured" },
      },
      voice: {
        gemini: { status: "ready", reason: "configured" },
        deepgram: { status: "disabled", reason: "not configured" },
      },
      scene: { status: "disabled", reason: "not configured" },
      anilist: { status: "disabled", reason: "not enabled" },
      freesound: { status: "disabled", reason: "not enabled" },
      soundEffects: { status: "ready", reason: "configured" },
      meshy: { status: "ready", reason: "configured" },
      safeSearch: { status: "ready", reason: "configured" },
    })),
    searchReferences: vi.fn(),
    sceneReference: vi.fn(),
    searchAniList: vi.fn(),
    searchSoundEffects: vi.fn(),
    synthesizeVoice: vi.fn(),
    generateSoundEffect: vi.fn(async () => ({ status: "ready" as const })),
    translate: vi.fn(),
    createMeshyJob: vi.fn(async () => ({
      status: "ready" as const,
      provider: "meshy" as const,
      jobId: "provider_job_123",
    })),
    getMeshyJob: vi.fn(async (jobId: string) => ({
      status: "ready" as const,
      provider: "meshy" as const,
      jobId,
      jobStatus: "IN_PROGRESS",
    })),
    safeSearch: vi.fn(),
    ...overrides,
  } as unknown as ConstructorParameters<typeof CreatorIntelligenceController>[0];
}

describe("CreatorIntelligenceController paid route protection", () => {
  it("rejects an unauthenticated paid request before invoking a provider", async () => {
    const core = createCore();
    const guard = new CreatorIntelligenceAdmissionGuard({
      env: () => ({ NODE_ENV: "development" }),
    });
    const controller = new CreatorIntelligenceController(core, guard);

    await expect(statusOf(() => controller.soundGenerate(
      undefined,
      "sfx:12345678",
      { prompt: "door slam" },
    ))).resolves.toBe(401);
    expect(core.generateSoundEffect).not.toHaveBeenCalled();
  });

  it("wraps provider Meshy ids and unwraps only for the creating user", async () => {
    const core = createCore();
    const guard = new CreatorIntelligenceAdmissionGuard({
      env: () => ({ NODE_ENV: "development" }),
      now: () => 10_000,
    });
    const controller = new CreatorIntelligenceController(core, guard);

    const created = await controller.meshCreate(
      "user-1",
      "mesh:12345678",
      { imageUrl: "https://example.com/reference.png" },
    );
    expect(created.status).toBe("ready");
    expect(created.jobId).not.toBe("provider_job_123");

    const status = await controller.meshStatus("user-1", created.jobId);
    expect(status.jobId).toBe("provider_job_123");
    expect(core.getMeshyJob).toHaveBeenCalledWith("provider_job_123");

    await expect(statusOf(() => controller.meshStatus(
      "user-2",
      created.jobId,
    ))).resolves.toBe(403);
    expect(core.getMeshyJob).toHaveBeenCalledTimes(1);
  });

  it("reports paid providers disabled when production coordination is absent", () => {
    const core = createCore();
    const guard = new CreatorIntelligenceAdmissionGuard({
      env: () => ({
        NODE_ENV: "production",
        CREATOR_INTELLIGENCE_PAID_ROUTES_ENABLED: "true",
      }),
    });
    const controller = new CreatorIntelligenceController(core, guard);

    expect(controller.status()).toMatchObject({
      admission: {
        paidRoutesEnabled: false,
        enforcement: "unavailable",
      },
      soundEffects: { status: "disabled" },
      meshy: { status: "disabled" },
      safeSearch: { status: "disabled" },
      translation: {
        deepl: { status: "disabled" },
        libretranslate: { status: "disabled" },
      },
      voice: {
        gemini: { status: "disabled" },
        deepgram: { status: "disabled" },
      },
    });
  });
});
