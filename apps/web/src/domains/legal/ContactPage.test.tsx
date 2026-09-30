// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ContactPage } from "./ContactPage";

vi.mock("@/shared/seo/use-document-title", () => ({ useDocumentTitle: vi.fn() }));
vi.mock("@/shared/components/site-experience/WorkflowIllustration", () => ({
  WorkflowIllustration: () => <span data-testid="workflow-illustration" />,
}));

afterEach(cleanup);

describe("ContactPage", () => {
  it("puts the dedicated contact paths first as links, before informational topics", () => {
    render(
      <MemoryRouter>
        <ContactPage />
      </MemoryRouter>,
    );

    const pathsHeading = screen.getByRole("heading", { name: "문의 성격에 맞는 전용 경로" });
    const topicsHeading = screen.getByRole("heading", { name: "이런 문의를 받습니다" });
    expect(pathsHeading.compareDocumentPosition(topicsHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    expect(screen.getByRole("link", { name: /사이트 문의/ }).getAttribute("href")).toBe("/support");
    expect(screen.getByRole("link", { name: /버그 제보/ }).getAttribute("href")).toBe("/feedback?type=bug");
    // 안내용 주제 카드는 링크가 아니다(클릭할 수 있는 것처럼 보이지 않게).
    expect(screen.queryByRole("link", { name: /창작 도구·교육/ })).toBeNull();
    expect(screen.getByRole("link", { name: /비즈니스 문의/ }).getAttribute("href")).toBe("/business");
  });
});
