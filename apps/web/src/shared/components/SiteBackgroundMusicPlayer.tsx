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
  SkipForward,
  Sparkles,
  Volume2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";

import {
  loadSiteOstManifest,
  readSiteBgmPreferences,
  resolveSiteBgmExperience,
  resolveSiteOstTrackIndex,
  siteOstTrackToPlaylistEntry,
  type SiteOstIntensity,
  type SiteOstStylePreference,
  type SiteOstTrack,
  type SiteOstVocalPreference,
  writeSiteBgmExpanded,
  writeSiteBgmFollowRoute,
  writeSiteBgmIntensity,
  writeSiteBgmStyle,
  writeSiteBgmVocals,
} from "@/shared/lib/site-background-music";
import { useI18n } from "@/shared/lib/i18n";
import { cn } from "@/shared/lib/utils";

import { SiteOstTrackSelect } from "./SiteOstTrackSelect";

const SITE_ROUTE_SUSPENSION = "site-route-audio-conflict";

const STYLE_OPTIONS: readonly { value: SiteOstStylePreference; ko: string; en: string }[] = [
  { value: "auto", ko: "자동", en: "Auto" },
  { value: "animation", ko: "애니메이션", en: "Animation" },
  { value: "webtoon", ko: "웹툰", en: "Webtoon" },
  { value: "lofi", ko: "Lo-fi", en: "Lo-fi" },
  { value: "cinematic", ko: "시네마틱", en: "Cinematic" },
  { value: "fantasy", ko: "판타지", en: "Fantasy" },
  { value: "citypop", ko: "시티팝", en: "City Pop" },
];
const INTENSITY_OPTIONS: readonly { value: SiteOstIntensity; ko: string; en: string }[] = [
  { value: "chill", ko: "차분", en: "Chill" },
  { value: "normal", ko: "균형", en: "Normal" },
  { value: "epic", ko: "웅장", en: "Epic" },
];
const VOCAL_OPTIONS: readonly { value: SiteOstVocalPreference; ko: string; en: string }[] = [
  { value: "auto", ko: "자동", en: "Auto" },
  { value: "vocal", ko: "보컬", en: "Vocal" },
  { value: "instrumental", ko: "인스트루멘털", en: "Instrumental" },
];

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
    setEnabled: setBgmEnabled,
    next: nextBgm,
    setMood: setBgmMood,
    setVolume: setBgmVolume,
  } = useAmbientBgm();
  const audio = useAudioState();
  const [expanded, setExpanded] = useState(initial.expanded);
  const [followRoute, setFollowRoute] = useState(initial.followRoute);
  const [style, setStyle] = useState<SiteOstStylePreference>(initial.style);
  const [intensity, setIntensity] = useState<SiteOstIntensity>(initial.intensity);
  const [vocals, setVocals] = useState<SiteOstVocalPreference>(initial.vocals);
  const [playlistTracks, setPlaylistTracks] = useState<readonly SiteOstTrack[]>([]);
  const [sourceError, setSourceError] = useState("");
  const suspended = externallySuspended || experience.suspended;
  const hasPublishedOst = playlistTracks.length > 0;

  useEffect(() => {
    if (suspended) suspendBgmForContext(SITE_ROUTE_SUSPENSION);
    else resumeBgmForContext(SITE_ROUTE_SUSPENSION);
  }, [suspended]);

  useEffect(() => () => resumeBgmForContext(SITE_ROUTE_SUSPENSION), []);

  useEffect(() => {
    const controller = new AbortController();
    setSourceError("");
    void loadSiteOstManifest(controller.signal)
      .then((tracks) => {
        if (controller.signal.aborted) return;
        setPlaylistTracks(tracks);
        registerBgmPlaylist(tracks.map(siteOstTrackToPlaylistEntry));
        if (tracks.length === 0) {
          setBgmEnabled(false);
          setSourceError(korean ? "검수 완료된 오리지널 OST가 아직 게시되지 않았습니다." : "No reviewed original OST has been published yet.");
        }
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return;
        registerBgmPlaylist([]);
        setPlaylistTracks([]);
        setBgmEnabled(false);
        setSourceError(reason instanceof Error ? reason.message : (korean ? "오리지널 OST를 불러오지 못했습니다." : "Could not load the original OST."));
      });
    return () => controller.abort();
  }, [korean, setBgmEnabled]);

  useEffect(() => {
    if (!followRoute || suspended || playlistTracks.length === 0) return;
    const index = resolveSiteOstTrackIndex(playlistTracks, experience, { style, intensity, vocals });
    setBgmMood(`playlist:${index}`);
  }, [setBgmMood, experience, followRoute, playlistTracks, style, intensity, vocals, suspended]);

  useEffect(() => {
    if (!bgmEnabled || suspended || !hasPublishedOst) return;
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
  }, [bgmEnabled, hasPublishedOst, setBgmEnabled, suspended]);

  if (suspended) return null;

  const themeLabel = korean ? experience.label : experience.labelEn;
  const themeDescription = korean ? experience.description : experience.descriptionEn;
  const activePlaylistIndex = bgmMoodId.startsWith("playlist:")
    ? Number.parseInt(bgmMoodId.slice("playlist:".length), 10)
    : -1;
  const activeOstTrack = (Number.isInteger(activePlaylistIndex) && activePlaylistIndex >= 0 ? playlistTracks[activePlaylistIndex] : undefined)
    ?? playlistTracks.find((track) => track.title === bgmMood)
    ?? null;
  const activeLabel = activeOstTrack?.title || (hasPublishedOst ? themeLabel : (korean ? "오리지널 OST 준비 중" : "Original OST in production"));
  const playing = hasPublishedOst && bgmEnabled && !audio.muted;

  const togglePlayback = async () => {
    if (!hasPublishedOst) return;
    if (playing) {
      setBgmEnabled(false);
      return;
    }
    if (audio.muted) setMuted(false);
    setSourceError("");
    try {
      await resumeAudio();
      setBgmEnabled(true);
    } catch {
      setBgmEnabled(false);
      setSourceError(korean ? "음악 재생을 시작하지 못했습니다. 재생 버튼을 다시 눌러 주세요." : "Could not start playback. Press play to try again.");
    }
  };

  const chooseFollowRoute = (value: boolean) => {
    setFollowRoute(value);
    writeSiteBgmFollowRoute(value);
    if (value && playlistTracks.length > 0) {
      setBgmMood(`playlist:${resolveSiteOstTrackIndex(playlistTracks, experience, { style, intensity, vocals })}`);
    }
  };

  const chooseStyle = (value: SiteOstStylePreference) => {
    setStyle(value);
    writeSiteBgmStyle(value);
  };
  const chooseIntensity = (value: SiteOstIntensity) => {
    setIntensity(value);
    writeSiteBgmIntensity(value);
  };
  const chooseVocals = (value: SiteOstVocalPreference) => {
    setVocals(value);
    writeSiteBgmVocals(value);
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
      aria-label={korean ? "툰스펙트럼 오리지널 OST" : "ToonSpectrum original OST"}
    >
      {expanded ? (
        <div className="mb-2 w-[min(26rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-line bg-panel/95 shadow-2xl backdrop-blur-xl">
          <div className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.12em] text-accent">
                <Sparkles className="size-3.5" aria-hidden="true" /> TOONSPECTRUM ORIGINAL OST
              </p>
              <p className="mt-1 truncate text-sm font-black text-fg">{themeLabel}</p>
              <p className="mt-1 text-xs leading-5 text-fg-2">{themeDescription}</p>
            </div>
            <button type="button" onClick={toggleExpanded} className="grid size-10 shrink-0 place-items-center rounded-full border border-line text-fg-2 hover:bg-raised hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent" aria-label={korean ? "OST 플레이어 접기" : "Collapse OST player"}>
              <ChevronDown className="size-4" aria-hidden="true" />
            </button>
          </div>

          <div className="max-h-[min(65dvh,38rem)] space-y-4 overflow-y-auto overscroll-contain p-4">
            <div className="rounded-xl border border-accent/25 bg-accent/5 px-3 py-2 text-xs leading-5 text-fg-2">
              <span className="font-black text-accent">{korean ? "오리지널 전용" : "Original only"}</span>
              <span>{korean ? " · 레퍼런스/스톡/브라우저 합성 BGM으로 자동 대체하지 않습니다." : " · No automatic fallback to reference, stock, or browser-synthesized music."}</span>
            </div>

            <label className="flex min-h-10 items-center justify-between gap-3 rounded-xl border border-line bg-card px-3 py-2 text-xs font-semibold text-fg-2">
              <span>{korean ? "페이지 역할에 맞춰 OP · 테마 · ED 자동 전환" : "Follow page role with opening, theme and ending"}</span>
              <input type="checkbox" checked={followRoute} onChange={(event) => chooseFollowRoute(event.target.checked)} className="size-4 accent-[var(--color-accent)]" />
            </label>

            <div className="grid grid-cols-3 gap-2">
              <label className="text-[0.6875rem] font-semibold text-fg-2">
                {korean ? "스타일" : "Style"}
                <select aria-label={korean ? "OST 스타일" : "OST style"} className="mt-1 min-h-10 w-full rounded-xl border border-line bg-card px-2 text-xs text-fg outline-none focus:border-accent" value={style} onChange={(event) => chooseStyle(event.target.value as SiteOstStylePreference)}>
                  {STYLE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{korean ? option.ko : option.en}</option>)}
                </select>
              </label>
              <label className="text-[0.6875rem] font-semibold text-fg-2">
                {korean ? "강도" : "Intensity"}
                <select aria-label={korean ? "OST 강도" : "OST intensity"} className="mt-1 min-h-10 w-full rounded-xl border border-line bg-card px-2 text-xs text-fg outline-none focus:border-accent" value={intensity} onChange={(event) => chooseIntensity(event.target.value as SiteOstIntensity)}>
                  {INTENSITY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{korean ? option.ko : option.en}</option>)}
                </select>
              </label>
              <label className="text-[0.6875rem] font-semibold text-fg-2">
                {korean ? "보컬" : "Vocal"}
                <select aria-label={korean ? "OST 보컬" : "OST vocal"} className="mt-1 min-h-10 w-full rounded-xl border border-line bg-card px-2 text-xs text-fg outline-none focus:border-accent" value={vocals} onChange={(event) => chooseVocals(event.target.value as SiteOstVocalPreference)}>
                  {VOCAL_OPTIONS.map((option) => <option key={option.value} value={option.value}>{korean ? option.ko : option.en}</option>)}
                </select>
              </label>
            </div>

            <SiteOstTrackSelect tracks={playlistTracks} activeTrack={activeOstTrack} korean={korean} onSelect={(id) => {
              const index = playlistTracks.findIndex((track) => track.id === id);
              if (index < 0) return;
              chooseFollowRoute(false);
              setBgmMood(`playlist:${index}`);
            }} />

            <label className="block text-xs font-semibold text-fg-2">
              <span className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5"><Volume2 className="size-3.5" aria-hidden="true" />{korean ? "OST 음량" : "OST volume"}</span>
                <span className="font-black text-fg">{Math.round(bgmVolume * 100)}%</span>
              </span>
              <input aria-label={korean ? "OST 음량" : "OST volume"} type="range" min={0} max={1} step={0.05} value={bgmVolume} onChange={(event) => setBgmVolume(Number(event.target.value))} className="mt-2 w-full accent-[var(--color-accent)]" disabled={!hasPublishedOst} />
            </label>

            <div className="flex items-center gap-2">
              <button type="button" onClick={() => void togglePlayback()} disabled={!hasPublishedOst} className={cn("inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl px-4 text-sm font-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent", hasPublishedOst ? "bg-accent text-on-accent hover:opacity-90" : "cursor-not-allowed bg-raised text-fg-3")}>
                {playing ? <Pause className="size-4" aria-hidden="true" /> : <Play className="size-4" aria-hidden="true" />}
                {playing ? (korean ? "잠시 멈춤" : "Pause") : hasPublishedOst ? (korean ? "음악 재생" : "Play music") : (korean ? "OST 제작 중" : "OST in production")}
              </button>
              <button type="button" disabled={!hasPublishedOst} onClick={() => { chooseFollowRoute(false); nextBgm(); }} className="grid size-11 shrink-0 place-items-center rounded-xl border border-line bg-card text-fg-2 hover:bg-raised hover:text-fg disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent" aria-label={korean ? "다음 OST" : "Next OST"}>
                <SkipForward className="size-4" aria-hidden="true" />
              </button>
            </div>

            <div className="rounded-xl border border-line bg-card px-3 py-3 text-xs leading-5 text-fg-2" aria-live="polite">
              {activeOstTrack ? (
                <div className="mb-2 flex flex-wrap gap-1.5">
                  <span className="rounded-full border border-accent/30 bg-accent/10 px-2 py-0.5 font-black text-accent">{roleLabel(activeOstTrack.role, korean)}</span>
                  <span className="rounded-full border border-good/30 bg-good/10 px-2 py-0.5 font-black text-good">ORIGINAL</span>
                  <span className="rounded-full border border-line px-2 py-0.5 text-fg-3">{activeOstTrack.vocalMode === "vocal" ? (korean ? "보컬" : "Vocal") : (korean ? "인스트루멘털" : "Instrumental")}</span>
                  <span className="rounded-full border border-line px-2 py-0.5 text-fg-3">{activeOstTrack.bpm} BPM</span>
                </div>
              ) : null}
              <p className="truncate font-bold text-fg">{playing ? "● " : "○ "}{activeLabel}</p>
              {activeOstTrack?.summary ? <p className="mt-1 text-fg-3">{activeOstTrack.summary}</p> : null}
              {bgmArtist ? <p className="mt-1 truncate">{bgmArtist}</p> : null}
              {activeOstTrack ? <p className="mt-1 text-fg-3">{activeOstTrack.provider === "ace-step" ? "ACE-Step 1.5 · Local generation recorded" : "Eleven Music v2.5 · C2PA requested"} · SHA {activeOstTrack.sha256.slice(0, 10)}…</p> : null}
              {bgmCreditUrl ? (
                <a href={bgmCreditUrl} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex min-h-7 items-center gap-1 text-accent underline underline-offset-4">
                  {korean ? "생성 출처·이용 조건" : "Generation provenance and terms"}<ExternalLink className="size-3" aria-hidden="true" />
                </a>
              ) : null}
              {sourceError ? <p className="mt-2 text-warn">{sourceError}</p> : null}
            </div>

            <Link to="/studio/assets/audio" className="inline-flex min-h-9 items-center gap-1.5 text-xs font-bold text-accent underline underline-offset-4">
              <Music2 className="size-3.5" aria-hidden="true" />
              {korean ? "내 작품의 오리지널 애니 OST 만들기" : "Create an original anime OST for my story"}
            </Link>
          </div>
        </div>
      ) : null}

      <div className="flex max-w-[min(26rem,calc(100vw-2rem))] items-center gap-1 rounded-full border border-line bg-panel/95 p-1.5 shadow-xl backdrop-blur-xl">
        <button type="button" onClick={() => void togglePlayback()} disabled={!hasPublishedOst} className={cn("grid size-11 shrink-0 place-items-center rounded-full transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent", !hasPublishedOst ? "cursor-not-allowed bg-raised text-fg-3" : playing ? "bg-accent text-on-accent" : "bg-raised text-fg-2 hover:text-fg")} aria-label={playing ? (korean ? "OST 일시정지" : "Pause OST") : (korean ? "OST 재생" : "Play OST")} aria-pressed={playing}>
          {playing ? <Pause className="size-4" aria-hidden="true" /> : <Play className="size-4" aria-hidden="true" />}
        </button>
        <button type="button" onClick={toggleExpanded} className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-full px-2 text-left hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent" aria-expanded={expanded}>
          <span className={cn("size-2 shrink-0 rounded-full", playing ? "animate-pulse bg-good" : hasPublishedOst ? "bg-fg-3" : "bg-warn")} aria-hidden="true" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[0.6875rem] font-bold text-fg-3">{korean ? "오리지널 애니·웹툰 OST" : "Original animation · webtoon OST"}</span>
            <span className="block truncate text-xs font-black text-fg">{activeLabel}</span>
          </span>
          {expanded ? <ChevronDown className="size-4 shrink-0 text-fg-3" aria-hidden="true" /> : <ChevronUp className="size-4 shrink-0 text-fg-3" aria-hidden="true" />}
        </button>
      </div>
    </aside>
  );
}

export default SiteBackgroundMusicPlayer;
