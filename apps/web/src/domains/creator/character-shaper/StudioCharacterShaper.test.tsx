// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioCharacterShaper } from "./StudioCharacterShaper";

import type { StudioVrmPoserProps } from "../vrm/StudioVrmPoserTypes";

const controllerCalls: unknown[] = [];

vi.mock("../vrm/useStudioVrmPoserController", () => ({
  useStudioVrmPoserController: (props: unknown) => {
    controllerCalls.push(props);
    return { status: "empty", dialogRef: { current: null } };
  },
}));

// Keep the real binding: the thumbnail recorder and workbench consume its complete
// recipe/profile contract even before a model has loaded.

vi.mock("./StudioCharacterShaperDialog", () => ({
  StudioCharacterShaperDialog: ({ onOpenAdvanced }: { onOpenAdvanced?: () => void }) => (
    <div data-testid="shaper-dialog">
      <button type="button" onClick={() => onOpenAdvanced?.()}>
        고급 편집
      </button>
    </div>
  ),
}));

vi.mock("../vrm/StudioVrmPoserDialog", () => ({
  StudioVrmPoserDialog: () => <div data-testid="legacy-dialog" />,
}));

afterEach(() => {
  cleanup();
  controllerCalls.length = 0;
});

function props(overrides: Partial<StudioVrmPoserProps> = {}): StudioVrmPoserProps {
  return {
    open: true,
    onClose: () => undefined,
    onInsert: () => undefined,
    ...overrides,
  };
}

describe("StudioCharacterShaper", () => {
  it("renders nothing while closed but still builds the runtime so state survives a reopen", () => {
    const closedProps = props({ open: false });
    const { container } = render(<StudioCharacterShaper {...closedProps} />);
    expect(container.innerHTML).toBe("");
    // 상위 문서 controller의 복원 effect가 재렌더해도 닫힌 호스트 계약은 유지된다.
    expect(controllerCalls[0]).toEqual(closedProps);
    for (const call of controllerCalls) expect(call).toEqual(closedProps);
  });

  it("mounts the workshop shell with the controller host and the binding in one commit", () => {
    render(<StudioCharacterShaper {...props()} />);
    expect(screen.getByTestId("shaper-dialog")).toBeTruthy();
    expect(screen.queryByTestId("legacy-dialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "캐릭터 저작 도구" }));
    expect(screen.getByRole("dialog", { name: "캐릭터 품질 워크벤치" })).toBeTruthy();
  });

  it("고급 편집 swaps to the legacy builder over the same host", () => {
    render(<StudioCharacterShaper {...props()} />);
    fireEvent.click(screen.getByRole("button", { name: "고급 편집" }));
    expect(screen.getByTestId("legacy-dialog")).toBeTruthy();
    expect(screen.queryByTestId("shaper-dialog")).toBeNull();
    expect(screen.queryByRole("button", { name: "캐릭터 저작 도구" })).toBeNull();
  });
});
