// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EMPTY_STUDIO_LIVE_CONTEXT, StudioLiveCollaborationContext } from "../studio-live-collaboration-context";
import type { StudioLiveRoom } from "../studio-live-collaboration-room";
import StudioP2pHuddleLauncher from "./StudioP2pHuddleLauncher";
import { resetStudioStrokeFocusActivityForTests, setStudioStrokeFocusActivity } from "../../studio-stroke-focus-activity";

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
});
