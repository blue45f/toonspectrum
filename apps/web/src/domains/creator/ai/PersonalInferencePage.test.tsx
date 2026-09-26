// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PersonalInferencePage } from "./PersonalInferencePage";

import type { PropsWithChildren } from "react";

const mocks = vi.hoisted(() => ({
  configured: false,
  capabilities: vi.fn(),
  jobs: vi.fn(),
}));

vi.mock("@/shared/ai/unified-ai-settings", () => ({
  useUnifiedAiAuxSettings: () => ({
    revision: 0,
    settings: mocks.configured
      ? { creatorRuntimeBaseUrl: "https://runtime.example.test", creatorRuntimeToken: "x".repeat(32) }
      : { creatorRuntimeBaseUrl: "", creatorRuntimeToken: "" },
  }),
}));

vi.mock("@/shared/components/section", () => ({
  Container: ({ children }: PropsWithChildren) => <div>{children}</div>,
}));

vi.mock("@/shared/seo/use-document-title", () => ({
  useDocumentTitle: vi.fn(),
}));

vi.mock("./personal-inference-client", () => ({
  personalInferenceCapabilities: mocks.capabilities,
  listPersonalInferenceJobs: mocks.jobs,
  cancelPersonalInferenceJob: vi.fn(),
  downloadPersonalInferenceArtifact: vi.fn(),
  submitPersonalInferenceJob: vi.fn(),
  uploadPersonalInferenceAsset: vi.fn(),
}));

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/studio/ai-lab"]}>
      <PersonalInferencePage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.configured = false;
  mocks.capabilities.mockResolvedValue({ enabled: true, engines: {} });
  mocks.jobs.mockResolvedValue([]);
});

afterEach(cleanup);

describe("PersonalInferencePage empty workflow", () => {
  it("turns an unconfigured runtime into a direct setup and diagnostics path", () => {
    renderPage();

    expect(screen.getByRole("heading", { name: "런타임을 연결하면 작업 기록이 여기에 모입니다" })).toBeTruthy();
    expect(screen.getAllByRole("link", { name: /클라우드 런타임 연결|클라우드 런타임 설정/ })
      .some((link) => link.getAttribute("href") === "/settings/ai")).toBe(true);
    expect(screen.getByRole("link", { name: "연결 문제 진단" }).getAttribute("href")).toBe("/help");
    expect(screen.queryByText("아직 작업이 없습니다.")).toBeNull();
    expect(mocks.capabilities).not.toHaveBeenCalled();
    expect(mocks.jobs).not.toHaveBeenCalled();
  });

  it("guides an idle configured runtime back to the generation form", async () => {
    mocks.configured = true;

    renderPage();

    expect(await screen.findByRole("heading", { name: "첫 변환 작업을 시작하세요" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "생성 설정으로 이동" }).getAttribute("href")).toBe(
      "/studio/ai-lab#ai-generation-settings",
    );
    expect(document.getElementById("ai-generation-settings")).toBeTruthy();
    expect(mocks.capabilities).toHaveBeenCalledOnce();
    expect(mocks.jobs).toHaveBeenCalledOnce();
  });
});
