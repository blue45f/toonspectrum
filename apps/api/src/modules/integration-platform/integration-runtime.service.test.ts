import {
  BadGatewayException,
  ConflictException,
  ForbiddenException,
  HttpException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ProductionCollaborationService } from "../production-collaboration/production-collaboration.service";
import type { IntegrationRuntimeExecuteDto } from "./integration-runtime.dto";
import type { IntegrationRuntimeProviderEngine } from "./integration-runtime.providers";
import {
  IntegrationRuntimeDailyQuotaError,
  IntegrationRuntimeMutationConflictError,
  IntegrationRuntimeMutationInFlightError,
  type IntegrationRuntimeRepository,
} from "./integration-runtime.repository";
import {
  IntegrationRuntimeService,
  integrationRuntimeDigest,
} from "./integration-runtime.service";
import { IntegrationRuntimeExternalError } from "./integration-runtime.transport";

const request: IntegrationRuntimeExecuteDto = {
  projectId: "project-1",
  mutationId: "11111111-1111-4111-8111-111111111111",
  dryRun: false,
  confirm: true,
  request: {
    providerId: "slack",
    action: "message.send",
    input: {
      title: "Review",
      text: "Episode ready",
      severity: "info",
    },
  },
};

function fixture(overrides: { configured?: boolean; edit?: boolean; writes?: boolean } = {}) {
  const production = {
    getProject: vi.fn().mockResolvedValue({
      aggregate: { projectId: "project-1" },
      access: { view: true, edit: overrides.edit ?? true, manage: true },
    }),
  };
  const repository = {
    beginMutation: vi.fn().mockResolvedValue({ replay: null }),
    completeMutation: vi.fn().mockResolvedValue(undefined),
    failMutation: vi.fn().mockResolvedValue(undefined),
    listReceipts: vi.fn().mockResolvedValue([]),
  };
  const status = {
    providerId: "slack",
    name: "Slack",
    action: "message.send",
    category: "communication",
    configured: overrides.configured ?? true,
    missingConfigurationCount: overrides.configured === false ? 1 : 0,
    writesExternalState: overrides.writes ?? true,
    executionMode: "operator-webhook",
    summary: "summary",
    exampleInput: {},
  } as const;
  const engine = {
    connectors: vi.fn(() => [status]),
    status: vi.fn(() => status),
    execute: vi.fn().mockResolvedValue({
      externalId: null,
      response: { providerId: "slack", delivered: true },
    }),
  };
  return {
    production,
    repository,
    engine,
    service: new IntegrationRuntimeService(
      production as unknown as ProductionCollaborationService,
      repository as unknown as IntegrationRuntimeRepository,
      engine as unknown as IntegrationRuntimeProviderEngine,
    ),
  };
}

describe("IntegrationRuntimeService", () => {
  beforeEach(() => vi.useRealTimers());

  it("builds stable prefixed request digests", () => {
    expect(integrationRuntimeDigest({ b: 2, a: 1 })).toBe(
      integrationRuntimeDigest({ a: 1, b: 2 }),
    );
    expect(integrationRuntimeDigest({ a: 1 })).toMatch(/^sha256:[0-9a-f]{64}$/u);
  });

  it("returns a dry-run plan without writing a receipt or calling the provider", async () => {
    const test = fixture({ configured: false });
    const result = await test.service.execute("user-1", {
      ...request,
      dryRun: true,
      confirm: false,
    });
    expect(result).toMatchObject({
      state: "planned",
      configured: false,
      executable: false,
      providerId: "slack",
    });
    expect(test.repository.beginMutation).not.toHaveBeenCalled();
    expect(test.engine.execute).not.toHaveBeenCalled();
  });

  it("requires project edit access for external writes", async () => {
    const test = fixture({ edit: false });
    await expect(test.service.execute("user-1", request)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(test.repository.beginMutation).not.toHaveBeenCalled();
  });

  it("fails closed before a receipt when operator configuration is missing", async () => {
    const test = fixture({ configured: false });
    await expect(test.service.execute("user-1", request)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(test.repository.beginMutation).not.toHaveBeenCalled();
  });

  it("persists a successful normalized receipt and replays it idempotently", async () => {
    const test = fixture();
    const result = await test.service.execute("user-1", request);
    expect(result).toMatchObject({
      state: "succeeded",
      replayed: false,
      providerId: "slack",
      result: { delivered: true },
    });
    expect(test.repository.beginMutation).toHaveBeenCalledWith(expect.objectContaining({
      provider: "slack",
      operation: "message.send",
      requestDigest: expect.stringMatching(/^sha256:/u),
    }));
    expect(test.repository.completeMutation).toHaveBeenCalledWith(expect.objectContaining({
      mutationId: request.mutationId,
      response: expect.objectContaining({ state: "succeeded" }),
    }));

    const replay = { schema: "toonspectrum.integration-runtime-receipt/1", state: "succeeded" };
    test.repository.beginMutation.mockResolvedValueOnce({ replay });
    const replayed = await test.service.execute("user-1", request);
    expect(replayed).toEqual({ ...replay, replayed: true });
    expect(test.engine.execute).toHaveBeenCalledTimes(1);
  });

  it("returns transient provider values once but persists only their redacted receipt form", async () => {
    const test = fixture();
    test.engine.execute.mockResolvedValueOnce({
      externalId: "file-1",
      response: { images: { "1:2": "https://signed.example.test/render?token=secret" } },
      receiptResponse: { imageReadyNodeIds: ["1:2"], transientValuesPersisted: false },
    });
    const result = await test.service.execute("user-1", request);
    expect(result).toMatchObject({
      transientResult: true,
      result: { images: { "1:2": expect.stringContaining("signed.example.test") } },
    });
    expect(test.repository.completeMutation).toHaveBeenCalledWith(expect.objectContaining({
      response: expect.objectContaining({
        transientResult: true,
        result: { imageReadyNodeIds: ["1:2"], transientValuesPersisted: false },
      }),
    }));
    expect(JSON.stringify(test.repository.completeMutation.mock.calls[0]?.[0])).not.toContain("token=secret");
  });

  it("maps the durable actor quota to HTTP 429 before provider execution", async () => {
    const test = fixture();
    test.repository.beginMutation.mockRejectedValueOnce(
      new IntegrationRuntimeDailyQuotaError(
        100,
        new Date("2026-09-26T00:00:00.000Z"),
      ),
    );
    const error = await test.service.execute("user-1", request).catch(
      (cause: unknown) => cause,
    );
    expect(error).toBeInstanceOf(HttpException);
    expect((error as HttpException).getStatus()).toBe(429);
    expect((error as HttpException).getResponse()).toMatchObject({
      code: "integration_runtime_daily_quota_exceeded",
      limit: 100,
      resetAt: "2026-09-26T00:00:00.000Z",
    });
    expect(test.engine.execute).not.toHaveBeenCalled();
  });

  it("maps mutation conflicts and in-flight receipts without executing twice", async () => {
    const conflict = fixture();
    conflict.repository.beginMutation.mockRejectedValueOnce(
      new IntegrationRuntimeMutationConflictError(),
    );
    await expect(conflict.service.execute("user-1", request)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(conflict.engine.execute).not.toHaveBeenCalled();

    const uncertain = fixture();
    uncertain.repository.beginMutation.mockRejectedValueOnce(
      new IntegrationRuntimeMutationInFlightError("uncertain", "external-1"),
    );
    await expect(uncertain.service.execute("user-1", request)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(uncertain.engine.execute).not.toHaveBeenCalled();
  });

  it("records uncertain provider failures and does not expose raw provider bodies", async () => {
    const test = fixture();
    test.engine.execute.mockRejectedValueOnce(
      new IntegrationRuntimeExternalError("external_timeout", null, true),
    );
    await expect(test.service.execute("user-1", request)).rejects.toBeInstanceOf(
      BadGatewayException,
    );
    expect(test.repository.failMutation).toHaveBeenCalledWith(expect.objectContaining({
      state: "uncertain",
      errorCode: "external_timeout",
    }));
  });

  it("uses view access and actor scoping when listing receipts", async () => {
    const test = fixture({ edit: false, writes: false });
    test.repository.listReceipts.mockResolvedValueOnce([{ mutationId: "m1" }]);
    const result = await test.service.listReceipts("user-1", {
      projectId: "project-1",
      limit: 20,
    });
    expect(result.receipts).toEqual([{ mutationId: "m1" }]);
    expect(test.repository.listReceipts).toHaveBeenCalledWith("project-1", "user-1", 20);
  });
});
