// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AdminBusinessInquiries } from "./AdminBusinessInquiries";

const get = vi.hoisted(() => vi.fn<(path: string, options?: unknown) => Promise<unknown>>());
vi.mock("@/platform/api", () => ({
  api: { get, post: vi.fn() },
  getApiErrorMessage: async (_cause: unknown, fallback: string) => fallback,
}));
vi.mock("@/shared/lib/i18n-bilingual-copy", () => ({
  translateCurrentStaticSourceText: (_id: string, _lang: string, text: string) => text,
  formatI18nTemplate: (template: string) => template,
}));

beforeEach(() => {
  get.mockReset();
  get.mockImplementation((path: string) =>
    path.includes("verifications")
      ? Promise.resolve({ items: [] })
      : Promise.resolve({ items: [], total: 0 }),
  );
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("AdminBusinessInquiries 상태 표면 (관리자 킷)", () => {
  it("로딩 중에는 킷 스피너(status)를 보여주고, 빈 결과는 킷 빈 상태로 구분한다", async () => {
    const pending = Promise.withResolvers<unknown>();
    get.mockImplementation((path: string) =>
      path.includes("verifications") ? Promise.resolve({ items: [] }) : pending.promise,
    );
    render(<AdminBusinessInquiries />);
    // 문의·인증 두 패널 모두 관리자 킷 AdminSpinner(role=status)를 렌더한다.
    expect(screen.getAllByRole("status", { name: "불러오는 중" }).length).toBeGreaterThan(0);
    pending.resolve({ items: [], total: 0 });
    // 성공했지만 비어 있는 결과는 오류가 아니라 빈 상태로 표시된다.
    expect(await screen.findByText("해당 상태의 문의가 없습니다.")).toBeTruthy();
    expect(await screen.findByText("해당 상태의 기업 인증 요청이 없습니다.")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("요청 실패는 빈 상태가 아니라 alert로 알린다", async () => {
    get.mockImplementation((path: string) =>
      path.includes("verifications")
        ? Promise.resolve({ items: [] })
        : Promise.reject(new Error("network down")),
    );
    render(<AdminBusinessInquiries />);
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByText("비즈니스 문의를 불러오지 못했어요.")).toBeTruthy();
    expect(screen.queryByText("해당 상태의 문의가 없습니다.")).toBeNull();
  });
});
