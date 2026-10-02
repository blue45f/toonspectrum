// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { PageIntro } from "./page-intro";

afterEach(() => {
  cleanup();
});

describe("PageIntro", () => {
  it("variant 를 data-variant 로 반영하고 자식을 렌더한다", () => {
    const { container } = render(
      <PageIntro variant="unfold">
        <header>온보딩 헤더</header>
        <section>1단계</section>
      </PageIntro>,
    );
    const root = container.firstElementChild;
    expect(root?.getAttribute("data-variant")).toBe("unfold");
    expect(screen.getByText("온보딩 헤더")).not.toBeNull();
    expect(screen.getByText("1단계")).not.toBeNull();
  });

  it("기본 variant 는 restrained 이다", () => {
    const { container } = render(
      <PageIntro>
        <p>로그인</p>
      </PageIntro>,
    );
    expect(container.firstElementChild?.getAttribute("data-variant")).toBe("restrained");
  });

  it("클릭하면 스킵 상태가 된다", () => {
    const { container } = render(
      <PageIntro variant="chapter">
        <section>챕터 1</section>
      </PageIntro>,
    );
    const root = container.firstElementChild as HTMLElement;
    expect(root.getAttribute("data-skipped")).toBe("false");
    fireEvent.click(root);
    expect(root.getAttribute("data-skipped")).toBe("true");
  });

  it("ESC 키로 스킵할 수 있다", () => {
    const { container } = render(
      <PageIntro variant="unfold">
        <section>단계</section>
      </PageIntro>,
    );
    const root = container.firstElementChild as HTMLElement;
    fireEvent.keyDown(window, { key: "Escape" });
    expect(root.getAttribute("data-skipped")).toBe("true");
  });

  it("ESC 외의 키는 스킵하지 않는다", () => {
    const { container } = render(
      <PageIntro variant="unfold">
        <section>단계</section>
      </PageIntro>,
    );
    const root = container.firstElementChild as HTMLElement;
    fireEvent.keyDown(window, { key: "Enter" });
    expect(root.getAttribute("data-skipped")).toBe("false");
  });
});
