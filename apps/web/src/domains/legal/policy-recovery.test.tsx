// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getStaticPolicyDocument } from "./policy-content";
import { PrivacyPage, TermsPage } from "./PolicyPage";

const mock = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@/infrastructure/api", () => ({
  api: { get: mock.get }, apiPath: (path: string) => `/api${path}`, httpStatus: () => null,
}));

beforeEach(() => {
  mock.get.mockReset();
  vi.stubEnv("VITE_POLICY_API_AUTO", "true");
});
afterEach(() => { cleanup(); vi.unstubAllEnvs(); });

describe("policy display while the publication service is unavailable", () => {
  it.each([
    ["privacy-policy", PrivacyPage], ["terms-of-service", TermsPage],
  ] as const)("%s preserves a successful API fallback's source and legal content", async (slug, Page) => {
    mock.get.mockResolvedValue(getStaticPolicyDocument(slug));
    render(<Page />);
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("내장 정책 사본"));
    expect(screen.getByText("내장 정책 사본")).toBeTruthy();
    expect(screen.queryByText("TermsDesk 게시 정본")).toBeNull();
    expect(mock.get).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("link", { name: /원문·버전 이력/ }).getAttribute("href"))
      .toBe(`https://desk-platform.vercel.app/termsdesk/p/toonspectrum/${slug}`);
  });

  it("returns to a published original on a successful retry without retaining the fallback banner", async () => {
    mock.get.mockResolvedValueOnce(getStaticPolicyDocument("privacy-policy"));
    render(<PrivacyPage />);
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("내장 정책 사본"));
    mock.get.mockResolvedValueOnce({
      policySlug: "privacy-policy", name: "개인정보처리방침", body: "Recovered publication fixture",
      versionLabel: "test-v2", contentHash: "a".repeat(64), effectiveAt: null, source: "termsdesk",
    });
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    await waitFor(() => expect(screen.getByText("TermsDesk 게시 정본")).toBeTruthy());
    expect(screen.queryByText("내장 정책 사본")).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByText("Recovered publication fixture")).toBeTruthy();
    expect(mock.get).toHaveBeenCalledTimes(2);
  });

  it("retains readable bundled policy text after an application API failure", async () => {
    mock.get.mockRejectedValue(new Error("offline"));
    render(<PrivacyPage />);
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("내장 정책 사본"));
    expect(screen.getByText("4. 기기 내 AI 기능과 MediaPipe")).toBeTruthy();
    expect(screen.queryByText("TermsDesk 게시 정본")).toBeNull();
  });
});
