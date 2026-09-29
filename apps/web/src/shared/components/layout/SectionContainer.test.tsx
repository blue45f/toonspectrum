// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { SectionContainer } from "./SectionContainer";
import { LAYOUT_TOKENS } from "./layout-tokens";

afterEach(cleanup);

describe("SectionContainer 렌더링 계약", () => {
  it("eyebrow/title/description 헤더 패턴을 렌더한다", () => {
    render(
      <SectionContainer eyebrow="PLANS" title="요금제" description="설명 문단">
        본문
      </SectionContainer>
    );
    expect(screen.getByText("PLANS")).toBeTruthy();
    expect(screen.getByRole("heading", { level: 2, name: "요금제" })).toBeTruthy();
    expect(screen.getByText("설명 문단")).toBeTruthy();
    expect(screen.getByText("본문")).toBeTruthy();
  });

  it("헤더 슬롯이 없으면 헤더를 렌더하지 않는다", () => {
    const { container } = render(<SectionContainer>본문</SectionContainer>);
    expect(container.querySelector("h2")).toBeNull();
    expect(container.textContent).toBe("본문");
  });

  it("id가 있으면 제목 h2와 aria-labelledby를 연결한다", () => {
    render(
      <SectionContainer id="plans" title="요금제">
        본문
      </SectionContainer>
    );
    const section = screen.getByText("본문").closest("section")!;
    expect(section.getAttribute("aria-labelledby")).toBe("plans-title");
    expect(screen.getByRole("heading", { level: 2 }).getAttribute("id")).toBe("plans-title");
  });

  it("align=center이면 헤더가 가운데 정렬된다", () => {
    render(
      <SectionContainer align="center" eyebrow="PLANS" title="요금제">
        본문
      </SectionContainer>
    );
    const header = screen.getByRole("heading", { level: 2 }).parentElement!;
    expect(header.className).toContain("text-center");
    expect(header.className).toContain("items-center");
  });

  it.each([
    ["compact", LAYOUT_TOKENS.sectionSpacing.compact],
    ["default", LAYOUT_TOKENS.sectionSpacing.default],
    ["roomy", LAYOUT_TOKENS.sectionSpacing.roomy],
  ] as const)("spacing=%s이면 해당 py 스케일을 적용한다", (spacing, expected) => {
    const { container } = render(<SectionContainer spacing={spacing}>본문</SectionContainer>);
    for (const token of expected.split(" ")) {
      expect(container.firstElementChild?.className).toContain(token);
    }
  });
});
