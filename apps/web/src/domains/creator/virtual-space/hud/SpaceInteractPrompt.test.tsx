// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SpaceInteractPrompt } from "./SpaceInteractPrompt";

afterEach(cleanup);

describe("SpaceInteractPrompt 키캡 표준", () => {
  it("상호작용 프롬프트는 E 키캡을 보여 주고 단축키는 E X로 알린다", () => {
    render(<SpaceInteractPrompt target={{ kind: "interaction", labelKo: "원고 책상", labelEn: "Manuscript desk" }}
      touch={false} onActivate={vi.fn()} />);
    const button = screen.getByRole("button", { name: "원고 책상 상호작용" });
    expect(button.querySelector("kbd")?.textContent).toBe("E");
    expect(button.getAttribute("aria-keyshortcuts")).toBe("E X");
  });

  it("NPC 프롬프트도 같은 E 키캡을 쓴다", () => {
    render(<SpaceInteractPrompt target={{ kind: "npc", labelKo: "모아", labelEn: "Moa" }}
      touch={false} onActivate={vi.fn()} />);
    const button = screen.getByRole("button");
    expect(button.querySelector("kbd")?.textContent).toBe("E");
    expect(button.getAttribute("data-target-kind")).toBe("npc");
  });

  it("터치에서는 키캡 대신 아이콘을 보여 준다", () => {
    render(<SpaceInteractPrompt target={{ kind: "interaction", labelKo: "원고 책상", labelEn: "Manuscript desk" }}
      touch onActivate={vi.fn()} />);
    const button = screen.getByRole("button");
    expect(button.querySelector("kbd")).toBeNull();
    expect(button.getAttribute("aria-keyshortcuts")).toBeNull();
  });

  it("대상이 없으면 아무것도 그리지 않는다", () => {
    const { container } = render(<SpaceInteractPrompt target={null} touch={false} onActivate={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });
});
