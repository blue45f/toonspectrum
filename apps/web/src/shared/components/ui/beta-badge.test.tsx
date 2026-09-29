// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { BetaBadge } from "./beta-badge";

afterEach(cleanup);

describe("BetaBadge", () => {
  it("베타 문자로 상태를 전달한다", () => {
    render(<BetaBadge />);
    const badge = screen.getByText("베타");
    expect(badge.getAttribute("data-tone")).toBe("warn");
    expect(badge.parentElement?.getAttribute("data-beta-badge")).toBe("true");
  });

  it("기본 안내와 추가 클래스를 전달한다", () => {
    render(<BetaBadge className="ml-2" />);
    const badge = screen.getByText("베타");
    expect(badge.className).toContain("ml-2");
    expect(badge.parentElement?.getAttribute("title")).toContain("베타 기능");
  });

  it("문맥에 맞는 안내문을 덮어쓸 수 있다", () => {
    render(<BetaBadge title="자동 채색 베타" />);
    expect(screen.getByText("베타").parentElement?.getAttribute("title")).toBe(
      "자동 채색 베타"
    );
  });
});
