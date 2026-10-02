// @vitest-environment jsdom
import { useRef } from "react";
import { MemoryRouter } from "react-router-dom";
import { act, cleanup, fireEvent, render, renderHook, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { StudioSpaceSocialRequest } from "../StudioVirtualSpaceSocialPanel";
import { DEFAULT_STUDIO_WORLD_MANIFEST } from "../studio-virtual-space-world-manifest";
import { SpaceInteractPrompt } from "./SpaceInteractPrompt";
import { SpaceMinimap } from "./SpaceMinimap";
import { SpacePopover } from "./SpacePopover";
import { SpaceProximityStrip, type SpaceNearbyPerson } from "./SpaceProximityStrip";
import { SpaceRequestToast } from "./SpaceRequestToast";
import { SpaceToasts } from "./SpaceToasts";
import { SpaceWorkLauncher } from "./SpaceWorkLauncher";
import { pushSpaceToast, useSpacePrivateZoneNotice, useSpaceToasts, SPACE_TOAST_LIMIT } from "./use-space-toasts";

afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("SpaceInteractPrompt", () => {
  it("근처 대상이 없으면 그리지 않고, 있으면 캔버스 게이트가 인식하는 보조 버튼을 그린다", () => {
    const onActivate = vi.fn();
    const view = render(<SpaceInteractPrompt target={null} touch={false} onActivate={onActivate} />);
    expect(view.container.firstChild).toBeNull();
    view.rerender(<SpaceInteractPrompt target={{ kind: "npc", labelKo: "NPC · 안내원", labelEn: "NPC · Guide" }} touch={false} onActivate={onActivate} />);
    const button = screen.getByRole("button", { name: "NPC · 안내원과 대화하기" });
    expect(button.getAttribute("data-interact-prompt")).toBe("true");
    expect(button.getAttribute("aria-keyshortcuts")).toBe("X");
    fireEvent.click(button);
    expect(onActivate).toHaveBeenCalledOnce();
    view.rerender(<SpaceInteractPrompt target={{ kind: "interaction", labelKo: "검수 콘솔", labelEn: "Review console" }} touch onActivate={onActivate} />);
    expect(screen.getByRole("button", { name: "검수 콘솔 상호작용" }).hasAttribute("aria-keyshortcuts")).toBe(false);
  });
});

describe("SpaceToasts", () => {
  it("같은 문구는 하나로 합치고 최대 개수를 넘으면 오래된 알림부터 뺀다", () => {
    let toasts = pushSpaceToast([], { id: "a", message: "하나", tone: "info", createdAt: 1 });
    toasts = pushSpaceToast(toasts, { id: "b", message: "하나", tone: "success", createdAt: 2 });
    expect(toasts.map((toast) => toast.id)).toEqual(["b"]);
    for (const id of ["c", "d", "e"]) toasts = pushSpaceToast(toasts, { id, message: id, tone: "info", createdAt: 3 });
    expect(toasts).toHaveLength(SPACE_TOAST_LIMIT);
    expect(toasts.map((toast) => toast.id)).toEqual(["c", "d", "e"]);
    expect(pushSpaceToast(toasts, { id: "f", message: "   ", tone: "info", createdAt: 4 })).toBe(toasts);
  });

  it("알림은 5초 뒤 사라지고 닫기 버튼으로 바로 닫을 수 있다", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useSpaceToasts());
    act(() => { result.current.notify("자리를 기억했어요", "success"); });
    const view = render(<SpaceToasts toasts={result.current.toasts} onDismiss={result.current.dismiss} />);
    const log = screen.getByRole("log", { name: "알림" });
    expect(within(log).getByText("자리를 기억했어요")).toBeTruthy();
    act(() => { vi.advanceTimersByTime(5_000); });
    view.rerender(<SpaceToasts toasts={result.current.toasts} onDismiss={result.current.dismiss} />);
    expect(within(log).queryByText("자리를 기억했어요")).toBeNull();
    act(() => { result.current.notify("다시 알림"); });
    view.rerender(<SpaceToasts toasts={result.current.toasts} onDismiss={result.current.dismiss} />);
    act(() => { fireEvent.click(screen.getByRole("button", { name: "알림 닫기" })); });
    expect(result.current.toasts).toHaveLength(0);
  });

  it("프라이빗 구역 안내는 들어간 순간에만 한 번 알리고, 다시 들어오면 새로 알린다", () => {
    const notify = vi.fn();
    const format = () => "프라이빗 구역에 들어왔어요";
    const { rerender } = renderHook(({ inside }: { inside: boolean }) => useSpacePrivateZoneNotice(inside, notify, format), {
      initialProps: { inside: false },
    });
    expect(notify).not.toHaveBeenCalled();
    rerender({ inside: true });
    expect(notify).toHaveBeenCalledExactlyOnceWith("프라이빗 구역에 들어왔어요", "info");
    rerender({ inside: true });
    expect(notify).toHaveBeenCalledOnce();
    rerender({ inside: false });
    expect(notify).toHaveBeenCalledOnce();
    rerender({ inside: true });
    expect(notify).toHaveBeenCalledTimes(2);
  });
});

describe("SpacePopover", () => {
  function Anchored({ onClose }: { readonly onClose: () => void }) {
    const anchor = useRef<HTMLDivElement>(null);
    return <>
      <div ref={anchor}><button type="button">트리거</button></div>
      <button type="button" data-space-toggle="map">다른 여닫기</button>
      <button type="button">바깥</button>
      <SpacePopover open sheet={false} anchorRef={anchor} toggleSelector='[data-space-toggle="map"]' onClose={onClose} title="작은 창">
        <button type="button">안쪽</button>
      </SpacePopover>
    </>;
  }

  it("비모달 팝오버는 바깥을 누르면 닫히지만 트리거·여닫기 버튼·안쪽은 제외한다", () => {
    const onClose = vi.fn();
    render(<Anchored onClose={onClose} />);
    const dialog = screen.getByRole("dialog", { name: "작은 창" });
    expect(dialog.getAttribute("aria-modal")).toBe("false");
    expect(document.activeElement).toBe(within(dialog).getByRole("button", { name: "닫기" }));
    fireEvent.pointerDown(screen.getByRole("button", { name: "트리거" }));
    fireEvent.pointerDown(screen.getByRole("button", { name: "다른 여닫기" }));
    fireEvent.pointerDown(within(dialog).getByRole("button", { name: "안쪽" }));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.pointerDown(screen.getByRole("button", { name: "바깥" }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});

describe("SpaceProximityStrip", () => {
  const person = (id: string, activity: SpaceNearbyPerson["activity"] = "available"): SpaceNearbyPerson => ({
    id, name: id.toUpperCase(), activity, avatarIndex: 0, inConversation: false,
  });

  it("사람은 최대 3명, NPC는 배지를 붙여 따로 보여 준다", () => {
    const onNpcTalk = vi.fn();
    render(<SpaceProximityStrip people={[person("a"), person("b"), person("c"), person("d")]}
      npcs={[{ id: "guide", labelKo: "NPC · 안내원", labelEn: "NPC · Guide", activityKo: "안내 중", activityEn: "Guiding", skinKey: "guide", canTalk: true }]}
      artStyle="webtoon" socialDisabled={null} followingPeerId={null}
      onWave={vi.fn()} onTalk={vi.fn()} onFollow={vi.fn()} onNpcTalk={onNpcTalk} />);
    const strip = screen.getByRole("region", { name: "근처에 있는 사람과 NPC" });
    expect(strip.querySelectorAll('[data-kind="person"]')).toHaveLength(3);
    expect(within(strip).queryByText("D")).toBeNull();
    const npc = strip.querySelector<HTMLElement>('[data-kind="npc"]');
    if (!npc) throw new Error("NPC 카드가 필요합니다.");
    expect(within(npc).getByText("NPC")).toBeTruthy();
    expect(within(npc).getByText("안내원")).toBeTruthy();
    fireEvent.click(within(npc).getByRole("button", { name: "NPC · 안내원과 대화하기" }));
    expect(onNpcTalk).toHaveBeenCalledExactlyOnceWith("guide");
  });

  it("요청을 보낼 수 없거나 상대가 집중 중이면 버튼을 비활성 사유와 함께 막는다", () => {
    const onTalk = vi.fn();
    const onFollow = vi.fn();
    const view = render(<SpaceProximityStrip people={[person("a", "focused")]} npcs={[]} artStyle="webtoon" socialDisabled={null}
      followingPeerId="a" onWave={vi.fn()} onTalk={onTalk} onFollow={onFollow} onNpcTalk={vi.fn()} />);
    const talk = screen.getByRole("button", { name: "A에게 대화 요청" });
    expect(talk.getAttribute("aria-disabled")).toBe("true");
    expect(talk.getAttribute("title")).toBe("상대가 집중 중이거나 자리를 비웠어요");
    fireEvent.click(talk);
    expect(onTalk).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "A 따라가기" }).getAttribute("aria-pressed")).toBe("true");
    view.rerender(<SpaceProximityStrip people={[person("a")]} npcs={[]} artStyle="webtoon" socialDisabled="연결 확인 중"
      followingPeerId={null} onWave={vi.fn()} onTalk={onTalk} onFollow={onFollow} onNpcTalk={vi.fn()} />);
    expect(screen.getByRole("button", { name: "A에게 대화 요청" }).getAttribute("title")).toBe("연결 확인 중");
    view.rerender(<SpaceProximityStrip people={[]} npcs={[]} artStyle="webtoon" socialDisabled={null}
      followingPeerId={null} onWave={vi.fn()} onTalk={onTalk} onFollow={onFollow} onNpcTalk={vi.fn()} />);
    expect(screen.queryByRole("region", { name: "근처에 있는 사람과 NPC" })).toBeNull();
  });
});

describe("SpaceRequestToast", () => {
  const incoming = (id: string, action: StudioSpaceSocialRequest["action"] = "talk"): StudioSpaceSocialRequest => ({
    id, action, status: "offered", direction: "incoming", createdAt: 1, expiresAt: 2,
    peer: { sessionId: `peer-${id}`, displayName: "Bob", role: "editor" },
  });

  it("받은 요청을 10초 동안 보여 주고 같은 응답 경로로 수락·거절한다", () => {
    vi.useFakeTimers();
    const onRespond = vi.fn();
    const onOpenPeople = vi.fn();
    render(<SpaceRequestToast requests={[incoming("one")]} acceptDisabledReason={null} onRespond={onRespond} onOpenPeople={onOpenPeople} />);
    const toast = screen.getByRole("region", { name: "Bob님의 대화 요청" });
    fireEvent.click(within(toast).getByRole("button", { name: "Bob님의 대화 요청 수락" }));
    fireEvent.click(within(toast).getByRole("button", { name: "Bob님의 대화 요청 거절" }));
    fireEvent.click(within(toast).getByRole("button", { name: "자세히" }));
    expect(onRespond.mock.calls).toEqual([["one", "accept"], ["one", "decline"]]);
    expect(onOpenPeople).toHaveBeenCalledOnce();
    act(() => { vi.advanceTimersByTime(10_000); });
    expect(screen.queryByRole("region", { name: "Bob님의 대화 요청" })).toBeNull();
  });

  it("집중 중에는 수락을 막고 거절은 그대로 둔다", () => {
    const onRespond = vi.fn();
    render(<SpaceRequestToast requests={[incoming("two", "review")]} acceptDisabledReason="집중 중" onRespond={onRespond} onOpenPeople={vi.fn()} />);
    const accept = screen.getByRole("button", { name: "Bob님의 함께 검토 초대 수락" });
    expect(accept.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(accept);
    fireEvent.click(screen.getByRole("button", { name: "Bob님의 함께 검토 초대 거절" }));
    expect(onRespond.mock.calls).toEqual([["two", "decline"]]);
  });
});

describe("SpaceMinimap", () => {
  it("미니맵은 접기·큰 지도 열기를 제공하고, 큰 지도는 구역 버튼으로 그 입구까지 걷게 한다", () => {
    const onMoveTo = vi.fn();
    const onOpenFull = vi.fn();
    const manifest = DEFAULT_STUDIO_WORLD_MANIFEST;
    const room = manifest.rooms[0];
    if (!room) throw new Error("기본 월드의 방이 필요합니다.");
    const view = render(<SpaceMinimap manifest={manifest} self={{ x: 10, y: 10 }} people={[{ id: "bob", name: "Bob", point: { x: 20, y: 20 } }]}
      currentRoomId={room.id} expanded onToggleExpanded={vi.fn()} onOpenFull={onOpenFull} onMoveTo={onMoveTo} />);
    const minimap = screen.getByRole("region", { name: "미니맵" });
    expect(within(minimap).getByRole("button", { name: "미니맵 접기" }).getAttribute("aria-expanded")).toBe("true");
    const open = within(minimap).getByRole("button", { name: "큰 지도 열기 (M)" });
    expect(open.getAttribute("data-space-toggle")).toBe("map");
    fireEvent.click(open);
    expect(onOpenFull).toHaveBeenCalledOnce();
    expect(minimap.querySelectorAll(".space-minimap__peer")).toHaveLength(1);
    view.rerender(<SpaceMinimap manifest={manifest} self={{ x: 10, y: 10 }} people={[]} currentRoomId={room.id} variant="full" onMoveTo={onMoveTo} />);
    const zoneButtons = view.container.querySelectorAll(".space-minimap__zone-button");
    expect(zoneButtons.length).toBe(manifest.rooms.length);
    const first = zoneButtons[0];
    if (!(first instanceof HTMLButtonElement)) throw new Error("구역 버튼이 필요합니다.");
    expect(first.getAttribute("data-active")).toBe("true");
    fireEvent.click(first);
    expect(onMoveTo).toHaveBeenCalledOnce();
  });
});

describe("SpaceWorkLauncher", () => {
  it("정확한 이어하기 대상이 없으면 선택지 팝오버를 연다", () => {
    const onOpenChange = vi.fn();
    const view = render(<MemoryRouter><SpaceWorkLauncher project={{ title: null, resumeHref: null, verifyResume: () => false }}
      open={false} sheet={false} onOpenChange={onOpenChange} trigger={(trigger) => <button type="button" {...trigger} />}>
      <p>선택지</p>
    </SpaceWorkLauncher></MemoryRouter>);
    const trigger = screen.getByRole("button", { name: "작업 시작" });
    expect(trigger.getAttribute("aria-haspopup")).toBe("dialog");
    fireEvent.click(trigger);
    expect(onOpenChange).toHaveBeenCalledExactlyOnceWith(true);
    view.rerender(<MemoryRouter><SpaceWorkLauncher project={{ title: null, resumeHref: null, verifyResume: () => false }}
      open sheet={false} onOpenChange={onOpenChange} trigger={(value) => <button type="button" {...value} />}>
      <p>선택지</p>
    </SpaceWorkLauncher></MemoryRouter>);
    expect(within(screen.getByRole("dialog", { name: "무엇부터 할까요?" })).getByText("선택지")).toBeTruthy();
  });

  it("정확한 이어하기 대상이 있으면 누르는 순간 다시 확인하고 같은 대상일 때만 이동한다", () => {
    const verifyResume = vi.fn(() => false);
    render(<MemoryRouter><SpaceWorkLauncher project={{ title: "3화", resumeHref: "/studio/p/work/editor", verifyResume }}
      open={false} sheet={false} onOpenChange={vi.fn()} trigger={(trigger) => <button type="button" {...trigger} />}>
      <p>선택지</p>
    </SpaceWorkLauncher></MemoryRouter>);
    const resume = screen.getByRole("button", { name: "원고 이어하기" });
    expect(resume.getAttribute("data-space-exact-resume")).toBe("true");
    fireEvent.click(resume);
    expect(verifyResume).toHaveBeenCalledExactlyOnceWith("/studio/p/work/editor");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("이어하기 검증이 실패하면 팝오버 대신 새로 고쳤다는 안내를 보여준다", () => {
    const verifyResume = vi.fn(() => false);
    render(<MemoryRouter><SpaceWorkLauncher project={{ title: "3화", resumeHref: "/studio/p/work/editor", verifyResume }}
      open={false} sheet={false} onOpenChange={vi.fn()} trigger={(trigger) => <button type="button" {...trigger} />}>
      <p>선택지</p>
    </SpaceWorkLauncher></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: "원고 이어하기" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("status").textContent).toContain("새로 고쳤어요");
  });
});
