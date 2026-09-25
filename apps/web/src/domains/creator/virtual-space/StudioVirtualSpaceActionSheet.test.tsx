// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { StudioVirtualSpaceActionSheet } from "./StudioVirtualSpaceActionSheet";
import type { StudioSpatialAction } from "./studio-virtual-space-spatial-actions";
import type { StudioWorldInteractionDefinition } from "./studio-virtual-space-world-manifest";

const interaction: StudioWorldInteractionDefinition = {
  id: "team-console",
  zoneId: "lobby",
  point: { x: 100, y: 100 },
  radius: 64,
  labelKo: "팀 콘솔",
  labelEn: "Team console",
  action: "community",
};

const actions: readonly StudioSpatialAction[] = [
  {
    id: "team-hub",
    labelKo: "팀·그룹·초대",
    labelEn: "Teams, groups & invites",
    descriptionKo: "팀원을 초대합니다.",
    descriptionEn: "Invite teammates.",
    risk: "authority",
  },
];
describe("StudioVirtualSpaceActionSheet", () => {
  it("selects a guarded action without executing confirmation implicitly", () => {
    const onChoose = vi.fn();
    const onConfirm = vi.fn();
    render(<StudioVirtualSpaceActionSheet
      interaction={interaction}
      actions={actions}
      phase="choosing"
      onChoose={onChoose}
      onConfirm={onConfirm}
      onClose={vi.fn()}
    />);

    fireEvent.click(screen.getByRole("button", { name: /팀·그룹·초대/u }));
    expect(onChoose).toHaveBeenCalledWith("team-hub");
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("requires a second explicit confirmation for authority actions", () => {
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    render(<StudioVirtualSpaceActionSheet
      interaction={interaction}
      actions={actions}
      phase="confirming"
      selectedActionId="team-hub"
      onChoose={vi.fn()}
      onConfirm={onConfirm}
      onClose={onClose}
    />);

    expect(screen.getByText(/실제 변경·게시·초대/u)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "확인하고 계속" }));
    expect(onConfirm).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "취소" }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
