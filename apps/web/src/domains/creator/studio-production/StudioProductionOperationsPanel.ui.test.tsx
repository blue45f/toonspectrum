// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";

import {
  StudioProductionOperationsPanel,
  type StudioProductionRoleCandidate,
} from "./StudioProductionOperationsPanel";
import {
  createEmptyProductionWorkspace,
  type ProductionWorkspace,
} from "./studio-production-workspace";

const roleCandidates: readonly StudioProductionRoleCandidate[] = [{
  memberId: "member-artist",
  displayName: "김작가",
  accessRole: "editor",
  isCurrentUser: true,
  recommendedRoles: ["lineart", "color"],
}];

function OperationsHarness() {
  const [workspace, setWorkspace] = useState<ProductionWorkspace>(() => (
    createEmptyProductionWorkspace("work:test")
  ));
  return (
    <>
      <StudioProductionOperationsPanel
        workspace={workspace}
        canEdit
        canManageRoles
        roleCandidates={roleCandidates}
        onCommit={(update) => setWorkspace((current) => update(current))}
      />
      <output data-testid="workspace-state">{JSON.stringify(workspace)}</output>
    </>
  );
}

function readWorkspace(): ProductionWorkspace {
  return JSON.parse(screen.getByTestId("workspace-state").textContent ?? "{}") as ProductionWorkspace;
}

afterEach(cleanup);

describe("StudioProductionOperationsPanel role assignment UI", () => {
  it("links a team member, shows access separately, and merges recommended production roles", async () => {
    render(<OperationsHarness />);

    fireEvent.change(screen.getByLabelText("대상 팀원"), {
      target: { value: "member-artist" },
    });

    expect(screen.getByText(/협업 권한:/).textContent).toContain("편집");
    expect(screen.getByRole("button", { name: "선화" }).getAttribute("aria-pressed"))
      .toBe("true");

    fireEvent.click(screen.getByRole("button", { name: "역할 배정" }));
    await waitFor(() => {
      expect(readWorkspace().roleAssignments).toMatchObject([{
        memberId: "member-artist",
        displayName: "김작가",
        roles: ["lineart"],
        hierarchyNodeId: null,
      }]);
    });

    fireEvent.click(screen.getByRole("button", { name: "채색" }));
    fireEvent.click(screen.getByRole("button", { name: "역할 배정" }));
    await waitFor(() => {
      expect(readWorkspace().roleAssignments).toHaveLength(1);
      expect(readWorkspace().roleAssignments[0]?.roles).toEqual(["lineart", "color"]);
    });
  });
});
