// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/react";
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

vi.mock("../studio-server-ai-client", () => ({
  getStudioServerAiStatus: vi.fn().mockRejectedValue(new Error("offline")),
  completeStudioServerText: vi.fn(),
  studioServerAiProviderLabel: (provider: string) => provider,
}));

vi.mock("@/domains/auth/public/session/auth-session-store", () => ({
  useSession: () => ({ data: null }),
}));

vi.mock("./personal-inference-client", () => ({
  personalInferenceCapabilities: mocks.capabilities,
  listPersonalInferenceJobs: mocks.jobs,
  cancelPersonalInferenceJob: vi.fn(),
  downloadPersonalInferenceArtifact: vi.fn(),
  submitPersonalInferenceJob: vi.fn(),
  uploadPersonalInferenceAsset: vi.fn(),
}));

function renderPage(entry = "/studio/ai-lab") {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <PersonalInferencePage />
    </MemoryRouter>,
  );
}

function runtimeDisclosure(): HTMLDetailsElement {
  const element = document.querySelector("details[data-ai-runtime-disclosure]");
  if (!(element instanceof HTMLDetailsElement)) throw new Error("내 AI 런타임 접이식이 없습니다");
  return element;
}

beforeEach(() => {
  vi.clearAllMocks();
  // 해시로 들어오면 알려진 구역으로 스크롤하는데, jsdom에는 scrollIntoView가 없다.
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, writable: true, value: vi.fn() });
  mocks.configured = false;
  mocks.capabilities.mockResolvedValue({ enabled: true, engines: {} });
  mocks.jobs.mockResolvedValue([]);
});

afterEach(cleanup);

describe("PersonalInferencePage AI hub", () => {
  it("starts with Luna's suggestions and compares every AI entry before the runtime", () => {
    renderPage();

    expect(screen.getByRole("heading", { level: 1, name: "AI와 함께, 아이디어를 장면으로" })).toBeTruthy();
    const nav = screen.getByRole("navigation", { name: "AI 도구 이동" });
    expect(within(nav).getByRole("link", { name: /AI 크리에이티브 디렉터/u }).getAttribute("aria-current")).toBe("page");
    expect(within(nav).getByRole("link", { name: /생성 실험실/u }).getAttribute("href")).toBe("/studio/generate");
    expect(screen.getByRole("list", { name: "제안 목록" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "AI로 할 수 있는 일 · 사용 조건" })).toBeTruthy();
    // 고급 기능인 내 AI 런타임은 접어 두되, 기능과 주소(#ai-runtime)는 그대로 있다.
    const disclosure = runtimeDisclosure();
    expect(disclosure.open).toBe(false);
    expect(within(disclosure).getByText("내 AI 런타임 · 고급")).toBeTruthy();
    expect(within(disclosure).getByRole("heading", { name: "내 AI 런타임으로 영상·3D 변환", hidden: true })).toBeTruthy();
    expect(document.getElementById("ai-runtime")).toBeTruthy();
  });

  it("opens the advanced runtime when the visitor comes for it or already connected one", () => {
    renderPage("/studio/ai-lab#ai-runtime");
    expect(runtimeDisclosure().open).toBe(true);
    cleanup();

    renderPage("/studio/ai-lab#ai-generation-settings");
    expect(runtimeDisclosure().open).toBe(true);
    cleanup();

    renderPage("/studio/ai-lab#ai-tools");
    expect(runtimeDisclosure().open).toBe(false);
    cleanup();

    mocks.configured = true;
    renderPage();
    expect(runtimeDisclosure().open).toBe(true);
  });
});

describe("PersonalInferencePage empty workflow", () => {
  it("turns an unconfigured runtime into a direct setup and diagnostics path", () => {
    renderPage();

    expect(screen.getByRole("heading", { name: "런타임을 연결하면 작업 기록이 여기에 모입니다", hidden: true })).toBeTruthy();
    expect(screen.getAllByRole("link", { name: /클라우드 런타임 연결|클라우드 런타임 설정/, hidden: true })
      .some((link) => link.getAttribute("href") === "/settings/ai")).toBe(true);
    expect(screen.getByRole("link", { name: "연결 문제 진단", hidden: true }).getAttribute("href")).toBe("/help");
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
