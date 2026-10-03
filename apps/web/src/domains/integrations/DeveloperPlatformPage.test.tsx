// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DeveloperPlatformPage } from "./DeveloperPlatformPage";

const mocks = vi.hoisted(() => ({
  developerManifest: vi.fn(),
}));

vi.mock("./integration-platform-client", () => ({
  integrationPlatformClient: mocks,
}));

vi.mock("@/platform/api", () => ({
  getApiErrorMessage: async (_reason: unknown, fallback: string) => fallback,
}));

vi.mock("@/shared/lib/i18n", () => ({
  useI18n: (selector: (state: { lang: string }) => unknown) => selector({ lang: "ko" }),
  // 공용 LoadingState가 useT를 쓴다 — 라벨을 명시 전달하므로 키 반환 스텁으로 충분하다.
  useT: () => (key: string) => key,
}));

const manifestFixture = {
  schema: "toonstudio.developer/v1",
  providers: 3,
  scopes: ["catalog:read"],
  events: ["project.updated"],
  actions: ["catalog.list"],
  webhook: { version: "2026-10", signature: "hmac-sha256" },
  safety: { rawFilesRequireStrongGrant: true },
};

describe("DeveloperPlatformPage", () => {
  beforeEach(() => {
    mocks.developerManifest.mockReset();
  });

  it("불러오기에 실패하면 재시도 버튼이 있는 오류를 보여주고, 재시도로 복구한다", async () => {
    mocks.developerManifest
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce(manifestFixture);

    render(
      <MemoryRouter>
        <DeveloperPlatformPage />
      </MemoryRouter>,
    );

    const retryButton = await screen.findByRole("button", { name: "다시 확인" });
    expect(screen.getByRole("alert").textContent).toContain("개발자 계약을 불러오지 못했습니다.");

    fireEvent.click(retryButton);

    await waitFor(() => {
      expect(screen.getByText("toonstudio.developer/v1")).toBeTruthy();
    });
    expect(screen.queryByRole("alert")).toBeNull();
    expect(mocks.developerManifest).toHaveBeenCalledTimes(2);
  });

  it("웹훅 계약을 헤더가 있는 코드 카드로 보여준다", async () => {
    mocks.developerManifest.mockResolvedValueOnce(manifestFixture);

    render(
      <MemoryRouter>
        <DeveloperPlatformPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText("웹훅 계약 JSON")).toBeTruthy();
    expect(screen.getByText(/"signature": "hmac-sha256"/)).toBeTruthy();
  });
});
