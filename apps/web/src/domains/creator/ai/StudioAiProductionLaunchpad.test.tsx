// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioAiProductionLaunchpad } from "./StudioAiProductionLaunchpad";

afterEach(cleanup);

describe("StudioAiProductionLaunchpad", () => {
  it("opens the task-first comic director and recipe workflows", () => {
    const onOpenScenario = vi.fn();
    const onOpenSuperSuite = vi.fn();

    render(
      <StudioAiProductionLaunchpad
        imageConfigured
        textConfigured
        onOpenScenario={onOpenScenario}
        onOpenSuperSuite={onOpenSuperSuite}
      />,
    );

    const director = screen.getByRole("button", {
      name: /AI 코믹 디렉터 · 스토리 → 편집 가능한 컷/u,
    });
    expect(director.getAttribute("data-studio-ai-production-action")).toBe("director");

    fireEvent.click(director);
    fireEvent.click(
      screen.getByRole("button", { name: /화풍·연출 레시피 만들기/u }),
    );

    expect(onOpenScenario).toHaveBeenCalledTimes(1);
    expect(onOpenSuperSuite).toHaveBeenCalledTimes(1);
    expect(
      screen
        .getByRole("link", { name: /홍보영상·모션툰 만들기/u })
        .getAttribute("href"),
    ).toBe("/create/promo");
  });

  it("explains why the director is unavailable without disabling local recipes", () => {
    const onOpenScenario = vi.fn();
    const onOpenSuperSuite = vi.fn();

    render(
      <StudioAiProductionLaunchpad
        imageConfigured={false}
        textConfigured={false}
        onOpenScenario={onOpenScenario}
        onOpenSuperSuite={onOpenSuperSuite}
        scenarioDisabled
        scenarioDisabledReason="마스터 편집 중에는 사용할 수 없어요."
      />,
    );

    const scenarioButton = screen.getByRole("button", {
      name: /AI 코믹 디렉터/u,
    }) as HTMLButtonElement;

    expect(scenarioButton.disabled).toBe(true);
    expect(screen.queryByText("마스터 편집 중에는 사용할 수 없어요.")).not.toBeNull();

    fireEvent.click(
      screen.getByRole("button", { name: /화풍·연출 레시피 만들기/u }),
    );
    expect(onOpenSuperSuite).toHaveBeenCalledTimes(1);
    expect(onOpenScenario).not.toHaveBeenCalled();
  });
});
