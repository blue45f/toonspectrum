// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { IntegrationPage } from "./IntegrationUi";

afterEach(cleanup);

function renderPage(art?: { kind: "publish"; caption: string }) {
  return render(
    <MemoryRouter initialEntries={["/publish"]}>
      <IntegrationPage eyebrow="배포" title="게시 센터" description="설명" art={art}>
        <p>본문</p>
      </IntegrationPage>
    </MemoryRouter>,
  );
}

describe("IntegrationPage 헤더 아트 슬롯", () => {
  it("art를 넘긴 페이지는 헤더에 콘셉트 아트와 캡션을 렌더한다", () => {
    const { container } = renderPage({
      kind: "publish",
      caption: "브랜드 콘셉트 아트 · 실제 화면이 아닙니다",
    });
    expect(container.querySelector("figure")).not.toBeNull();
    expect(screen.getByText("브랜드 콘셉트 아트 · 실제 화면이 아닙니다")).toBeTruthy();
    expect(container.querySelector('img[src*="publish"]')).not.toBeNull();
  });

  it("art를 넘기지 않은 페이지는 아트 없이 헤더만 렌더한다", () => {
    const { container } = renderPage();
    expect(container.querySelector("figure")).toBeNull();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("게시 센터");
  });
});
