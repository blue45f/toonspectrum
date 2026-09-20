// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EMPTY_STUDIO_LIVE_CONTEXT, StudioLiveCollaborationContext } from "../studio-live-collaboration-context";
import type { StudioLiveRoom } from "../studio-live-collaboration-room";
import StudioP2pHuddleLauncher from "./StudioP2pHuddleLauncher";
import { closeStudioP2pHuddle, openStudioP2pHuddle, STUDIO_P2P_HUDDLE_CLOSED_EVENT } from "./studio-p2p-huddle-events";
import { resetStudioStrokeFocusActivityForTests, setStudioStrokeFocusActivity } from "../../studio-stroke-focus-activity";
import { studioHuddleAudioFocusSnapshot } from "./studio-p2p-huddle-audio-focus";
import { registerStudioHuddleAuthority } from "./studio-p2p-huddle-authority";

const track = { kind: "audio", stop: vi.fn(), onended: null };
const stream = { getTracks: () => [track] };
const getUserMedia = vi.fn(async () => stream);
function environment() {
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
  vi.stubGlobal("MediaStream", class { constructor(private tracks: unknown[]) {} getTracks() { return this.tracks; } });
  Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia } });
}
function fixture(workId = "work-a", supported = true) {
  return { workId, ready: true, participant: { sessionId: "a", role: "editor", displayName: "작가" },
    direct: supported ? { getPeers: () => [], send: () => false, subscribe: () => () => undefined } : null,
    subscribe: () => () => undefined, subscribeVoice: () => () => undefined,
  } as unknown as StudioLiveRoom;
}
function view(room: StudioLiveRoom, canChat = true) {
  return <StudioLiveCollaborationContext.Provider value={{ ...EMPTY_STUDIO_LIVE_CONTEXT, room, canChat, availability: "ready" }}>
    <StudioP2pHuddleLauncher />
  </StudioLiveCollaborationContext.Provider>;
}
afterEach(() => { resetStudioStrokeFocusActivityForTests(); cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); getUserMedia.mockClear(); track.stop.mockClear(); });
describe("P2P launcher consent and lifetime", () => {
  it("requires a matching private capability and cancels an outstanding device prompt when it is revoked",async()=>{
    environment();render(view(fixture()));let valid=true,notify=()=>{};
    const capability=registerStudioHuddleAuthority({conversationId:"private",peerIds:["b"],valid:()=>valid,subscribe:fn=>{notify=fn;return()=>{};}});
    act(()=>openStudioP2pHuddle({conversationId:"private",peerIds:["b"],authorityToken:"invented"}));
    expect(screen.queryByRole("button",{name:"동의하고 P2P 채팅 참여"})).toBeNull();
    act(()=>openStudioP2pHuddle({conversationId:"private",peerIds:["b"],authorityToken:capability.token}));
    expect(getUserMedia).not.toHaveBeenCalled();fireEvent.click(screen.getByRole("button",{name:"동의하고 P2P 채팅 참여"}));
    let finish!:(value:typeof stream)=>void;getUserMedia.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
    fireEvent.click(screen.getByRole("button",{name:"마이크 켜기"}));
    act(()=>{valid=false;notify();});await act(async()=>{finish(stream);await Promise.resolve();});
    expect(track.stop).toHaveBeenCalledOnce();expect(studioHuddleAudioFocusSnapshot()).toBe(false);
    expect(screen.queryByRole("button",{name:"마이크 끄기"})).toBeNull();capability.dispose();
  });
  it("gives joined Huddles local playback priority without capturing devices or treating a panel open as a call", () => {
    environment(); const mounted = render(view(fixture()));
    expect(studioHuddleAudioFocusSnapshot()).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "채팅·통화" }));
    expect(studioHuddleAudioFocusSnapshot()).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "동의하고 P2P 채팅 참여" }));
    expect(studioHuddleAudioFocusSnapshot()).toBe(true); expect(getUserMedia).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "대화 패널 접기" }));
    window.dispatchEvent(new Event("blur"));
    expect(studioHuddleAudioFocusSnapshot()).toBe(true);
    mounted.unmount(); expect(studioHuddleAudioFocusSnapshot()).toBe(false);
  });
  it("keeps devices off until an explicit media action and preserves calls while collapsed", async () => {
    environment(); render(view(fixture()));
    fireEvent.click(screen.getByRole("button", { name: "채팅·통화" }));
    expect(getUserMedia).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "동의하고 P2P 채팅 참여" }));
    expect(getUserMedia).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "마이크 켜기" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "마이크 끄기" })).toBeTruthy());
    expect(getUserMedia).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "대화 패널 접기" }));
    expect(track.stop).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /P2P 대화 중/ }));
    fireEvent.click(screen.getByRole("button", { name: "나가기" }));
    expect(track.stop).toHaveBeenCalledOnce();
  });
  it("starts the virtual studio only after explicit P2P participation", () => {
    environment(); render(view(fixture()));
    fireEvent.click(screen.getByRole("button", { name: "채팅·통화" }));
    expect(screen.queryByRole("application", { name: /가상 스튜디오 지도/ })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "동의하고 P2P 채팅 참여" }));
    expect(screen.getByRole("application", { name: /가상 스튜디오 지도/ })).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: /근접 미디어/ })).toBeTruthy();
    expect(getUserMedia).not.toHaveBeenCalled();
  });
  it("collapses an expanded huddle during a canvas stroke without leaving", () => {
    environment(); render(view(fixture()));
    fireEvent.click(screen.getByRole("button", { name: "채팅·통화" }));
    fireEvent.click(screen.getByRole("button", { name: "동의하고 P2P 채팅 참여" }));
    const panel = document.querySelector<HTMLElement>("[data-studio-p2p-huddle]");
    expect(panel?.hidden).toBe(false);

    act(() => setStudioStrokeFocusActivity("canvas-stroke", true));

    expect(panel?.hidden).toBe(true);
    expect(screen.getByRole("button", { name: /P2P 대화 중/ })).toBeTruthy();
    expect(track.stop).not.toHaveBeenCalled();
  });
  it.each(["room", "permission"])("releases capture on %s changes", async (change) => {
    environment(); const original = fixture(); const rendered = render(view(original));
    fireEvent.click(screen.getByRole("button", { name: "채팅·통화" }));
    fireEvent.click(screen.getByRole("button", { name: "동의하고 P2P 채팅 참여" }));
    fireEvent.click(screen.getByRole("button", { name: "마이크 켜기" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "마이크 끄기" })).toBeTruthy());
    rendered.rerender(view(change === "room" ? fixture("work-b") : original, change !== "permission"));
    expect(track.stop).toHaveBeenCalledOnce();
  });
  it("disables participation without a strict RTC port", () => {
    environment(); render(view(fixture("local", false)));
    fireEvent.click(screen.getByRole("button", { name: "채팅·통화" }));
    expect(screen.getByRole("button", { name: "동의하고 P2P 채팅 참여" }).hasAttribute("disabled")).toBe(true);
    expect(getUserMedia).not.toHaveBeenCalled();
  });
  it("does not expose publishing controls to viewers", () => {
    environment(); render(view(fixture(), false));
    expect(screen.queryByRole("button", { name: "채팅·통화" })).toBeNull();
  });
  it("keeps an accepted conversation fixed and closes only its matching leave event", async () => {
    environment(); render(view(fixture()));
    act(() => openStudioP2pHuddle({ source: "virtual-space", conversationId: "conversation-one", peerIds: ["b"] }));
    fireEvent.click(screen.getByRole("button", { name: "동의하고 P2P 채팅 참여" }));
    expect(screen.queryByRole("checkbox", { name: /근접 미디어/ })).toBeNull();
    expect(getUserMedia).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "마이크 켜기" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "마이크 끄기" })).toBeTruthy());

    act(() => closeStudioP2pHuddle({ conversationId: "conversation-old" }));
    act(() => openStudioP2pHuddle({ conversationId: "conversation-one", peerIds: ["b"] }));
    expect(track.stop).not.toHaveBeenCalled();
    act(() => closeStudioP2pHuddle({ conversationId: "conversation-one" }));
    expect(track.stop).toHaveBeenCalledOnce();
    expect(document.querySelector<HTMLElement>("[data-studio-p2p-huddle]")?.hidden).toBe(true);
  });
  it.each([
    { conversationId: "conversation-two", peerIds: ["b"] },
    { conversationId: "conversation-one", peerIds: ["b", "c"] },
    { source: "toolbar" as const },
  ])("revokes capture before changing the consented audience to %j", async (next) => {
    environment(); render(view(fixture()));
    act(() => openStudioP2pHuddle({ conversationId: "conversation-one", peerIds: ["b"] }));
    fireEvent.click(screen.getByRole("button", { name: "동의하고 P2P 채팅 참여" }));
    fireEvent.click(screen.getByRole("button", { name: "마이크 켜기" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "마이크 끄기" })).toBeTruthy());
    act(() => openStudioP2pHuddle(next));
    expect(track.stop).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "동의하고 P2P 채팅 참여" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "동의하고 P2P 채팅 참여" }));
    expect(screen.getByRole("button", { name: "마이크 켜기" })).toBeTruthy();
    expect(getUserMedia).toHaveBeenCalledOnce();
  });
  it("does not let virtual cleanup close a general toolbar call", async () => {
    environment(); render(view(fixture()));
    fireEvent.click(screen.getByRole("button", { name: "채팅·통화" }));
    fireEvent.click(screen.getByRole("button", { name: "동의하고 P2P 채팅 참여" }));
    fireEvent.click(screen.getByRole("button", { name: "마이크 켜기" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "마이크 끄기" })).toBeTruthy());
    act(() => closeStudioP2pHuddle({ conversationId: "conversation-old" }));
    expect(track.stop).not.toHaveBeenCalled();
  });

  it.each(["manual", "command", "switch", "transport", "unmount"])("notifies scoped %s closure once after capture stops, even if social cleanup replies", async (reason) => {
    environment();
    let terminate: (() => void) | undefined;
    const room = { ...fixture(), subscribeVoice: (listener: (event: { type: string }) => void) => {
      terminate = () => listener({ type: "terminal" }); return () => undefined;
    } } as unknown as StudioLiveRoom;
    const rendered = render(view(room));
    act(() => openStudioP2pHuddle({ conversationId: "conversation-one", peerIds: ["b"] }));
    fireEvent.click(screen.getByRole("button", { name: "동의하고 P2P 채팅 참여" }));
    fireEvent.click(screen.getByRole("button", { name: "마이크 켜기" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "마이크 끄기" })).toBeTruthy());
    const closed = vi.fn((event: Event) => {
      const detail = (event as CustomEvent<{ conversationId: string }>).detail;
      expect(track.stop).toHaveBeenCalledOnce();
      expect(detail).toEqual({ conversationId: "conversation-one" });
      closeStudioP2pHuddle(detail);
    });
    globalThis.addEventListener(STUDIO_P2P_HUDDLE_CLOSED_EVENT, closed);
    try {
      if (reason === "manual") fireEvent.click(screen.getByRole("button", { name: "나가기" }));
      else if (reason === "command") act(() => closeStudioP2pHuddle({ conversationId: "conversation-one" }));
      else if (reason === "switch") act(() => openStudioP2pHuddle({ conversationId: "conversation-two", peerIds: ["c"] }));
      else if (reason === "transport") act(() => terminate?.());
      else rendered.unmount();
      expect(closed).toHaveBeenCalledOnce();
      act(() => closeStudioP2pHuddle({ conversationId: "conversation-one" }));
      expect(closed).toHaveBeenCalledOnce();
    } finally {
      globalThis.removeEventListener(STUDIO_P2P_HUDDLE_CLOSED_EVENT, closed);
    }
  });
  it("notifies cancellation of a pending scoped join without notifying general calls", () => {
    environment(); render(view(fixture()));
    const closed = vi.fn();
    globalThis.addEventListener(STUDIO_P2P_HUDDLE_CLOSED_EVENT, closed);
    try {
      act(() => openStudioP2pHuddle({ conversationId: "conversation-pending", peerIds: ["b"] }));
      act(() => closeStudioP2pHuddle({ conversationId: "conversation-pending" }));
      expect(closed).toHaveBeenCalledOnce();
      expect(getUserMedia).not.toHaveBeenCalled();
      act(() => openStudioP2pHuddle({ source: "toolbar" }));
      act(() => closeStudioP2pHuddle());
      expect(closed).toHaveBeenCalledOnce();
    } finally {
      globalThis.removeEventListener(STUDIO_P2P_HUDDLE_CLOSED_EVENT, closed);
    }
  });

});
