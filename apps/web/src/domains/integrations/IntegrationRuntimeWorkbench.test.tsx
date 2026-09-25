// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { IntegrationRuntimeWorkbench } from "./IntegrationRuntimeWorkbench";

const mocks = vi.hoisted(() => ({
  runtimeConnectors: vi.fn(),
  runtimeReceipts: vi.fn(),
  executeRuntime: vi.fn(),
}));

vi.mock("./integration-platform-client", () => ({
  integrationPlatformClient: mocks,
}));

vi.mock("@/shared/lib/i18n", () => ({
  useI18n: (selector: (state: { lang: string }) => unknown) => selector({ lang: "ko" }),
}));

const connectors = {
  generatedAt: "2026-09-25T00:00:00.000Z",
  durability: "database-receipt" as const,
  safety: {
    explicitConfirmation: true,
    idempotencyReceipt: true,
    unofficialBrowserAutomation: false,
    providerPasswordsAccepted: false,
  },
  connectors: [
    {
      providerId: "wikidata" as const,
      name: "Wikidata",
      action: "trends.read",
      category: "data" as const,
      configured: true,
      missingConfigurationCount: 0,
      writesExternalState: false,
      executionMode: "public-protocol" as const,
      summary: "Search public metadata.",
      exampleInput: { query: "Work", language: "en", limit: 5 },
    },
    {
      providerId: "slack" as const,
      name: "Slack",
      action: "message.send",
      category: "communication" as const,
      configured: false,
      missingConfigurationCount: 1,
      writesExternalState: true,
      executionMode: "operator-webhook" as const,
      summary: "Send a project notification.",
      exampleInput: { title: "Review", text: "Episode ready", severity: "info" },
    },
  ],
};

describe("IntegrationRuntimeWorkbench", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.runtimeConnectors.mockResolvedValue(connectors);
    mocks.runtimeReceipts.mockResolvedValue({ generatedAt: "now", receipts: [] });
    mocks.executeRuntime.mockImplementation(async (request: { dryRun: boolean; mutationId: string }) => ({
      schema: request.dryRun
        ? "toonspectrum.integration-runtime-plan/1"
        : "toonspectrum.integration-runtime-receipt/1",
      state: request.dryRun ? "planned" : "succeeded",
      projectId: "project-1",
      mutationId: request.mutationId,
      requestDigest: `sha256:${"a".repeat(64)}`,
      providerId: "wikidata",
      action: "trends.read",
      ...(request.dryRun ? { configured: true, executable: true } : { replayed: false, result: { source: "Wikidata" } }),
    }));
  });

  it("keeps live execution disabled until the operator confirms the reviewed request", async () => {
    render(<IntegrationRuntimeWorkbench />);

    expect(await screen.findByRole("option", { name: "Wikidata · trends.read" })).toBeTruthy();
    const project = screen.getByRole("textbox", { name: "제작 프로젝트 ID" });
    fireEvent.change(project, { target: { value: "project-1" } });

    const live = screen.getByRole("button", { name: "외부 시스템 실행" });
    expect((live as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "계획 확인" }));
    await waitFor(() => expect(mocks.executeRuntime).toHaveBeenCalledWith(expect.objectContaining({
      projectId: "project-1",
      dryRun: true,
      confirm: false,
      request: expect.objectContaining({ providerId: "wikidata", action: "trends.read" }),
    })));
    expect(await screen.findByText("실행 계획 확인 완료")).toBeTruthy();

    fireEvent.click(screen.getByRole("checkbox", { name: "실제 외부 실행 확인" }));
    expect((live as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(live);

    await waitFor(() => expect(mocks.executeRuntime).toHaveBeenLastCalledWith(expect.objectContaining({
      projectId: "project-1",
      dryRun: false,
      confirm: true,
    })));
    expect(mocks.runtimeReceipts).toHaveBeenCalledWith("project-1", 30);
  });

  it("allows planning but blocks live execution for an unconfigured connector", async () => {
    render(<IntegrationRuntimeWorkbench />);
    await screen.findByRole("option", { name: "Wikidata · trends.read" });

    fireEvent.change(screen.getByRole("combobox", { name: "실행 공급자" }), {
      target: { value: "slack" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "제작 프로젝트 ID" }), {
      target: { value: "project-1" },
    });
    fireEvent.click(screen.getByRole("checkbox", { name: "실제 외부 실행 확인" }));

    expect((screen.getByRole("button", { name: "외부 시스템 실행" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "계획 확인" }) as HTMLButtonElement).disabled).toBe(false);
  });
});
