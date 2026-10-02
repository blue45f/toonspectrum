// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { creatorRoleDefinition, type CreatorRoleId } from "@/shared/lib/creator-role-contract";

import { createProductionDemoProject } from "../production-hub/production-demo";
import { SpaceRoleGuide } from "./SpaceRoleGuide";
import { StudioVirtualSpaceOfficeStart } from "./StudioVirtualSpaceOfficeStart";
import { studioVirtualSpaceRolePreset } from "./studio-virtual-space-role-preset";
import type { SpaceRolePreset } from "./use-space-role-preset";
import type { StudioVirtualOperationsSnapshot } from "./use-studio-virtual-space-operations";

afterEach(cleanup);

const reviewerLabelKo = creatorRoleDefinition("reviewer")?.label.ko ?? "검수 담당";

function rolePreset(roleId: CreatorRoleId | null, userId: string | null): SpaceRolePreset {
  return {
    attempted: true,
    userId,
    activeRole: roleId,
    definition: creatorRoleDefinition(roleId),
    customRoleLabel: null,
    preset: studioVirtualSpaceRolePreset(roleId, false),
  };
}

describe("가상스튜디오 직군 가이드", () => {
  it("직군이 없으면 아무것도 그리지 않는다", () => {
    const { container } = render(
      <MemoryRouter>
        <SpaceRoleGuide role={rolePreset(null, null)} aggregate={null} />
      </MemoryRouter>,
    );
    expect(container.firstChild).toBeNull();
  });

  it("검수자에게는 검수 요청 작업을 직군 우선 업무로 앞세우고 작업 공간 이동을 연결한다", () => {
    const onGuide = vi.fn();
    const aggregate = createProductionDemoProject();
    render(
      <MemoryRouter>
        <SpaceRoleGuide role={rolePreset("reviewer", "demo-art")} aggregate={aggregate} onGuide={onGuide} />
      </MemoryRouter>,
    );
    expect(screen.getByText(reviewerLabelKo)).toBeTruthy();
    expect(screen.getAllByText(/검수 요청/u).length).toBeGreaterThanOrEqual(1);
    const walkButtons = screen.getAllByRole("button", { name: /작업 공간으로 이동/u });
    expect(walkButtons.length).toBeGreaterThanOrEqual(1);
    const firstWalk = walkButtons[0];
    if (!firstWalk) throw new Error("직군 우선 업무의 이동 버튼이 없습니다.");
    fireEvent.click(firstWalk);
    expect(onGuide).toHaveBeenCalledOnce();
    expect(["story", "drawing", "review", "production", "assets"]).toContain(onGuide.mock.calls[0]?.[0]);
  });

  it("직군 빠른 실행 링크와 추천 공간 이동을 제공한다", () => {
    const onGuidePlace = vi.fn();
    const definition = creatorRoleDefinition("reviewer");
    render(
      <MemoryRouter>
        <SpaceRoleGuide role={rolePreset("reviewer", "demo-art")} aggregate={null} onGuidePlace={onGuidePlace} />
      </MemoryRouter>,
    );
    const firstAction = definition?.actions[0];
    if (!firstAction) throw new Error("검수 직군의 빠른 실행이 없습니다.");
    expect(screen.getByRole("link", { name: new RegExp(firstAction.label.ko, "u") }).getAttribute("href"))
      .toBe(firstAction.href);
    fireEvent.click(screen.getByRole("button", { name: "리뷰 갤러리" }));
    expect(onGuidePlace).toHaveBeenCalledExactlyOnceWith("review-gallery");
  });

  it("작업 시작 안내에 배선하면 직군 가이드가 함께 뜨고, 배선하지 않으면 기존 안내만 뜬다", () => {
    const aggregate = createProductionDemoProject();
    const snapshot: StudioVirtualOperationsSnapshot = {
      phase: "ready",
      project: {
        access: { view: true, comment: true, edit: true, manage: true, owner: true, role: "owner" },
        aggregate: { ...aggregate, workId: "work/one" },
      },
      inbox: [],
      calendar: [],
      error: null,
    };
    const base = {
      snapshot, workId: "work/one", peerCount: 0,
      onOpenWork: vi.fn(), onOpenPeople: vi.fn(), onOpenSeats: vi.fn(), onRefresh: vi.fn(),
      onGuide: vi.fn(), onGuidePlace: vi.fn(),
    };
    const { unmount } = render(
      <MemoryRouter>
        <StudioVirtualSpaceOfficeStart {...base} rolePreset={rolePreset("reviewer", "demo-art")} />
      </MemoryRouter>,
    );
    expect(screen.getByText(reviewerLabelKo)).toBeTruthy();
    unmount();
    render(
      <MemoryRouter>
        <StudioVirtualSpaceOfficeStart {...base} />
      </MemoryRouter>,
    );
    expect(screen.queryByText(reviewerLabelKo)).toBeNull();
  });
});
