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
    presets: [
      { id: "pop", name: "청춘 오프닝", emoji: "🌅" },
      { id: "citypop", name: "감성 시티팝", emoji: "🌌" },
      { id: "mystery_noir", name: "비밀의 복선", emoji: "🔍" },
    ],
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

function renderAt(pathname: string, suspended = false) {
  return render(
    <MemoryRouter initialEntries={[pathname]}>
      <SiteBackgroundMusicPlayer suspended={suspended} />
    </MemoryRouter>,
  );
}

function expandPlayer() {
  const theme = screen.getByText(/트렌드 시티팝|툰스튜디오 오프닝|소재 마켓 그루브/u);
  const button = theme.closest("button");
  if (!button) throw new Error("player toggle not found");
  fireEvent.click(button);
}

describe("SiteBackgroundMusicPlayer", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    mocks.resumeAudio.mockResolvedValue(undefined);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("selects the route theme and starts only after an explicit play gesture", async () => {
    renderAt("/ranking");
    expect(screen.getByTestId("site-background-music-player")).toBeTruthy();
    expect(screen.getByText("트렌드 시티팝")).toBeTruthy();
    await waitFor(() => expect(mocks.setMood).toHaveBeenCalledWith("citypop"));

    fireEvent.click(screen.getByRole("button", { name: "배경음악 재생" }));
    await waitFor(() => {
      expect(mocks.resumeAudio).toHaveBeenCalledTimes(1);
      expect(mocks.setEnabled).toHaveBeenCalledWith(true);
    });
  });

  it("lets the listener override page following, theme and dedicated BGM volume", () => {
    renderAt("/ranking");
    expandPlayer();

    fireEvent.change(screen.getByLabelText("테마 직접 선택"), { target: { value: "mystery_noir" } });
    expect(mocks.setMood).toHaveBeenLastCalledWith("mystery_noir");
    expect(localStorage.getItem("ts_site_bgm_follow_route")).toBe("0");

    fireEvent.change(screen.getByLabelText("배경음악 음량"), { target: { value: "0.7" } });
    expect(mocks.setVolume).toHaveBeenCalledWith(0.7);
  });

  it("loads the reviewed hosted OST manifest only when vocal OST is selected", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        tracks: [{
          src: "/audio/theme.mp3",
          title: "Licensed theme",
          artist: "Artist",
          license: "Approved license",
          creditUrl: "https://example.com/credit",
        }],
      }),
    }));

    renderAt("/market");
    expandPlayer();
    fireEvent.click(screen.getByRole("button", { name: /고품질 보컬 OST/u }));

    await waitFor(() => expect(mocks.register).toHaveBeenCalledWith([
      {
        url: "/audio/theme.mp3",
        label: "Licensed theme",
        artist: "Artist",
        creditUrl: "https://example.com/credit",
      },
    ]));
    await waitFor(() => expect(mocks.setMood).toHaveBeenCalledWith("playlist:0"));
    expect(localStorage.getItem("ts_site_bgm_source")).toBe("vocal-ost");
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
