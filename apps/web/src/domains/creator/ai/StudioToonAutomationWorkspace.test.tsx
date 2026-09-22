// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createStudioToonAutomationDocument } from "./studio-toon-automation";
import { StudioToonAutomationWorkspace } from "./StudioToonAutomationWorkspace";

import type { StudioToonAutomationDocument } from "./studio-toon-automation";

function Harness({
  onOpenDirector = vi.fn(),
  onOpenSurface = vi.fn(),
}: {
  readonly onOpenDirector?: () => void;
  readonly onOpenSurface?: (surface: "comic" | "animation" | "character") => void;
}) {
  const [document, setDocument] = useState<StudioToonAutomationDocument>(
    createStudioToonAutomationDocument,
  );
  return (
    <StudioToonAutomationWorkspace
      sessionId="session-1"
      title="테스트 회차"
      storyText="주인공이 사라진 친구를 찾아 낯선 도시로 들어간다."
      sceneCount={6}
      visualBibleEntryCount={1}
      document={document}
      onChange={setDocument}
      onOpenDirector={onOpenDirector}
      onOpenSurface={onOpenSurface}
    />
  );
}

afterEach(cleanup);

describe("StudioToonAutomationWorkspace", () => {
  it("keeps webtoon and animation planning in one revisioned workspace", () => {
    render(<Harness />);

    const workspace = document.querySelector(
      '[data-studio-toon-automation-workspace="true"]',
    );
    expect(workspace).not.toBeNull();

    const animationButtons = screen.getAllByRole("button", {
      name: "30초 애니메이션",
    });
    const animationMode = animationButtons.find((button) =>
      button.hasAttribute("aria-pressed"),
    );
    expect(animationMode).toBeDefined();
    fireEvent.click(animationMode!);
    expect(animationMode!.getAttribute("aria-pressed")).toBe("true");

    const reference = screen.getByPlaceholderText("asset-id 또는 Studio 자산 경로");
    fireEvent.change(reference, { target: { value: "asset-scenario-1" } });
    fireEvent.click(screen.getByRole("button", { name: "추가" }));
    expect(screen.queryByText("asset-scenario-1")).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "캐릭터" }));
    fireEvent.click(screen.getByRole("button", { name: "첫 캐릭터 추가" }));
    expect(screen.queryByDisplayValue("캐릭터 1")).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "프롬프트" }));
    expect(screen.queryByText("장면 JSON 템플릿")).not.toBeNull();
    expect(screen.queryByText("나레이션 표시 규칙")).not.toBeNull();

    const animationTab = screen
      .getAllByRole("button", { name: "30초 애니메이션" })
      .find((button) => !button.hasAttribute("aria-pressed"));
    expect(animationTab).toBeDefined();
    fireEvent.click(animationTab!);
    expect(screen.getAllByDisplayValue(/장면 [1-6]/u)).toHaveLength(6);
    expect(screen.queryByText(/0초부터 30초까지/u)).not.toBeNull();
  });

  it("hands production work to the native Studio surfaces", () => {
    const onOpenDirector = vi.fn();
    const onOpenSurface = vi.fn();
    render(
      <Harness
        onOpenDirector={onOpenDirector}
        onOpenSurface={onOpenSurface}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "AI 코믹 디렉터" }));
    fireEvent.click(screen.getByRole("button", { name: "웹툰 편집기 열기" }));
    fireEvent.click(screen.getByRole("button", { name: "캐릭터 작업대 열기" }));
    fireEvent.click(screen.getByRole("button", { name: "애니매틱·영상 열기" }));

    expect(onOpenDirector).toHaveBeenCalledTimes(1);
    expect(onOpenSurface.mock.calls).toEqual([
      ["comic"],
      ["character"],
      ["animation"],
    ]);
  });
});
