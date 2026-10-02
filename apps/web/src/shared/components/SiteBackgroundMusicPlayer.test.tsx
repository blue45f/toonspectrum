// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";

import { SiteBackgroundMusicPlayer } from "./SiteBackgroundMusicPlayer";

import { requestSiteOstPanelToggle } from "@/shared/lib/site-background-music";

const mocks = vi.hoisted(() => ({
  moodId: "pop",
  enabled: false,
  setEnabled: vi.fn(),
  setMood: vi.fn(),
  setVolume: vi.fn(),
  next: vi.fn(),
  register: vi.fn(),
  resumeAudio: vi.fn().mockResolvedValue(undefined),
  suspend: vi.fn(),
  resumeContext: vi.fn(),
  setMuted: vi.fn(),
}));

vi.mock("@toonstudio/core/fx", () => ({
  registerBgmPlaylist: mocks.register,
  isBgmEnabled: () => mocks.enabled,
  resumeAudio: mocks.resumeAudio,
  suspendBgmForContext: mocks.suspend,
  resumeBgmForContext: mocks.resumeContext,
  setMuted: mocks.setMuted,
  useAmbientBgm: () => ({
    enabled: mocks.enabled,
    mood: "",
    moodId: mocks.moodId,
    artist: "",
    creditUrl: "",
    volume: 0.48,
    presets: [],
    toggle: vi.fn(),
    setEnabled: mocks.setEnabled,
    next: mocks.next,
    setMood: mocks.setMood,
    setVolume: mocks.setVolume,
  }),
  useAudioState: () => ({
    sfxEnabled: true,
    bgmEnabled: mocks.enabled,
    muted: false,
    volume: 0.55,
    bgmVolume: 0.48,
    currentMood: "",
    currentMoodId: "pop",
    currentTrackArtist: "",
    currentTrackCreditUrl: "",
  }),
}));

vi.mock("@/shared/lib/i18n", () => ({
  useI18n: (selector: (state: { lang: string }) => unknown) => selector({ lang: "ko" }),
}));

// Metadata only: this fixture does not claim that an audio master exists or is approved for release.
const APPROVED_TRACK_FIXTURE = {
  id: "fixture-original-opening",
  src: "/audio/original/fixture-original-opening.mp3",
  title: "Fixture original opening",
  artist: "ToonStudio test fixture",
  role: "opening",
  origin: "original",
  vocalMode: "vocal",
  language: "ko",
  summary: "Deterministic metadata fixture for the approved-catalog UI path.",
  license: "Test fixture only; no media is published by this test.",
  creditUrl: "https://example.invalid/toonstudio-ost-fixture",
  profiles: ["animation", "citypop"],
  intensity: "normal",
  durationMs: 210_000,
  bpm: 128,
  provider: "elevenlabs",
  model: "music_v2_5",
  sha256: "a".repeat(64),
  generatedAt: "2026-09-18T00:00:00.000Z",
  provenance: "c2pa-requested",
  c2paRequested: true,
  status: "published",
} as const;

function mockManifest(tracks: readonly unknown[] = [APPROVED_TRACK_FIXTURE]) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ tracks }),
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function renderAt(pathname: string, suspended = false) {
  return render(
    <MemoryRouter initialEntries={[pathname]}>
      <SiteBackgroundMusicPlayer suspended={suspended} />
    </MemoryRouter>,
  );
}

/**
 * 공유 CI·개발 머신은 CPU 가 몇 배로 밀릴 수 있어 기본 1초 대기는 렌더 한 번에도 모자랄 수 있다.
 * 조건이 맞으면 곧바로 돌아오므로 통과하는 테스트는 느려지지 않고, 상한만 넉넉히 둔다.
 */
const SLOW_MACHINE = { timeout: 10_000 } as const;

/** 제스처 잠금 해제 리스너(pointerdown)가 window 에 붙은 횟수를 세는 감시자. 렌더 전에 만든다. */
function watchGestureListeners() {
  const add = vi.spyOn(window, "addEventListener");
  return () => add.mock.calls.filter(([type]) => (type as string) === "pointerdown").length;
}

/**
 * 목록이 불러와져 재생 버튼이 켜지고(렌더 반영) 제스처 리스너가 붙을(effect 반영) 때까지 기다린다.
 * `registerBgmPlaylist` 호출은 React 가 상태를 반영하기 전에 일어나므로, 부하가 큰 환경에서는 그 신호만 보고
 * 제스처를 보내면 버튼이 아직 꺼져 있거나 리스너가 붙기 전일 수 있다. 상태 반영의 결과를 직접 관찰한다.
 */
async function catalogueReady(gestureListeners?: () => number) {
  await waitFor(() => expect(mocks.register).toHaveBeenCalled(), SLOW_MACHINE);
  await waitFor(() => {
    const play = screen.getByRole("button", { name: /^OST (재생|일시정지)$/u }) as HTMLButtonElement;
    expect(play.disabled).toBe(false);
  }, SLOW_MACHINE);
  if (gestureListeners) await waitFor(() => expect(gestureListeners()).toBeGreaterThan(0), SLOW_MACHINE);
}

async function expandPlayer() {
  const button = await screen.findByRole("button", { name: /오리지널 애니·웹툰 OST/u });
  fireEvent.click(button);
}

describe("SiteBackgroundMusicPlayer", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    mocks.moodId = "pop";
    mocks.enabled = false;
    mocks.setEnabled.mockImplementation((value: boolean) => { mocks.enabled = value; });
    // clearAllMocks 는 쓰이지 않은 mockImplementationOnce 를 지우지 않아 앞 테스트의 실패가 뒤로 번진다.
    mocks.resumeAudio.mockReset();
    mocks.resumeAudio.mockResolvedValue(undefined);
    mockManifest();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("selects the route theme and starts only after an explicit play gesture", async () => {
    renderAt("/ranking");
    expect(screen.getByTestId("site-background-music-player")).toBeTruthy();
    expect(mocks.resumeAudio).not.toHaveBeenCalled();

    expect(await screen.findByText("네온 스크롤")).toBeTruthy();
    await waitFor(() => expect(mocks.setMood).toHaveBeenCalledWith("playlist:0"));

    const play = screen.getByRole("button", { name: "OST 재생" }) as HTMLButtonElement;
    await waitFor(() => expect(play.disabled).toBe(false));
    fireEvent.click(play);
    await waitFor(() => {
      expect(mocks.resumeAudio).toHaveBeenCalledTimes(1);
      expect(mocks.setEnabled).toHaveBeenCalledWith(true);
    });
  });

  it("keeps both compact controls at the 44px touch-target minimum", async () => {
    renderAt("/");
    expect(await screen.findByText("툰스튜디오 오프닝")).toBeTruthy();
    expect(screen.getByRole("button", { name: "OST 재생" }).className).toContain("size-11");
    expect(screen.getByRole("button", { name: /오리지널 애니·웹툰 OST/u }).className).toContain("min-h-11");
  });

  it("lets the listener override page following, style and dedicated BGM volume", async () => {
    renderAt("/ranking");
    await screen.findByText("네온 스크롤");
    await expandPlayer();

    fireEvent.click(screen.getByRole("checkbox", { name: /페이지 역할에 맞춰/u }));
    expect(localStorage.getItem("ts_site_bgm_follow_route")).toBe("0");

    fireEvent.change(screen.getByLabelText("OST 스타일"), { target: { value: "cinematic" } });
    expect(localStorage.getItem("ts_site_bgm_style")).toBe("cinematic");

    fireEvent.change(screen.getByLabelText("OST 음량"), { target: { value: "0.7" } });
    expect(mocks.setVolume).toHaveBeenCalledWith(0.7);
  });

  it("registers only parser-approved same-origin metadata and follows the route role", async () => {
    const fetchMock = mockManifest([APPROVED_TRACK_FIXTURE]);
    renderAt("/market");

    await waitFor(() => expect(mocks.register).toHaveBeenCalledWith([
      {
        url: "/audio/original/fixture-original-opening.mp3",
        label: "Fixture original opening",
        artist: "ToonStudio test fixture",
        creditUrl: "https://example.invalid/toonstudio-ost-fixture",
      },
    ]));
    await waitFor(() => expect(mocks.setMood).toHaveBeenCalledWith("playlist:0"));
    expect(fetchMock).toHaveBeenCalledWith("/audio/playlist.json?catalog=prism-awakening-20260921", expect.objectContaining({
      cache: "no-cache",
      headers: { Accept: "application/json" },
    }));
  });

  it("keeps playback unavailable when the reviewed release catalogue is empty", async () => {
    mockManifest([]);
    renderAt("/");

    expect(await screen.findByText("오리지널 OST 준비 중")).toBeTruthy();
    const play = screen.getByRole("button", { name: "OST 재생" }) as HTMLButtonElement;
    expect(play.disabled).toBe(true);
    fireEvent.click(play);
    expect(mocks.resumeAudio).not.toHaveBeenCalled();
    await waitFor(() => expect(mocks.register).toHaveBeenCalledWith([]));
    await waitFor(() => expect(mocks.setEnabled).toHaveBeenCalledWith(false));

    await expandPlayer();
    expect(await screen.findByText("검수 완료된 오리지널 OST가 아직 게시되지 않았습니다.")).toBeTruthy();
  });

  it("fails closed when the same-origin catalogue is unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    renderAt("/");
    await expandPlayer();

    expect(await screen.findByText("사이트 OST 목록을 불러오지 못했습니다.")).toBeTruthy();
    expect((screen.getByRole("button", { name: "OST 재생" }) as HTMLButtonElement).disabled).toBe(true);
    expect(mocks.register).toHaveBeenCalledWith([]);
    expect(mocks.setEnabled).toHaveBeenCalledWith(false);
  });

  it("selects a new master without autoplay and disables page following", async () => {
    mockManifest([APPROVED_TRACK_FIXTURE, { ...APPROVED_TRACK_FIXTURE, id: "spectrum-breaker-vocal", title: "SPECTRUM BREAKER", src: "/audio/original/spectrum-breaker-vocal.mp3" }]);
    renderAt("/");
    await waitFor(() => expect(mocks.register).toHaveBeenCalled());
    await expandPlayer();
    fireEvent.change(screen.getByLabelText("OST 곡 선택"), { target: { value: "spectrum-breaker-vocal" } });
    expect(mocks.setMood).toHaveBeenLastCalledWith("playlist:1");
    expect(localStorage.getItem("ts_site_bgm_follow_route")).toBe("0");
    expect(mocks.resumeAudio).not.toHaveBeenCalled();
    expect(mocks.setEnabled).not.toHaveBeenCalledWith(true);
    expect(screen.getByText("전체 OST · 2곡")).toBeTruthy();
  });

  it("shows actual ACE-Step provenance and same-origin download for the selected master", async () => {
    mocks.moodId = "playlist:0";
    mockManifest([{ ...APPROVED_TRACK_FIXTURE, provider: "ace-step", model: "acestep-v15-turbo", provenance: "local-generation-recorded", generatorRevision: "b".repeat(40), c2paRequested: undefined }]);
    renderAt("/");
    await waitFor(() => expect(mocks.register).toHaveBeenCalled());
    await expandPlayer();
    expect(screen.getByText(/ACE-Step 1.5 · Local generation recorded/u)).toBeTruthy();
    expect(screen.queryByText(/C2PA requested/u)).toBeNull();
    const link = screen.getByRole("link", { name: "현재 곡 MP3 저장" });
    expect(link.getAttribute("href")).toBe(APPROVED_TRACK_FIXTURE.src);
    expect(link.getAttribute("download")).toBe(`${APPROVED_TRACK_FIXTURE.id}.mp3`);
  });

  it("handles audio unlock rejection without claiming playback started", async () => {
    mocks.resumeAudio.mockRejectedValue(new Error("Blocked audio context"));
    renderAt("/");
    await catalogueReady();
    fireEvent.click(screen.getByRole("button", { name: "OST 재생" }));
    await expandPlayer();
    expect(await screen.findByText("음악 재생을 시작하지 못했습니다. 재생 버튼을 다시 눌러 주세요.")).toBeTruthy();
    expect(mocks.setEnabled).not.toHaveBeenCalledWith(true);
    expect(mocks.setEnabled).toHaveBeenCalledWith(false);
  });

  it("does not undo a user's pause when an older gesture finishes unlocking", async () => {
    mocks.enabled = true;
    let finish!: () => void;
    mocks.resumeAudio.mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; }));
    const gestureListeners = watchGestureListeners();
    renderAt("/");
    await catalogueReady(gestureListeners);
    fireEvent.pointerDown(window);
    expect(mocks.resumeAudio).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "OST 일시정지" }));
    expect(mocks.enabled).toBe(false);
    await act(async () => { finish(); });
    expect(mocks.setEnabled).not.toHaveBeenCalledWith(true);
    expect(mocks.enabled).toBe(false);
  });

  it.each(["suspend", "unmount"])("discards a delayed play request after %s", async (exit) => {
    let finish!: () => void;
    mocks.resumeAudio.mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; }));
    const view = renderAt("/");
    await catalogueReady();
    fireEvent.click(screen.getByRole("button", { name: "OST 재생" }));
    expect(mocks.resumeAudio).toHaveBeenCalledTimes(1);
    if (exit === "unmount") view.unmount();
    else view.rerender(<MemoryRouter initialEntries={["/"]}><SiteBackgroundMusicPlayer suspended /></MemoryRouter>);
    await act(async () => { finish(); });
    expect(mocks.setEnabled).not.toHaveBeenCalledWith(true);
  });

  it("retries a rejected restore unlock on a later gesture without changing opt-in", async () => {
    mocks.enabled = true;
    mocks.resumeAudio.mockRejectedValueOnce(new Error("Context temporarily unavailable"));
    const gestureListeners = watchGestureListeners();
    renderAt("/");
    await catalogueReady(gestureListeners);
    await act(async () => { fireEvent.pointerDown(window); });
    expect(mocks.setEnabled).not.toHaveBeenCalled();
    expect(mocks.enabled).toBe(true);
    await act(async () => { fireEvent.keyDown(window, { key: "Enter" }); });
    await waitFor(() => expect(mocks.resumeAudio).toHaveBeenCalledTimes(2), SLOW_MACHINE);
    await waitFor(() => expect(mocks.setEnabled).toHaveBeenCalledExactlyOnceWith(true), SLOW_MACHINE);
  });

  it("ignores a failed older play request after a newer request succeeded", async () => {
    let fail!: (error: Error) => void;
    mocks.resumeAudio.mockImplementationOnce(() => new Promise<void>((_, reject) => { fail = reject; }));
    renderAt("/");
    await catalogueReady();
    fireEvent.click(screen.getByRole("button", { name: "OST 재생" }));
    fireEvent.click(screen.getByRole("button", { name: "OST 재생" }));
    await waitFor(() => expect(mocks.setEnabled).toHaveBeenCalledWith(true), SLOW_MACHINE);
    await act(async () => { fail(new Error("Expired unlock")); });
    expect(mocks.setEnabled).not.toHaveBeenCalledWith(false);
    expect(mocks.enabled).toBe(true);
  });

  it("stays out of audio-producing pages and preserves the user's opt-in", () => {
    renderAt("/studio/assets/audio");
    expect(screen.queryByTestId("site-background-music-player")).toBeNull();
    expect(mocks.suspend).toHaveBeenCalledWith("site-route-audio-conflict");
    expect(mocks.setEnabled).not.toHaveBeenCalled();
  });

  it("suspends playback while an isolated editor or admin shell owns the screen", () => {
    renderAt("/studio/projects", true);
    expect(screen.queryByTestId("site-background-music-player")).toBeNull();
    expect(mocks.suspend).toHaveBeenCalledWith("site-route-audio-conflict");
    expect(mocks.setEnabled).not.toHaveBeenCalled();
  });
});

describe("focused task audio policy", () => {
  it("removes ambient OST controls from focused creation screens", () => {
    mockManifest();
    renderAt("/studio/new");
    expect(screen.queryByTestId("site-background-music-player")).toBeNull();
    expect(mocks.suspend).toHaveBeenCalledWith("site-route-audio-conflict");
  });
});

describe("task workspace audio dock", () => {
  it("keeps OST controls in the header and returns focus after Escape", async () => {
    mockManifest();
    render(<MemoryRouter initialEntries={["/studio/assets"]}>
      <div id="workspace-audio-dock" /><SiteBackgroundMusicPlayer />
    </MemoryRouter>);
    const toggle = await screen.findByRole("button", { name: "OST 설정" });
    expect(toggle.closest("#workspace-audio-dock")).not.toBeNull();
    fireEvent.click(toggle);
    expect(screen.getByRole("slider", { name: "OST 음량" })).toBeTruthy();
    fireEvent.keyDown(toggle, { key: "Escape", isComposing: true });
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    fireEvent.keyDown(toggle, { key: "Escape" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(toggle);
    expect(mocks.setEnabled).not.toHaveBeenCalledWith(true);
  });
});

describe("mobile settings cluster entry point", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it("opens from the settings cluster request, focuses the panel and returns focus to the cluster", async () => {
    mockManifest();
    // 휴대폰에서는 알약이 CSS로 숨으므로 접은 뒤 초점은 ⚙ 토글로 돌아가야 한다.
    const visibility = vi.fn(function (this: HTMLElement) {
      return this.closest("[data-site-ost-pill]") === null;
    });
    Object.defineProperty(HTMLElement.prototype, "checkVisibility", { configurable: true, value: visibility });
    try {
      render(
        <MemoryRouter initialEntries={["/ranking"]}>
          <button type="button" data-floating-controls-toggle>설정</button>
          <SiteBackgroundMusicPlayer />
        </MemoryRouter>,
      );
      await screen.findByText("네온 스크롤");

      act(() => requestSiteOstPanelToggle());

      const collapse = await screen.findByRole("button", { name: "OST 플레이어 접기" });
      expect(screen.getByTestId("site-background-music-player").getAttribute("data-site-ost-expanded")).toBe("true");
      await waitFor(() => expect(document.activeElement).toBe(collapse));

      fireEvent.keyDown(collapse, { key: "Escape" });

      await waitFor(() => expect(screen.queryByRole("button", { name: "OST 플레이어 접기" })).toBeNull());
      expect(document.activeElement).toBe(screen.getByRole("button", { name: "설정" }));
      expect(localStorage.getItem("ts_site_bgm_expanded")).toBe("0");
    } finally {
      Reflect.deleteProperty(HTMLElement.prototype, "checkVisibility");
    }
  });

  it("does not restore a previously expanded panel on a phone-width viewport", async () => {
    mockManifest();
    localStorage.setItem("ts_site_bgm_expanded", "1");
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn((query: string) => ({
        matches: query === "(max-width: 767px)",
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
    try {
      renderAt("/ranking");
      await screen.findByText("네온 스크롤");

      expect(screen.queryByRole("button", { name: "OST 플레이어 접기" })).toBeNull();
      expect(screen.getByTestId("site-background-music-player").hasAttribute("data-site-ost-expanded")).toBe(false);
    } finally {
      Reflect.deleteProperty(window, "matchMedia");
    }
  });
});
