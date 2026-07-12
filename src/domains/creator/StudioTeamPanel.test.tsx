import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  StudioTeamPanel,
  StudioTeamPanelView,
  type StudioTeamPanelViewProps,
} from "./StudioTeamPanel";

import type { StudioTeamSnapshot } from "./studio-team-client";

const noop = () => {
  // Node SSR 회귀 테스트에서는 이벤트를 실행하지 않는다.
};

function teamSnapshot(overrides: Partial<StudioTeamSnapshot["viewer"]> = {}): StudioTeamSnapshot {
  return {
    workId: "work-1",
    viewer: {
      userId: "owner-1",
      role: "owner",
      status: "active",
      capabilities: { view: true, comment: true, edit: true, manageMembers: true, respondInvite: false },
      ...overrides,
    },
    members: [
      {
        userId: "owner-1",
        name: "서윤",
        image: "",
        role: "owner",
        status: "active",
        isOwner: true,
      },
      {
        userId: "editor/1",
        name: "민호",
        image: "",
        role: "editor",
        status: "active",
        isOwner: false,
      },
    ],
  };
}

function renderView(overrides: Partial<StudioTeamPanelViewProps> = {}): string {
  const props: StudioTeamPanelViewProps = {
    actionError: null,
    busyAction: null,
    confirmRemoveUserId: null,
    inviteRole: "editor",
    inviteUserId: "",
    loadError: null,
    loading: false,
    loggedIn: true,
    notice: null,
    snapshot: teamSnapshot(),
    workId: "work-1",
    onInvitationRespond: noop,
    onInvite: noop,
    onInviteRoleChange: noop,
    onInviteUserIdChange: noop,
    onRemoveCancel: noop,
    onRemoveConfirm: noop,
    onRemoveRequest: noop,
    onRetry: noop,
    onRoleChange: noop,
    ...overrides,
  };
  return renderToStaticMarkup(<StudioTeamPanelView {...props} />);
}

describe("StudioTeamPanel shell and first-use states", () => {
  it("로그아웃 상태에서 인증 안내와 접근 가능한 dialog 구조를 제공한다", () => {
    const html = renderToStaticMarkup(
      <StudioTeamPanel loggedIn={false} open workId="work-1" onClose={noop} />
    );

    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('aria-labelledby=');
    expect(html).toContain('aria-describedby=');
    expect(html).toContain('aria-label="팀 작업 공간 닫기"');
    expect(html).toContain("로그인이 필요해요");
    expect(html).toContain("size-11");
    expect(html).toContain("팀 작업 공간");
    expect(html).toContain("서버 권한");
  });

  it("저장되지 않은 원고에서 서버 저장 선행 조건을 설명한다", () => {
    const html = renderToStaticMarkup(
      <StudioTeamPanel loggedIn open workId={null} onClose={noop} />
    );

    expect(html).toContain("작품을 먼저 저장해 주세요");
    expect(html).toContain("아직 서버에 저장되지 않은 원고예요");
    expect(html).not.toContain("사용자 ID");
  });

  it("모바일 시트가 하단 도구막대 위에서 독립 스크롤하고 데스크톱 우측 패널로 전환된다", () => {
    const html = renderToStaticMarkup(
      <StudioTeamPanel loggedIn={false} open workId="work-1" onClose={noop} />
    );

    expect(html).toContain("bottom-[calc(7rem+env(safe-area-inset-bottom))]");
    expect(html).toContain("max-h-[min(72dvh,calc(100dvh-7.75rem-env(safe-area-inset-top)))]");
    expect(html).toContain("sm:inset-y-0");
    expect(html).toContain("sm:w-[26rem]");
    expect(html).toContain("overflow-y-auto");
    expect(html).toContain("overscroll-contain");
    expect(html).toContain("pb-[max(1rem,env(safe-area-inset-bottom))]");
  });

  it("닫힌 상태에서는 dialog를 렌더링하지 않는다", () => {
    const html = renderToStaticMarkup(
      <StudioTeamPanel loggedIn open={false} workId="work-1" onClose={noop} />
    );
    expect(html).toBe("");
  });
});

describe("StudioTeamPanelView permissions", () => {
  it("응답 대기 중인 사용자는 초대를 수락하거나 거절할 수 있다", () => {
    const pending = teamSnapshot({
      userId: "pending-1",
      role: "commenter",
      status: "pending",
      capabilities: { view: false, comment: false, edit: false, manageMembers: false, respondInvite: true },
      invitationId: "11111111-1111-4111-8111-111111111111",
    });
    pending.members.push({
      userId: "pending-1",
      name: "지우",
      image: "",
      role: "commenter",
      status: "pending",
      isOwner: false,
    });

    const html = renderView({ snapshot: pending });

    expect(html).toContain("팀 초대가 도착했어요");
    expect(html).toContain("검토자 권한");
    expect(html).toContain("초대 수락");
    expect(html).toContain("초대 거절");
    expect(html).not.toContain('data-team-manage-controls="true"');
    expect(html).toContain("소유자와 내 정보");
    expect(html).toContain("전체 팀 명단은 소유자와 관리자에게만 표시됩니다");
  });

  it("manageMembers 권한이 있는 소유자·관리자에게만 초대와 역할 관리 UI를 제공한다", () => {
    const html = renderView();

    expect(html).toContain("팀원 초대");
    expect(html).toContain('id="studio-team-invite-user-id"');
    expect(html).toContain("가입한 사용자의 ID로 초대합니다");
    expect(html).toContain('<strong class="font-semibold text-fg-2">편집자</strong>');
    expect(html).toContain("공동 저장 연결에 사용할 편집 역할입니다");
    expect(html).toContain('data-team-manage-controls="true"');
    expect(html).toContain('aria-label="민호 역할"');
    expect(html).toContain('aria-label="민호 팀에서 내보내기"');
    expect(html).not.toContain('aria-label="서윤 팀에서 내보내기"');
  });

  it("관리 권한이 없는 편집자에게 초대·변경·삭제 컨트롤을 노출하지 않는다", () => {
    const editor = teamSnapshot({
      userId: "editor/1",
      role: "editor",
      status: "active",
      capabilities: { view: false, comment: false, edit: false, manageMembers: false, respondInvite: false },
    });

    const html = renderView({ snapshot: editor });

    expect(html).not.toContain("팀원 초대");
    expect(html).not.toContain("studio-team-invite-user-id");
    expect(html).not.toContain('data-team-manage-controls="true"');
    expect(html).not.toContain("팀에서 내보내기");
    expect(html).toContain("내 역할 · 편집자");
    expect(html).toContain("소유자와 내 정보");
    expect(html).toContain("역할별 서버 권한 안내");
  });

  it("active 관리자에게 manageMembers capability가 있으면 멤버 관리 UI를 제공한다", () => {
    const admin = teamSnapshot({
      userId: "admin-1",
      role: "admin",
      status: "active",
      capabilities: { view: false, comment: false, edit: false, manageMembers: true, respondInvite: false },
    });

    const html = renderView({ snapshot: admin });

    expect(html).toContain("팀원 초대");
    expect(html).toContain('data-team-manage-controls="true"');
    expect(html).toContain("내 역할 · 관리자");
  });

  it("관리 capability가 있어도 편집자 역할이면 권한 상승 컨트롤을 방어적으로 숨긴다", () => {
    const suspicious = teamSnapshot({
      userId: "editor/1",
      role: "editor",
      status: "active",
      capabilities: { view: false, comment: false, edit: false, manageMembers: true, respondInvite: false },
    });

    const html = renderView({ snapshot: suspicious });

    expect(html).not.toContain("팀원 초대");
    expect(html).not.toContain('data-team-manage-controls="true"');
  });

  it("로딩·오류·빈 멤버 상태에 각각 안내와 복구 경로가 있다", () => {
    expect(renderView({ loading: true })).toContain('aria-label="팀 작업 공간 불러오는 중"');
    const errorHtml = renderView({ loadError: "네트워크 연결을 확인하세요.", snapshot: null });
    expect(errorHtml).toContain('role="alert"');
    expect(errorHtml).toContain("다시 시도");

    const emptyHtml = renderView({ snapshot: { ...teamSnapshot(), members: [] } });
    expect(emptyHtml).toContain("표시할 팀원이 없어요");
    expect(emptyHtml).toContain("첫 팀원을 추가");
  });

  it("저장된 서버 권한만 표시하며 존재하지 않는 접속 상태를 주장하지 않는다", () => {
    const html = renderView();
    expect(html).toContain("현재는 서버 멤버·초대·역할 관리 단계입니다");
    expect(html).not.toContain("온라인");
    expect(html).not.toContain("접속 중");
    expect(html).not.toContain("실시간");
  });
});
