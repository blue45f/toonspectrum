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
  loadSiteOstManifest,
  resolveSiteOstTrackIndex,
  siteOstTrackToPlaylistEntry,
  readSiteBgmPreferences,
  resolveSiteBgmExperience,
  type SiteBgmSource,
  type SiteOstTrack,
  writeSiteBgmExpanded,
  writeSiteBgmFollowRoute,
  writeSiteBgmSource,
} from "@/shared/lib/site-background-music";
import { cn } from "@/shared/lib/utils";
import { useI18n } from "@/shared/lib/i18n";

const SITE_ROUTE_SUSPENSION = "site-route-audio-conflict";

function sourceLabel(source: SiteBgmSource, korean: boolean): string {
  if (source === "original-ost") return korean ? "오리지널 애니 OST" : "Original anime OST";
  return korean ? "집중용 인스트" : "Focus instrumental";
}

function roleLabel(role: SiteOstTrack["role"], korean: boolean): string {
  const labels: Record<SiteOstTrack["role"], readonly [string, string]> = {
    opening: ["오프닝", "Opening"], creator: ["창작자 테마", "Creator theme"],
    story: ["메인 테마", "Main theme"], action: ["액션 테마", "Action theme"],
    romance: ["캐릭터 송", "Character song"], ending: ["엔딩", "Ending"],
  };
  return labels[role][korean ? 0 : 1];
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
  const [playlistTracks, setPlaylistTracks] = useState<readonly SiteOstTrack[]>([]);
  const [sourceError, setSourceError] = useState("");
  const suspended = externallySuspended || experience.suspended;

  useEffect(() => {
    if (suspended) suspendBgmForContext(SITE_ROUTE_SUSPENSION);
    else resumeBgmForContext(SITE_ROUTE_SUSPENSION);
  }, [suspended]);

  useEffect(() => () => resumeBgmForContext(SITE_ROUTE_SUSPENSION), []);

  useEffect(() => {
    if (source === "focus-instrumental") {
      registerBgmPlaylist([]);
      setPlaylistTracks([]);
      return;
    }

    const controller = new AbortController();
    setSourceError("");
    void loadSiteOstManifest(controller.signal)
      .then((tracks) => {
        if (controller.signal.aborted) return;
        if (tracks.length === 0) throw new Error("사용 가능한 사이트 OST가 없습니다.");
        setPlaylistTracks(tracks);
        registerBgmPlaylist(tracks.map(siteOstTrackToPlaylistEntry));
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return;
        registerBgmPlaylist([]);
        setPlaylistTracks([]);
        setSource("focus-instrumental");
        writeSiteBgmSource("focus-instrumental");
        setSourceError(reason instanceof Error ? reason.message : "사이트 OST를 불러오지 못했습니다.");
      });
    return () => controller.abort();
  }, [source]);

  useEffect(() => {
    if (!followRoute || suspended) return;
    if (source === "focus-instrumental") {
      setBgmMood(experience.moodId);
      return;
    }
    if (playlistTracks.length > 0) setBgmMood(`playlist:${resolveSiteOstTrackIndex(playlistTracks, experience)}`);
  }, [setBgmMood, experience, followRoute, playlistTracks, source, suspended]);

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
  const activePlaylistIndex = bgmMoodId.startsWith("playlist:")
    ? Number.parseInt(bgmMoodId.slice("playlist:".length), 10)
    : -1;
  const activeOstTrack = source === "original-ost"
    ? (Number.isInteger(activePlaylistIndex) && activePlaylistIndex >= 0 ? playlistTracks[activePlaylistIndex] : undefined)
      ?? playlistTracks.find((track) => track.title === bgmMood)
      ?? null
    : null;
  const activeLabel = activeOstTrack?.title || bgmMood || themeLabel;
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
      if (source === "focus-instrumental") setBgmMood(experience.moodId);
      if (source === "original-ost" && playlistTracks.length > 0) {
        setBgmMood(`playlist:${resolveSiteOstTrackIndex(playlistTracks, experience)}`);
      }
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
      aria-label={korean ? "사이트 애니 OST" : "Site anime OST"}
    >
      {expanded ? (
        <div className="mb-2 w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-line bg-panel/95 shadow-2xl backdrop-blur-xl">
          <div className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.12em] text-accent">
                <Sparkles className="size-3.5" aria-hidden="true" />
                {korean ? "TOONSPECTRUM ORIGINAL OST" : "TOONSPECTRUM ORIGINAL OST"}
              </p>
              <p className="mt-1 truncate text-sm font-black text-fg">{themeLabel}</p>
              <p className="mt-1 text-xs leading-5 text-fg-2">{themeDescription}</p>
            </div>
            <button
              type="button"
              onClick={toggleExpanded}
              className="grid size-10 shrink-0 place-items-center rounded-full border border-line text-fg-2 hover:bg-raised hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              aria-label={korean ? "OST 플레이어 접기" : "Collapse OST player"}
            >
              <ChevronDown className="size-4" aria-hidden="true" />
            </button>
          </div>

          <div className="space-y-4 p-4">
            <div className="grid grid-cols-2 gap-2" role="group" aria-label={korean ? "음악 소스" : "Music source"}>
              {(["original-ost", "focus-instrumental"] as const).map((value) => (
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
                  {value === "focus-instrumental" ? <Music2 className="mr-1.5 inline size-3.5" aria-hidden="true" /> : <Radio className="mr-1.5 inline size-3.5" aria-hidden="true" />}
                  {sourceLabel(value, korean)}
                </button>
              ))}
            </div>

            <label className="flex min-h-10 items-center justify-between gap-3 rounded-xl border border-line bg-card px-3 py-2 text-xs font-semibold text-fg-2">
              <span>{korean ? "페이지 역할에 맞춰 OP · 테마 · ED 자동 전환" : "Follow page role with opening, theme and ending"}</span>
              <input
                type="checkbox"
                checked={followRoute}
                onChange={(event) => chooseFollowRoute(event.target.checked)}
                className="size-4 accent-[var(--color-accent)]"
              />
            </label>

            {source === "focus-instrumental" ? (
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
                <span className="flex items-center gap-1.5"><Volume2 className="size-3.5" aria-hidden="true" />{korean ? "OST 음량" : "OST volume"}</span>
                <span className="font-black text-fg">{Math.round(bgmVolume * 100)}%</span>
              </span>
              <input
                aria-label={korean ? "OST 음량" : "OST volume"}
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
                aria-label={korean ? "다음 OST" : "Next OST"}
              >
                <SkipForward className="size-4" aria-hidden="true" />
              </button>
            </div>

            <div className="rounded-xl border border-line bg-card px-3 py-3 text-xs leading-5 text-fg-2" aria-live="polite">
              {activeOstTrack ? (
                <div className="mb-2 flex flex-wrap gap-1.5">
                  <span className="rounded-full border border-accent/30 bg-accent/10 px-2 py-0.5 font-black text-accent">{roleLabel(activeOstTrack.role, korean)}</span>
                  <span className={cn("rounded-full border px-2 py-0.5 font-black", activeOstTrack.origin === "original" ? "border-good/30 bg-good/10 text-good" : "border-warn/30 bg-warn/10 text-warn")}>
                    {activeOstTrack.origin === "original" ? "ORIGINAL" : "REFERENCE DEMO"}
                  </span>
                  <span className="rounded-full border border-line px-2 py-0.5 text-fg-3">{activeOstTrack.vocalMode === "vocal" ? (korean ? "보컬" : "Vocal") : activeOstTrack.vocalMode === "instrumental" ? (korean ? "연주" : "Instrumental") : (korean ? "보컬 여부 확인 중" : "Vocal status unknown")}</span>
                </div>
              ) : null}
              <p className="truncate font-bold text-fg">{playing ? "● " : "○ "}{activeLabel}</p>
              {activeOstTrack?.summary ? <p className="mt-1 text-fg-3">{activeOstTrack.summary}</p> : null}
              {bgmArtist ? <p className="mt-1 truncate">{bgmArtist}</p> : null}
              {activeOstTrack?.origin === "licensed-reference" ? (
                <p className="mt-2 rounded-lg border border-warn/30 bg-warn/5 px-2 py-1.5 text-warn">{korean ? "현재는 임시 레퍼런스 음원입니다. 생성된 ToonSpectrum 오리지널 OST가 게시되면 같은 역할의 곡을 자동 우선 재생합니다." : "This is a temporary reference track. A published ToonSpectrum original will automatically take priority for the same role."}</p>
              ) : null}
              {bgmCreditUrl ? (
                <a href={bgmCreditUrl} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex min-h-7 items-center gap-1 text-accent underline underline-offset-4">
                  {korean ? "음원 출처·이용 조건" : "Track source and terms"}<ExternalLink className="size-3" aria-hidden="true" />
                </a>
              ) : null}
              {sourceError ? <p className="mt-1 text-warn">{sourceError}</p> : null}
            </div>

            <Link to="/studio/assets/audio" className="inline-flex min-h-9 items-center gap-1.5 text-xs font-bold text-accent underline underline-offset-4">
              <Music2 className="size-3.5" aria-hidden="true" />
              {korean ? "내 작품의 오리지널 애니 OST 만들기" : "Create an original anime OST for my story"}
            </Link>
          </div>
        </div>
      ) : null}

      <div className="flex max-w-[min(24rem,calc(100vw-2rem))] items-center gap-1 rounded-full border border-line bg-panel/95 p-1.5 shadow-xl backdrop-blur-xl">
        <button
          type="button"
          onClick={() => void togglePlayback()}
          className={cn(
            "grid size-11 shrink-0 place-items-center rounded-full transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
            playing ? "bg-accent text-on-accent" : "bg-raised text-fg-2 hover:text-fg",
          )}
          aria-label={playing ? (korean ? "OST 일시정지" : "Pause OST") : (korean ? "OST 재생" : "Play OST")}
          aria-pressed={playing}
        >
          {playing ? <Pause className="size-4" aria-hidden="true" /> : <Play className="size-4" aria-hidden="true" />}
        </button>
        <button
          type="button"
          onClick={toggleExpanded}
          className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-full px-2 text-left hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
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
