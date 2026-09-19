// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";

import { SiteBackgroundMusicPlayer } from "./SiteBackgroundMusicPlayer";

const mocks = vi.hoisted(() => ({
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

vi.mock("@toonspectrum/core/fx", () => ({
  registerBgmPlaylist: mocks.register,
  resumeAudio: mocks.resumeAudio,
  suspendBgmForContext: mocks.suspend,
  resumeBgmForContext: mocks.resumeContext,
  setMuted: mocks.setMuted,
  useAmbientBgm: () => ({
    enabled: false,
    mood: "",
    moodId: "pop",
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
    bgmEnabled: false,
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
  artist: "ToonSpectrum test fixture",
  role: "opening",
  origin: "original",
  vocalMode: "vocal",
  language: "ko",
  summary: "Deterministic metadata fixture for the approved-catalog UI path.",
  license: "Test fixture only; no media is published by this test.",
  creditUrl: "https://example.invalid/toonspectrum-ost-fixture",
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

async function expandPlayer() {
  const button = await screen.findByRole("button", { name: /오리지널 애니·웹툰 OST/u });
  fireEvent.click(button);
}

describe("SiteBackgroundMusicPlayer", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    mocks.resumeAudio.mockResolvedValue(undefined);
    mockManifest();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
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
    expect(await screen.findByText("툰스펙트럼 오프닝")).toBeTruthy();
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
        artist: "ToonSpectrum test fixture",
        creditUrl: "https://example.invalid/toonspectrum-ost-fixture",
      },
    ]));
    await waitFor(() => expect(mocks.setMood).toHaveBeenCalledWith("playlist:0"));
    expect(fetchMock).toHaveBeenCalledWith("/audio/playlist.json", expect.objectContaining({
      cache: "force-cache",
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
