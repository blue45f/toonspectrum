// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { StudioLpcCreditsNotice } from "./StudioLpcCreditsNotice";
import {
  STUDIO_LPC_CREDIT_AUTHORS,
  STUDIO_LPC_CREDITS_MARKDOWN_URL,
  STUDIO_LPC_GENERATOR_URL,
  STUDIO_LPC_LICENSE_USES,
} from "./studio-lpc-characters";

afterEach(cleanup);

describe("캐릭터 아트 크레딧 표기", () => {
  it("접힌 상태로 시작하고 펼치면 작가 전원·선택 라이선스·전체 출처·AI 초상화 표기를 보여 준다", () => {
    const { container } = render(<StudioLpcCreditsNotice />);
    const details = container.querySelector("details");
    expect(details?.open).toBe(false);
    const summary = screen.getByText(/캐릭터 아트 출처·라이선스|Character art credits/u);
    fireEvent.click(summary);
    if (details) details.open = true;

    const authors = container.querySelector(".studio-lpc-credits__authors")?.textContent ?? "";
    for (const author of STUDIO_LPC_CREDIT_AUTHORS) expect(authors).toContain(author);
    for (const use of STUDIO_LPC_LICENSE_USES) {
      const link = screen.getByRole("link", { name: use.license });
      expect(link.getAttribute("href")).toBe(use.url);
      expect(link.getAttribute("rel")).toContain("noopener");
    }
    const hrefs = [...container.querySelectorAll("a")].map((anchor) => anchor.getAttribute("href"));
    expect(hrefs).toContain(STUDIO_LPC_CREDITS_MARKDOWN_URL);
    expect(hrefs).toContain(STUDIO_LPC_GENERATOR_URL);
    expect(container.textContent).toMatch(/AI로 생성한 이미지|AI-generated images/u);
    expect(container.textContent).toMatch(/OGA-BY 3\.0/u);
    // 새 탭으로 여는 링크는 모두 opener를 끊는다.
    for (const anchor of container.querySelectorAll("a[target='_blank']")) expect(anchor.getAttribute("rel")).toContain("noreferrer");
  });
});
