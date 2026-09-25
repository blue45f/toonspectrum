import { HttpException, UnauthorizedException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import type { Request } from "express";
import type { CreatorIntelligenceCore } from "./creator-intelligence-core";
import {
  CreatorIntelligenceController,
} from "./creator-intelligence.module";
import { CreatorIntelligenceMeshArtifactService } from "./creator-intelligence-mesh-artifact.service";
import { CreatorIntelligencePaidAdmission } from "./creator-intelligence-paid-admission";

function request(): Request {
  return {
    aborted: false,
    once: vi.fn(),
    off: vi.fn(),
  } as unknown as Request;
}

function controller(overrides: Partial<CreatorIntelligenceCore> = {}) {
  const core = {
    describe: vi.fn(() => ({ voice: {}, soundEffects: { status: "ready" } })),
    synthesizeVoice: vi.fn(async () => ({ status: "ready", audioBase64: "AAAA" })),
    generateSoundEffect: vi.fn(async () => ({ status: "ready", audioBase64: "AAAA" })),
    translate: vi.fn(async () => ({ status: "ready", text: "번역" })),
    createMeshyJob: vi.fn(async () => ({ status: "ready", provider: "meshy", jobId: "mesh_job_123" })),
    getMeshyJob: vi.fn(async (jobId: string) => ({ status: "ready", provider: "meshy", jobId })),
    safeSearch: vi.fn(async () => ({ status: "ready", reviewRequired: false })),
    ...overrides,
  } as unknown as CreatorIntelligenceCore;
  return {
    core,
    controller: new CreatorIntelligenceController(
      core,
      new CreatorIntelligencePaidAdmission(null),
      new CreatorIntelligenceMeshArtifactService(),
    ),
  };
}

describe("CreatorIntelligenceController paid boundaries", () => {
  it("requires an authenticated session identity", async () => {
    const { controller: subject } = controller();
    await expect(subject.soundGenerate(
      undefined,
      `request-${crypto.randomUUID()}`,
      { prompt: "rain" },
      request(),
    )).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("requires an idempotency key before provider dispatch", async () => {
    const { controller: subject, core } = controller();
    let error: unknown;
    try {
      await subject.translate(
        "user-1",
        undefined,
        { provider: "deepl", text: "hello", targetLanguage: "KO" },
        request(),
      );
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(HttpException);
    expect((error as HttpException).getStatus()).toBe(400);
    expect(core.translate).not.toHaveBeenCalled();
  });

  it("returns an owner-bound opaque Meshy job token", async () => {
    const { controller: subject, core } = controller();
    const created = await subject.meshCreate(
      "user-1",
      `request-${crypto.randomUUID()}`,
      { imageUrl: "https://example.com/input.png" },
      request(),
    );
    expect(created).toMatchObject({ status: "ready", provider: "meshy" });
    expect(created.jobId).not.toBe("mesh_job_123");

    const own = await subject.meshStatus("user-1", created.jobId, request());
    expect(own).toMatchObject({ status: "ready", jobId: created.jobId });
    expect(core.getMeshyJob).toHaveBeenCalledWith("mesh_job_123");

    await expect(subject.meshStatus("user-2", created.jobId, request())).rejects.toThrow(
      "현재 계정과 일치하지 않아요",
    );
  });

  it("publishes whether paid execution is guarded and enabled", () => {
    const { controller: subject } = controller();
    expect(subject.status()).toMatchObject({
      paidExecution: {
        requiresAuthentication: true,
        requiresIdempotencyKey: true,
        failClosedInProduction: true,
      },
      meshArtifacts: {
        configured: false,
        requiredInProduction: true,
        providerUrlsReturnedInProduction: false,
      },
    });
  });
});
