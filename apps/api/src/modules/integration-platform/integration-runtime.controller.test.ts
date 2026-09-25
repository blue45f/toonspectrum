import { UnauthorizedException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import { IntegrationRuntimeController } from "./integration-runtime.controller";
import type { IntegrationRuntimeService } from "./integration-runtime.service";

function fixture() {
  const service = {
    connectors: vi.fn(() => ({ connectors: [] })),
    listReceipts: vi.fn().mockResolvedValue({ receipts: [] }),
    execute: vi.fn().mockResolvedValue({ state: "planned" }),
  };
  return {
    service,
    controller: new IntegrationRuntimeController(
      service as unknown as IntegrationRuntimeService,
    ),
  };
}

describe("IntegrationRuntimeController", () => {
  it("requires a verified session for connector configuration state", () => {
    const { controller, service } = fixture();
    expect(() => controller.connectors(undefined)).toThrow(UnauthorizedException);
    expect(service.connectors).not.toHaveBeenCalled();
  });

  it("binds receipt reads and execution to the authenticated actor", async () => {
    const { controller, service } = fixture();
    await expect(controller.receipts("user-1", { projectId: "project-1", limit: 10 }))
      .resolves.toEqual({ receipts: [] });
    expect(service.listReceipts).toHaveBeenCalledWith("user-1", {
      projectId: "project-1",
      limit: 10,
    });

    const body = {
      projectId: "project-1",
      mutationId: "11111111-1111-4111-8111-111111111111",
      dryRun: true,
      confirm: false,
      request: {
        providerId: "wikidata" as const,
        action: "trends.read" as const,
        input: { query: "Work", language: "en", limit: 5 },
      },
    };
    await expect(controller.execute("user-1", body)).resolves.toEqual({ state: "planned" });
    expect(service.execute).toHaveBeenCalledWith("user-1", body);
  });
});
