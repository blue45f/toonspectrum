// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  StudioHybridDccExpertTools,
  StudioHybridDccModeTabs,
  StudioHybridDccToolTiles,
  type StudioHybridDccExpertToolGroup,
  type StudioHybridDccQuickTool,
} from "./StudioHybridDccWorkbenchChrome";
import { WORKBENCH_MODES } from "./studio-hybrid-dcc-workbench-modes";

afterEach(cleanup);

function tool(overrides: Partial<StudioHybridDccQuickTool> & Pick<StudioHybridDccQuickTool, "technical" | "label">): StudioHybridDccQuickTool {
  return { description: `${overrides.label} 설명`, onClick: vi.fn(), ...overrides };
}

describe("StudioHybridDccModeTabs", () => {
  it("names every work mode in plain words and marks the current one", () => {
    const onChange = vi.fn();
    render(<StudioHybridDccModeTabs mode="cad" onChange={onChange} />);

    const nav = screen.getByRole("navigation", { name: "작업 모드" });
    const buttons = within(nav).getAllByRole("button");
    expect(buttons).toHaveLength(WORKBENCH_MODES.length);
    expect(buttons.map((button) => button.getAttribute("data-studio-hybrid-dcc-mode")))
      .toEqual(["model", "build", "cad", "sculpt", "material", "shot"]);

    const pressed = buttons.filter((button) => button.getAttribute("aria-pressed") === "true");
    expect(pressed).toHaveLength(1);
    expect(pressed[0]?.textContent).toContain("정밀 CAD");
    // 모드 이름 옆에 무엇을 하는 곳인지 쉬운 설명이 함께 있다.
    expect(within(nav).getByText("치수가 정확한 부품")).toBeTruthy();
    expect(within(nav).getByText("카메라 컷을 원고로")).toBeTruthy();

    fireEvent.click(within(nav).getByRole("button", { name: /^컷·선화/u }));
    expect(onChange).toHaveBeenCalledWith("shot");
  });

  it("keeps every tab at least 44px tall for touch", () => {
    render(<StudioHybridDccModeTabs mode="model" onChange={vi.fn()} />);
    for (const button of screen.getAllByRole("button")) {
      expect(button.className, button.textContent ?? "").toContain("min-h-11");
    }
  });
});

describe("StudioHybridDccToolTiles", () => {
  const tools: readonly StudioHybridDccQuickTool[] = [
    tool({ label: "큐브 추가", technical: "Primitive" }),
    tool({ label: "면 밀어내기", technical: "Extrude", requiresAsset: true }),
    tool({ label: "모서리 둥글리기", technical: "Bevel", requiresAsset: true }),
  ];

  it("separates usable tools from tools that wait for an object and explains why once", () => {
    render(<StudioHybridDccToolTiles mode="model" tools={tools} busy={false} hasActiveAsset={false} />);

    const ready = screen.getByLabelText("추천 3D 도구");
    expect(within(ready).getAllByRole("button")).toHaveLength(1);
    expect((within(ready).getByRole("button", { name: /큐브 추가/u }) as HTMLButtonElement).disabled).toBe(false);

    const locked = document.querySelector<HTMLElement>("[data-studio-hybrid-dcc-locked-tools]");
    expect(locked).not.toBeNull();
    expect(locked!.textContent).toContain("오브젝트를 만들거나 3D 화면에서 선택하면 켜지는 도구 2개");
    const lockedButtons = within(locked!).getAllByRole("button") as HTMLButtonElement[];
    expect(lockedButtons).toHaveLength(2);
    expect(lockedButtons.every((button) => button.disabled)).toBe(true);
  });

  it("moves every tool into the ready group once an object is selected", () => {
    render(<StudioHybridDccToolTiles mode="model" tools={tools} busy={false} hasActiveAsset />);

    expect(within(screen.getByLabelText("추천 3D 도구")).getAllByRole("button")).toHaveLength(3);
    expect(document.querySelector("[data-studio-hybrid-dcc-locked-tools]")).toBeNull();
  });

  it("runs the tool and keeps the industry term visible as a small caption", () => {
    const onClick = vi.fn();
    render(
      <StudioHybridDccToolTiles
        mode="model"
        tools={[tool({ label: "큐브 추가", technical: "Primitive", onClick })]}
        busy={false}
        hasActiveAsset={false}
      />,
    );

    const button = screen.getByRole("button", { name: /큐브 추가/u });
    expect(button.textContent).toContain("Primitive");
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("disables everything while a run is in progress or when the tool itself is disabled", () => {
    render(
      <StudioHybridDccToolTiles
        mode="shot"
        tools={[
          tool({ label: "8개 카메라 컷", technical: "Shot set" }),
          tool({ label: "3D 배경 편집기로 열기", technical: "Verified GLB handoff", disabled: true }),
        ]}
        busy
        hasActiveAsset
      />,
    );
    for (const button of screen.getAllByRole("button") as HTMLButtonElement[]) {
      expect(button.disabled, button.textContent ?? "").toBe(true);
    }
  });
});

describe("StudioHybridDccExpertTools", () => {
  const groups: readonly StudioHybridDccExpertToolGroup[] = [
    {
      id: "create",
      title: "만들기·불러오기",
      tools: [
        { name: "Add cube", hint: "큐브 하나 추가", action: "add-cube", onClick: vi.fn() },
        { name: "Extrude", hint: "면 밀어내기", requiresAsset: true, onClick: vi.fn() },
      ],
    },
    {
      id: "shots",
      title: "컷·협업·기록",
      tools: [{ name: "8 shots", hint: "카메라 컷 8개", onClick: vi.fn() }],
    },
  ];

  it("folds the full list behind a summary that counts the tools", () => {
    render(<StudioHybridDccExpertTools groups={groups} busy={false} hasActiveAsset={false} />);

    const details = document.querySelector<HTMLDetailsElement>("[data-studio-hybrid-dcc-expert-tools]");
    expect(details).not.toBeNull();
    expect(details!.open).toBe(false);
    expect(details!.querySelector("summary")?.textContent).toContain("전문가용 전체 도구");
    expect(details!.querySelector("summary")?.textContent).toContain("3개");
  });

  it("shows industry names with an easy hint and respects the object requirement", () => {
    render(<StudioHybridDccExpertTools groups={groups} busy={false} hasActiveAsset={false} />);

    const addCube = screen.getByRole("button", { name: /Add cube/u }) as HTMLButtonElement;
    expect(addCube.textContent).toContain("큐브 하나 추가");
    expect(addCube.disabled).toBe(false);
    expect((screen.getByRole("button", { name: /Extrude/u }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole("region", { name: "컷·협업·기록" })).toBeTruthy();
  });

  it("calls the handler and keeps stable automation hooks", () => {
    const onClick = vi.fn();
    render(
      <StudioHybridDccExpertTools
        groups={[{ id: "g", title: "그룹", tools: [{ name: "OCCT box", hint: "정밀 상자", action: "occt-box", onClick }] }]}
        busy={false}
        hasActiveAsset
      />,
    );
    const button = document.querySelector<HTMLButtonElement>('[data-studio-hybrid-dcc-action="occt-box"]');
    expect(button).not.toBeNull();
    fireEvent.click(button!);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("disables every tool while busy", () => {
    render(<StudioHybridDccExpertTools groups={groups} busy hasActiveAsset />);
    for (const button of screen.getAllByRole("button") as HTMLButtonElement[]) {
      expect(button.disabled, button.textContent ?? "").toBe(true);
    }
  });
});
