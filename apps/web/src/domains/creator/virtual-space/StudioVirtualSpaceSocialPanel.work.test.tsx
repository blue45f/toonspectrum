// @vitest-environment jsdom
import { useState, type ComponentProps } from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StudioVirtualSpaceSocialPanel } from "./StudioVirtualSpaceSocialPanel";
import { StudioVirtualSpaceReviewPicker } from "./StudioVirtualSpaceReviewPicker";
import { studioVirtualSpaceState, type StudioVirtualSpacePeer } from "./studio-virtual-space-model";
import { studioVirtualPlaceWorldManifest } from "./studio-virtual-space-place-world";

const f = vi.hoisted(() => ({ list: vi.fn() }));
vi.mock("@/shared/lib/i18n-bilingual-copy", () => ({ useBilingual: () => (ko: string) => ko }));
vi.mock("./studio-virtual-space-review-invitation", () => ({ listStudioVirtualSpaceReviewSubjects: f.list }));
afterEach(cleanup);
const subject = { schemaVersion: 1 as const, workId: "work-1", projectId: "graph-1", artifactId: "artifact-1", reviewId: "review-1", revisionId: "snapshot-1", rootGraphHash: "a".repeat(64) };
beforeEach(() => { f.list.mockReset().mockResolvedValue({ ok: true, choices: [{ subject, artifactTitle: "1화", title: "검수본" }], truncated: false }); });
const makePeer = (sessionId: string, activity: StudioVirtualSpacePeer["state"]["activity"] = "available", role: StudioVirtualSpacePeer["participant"]["role"] = "editor"): StudioVirtualSpacePeer => ({
  participant: { sessionId, displayName: sessionId, role },
  state: { ...studioVirtualSpaceState(), activity, zoneId: "review-gallery" }, sequence: 1, lastSeen: 100,
});
const alice = makePeer("나비"), focusedPeer = makePeer("집중작가", "focused"), awayPeer = makePeer("자리비운팀원", "away"), reviewer = makePeer("검수담당", "reviewing", "commenter");
type Props = ComponentProps<typeof StudioVirtualSpaceSocialPanel>;
function options(): Props {
  return {
    manifest: studioVirtualPlaceWorldManifest("review-gallery"), selectedPeer: null,
    peers: [alice, focusedPeer, awayPeer, reviewer], disabled: false, focused: false,
    social: { requests: [], readyPeerIds: ["나비", "집중작가", "자리비운팀원", "검수담당"], reviewReadyPeerIds: ["나비", "집중작가", "자리비운팀원", "검수담당"], greetingReadyPeerIds: [], greetings: [], blockedPeerIds: [], available: true },
    onSelect: vi.fn(), onWave: vi.fn(), onRequest: vi.fn(), onRespond: vi.fn(), onCancel: vi.fn(), onBlock: vi.fn(),
  };
}

describe("웹툰 팀원의 상태와 검수 핸드오프", () => {
  it("실제 접속자의 위치·권한 역할·작업 상태를 검색하고 초대 가능한 팀원만 좁힌다", () => {
    const props = options();
    render(<StudioVirtualSpaceSocialPanel {...props} />);
    expect(screen.getAllByText(/리뷰 갤러리/u)).toHaveLength(4);
    expect(screen.getByText("원고 검토 중")).toBeTruthy();
    expect(screen.getByText(/의견 참여자/u)).toBeTruthy();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "ｒｅｖｉｅｗｉｎｇ commenter" } });
    expect(screen.getByRole("button", { name: "검수담당" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "나비" })).toBeNull();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "초대 가능" }));
    expect(screen.getByRole("button", { name: "나비" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "집중작가" })).toBeNull();
    expect(screen.queryByRole("button", { name: "자리비운팀원" })).toBeNull();
    expect(props.onRequest).not.toHaveBeenCalled();
  });

  it("팀원 선택 없이 검수 선택으로 이어지고 두 번째 명시적 클릭으로 고정 검수본만 요청한다", async () => {
    const props = options(), onInvite = vi.fn().mockResolvedValue(true);
    function Workflow() {
      const [peerId, setPeerId] = useState<string | null>(null);
      return <><StudioVirtualSpaceSocialPanel {...props} onRequest={(id, action) => { if (action === "review") setPeerId(id); }} />
        {peerId ? <StudioVirtualSpaceReviewPicker workId="work-1" peerName={peerId} disabled={false} onInvite={onInvite} onClose={() => setPeerId(null)} /> : null}</>;
    }
    render(<Workflow />);
    expect(f.list).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "나비 님에게 검수 초대" }));
    await screen.findByRole("button", { name: "이 검수본으로 초대" });
    expect(onInvite).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "이 검수본으로 초대" }));
    expect(onInvite).toHaveBeenCalledExactlyOnceWith(subject, expect.any(AbortSignal));
    expect(props.onSelect).toHaveBeenCalledExactlyOnceWith("나비");
  });

  it.each(["focused", "away"] as const)("%s 팀원에게 요청하지 않고 이유를 연결한다", (activity) => {
    const peer = makePeer("나비", activity), props = { ...options(), selectedPeer: peer, peers: [peer] };
    render(<StudioVirtualSpaceSocialPanel {...props} />);
    const invite = screen.getByRole("button", { name: "나비 님에게 검수 초대" }) as HTMLButtonElement;
    expect(invite.disabled).toBe(true);
    expect(document.getElementById(invite.getAttribute("aria-describedby") ?? "")?.textContent).toMatch(activity === "focused" ? /집중/u : /돌아오면/u);
    fireEvent.click(invite);
    fireEvent.click(screen.getByRole("button", { name: "함께 검토 요청" }));
    expect(props.onRequest).not.toHaveBeenCalled();
  });

  it.each(["self-focus", "offline", "blocked", "not-ready", "review-unavailable", "pending"])("%s 상황에서 빠른 검수도 기존 요청 제한을 지킨다", (condition) => {
    const base = options();
    const props: Props = { ...base, peers: [alice], focused: condition === "self-focus", disabled: condition === "offline",
      social: { ...base.social,
        blockedPeerIds: condition === "blocked" ? ["나비"] : [],
        readyPeerIds: condition === "not-ready" ? [] : base.social.readyPeerIds,
        reviewReadyPeerIds: condition === "review-unavailable" ? [] : base.social.reviewReadyPeerIds,
        requests: condition === "pending" ? [{ id: "request-1", peer: alice.participant, direction: "outgoing", action: "review", status: "offered", createdAt: 100, expiresAt: 1000 }] : [],
      } };
    render(<StudioVirtualSpaceSocialPanel {...props} />);
    const invite = screen.getByRole("button", { name: "나비 님에게 검수 초대" }) as HTMLButtonElement;
    expect(invite.disabled).toBe(true);
    fireEvent.click(invite);
    expect(props.onRequest).not.toHaveBeenCalled();
    expect(f.list).not.toHaveBeenCalled();
  });

  it("실제 접속자가 없으면 인원이나 팀원을 만들어 표시하지 않는다", () => {
    render(<StudioVirtualSpaceSocialPanel {...options()} peers={[]} />);
    expect(screen.queryByRole("button", { name: /님에게 검수 초대/u })).toBeNull();
    const summary = document.querySelector(".studio-vspace-team-summary");
    expect(summary).not.toBeNull();
    if (summary) expect(within(summary as HTMLElement).getAllByText("0")).toHaveLength(3);
  });
  it("먼 팀원에게는 다가가기를 먼저 제공하고 실제 도착 후 명시적인 대화 요청만 보낸다", () => {
    const props = { ...options(), peers: [alice], selectedPeer: alice, onApproachPeer: vi.fn() };
    const view = render(<StudioVirtualSpaceSocialPanel {...props} />);
    expect((screen.getByRole("button", { name: "대화 요청" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "대화 요청" }));
    fireEvent.click(screen.getByRole("button", { name: "나비 님에게 다가가기" }));
    expect(props.onApproachPeer).toHaveBeenCalledExactlyOnceWith("나비");
    expect(props.onRequest).not.toHaveBeenCalled();
    expect(props.onSelect).not.toHaveBeenCalled();
    view.rerender(<StudioVirtualSpaceSocialPanel {...props} approachingPeerId="나비" />);
    expect((screen.getByRole("button", { name: "선택한 팀원에게 다가가기" }) as HTMLButtonElement).disabled).toBe(true);
    view.rerender(<StudioVirtualSpaceSocialPanel {...props} nearbyPeerIds={["나비"]} />);
    expect(screen.queryByRole("button", { name: "나비 님에게 다가가기" })).toBeNull();
    expect(props.onRequest).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "대화 요청" }));
    expect(props.onRequest).toHaveBeenCalledExactlyOnceWith("나비", "talk");
  });
  it.each(["focused", "away", "blocked", "offline", "self-focus", "movement-unavailable"] as const)("%s 조건에서도 다가가기로 기존 제한을 우회하지 않는다", (condition) => {
    const base = options(), peer = makePeer("나비", condition === "focused" || condition === "away" ? condition : "available");
    const props = { ...base, selectedPeer: peer, peers: [peer], onApproachPeer: vi.fn(),
      focused: condition === "self-focus", disabled: condition === "offline", approachDisabled: condition === "movement-unavailable",
      social: { ...base.social, blockedPeerIds: condition === "blocked" ? ["나비"] : [] } };
    render(<StudioVirtualSpaceSocialPanel {...props} />);
    for (const name of ["나비 님에게 다가가기", "선택한 팀원에게 다가가기"]) {
      const button = screen.getByRole("button", { name }) as HTMLButtonElement;
      expect(button.disabled).toBe(true);
      fireEvent.click(button);
    }
    expect(props.onApproachPeer).not.toHaveBeenCalled();
    expect(props.onRequest).not.toHaveBeenCalled();
  });
});
