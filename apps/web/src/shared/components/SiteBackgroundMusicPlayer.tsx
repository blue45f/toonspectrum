import {
  registerBgmPlaylist,
  resumeAudio,
  resumeBgmForContext,
  setMuted,
  suspendBgmForContext,
  useAmbientBgm,
  useAudioState,
} from "@toonspectrum/core/fx";
import {
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Music2,
  Pause,
  Play,
  Radio,
  SkipForward,
  Sparkles,
  Volume2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";

import {
  loadSiteBgmPlaylist,
  readSiteBgmPreferences,
  resolveSiteBgmExperience,
  type SiteBgmSource,
  writeSiteBgmExpanded,
  writeSiteBgmFollowRoute,
  writeSiteBgmSource,
} from "@/shared/lib/site-background-music";
import { cn } from "@/shared/lib/utils";
import { useI18n } from "@/shared/lib/i18n";

const SITE_ROUTE_SUSPENSION = "site-route-audio-conflict";

function sourceLabel(source: SiteBgmSource, korean: boolean): string {
  if (source === "vocal-ost") return korean ? "고품질 보컬 OST" : "Vocal OST";
  return korean ? "페이지 테마 연주" : "Page-theme instrumental";
}

export interface SiteBackgroundMusicPlayerProps {
  readonly suspended?: boolean;
}

export function SiteBackgroundMusicPlayer({ suspended: externallySuspended = false }: SiteBackgroundMusicPlayerProps = {}) {
  const { pathname } = useLocation();
  const lang = useI18n((state) => state.lang);
  const korean = lang.startsWith("ko");
  const experience = useMemo(() => resolveSiteBgmExperience(pathname), [pathname]);
  const initial = useMemo(() => readSiteBgmPreferences(), []);
  const {
    enabled: bgmEnabled,
    mood: bgmMood,
    moodId: bgmMoodId,
    artist: bgmArtist,
    creditUrl: bgmCreditUrl,
    volume: bgmVolume,
    presets: bgmPresets,
    setEnabled: setBgmEnabled,
    next: nextBgm,
    setMood: setBgmMood,
    setVolume: setBgmVolume,
  } = useAmbientBgm();
  const audio = useAudioState();
  const [expanded, setExpanded] = useState(initial.expanded);
  const [followRoute, setFollowRoute] = useState(initial.followRoute);
  const [source, setSource] = useState<SiteBgmSource>(initial.source);
  const [playlistSize, setPlaylistSize] = useState(0);
  const [sourceError, setSourceError] = useState("");
  const suspended = externallySuspended || experience.suspended;

  useEffect(() => {
    if (suspended) suspendBgmForContext(SITE_ROUTE_SUSPENSION);
    else resumeBgmForContext(SITE_ROUTE_SUSPENSION);
  }, [suspended]);

  useEffect(() => () => resumeBgmForContext(SITE_ROUTE_SUSPENSION), []);

  useEffect(() => {
    if (source === "page-theme") {
      registerBgmPlaylist([]);
      setPlaylistSize(0);
      return;
    }

    const controller = new AbortController();
    setSourceError("");
    void loadSiteBgmPlaylist(controller.signal)
      .then((tracks) => {
        if (controller.signal.aborted) return;
        if (tracks.length === 0) throw new Error("사용 가능한 보컬 OST가 없습니다.");
        registerBgmPlaylist(tracks);
        setPlaylistSize(tracks.length);
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return;
        registerBgmPlaylist([]);
        setPlaylistSize(0);
        setSource("page-theme");
        writeSiteBgmSource("page-theme");
        setSourceError(reason instanceof Error ? reason.message : "보컬 OST를 불러오지 못했습니다.");
      });
    return () => controller.abort();
  }, [source]);

  useEffect(() => {
    if (!followRoute || suspended) return;
    if (source === "page-theme") {
      setBgmMood(experience.moodId);
      return;
    }
    if (playlistSize > 0) setBgmMood(`playlist:${experience.vocalTrackIndex % playlistSize}`);
  }, [setBgmMood, experience, followRoute, playlistSize, source, suspended]);

  useEffect(() => {
    if (!bgmEnabled || suspended) return;
    const unlock = () => {
      void resumeAudio().then(() => setBgmEnabled(true));
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
    window.addEventListener("pointerdown", unlock, { once: true, passive: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, [bgmEnabled, setBgmEnabled, suspended]);

  if (suspended) return null;

  const themeLabel = korean ? experience.label : experience.labelEn;
  const themeDescription = korean ? experience.description : experience.descriptionEn;
  const activeLabel = bgmMood || themeLabel;
  const playing = bgmEnabled && !audio.muted;

  const togglePlayback = async () => {
    if (playing) {
      setBgmEnabled(false);
      return;
    }
    if (audio.muted) setMuted(false);
    await resumeAudio();
    setBgmEnabled(true);
  };

  const chooseSource = (value: SiteBgmSource) => {
    setSourceError("");
    setSource(value);
    writeSiteBgmSource(value);
  };

  const chooseFollowRoute = (value: boolean) => {
    setFollowRoute(value);
    writeSiteBgmFollowRoute(value);
    if (value) {
      if (source === "page-theme") setBgmMood(experience.moodId);
      if (source === "vocal-ost" && playlistSize > 0) setBgmMood(`playlist:${experience.vocalTrackIndex % playlistSize}`);
    }
  };

  const toggleExpanded = () => {
    const next = !expanded;
    setExpanded(next);
    writeSiteBgmExpanded(next);
  };

  return (
    <aside
      data-testid="site-background-music-player"
      className="fixed bottom-4 left-4 z-50 max-w-[calc(100vw-2rem)] max-md:bottom-[calc(4.75rem+env(safe-area-inset-bottom))]"
      aria-label={korean ? "사이트 배경음악" : "Site background music"}
    >
      {expanded ? (
        <div className="mb-2 w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-line bg-panel/95 shadow-2xl backdrop-blur-xl">
          <div className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.12em] text-accent">
                <Sparkles className="size-3.5" aria-hidden="true" />
                {korean ? "페이지 사운드스케이프" : "Page soundscape"}
              </p>
              <p className="mt-1 truncate text-sm font-black text-fg">{themeLabel}</p>
              <p className="mt-1 text-xs leading-5 text-fg-2">{themeDescription}</p>
            </div>
            <button
              type="button"
              onClick={toggleExpanded}
              className="grid size-10 shrink-0 place-items-center rounded-full border border-line text-fg-2 hover:bg-raised hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              aria-label={korean ? "배경음악 설정 접기" : "Collapse music settings"}
            >
              <ChevronDown className="size-4" aria-hidden="true" />
            </button>
          </div>

          <div className="space-y-4 p-4">
            <div className="grid grid-cols-2 gap-2" role="group" aria-label={korean ? "음악 소스" : "Music source"}>
              {(["page-theme", "vocal-ost"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={source === value}
                  onClick={() => chooseSource(value)}
                  className={cn(
                    "min-h-11 rounded-xl border px-3 text-xs font-bold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                    source === value ? "border-accent bg-accent-soft text-accent" : "border-line bg-card text-fg-2 hover:bg-raised hover:text-fg",
                  )}
                >
                  {value === "page-theme" ? <Music2 className="mr-1.5 inline size-3.5" aria-hidden="true" /> : <Radio className="mr-1.5 inline size-3.5" aria-hidden="true" />}
                  {sourceLabel(value, korean)}
                </button>
              ))}
            </div>

            <label className="flex min-h-10 items-center justify-between gap-3 rounded-xl border border-line bg-card px-3 py-2 text-xs font-semibold text-fg-2">
              <span>{korean ? "페이지에 맞춰 자동 전환" : "Follow each page theme"}</span>
              <input
                type="checkbox"
                checked={followRoute}
                onChange={(event) => chooseFollowRoute(event.target.checked)}
                className="size-4 accent-[var(--color-accent)]"
              />
            </label>

            {source === "page-theme" ? (
              <label className="block text-xs font-semibold text-fg-2">
                {korean ? "테마 직접 선택" : "Choose a theme"}
                <select
                  className="mt-1.5 min-h-11 w-full rounded-xl border border-line bg-card px-3 text-sm text-fg outline-none focus:border-accent focus-visible:ring-2 focus-visible:ring-accent/30"
                  value={bgmMoodId.startsWith("playlist:") ? experience.moodId : bgmMoodId}
                  onChange={(event) => {
                    chooseFollowRoute(false);
                    setBgmMood(event.target.value);
                  }}
                >
                  {bgmPresets.map((preset) => (
                    <option key={preset.id} value={preset.id}>{preset.emoji ? `${preset.emoji} ` : ""}{preset.name}</option>
                  ))}
                </select>
              </label>
            ) : null}

            <label className="block text-xs font-semibold text-fg-2">
              <span className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5"><Volume2 className="size-3.5" aria-hidden="true" />{korean ? "배경음악 음량" : "Background music volume"}</span>
                <span className="font-black text-fg">{Math.round(bgmVolume * 100)}%</span>
              </span>
              <input
                aria-label={korean ? "배경음악 음량" : "Background music volume"}
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={bgmVolume}
                onChange={(event) => setBgmVolume(Number(event.target.value))}
                className="mt-2 w-full accent-[var(--color-accent)]"
              />
            </label>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void togglePlayback()}
                className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-accent px-4 text-sm font-black text-on-accent hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                {playing ? <Pause className="size-4" aria-hidden="true" /> : <Play className="size-4" aria-hidden="true" />}
                {playing ? (korean ? "잠시 멈춤" : "Pause") : (korean ? "음악 재생" : "Play music")}
              </button>
              <button
                type="button"
                onClick={() => {
                  chooseFollowRoute(false);
                  nextBgm();
                }}
                className="grid size-11 shrink-0 place-items-center rounded-xl border border-line bg-card text-fg-2 hover:bg-raised hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                aria-label={korean ? "다음 테마" : "Next theme"}
              >
                <SkipForward className="size-4" aria-hidden="true" />
              </button>
            </div>

            <div className="rounded-xl border border-line bg-card px-3 py-2.5 text-xs leading-5 text-fg-2" aria-live="polite">
              <p className="truncate font-bold text-fg">{playing ? "● " : "○ "}{activeLabel}</p>
              {bgmArtist ? <p className="truncate">{bgmArtist}</p> : null}
              {bgmCreditUrl ? (
                <a href={bgmCreditUrl} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex min-h-7 items-center gap-1 text-accent underline underline-offset-4">
                  {korean ? "음원 출처·라이선스" : "Track credit and license"}<ExternalLink className="size-3" aria-hidden="true" />
                </a>
              ) : null}
              {sourceError ? <p className="mt-1 text-warn">{sourceError}</p> : null}
            </div>

            <Link to="/studio/assets/audio" className="inline-flex min-h-9 items-center gap-1.5 text-xs font-bold text-accent underline underline-offset-4">
              <Music2 className="size-3.5" aria-hidden="true" />
              {korean ? "내 웹툰용 음악 직접 만들기" : "Create music for my webtoon"}
            </Link>
          </div>
        </div>
      ) : null}

      <div className="flex max-w-[min(24rem,calc(100vw-2rem))] items-center gap-1 rounded-full border border-line bg-panel/95 p-1.5 shadow-xl backdrop-blur-xl">
        <button
          type="button"
          onClick={() => void togglePlayback()}
          className={cn(
            "grid size-10 shrink-0 place-items-center rounded-full transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
            playing ? "bg-accent text-on-accent" : "bg-raised text-fg-2 hover:text-fg",
          )}
          aria-label={playing ? (korean ? "배경음악 일시정지" : "Pause background music") : (korean ? "배경음악 재생" : "Play background music")}
          aria-pressed={playing}
        >
          {playing ? <Pause className="size-4" aria-hidden="true" /> : <Play className="size-4" aria-hidden="true" />}
        </button>
        <button
          type="button"
          onClick={toggleExpanded}
          className="flex min-h-10 min-w-0 flex-1 items-center gap-2 rounded-full px-2 text-left hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          aria-expanded={expanded}
        >
          <span className={cn("size-2 shrink-0 rounded-full", playing ? "animate-pulse bg-good" : "bg-fg-3")} aria-hidden="true" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[0.6875rem] font-bold text-fg-3">{sourceLabel(source, korean)}</span>
            <span className="block truncate text-xs font-black text-fg">{activeLabel}</span>
          </span>
          {expanded ? <ChevronDown className="size-4 shrink-0 text-fg-3" aria-hidden="true" /> : <ChevronUp className="size-4 shrink-0 text-fg-3" aria-hidden="true" />}
        </button>
      </div>
    </aside>
  );
}

export default SiteBackgroundMusicPlayer;
