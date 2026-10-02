import {
  formatI18nTemplate,
  translateCurrentStaticSourceText,
  useBilingual,
} from "@/shared/lib/i18n-bilingual-copy";
import {
  ArrowLeft,
  BookOpenText,
  Headphones,
  Music4,
  RotateCcw,
  Sparkles,
  Square,
  WandSparkles,
  X,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type FormEvent,
} from "react";
import { Link, useSearchParams } from "react-router-dom";

import { MusicExternalImportPanel } from "./MusicExternalImportPanel";
import { MusicOstFlow } from "./MusicOstFlow";
import { MusicProviderToolkit } from "./MusicProviderToolkit";
import { MusicPublicationHint, MusicPublicationPanel } from "./MusicPublicationPanel";
import { MusicTrackCard } from "./MusicTrackCard";
import { ANIME_OST_STARTERS } from "./studio-anime-ost-presets";
import { generateMusic, getMusicStatus } from "./studio-music-client";
import { deleteMusicTrack, loadMusicTracks, saveMusicTrack } from "./studio-music-library";
import {
  buildMusicLyricsUserPrompt,
  MUSIC_LYRICS_SYSTEM_PROMPT,
  normalizeGeneratedLyrics,
} from "./studio-music-lyrics";
import { musicOstFlow } from "./music-ost-flow";
import { jumpToMusicSection } from "./music-section-jump";
import { createMusicRecovery } from "./studio-music-recovery";
import {
  readMusicEpisodeId,
  readMusicWorkId,
  scopeMusicBrief,
} from "./studio-music-work-scope";

import type { LocalMusicTrack } from "./studio-music-client";

import {
  applyMusicThemePack,
  buildMusicPrompt,
  defaultMusicBrief,
  MUSIC_ARCS,
  MUSIC_DURATIONS,
  MUSIC_INSTRUMENTS,
  MUSIC_INTENSITIES,
  MUSIC_LYRIC_LANGUAGES,
  MUSIC_MOODS,
  MUSIC_PURPOSES,
  MUSIC_SONG_STRUCTURES,
  MUSIC_TERMS_URL,
  MUSIC_THEME_PACKS,
  MUSIC_VOCAL_STYLES,
  parseMusicBrief,
  type MusicBrief,
  type MusicStatus,
} from "@toonstudio/core/studio-music";
import { useSession } from "@/domains/auth/public/session/auth-session-store";
import { getApiErrorMessage } from "@/platform/api";
import { AiRecoveryNotice } from "@/shared/ai/AiRecoveryNotice";
import { completeAutomaticFreeText } from "@/domains/creator/studio-server-ai-client";
import { cn } from "@/shared/lib/utils";

const inputClass = "w-full rounded-xl border border-line bg-canvas px-3 py-2.5 text-sm text-fg outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50";
const buttonClass = "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-line px-4 py-2 text-sm transition-colors hover:bg-panel focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50";

function StudioMusicWorkspace({ ownerId }: { readonly ownerId: string }) {
  const bt = useBilingual("StudioMusicPage");
  const [params] = useSearchParams();
  const workId = readMusicWorkId(params.get("workId"));
  const episodeId = readMusicEpisodeId(params.get("episodeId"), workId);
  const [brief, setBrief] = useState<MusicBrief>(() => ({
    ...defaultMusicBrief(),
    title: "나의 첫 오리지널 OST",
    purpose: "opening",
    bpm: 138,
    instruments: ["guitar", "drums", "synth", "strings"],
    vocals: true,
    vocalStyle: "bright-heroine",
    songStructure: "anime-op",
    lyricTheme: "작품의 첫 페이지를 함께 열어가는 청춘과 도전",
    intensity: "cinematic",
    arc: "build",
    workId,
    episodeId,
  }));
  const [status, setStatus] = useState<MusicStatus | null>(null);
  const [statusError, setStatusError] = useState("");
  const [statusAttempt, setStatusAttempt] = useState(0);
  const [recovery] = useState(() => createMusicRecovery(ownerId, {
    load: loadMusicTracks,
    save: saveMusicTrack,
    remove: deleteMusicTrack,
  }));
  const library = useSyncExternalStore(
    recovery.subscribe,
    recovery.getSnapshot,
    recovery.getSnapshot,
  );
  const { tracks, savedIds, pendingIds } = library;
  const libraryLoading = Boolean(ownerId)
    && (library.loading || (!library.loaded && !library.loadError));
  const [busy, setBusy] = useState(false);
  const [savingTrack, setSavingTrack] = useState(false);
  const [lyricsBusy, setLyricsBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [onlyWork, setOnlyWork] = useState(Boolean(workId));
  const [onlyEpisode, setOnlyEpisode] = useState(Boolean(episodeId));
  const [query, setQuery] = useState("");
  const [bgmLinkedTrackId, setBgmLinkedTrackId] = useState("");
  const pending = useRef<AbortController | null>(null);
  const lyricsPending = useRef<AbortController | null>(null);
  const lyricsDraft = useRef("");
  const formRef = useRef<HTMLFormElement>(null);
  const unsavedCount = tracks.filter((track) => !savedIds.includes(track.metadata.id)).length;
  const needsLeaveWarning = busy || lyricsBusy || pendingIds.length > 0 || unsavedCount > 0;

  useEffect(() => {
    const controller = new AbortController();
    setStatus(null);
    setStatusError("");
    void getMusicStatus(controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) setStatus(value);
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setStatusError("음악 서비스에 연결하지 못했습니다. 아직 생성 요청은 보내지 않았습니다.");
        }
      });
    return () => controller.abort();
  }, [statusAttempt]);

  useEffect(() => {
    if (ownerId) void recovery.load().catch(() => undefined);
  }, [ownerId, recovery]);

  useEffect(() => {
    // Route changes must not remount the account library or discard unsaved paid output.
    // A lyric draft belongs to the scene that requested it, so never carry a late response
    // into a different episode scope.
    lyricsPending.current?.abort();
    setBrief((previous) => previous.workId === workId && previous.episodeId === episodeId
      ? previous
      : scopeMusicBrief(previous, workId, episodeId));
    setOnlyWork(Boolean(workId));
    setOnlyEpisode(Boolean(episodeId));
    setBgmLinkedTrackId("");
  }, [episodeId, workId]);

  useEffect(() => () => {
    pending.current?.abort();
    lyricsPending.current?.abort();
    pending.current = null;
    lyricsPending.current = null;
  }, []);

  useEffect(() => {
    if (!needsLeaveWarning) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [needsLeaveWarning]);

  const patch = (next: Partial<MusicBrief>) => {
    setBrief((previous) => ({ ...previous, ...next }));
  };

  const applyTheme = (themeId: string) => {
    setBrief((previous) => applyMusicThemePack(previous, themeId));
    setNotice("웹툰 테마의 분위기·악기·템포·감정 곡선을 적용했습니다. 장면에 맞게 세부 값을 조정하세요.");
    setError("");
  };

  const chooseCreationMode = (vocals: boolean) => {
    if (!vocals) lyricsDraft.current = brief.lyrics || lyricsDraft.current;
    setBrief((previous) => ({
      ...previous,
      vocals,
      lyrics: vocals ? (previous.lyrics || lyricsDraft.current) : "",
      purpose: vocals
        ? (["opening", "ending", "ost"].includes(previous.purpose) ? previous.purpose : "opening")
        : "bgm",
      rightsConfirmed: false,
    }));
    setNotice(vocals
      ? "보컬 애니 OST 모드입니다. OP·ED·캐릭터 테마 프리셋과 AI 가사를 조합해 한 곡처럼 설계하세요."
      : "장면 BGM 모드입니다. 대사와 독서를 방해하지 않는 연주 중심으로 생성합니다.");
    setError("");
  };

  const applyAnimeOstStarter = (starterId: string) => {
    const starter = ANIME_OST_STARTERS.find((entry) => entry.id === starterId);
    if (!starter) return;
    setBrief((previous) => ({
      ...previous,
      ...starter.patch,
      scene: previous.scene.trim() || MUSIC_MOODS.find((entry) => entry.id === starter.patch.mood)?.scene || previous.scene,
      lyrics: previous.lyrics || lyricsDraft.current,
      rightsConfirmed: false,
    }));
    setNotice(`${starter.label}의 곡 구조·보컬·악기·템포를 적용했습니다. 장면과 가사를 작품에 맞게 바꿔 주세요.`);
    setError("");
  };

  const cancel = () => {
    pending.current?.abort();
    setNotice("생성 응답 수신을 취소했습니다. 공급자가 이미 처리한 요청은 과금될 수 있으며 자동으로 다시 요청하지 않습니다.");
  };

  const cancelLyrics = () => {
    lyricsPending.current?.abort();
    setNotice("AI 가사 초안 요청을 취소했습니다.");
  };

  const generateLyrics = async () => {
    if (lyricsPending.current || busy || !brief.scene.trim()) {
      if (!brief.scene.trim()) setError("AI 가사 초안을 만들려면 장면 설명을 먼저 입력해 주세요.");
      return;
    }
    setError("");
    setNotice("");
    const controller = new AbortController();
    lyricsPending.current = controller;
    setLyricsBusy(true);
    try {
      const result = await completeAutomaticFreeText(
        MUSIC_LYRICS_SYSTEM_PROMPT,
        buildMusicLyricsUserPrompt(brief),
        controller.signal,
      );
      if (controller.signal.aborted) return;
      if (!result.ok) {
        setError(result.error);
        return;
      }
      const lyrics = normalizeGeneratedLyrics(result.data.content);
      lyricsDraft.current = lyrics;
      patch({ vocals: true, lyrics, rightsConfirmed: false });
      setNotice(`AI 가사 초안을 만들었습니다 · ${result.data.provider} / ${result.data.model}. 작품 설정에 맞게 검토·수정하고 권리 확인을 다시 체크하세요.`);
    } catch (reason) {
      if (!controller.signal.aborted) {
        setError(reason instanceof Error ? reason.message : "AI 가사 초안을 만들지 못했습니다.");
      }
    } finally {
      if (lyricsPending.current === controller) {
        lyricsPending.current = null;
        setLyricsBusy(false);
      }
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const currentLibrary = recovery.getSnapshot();
    if (
      pending.current
      || lyricsPending.current
      || currentLibrary.loading
      || !currentLibrary.loaded
      || currentLibrary.loadError
      || currentLibrary.pendingIds.length
      || brief.workId !== workId
      || brief.episodeId !== episodeId
      || !ownerId
      || !status?.enabled
    ) return;
    setError("");
    setNotice("");
    let parsed: MusicBrief;
    try {
      parsed = parseMusicBrief({ ...brief, workId, episodeId });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "입력을 확인해 주세요.");
      return;
    }
    if (currentLibrary.tracks.length >= 20) {
      setError("보관함의 기존 곡을 다운로드한 뒤 삭제해 공간을 확보해 주세요. 최대 20곡입니다.");
      return;
    }
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true);
    try {
      const track = await generateMusic(
        parsed,
        ownerId,
        crypto.randomUUID(),
        controller.signal,
      );
      if (controller.signal.aborted) return;
      recovery.retain(track);
      setQuery("");
      setOnlyWork(false);
      setOnlyEpisode(false);
      setSavingTrack(true);
      try {
        await recovery.save(track.metadata.id);
        if (!controller.signal.aborted) {
          setNotice("음원을 생성해 이 기기에 저장했습니다. 재생 버튼으로 들어보세요.");
        }
      } catch (reason) {
        if (!controller.signal.aborted) {
          setNotice(`음원은 생성됐지만 저장 완료를 확인하지 못했습니다. MP3를 먼저 다운로드하거나 같은 음원을 기기에 다시 저장해 주세요. ${reason instanceof Error ? reason.message : ""}`);
        }
      }
    } catch (reason) {
      if (controller.signal.aborted) return;
      const message = await getApiErrorMessage(
        reason,
        "음악 생성에 실패했습니다. 자동 재시도하지 않습니다.",
      );
      if (!controller.signal.aborted) setError(message);
    } finally {
      if (pending.current === controller) {
        pending.current = null;
        setBusy(false);
        setSavingTrack(false);
      }
    }
  };

  const saveAgain = async (track: LocalMusicTrack) => {
    if (pending.current) throw new Error("진행 중인 음악 생성을 마친 뒤 저장해 주세요.");
    await recovery.save(track.metadata.id);
    setNotice("기존 음원을 기기에 저장했습니다. 외부 AI 생성 요청은 보내지 않았습니다.");
  };

  const remove = async (track: LocalMusicTrack) => {
    if (pending.current) throw new Error("진행 중인 음악 생성을 마친 뒤 삭제해 주세요.");
    await recovery.remove(track.metadata.id);
    setNotice("이 기기의 음원을 삭제했습니다.");
  };

  const refresh = async () => {
    if (pending.current) return;
    try {
      await recovery.load();
      setNotice("보관함을 다시 확인했습니다. 저장되지 않은 음원도 화면에 유지됩니다.");
    } catch {
      // The store exposes its read error without discarding existing output.
    }
  };

  const importExternalTrack = async (track: LocalMusicTrack) => {
    const currentLibrary = recovery.getSnapshot();
    if (pending.current || lyricsPending.current || currentLibrary.loading || !currentLibrary.loaded
      || currentLibrary.loadError || currentLibrary.pendingIds.length) {
      throw new Error("진행 중인 생성·저장을 마친 뒤 외부 음원을 가져와 주세요.");
    }
    if (currentLibrary.tracks.length >= 20) {
      throw new Error("보관함은 계정당 20곡까지입니다. 기존 음원을 다운로드한 뒤 삭제해 주세요.");
    }
    recovery.retain(track);
    setQuery("");
    setOnlyWork(false);
    setOnlyEpisode(false);
    setSavingTrack(true);
    try {
      await recovery.save(track.metadata.id);
    } catch (reason) {
      setNotice("파일은 화면에 유지되지만 기기 저장 완료를 확인하지 못했습니다. 먼저 음원 파일을 별도로 보관해 주세요.");
      throw reason;
    } finally {
      setSavingTrack(false);
    }
  };

  const preview = (() => {
    try {
      return buildMusicPrompt({ ...brief, rightsConfirmed: true });
    } catch {
      return "장면 설명과 음악 설정을 입력하면 생성 프롬프트를 확인할 수 있어요.";
    }
  })();

  const visibleTracks = tracks.filter((track) => {
    const matchesWork = !onlyWork || !workId || track.metadata.brief.workId === workId;
    const matchesEpisode = !onlyEpisode
      || !episodeId
      || track.metadata.brief.episodeId === episodeId;
    const matchesQuery = `${track.metadata.brief.title} ${track.metadata.brief.scene}`
      .toLocaleLowerCase()
      .includes(query.toLocaleLowerCase());
    return matchesWork && matchesEpisode && matchesQuery;
  });

  const publicationTracks = useMemo(
    () => workId ? tracks.filter((track) => track.metadata.brief.workId === workId) : [],
    [tracks, workId],
  );

  const flow = musicOstFlow({
    briefReady: Boolean(brief.title.trim() && brief.scene.trim()),
    trackCount: tracks.length,
    savedCount: savedIds.length,
    bgmLinked: Boolean(bgmLinkedTrackId),
  });

  const routeScope = workId
    ? episodeId
      ? `새 음악 연결 작품: ${workId} · 회차: ${episodeId}`
      : `새 음악 연결 작품: ${workId}`
    : "새 음악은 특정 작품에 연결하지 않습니다.";

  return (
    <div className="mx-auto w-full max-w-[92rem] space-y-7 break-keep px-4 py-6 text-fg sm:px-6 lg:py-10" data-testid="studio-music-page">
      <header className="relative overflow-hidden rounded-[2rem] border border-line bg-[radial-gradient(circle_at_0%_0%,color-mix(in_oklch,var(--color-accent)_20%,transparent),transparent_46%),radial-gradient(circle_at_100%_0%,color-mix(in_oklch,var(--color-accent-2)_14%,transparent),transparent_40%),var(--color-card)] p-5 sm:p-8">
        <Link
          to={workId ? formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.music.StudioMusicPage", "en", "/create/{v0}"), { v0: String(encodeURIComponent(workId)) }) : "/studio"}
          reloadDocument={!workId}
          onClick={(event) => {
            if (needsLeaveWarning && !window.confirm(bt("생성·저장이 진행 중이거나 저장 확인이 필요한 음원이 있습니다. MP3를 먼저 보관해 주세요. 그래도 나갈까요?", "Audio is still generating or waiting for save confirmation. Keep your MP3 first. Leave anyway?"))) {
              event.preventDefault();
            }
          }}
          className="relative mb-5 inline-flex min-h-11 items-center gap-2 text-sm text-fg-2 hover:text-accent"
        >
          <ArrowLeft size={16} aria-hidden />
          {workId ? bt("작품으로 돌아가기", "Back to the work") : bt("툰스튜디오로", "Back to ToonStudio")}
        </Link>
        <div className="relative grid gap-6 lg:grid-cols-[minmax(0,1fr)_16rem] lg:items-end">
          <div className="min-w-0">
            <p className="mb-3 flex items-center gap-2 text-xs font-semibold tracking-widest text-accent">
              <Headphones size={16} aria-hidden />TOONSTUDIO ORIGINAL ANIME OST
            </p>
            <h1 className="text-[1.75rem] font-bold leading-tight sm:text-4xl">
              {bt("웹툰을 한 편의 애니처럼,", "Score your webtoon like an anime,")}<br className="sm:hidden" /> {bt("나만의 보컬 OST로.", "with your own vocal OST.")}
            </h1>
            <p className="mt-3 max-w-3xl break-keep text-[0.9375rem] leading-7 text-fg-2 sm:text-base">
              {bt("오프닝·엔딩·캐릭터 송부터 장면 BGM까지, 작품의 세계관과 장면 감정에 맞는 오리지널 애니풍 OST를 만드세요. 기존 곡은 흉내 내지 않아요.", "From openings and endings to character songs and scene BGM — build an original anime-style OST that fits your world and scene emotion, never imitating existing songs.")}
            </p>
          </div>
          <ul className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 text-xs text-fg-2 [scrollbar-width:thin] lg:mx-0 lg:flex-col lg:items-stretch lg:overflow-visible lg:px-0 lg:pb-0" aria-label={bt("제작 도구 구성", "What's included")}>
            <li className="shrink-0 whitespace-nowrap rounded-full border border-line bg-canvas/40 px-3 py-1.5">{bt("7개 애니 OST 스타터", "7 anime OST starters")}</li>
            <li className="shrink-0 whitespace-nowrap rounded-full border border-line bg-canvas/40 px-3 py-1.5">{bt("OP · ED · 캐릭터 · 배틀 테마", "OP · ED · character · battle themes")}</li>
            <li className="shrink-0 whitespace-nowrap rounded-full border border-line bg-canvas/40 px-3 py-1.5">{bt("보컬 스타일 + AI 가사", "Vocal styles + AI lyrics")}</li>
            <li className="shrink-0 whitespace-nowrap rounded-full border border-line bg-canvas/40 px-3 py-1.5">Eleven Music v2.5</li>
          </ul>
        </div>
        <MusicOstFlow steps={flow} workLinked={Boolean(workId)} />
      </header>

      <section aria-label={translateCurrentStaticSourceText("domains.creator.music.StudioMusicPage", "ko", "음악 서비스 상태")} className="rounded-xl border border-line bg-panel/40 p-4 text-sm leading-relaxed">
        {statusError ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p>{statusError}</p>
            <button type="button" className={buttonClass} onClick={() => setStatusAttempt((value) => value + 1)}>
              {translateCurrentStaticSourceText("domains.creator.music.StudioMusicPage", "ko", "연결 다시 확인")}</button>
          </div>
        ) : !status ? (
          <p role="status">{translateCurrentStaticSourceText("domains.creator.music.StudioMusicPage", "ko", "음악 서비스 연결을 확인하고 있습니다.")}</p>
        ) : !status.enabled ? (
          <p><strong>{translateCurrentStaticSourceText("domains.creator.music.StudioMusicPage", "ko", "음악 생성 연결 준비 중")}</strong> {translateCurrentStaticSourceText("domains.creator.music.StudioMusicPage", "ko", "— 운영자의 음악 API·이용 조건·사용량 제한 설정이 필요합니다. 아래에서 장면과 음악 설정을 미리 구성할 수 있습니다. 데모 음원을 AI 결과로 표시하지 않습니다.")}</p>
        ) : (
          <p><strong>{translateCurrentStaticSourceText("domains.creator.music.StudioMusicPage", "ko", "Eleven Music 연결 설정됨")}</strong> {translateCurrentStaticSourceText("domains.creator.music.StudioMusicPage", "ko", "— 고품질 v2.5 모델로 생성합니다. 실제 요청은 공급자 계정의 크레딧을 사용하며 연결 상태가 실시간 잔액을 보장하지는 않습니다.")}</p>
        )}
        {statusError || (status && !status.enabled) ? (
          <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-fg-2">
            {bt("생성이 준비되기 전에도 설정을 미리 구성하거나, 다른 서비스에서 만든 음원을 가져와 보관함·작품 연결까지 진행할 수 있어요.", "Before generation is ready you can still prepare the brief, or import audio made elsewhere and continue to your library and work.")}
            <a href="#music-import" onClick={(event) => jumpToMusicSection(event, "music-import")} className="inline-flex min-h-11 items-center font-bold text-accent underline underline-offset-4">
              {bt("외부 음원 가져오기로 계속하기", "Continue by importing audio")}
            </a>
          </p>
        ) : null}
        {!ownerId ? (
          <p className="mt-2 text-fg-2">{translateCurrentStaticSourceText("domains.creator.music.StudioMusicPage", "ko", "음악 생성과 개인 보관함은 로그인 후 이용할 수 있습니다. 사이트의 로그인 메뉴를 이용해 주세요.")}</p>
        ) : null}
      </section>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(24rem,0.85fr)]">
        <form
          id="music-brief"
          tabIndex={-1}
          ref={formRef}
          onSubmit={(event) => void submit(event)}
          className="min-w-0 space-y-6 rounded-2xl border border-line bg-card p-5 sm:p-6"
          aria-label={translateCurrentStaticSourceText("domains.creator.music.StudioMusicPage", "ko", "오리지널 애니 OST 만들기")}
        >
          <div>
            <h2 className="flex items-center gap-2 text-xl font-semibold">
              <Sparkles size={20} aria-hidden />{translateCurrentStaticSourceText("domains.creator.music.StudioMusicPage", "ko", "오리지널 애니 OST 만들기")}</h2>
            <p className="mt-1 text-sm text-fg-3">{translateCurrentStaticSourceText("domains.creator.music.StudioMusicPage", "ko", "먼저 보컬 OST인지 장면 BGM인지 정하고, 작품의 감정선과 노래 구조를 다듬으세요.")}</p>
            <p className="mt-2 break-all text-xs text-fg-3" aria-live="polite">{routeScope}</p>
          </div>

          <fieldset disabled={busy} className="space-y-6 disabled:opacity-70">
            <section aria-labelledby="music-mode-heading">
              <h3 id="music-mode-heading" className="text-sm font-semibold">{translateCurrentStaticSourceText("domains.creator.music.StudioMusicPage", "ko", "1. 무엇을 만들까요?")}</h3>
              <p className="mt-1 text-xs leading-5 text-fg-3">{translateCurrentStaticSourceText("domains.creator.music.StudioMusicPage", "ko", "사이트용 테마곡처럼 들리게 하려면 보컬 애니 OST를 선택하세요. 장면 BGM은 독서 집중용 연주곡에 맞춥니다.")}</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <button type="button" aria-pressed={brief.vocals} onClick={() => chooseCreationMode(true)} className={cn("rounded-2xl border p-4 text-left transition-colors focus-visible:outline-2 focus-visible:outline-accent", brief.vocals ? "border-accent bg-accent/10" : "border-line bg-canvas hover:border-accent/40")}>
                  <span className="text-xs font-black tracking-[0.16em] text-accent">{translateCurrentStaticSourceText("domains.creator.music.StudioMusicPage", "en", "VOCAL ANIME OST")}</span>
                  <span className="mt-1 block text-base font-black">{translateCurrentStaticSourceText("domains.creator.music.StudioMusicPage", "ko", "오프닝 · 엔딩 · 캐릭터 송")}</span>
                  <span className="mt-1 block text-xs leading-5 text-fg-3">{translateCurrentStaticSourceText("domains.creator.music.StudioMusicPage", "ko", "보컬, 후렴 훅, 가사와 곡 구조를 중심으로 한 완성형 주제가")}</span>
                </button>
                <button type="button" aria-pressed={!brief.vocals} onClick={() => chooseCreationMode(false)} className={cn("rounded-2xl border p-4 text-left transition-colors focus-visible:outline-2 focus-visible:outline-accent", !brief.vocals ? "border-accent bg-accent/10" : "border-line bg-canvas hover:border-accent/40")}>
                  <span className="text-xs font-black tracking-[0.16em] text-fg-3">{translateCurrentStaticSourceText("domains.creator.music.StudioMusicPage", "en", "SCENE SCORE")}</span>
                  <span className="mt-1 block text-base font-black">{translateCurrentStaticSourceText("domains.creator.music.StudioMusicPage", "ko", "장면 BGM · 루프")}</span>
                  <span className="mt-1 block text-xs leading-5 text-fg-3">{translateCurrentStaticSourceText("domains.creator.music.StudioMusicPage", "ko", "대사와 스크롤을 방해하지 않는 분위기 중심의 연주 사운드트랙")}</span>
                </button>
              </div>
            </section>

            {brief.vocals ? (
              <section aria-labelledby="anime-ost-starter-heading">
                <div>
                  <h3 id="anime-ost-starter-heading" className="text-sm font-semibold">{translateCurrentStaticSourceText("domains.creator.music.StudioMusicPage", "ko", "2. 애니 OST 스타터")}</h3>
                  <p className="mt-1 text-xs text-fg-3">{translateCurrentStaticSourceText("domains.creator.music.StudioMusicPage", "ko", "특정 기존 작품이나 가수를 모사하지 않고, 곡의 역할과 감정 구조만 빠르게 설정합니다.")}</p>
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {ANIME_OST_STARTERS.map((starter) => (
                    <button key={starter.id} type="button" className="min-h-24 rounded-xl border border-line bg-canvas p-3 text-left transition-colors hover:border-accent/45 hover:bg-accent/5 focus-visible:outline-2 focus-visible:outline-accent" onClick={() => applyAnimeOstStarter(starter.id)}>
                      <span className="text-xs font-black tracking-[0.14em] text-accent">{starter.badge}</span>
                      <span className="mt-1 block text-sm font-bold text-fg">{starter.label}</span>
                      <span className="mt-1 block text-xs leading-5 text-fg-3">{starter.description}</span>
                    </button>
                  ))}
                </div>
              </section>
            ) : null}

            <section aria-labelledby="music-theme-heading">
              <div className="flex items-end justify-between gap-3">
                <div>
                  <h3 id="music-theme-heading" className="text-sm font-semibold">{brief.vocals ? translateCurrentStaticSourceText("domains.creator.music.StudioMusicPage", "ko", "3. 장르·장면 테마 보강") : translateCurrentStaticSourceText("domains.creator.music.StudioMusicPage", "ko", "2. 웹툰 장면 테마로 빠르게 시작")}</h3>
                  <p className="mt-1 text-xs text-fg-3">{translateCurrentStaticSourceText("domains.creator.music.StudioMusicPage", "ko", "테마를 누르면 악기·템포·강도·감정 곡선이 함께 설정됩니다.")}</p>
                </div>
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {MUSIC_THEME_PACKS.map((theme) => (
                  <button
                    key={theme.id}
                    type="button"
                    className="min-h-20 rounded-xl border border-line bg-canvas p-3 text-left transition-colors hover:border-accent/45 hover:bg-accent/5 focus-visible:outline-2 focus-visible:outline-accent"
                    onClick={() => applyTheme(theme.id)}
                  >
                    <span className="block text-sm font-bold text-fg">{theme.label}</span>
                    <span className="mt-1 block text-xs leading-5 text-fg-3">{theme.description}</span>
                  </button>
                ))}
              </div>
            </section>

            <section className="space-y-5 rounded-2xl border border-line bg-panel/30 p-4" aria-labelledby="music-detail-heading">
              <h3 id="music-detail-heading" className="text-sm font-semibold">{brief.vocals ? translateCurrentStaticSourceText("domains.creator.music.StudioMusicPage", "ko", "4. 장면과 곡 세부 설정") : translateCurrentStaticSourceText("domains.creator.music.StudioMusicPage", "ko", "3. 장면과 음악 세부 설정")}</h3>
              <label className="block space-y-2 text-sm font-medium">
                {translateCurrentStaticSourceText("domains.creator.music.StudioMusicPage", "ko", "음악 제목")}<input className={inputClass} required maxLength={80} value={brief.title} onChange={(event) => patch({ title: event.target.value })} />
              </label>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-2 text-sm font-medium">
                  {translateCurrentStaticSourceText("domains.creator.music.StudioMusicPage", "ko", "장면 분위기")}<select
                    aria-label={translateCurrentStaticSourceText("domains.creator.music.StudioMusicPage", "ko", "장면 분위기")}
                    className={inputClass}
                    value={brief.mood}
                    onChange={(event) => {
                      const mood = MUSIC_MOODS.find((entry) => entry.id === event.target.value)!;
                      patch({ mood: mood.id, bpm: mood.bpm });
                    }}
                  >
                    {MUSIC_MOODS.map((mood) => <option key={mood.id} value={mood.id}>{mood.label} · {mood.hint}</option>)}
                  </select>
                </label>
                <label className="space-y-2 text-sm font-medium">
                  {translateCurrentStaticSourceText("domains.creator.music.StudioMusicPage", "ko", "음악 용도")}<select className={inputClass} value={brief.purpose} onChange={(event) => patch({ purpose: event.target.value })}>
                    {MUSIC_PURPOSES.map((purpose) => <option key={purpose.id} value={purpose.id}>{purpose.label}</option>)}
                  </select>
                </label>
              </div>

              <label className="block space-y-2 text-sm font-medium">
                {translateCurrentStaticSourceText("domains.creator.music.StudioMusicPage", "ko", "장면 설명")}<textarea
                  className={formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.music.StudioMusicPage", "en", "{v0} min-h-32 resize-y leading-relaxed"), { v0: String(inputClass) })}
                  required
                  maxLength={600}
                  value={brief.scene}
                  onChange={(event) => patch({ scene: event.target.value })}
                  placeholder={translateCurrentStaticSourceText("domains.creator.music.StudioMusicPage", "ko", "어디에서, 누가, 어떤 감정을 느끼나요? 장면 후반에 감정이 어떻게 바뀌는지도 알려 주세요.")}
                />
              </label>
              <div className="-mt-3 flex items-center justify-between gap-2 text-xs text-fg-3">
                <button
                  type="button"
                  className="min-h-11 rounded-md px-1 text-accent underline underline-offset-4"
                  onClick={() => patch({ scene: MUSIC_MOODS.find((mood) => mood.id === brief.mood)!.scene })}
                >
                  {translateCurrentStaticSourceText("domains.creator.music.StudioMusicPage", "ko", "선택한 분위기의 예시 넣기")}</button>
                <span>{brief.scene.length}/600</span>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <label className="space-y-2 text-sm font-medium">
                  {translateCurrentStaticSourceText("domains.creator.music.StudioMusicPage", "ko", "길이")}<select className={inputClass} value={brief.seconds} onChange={(event) => patch({ seconds: Number(event.target.value) })}>
                    {MUSIC_DURATIONS.map((seconds) => <option key={seconds} value={seconds}>{seconds}{translateCurrentStaticSourceText("domains.creator.music.StudioMusicPage", "ko", "초")}</option>)}
                  </select>
                </label>
                <label className="space-y-2 text-sm font-medium">
                  {translateCurrentStaticSourceText("domains.creator.music.StudioMusicPage", "ko", "음악 강도")}<select className={inputClass} value={brief.intensity} onChange={(event) => patch({ intensity: event.target.value })}>
                    {MUSIC_INTENSITIES.map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}
                  </select>
                </label>
                <label className="space-y-2 text-sm font-medium">
                  {translateCurrentStaticSourceText("domains.creator.music.StudioMusicPage", "ko", "감정 곡선")}<select className={inputClass} value={brief.arc} onChange={(event) => patch({ arc: event.target.value })}>
                    {MUSIC_ARCS.map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}
                  </select>
                </label>
                <label className="space-y-2 text-sm font-medium">
                  {translateCurrentStaticSourceText("domains.creator.music.StudioMusicPage", "ko", "템포 · ")}{brief.bpm} {translateCurrentStaticSourceText("domains.creator.music.StudioMusicPage", "en", "BPM")}<input type="range" min={60} max={180} step={1} className="mt-3 w-full accent-[var(--color-accent)]" value={brief.bpm} onChange={(event) => patch({ bpm: Number(event.target.value) })} />
                </label>
              </div>

              <fieldset>
                <legend className="mb-2 text-sm font-medium">{translateCurrentStaticSourceText("domains.creator.music.StudioMusicPage", "ko", "주요 악기 ")}<span className="text-xs font-normal text-fg-3">{translateCurrentStaticSourceText("domains.creator.music.StudioMusicPage", "ko", "1–4개")}</span></legend>
                <div className="flex flex-wrap gap-2">
                  {MUSIC_INSTRUMENTS.map((instrument) => {
                    const selected = brief.instruments.includes(instrument.id);
                    return (
                      <button
                        key={instrument.id}
                        type="button"
                        aria-pressed={selected}
                        disabled={!selected && brief.instruments.length >= 4}
                        className={cn(buttonClass, selected && "border-accent bg-accent/10")}
                        onClick={() => patch({
                          instruments: selected
                            ? brief.instruments.filter((id) => id !== instrument.id)
                            : [...brief.instruments, instrument.id],
                        })}
                      >
                        {instrument.label}
                      </button>
                    );
                  })}
                </div>
              </fieldset>
            </section>

            <section className="space-y-4 rounded-2xl border border-line bg-panel/30 p-4" aria-labelledby="music-lyrics-heading">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 id="music-lyrics-heading" className="text-sm font-semibold">{brief.vocals ? translateCurrentStaticSourceText("domains.creator.music.StudioMusicPage", "ko", "5. 보컬 캐릭터·AI 가사") : translateCurrentStaticSourceText("domains.creator.music.StudioMusicPage", "ko", "4. 보컬 옵션")}</h3>
                  <p className="mt-1 text-xs leading-5 text-fg-3">{translateCurrentStaticSourceText("domains.creator.music.StudioMusicPage", "ko", "장면을 바탕으로 독창적인 가사 초안을 만들거나 직접 작성할 수 있습니다.")}</p>
                </div>
                <label className="flex min-h-10 items-center gap-3 text-sm">
                  <input
                    type="checkbox"
                    checked={brief.vocals}
                    onChange={(event) => chooseCreationMode(event.target.checked)}
                  />
                  {translateCurrentStaticSourceText("domains.creator.music.StudioMusicPage", "ko", "보컬이 있는 주제가 만들기")}</label>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-2 text-sm font-medium">
                  {translateCurrentStaticSourceText("domains.creator.music.StudioMusicPage", "ko", "보컬 캐릭터")}<select className={inputClass} value={brief.vocalStyle} onChange={(event) => patch({ vocalStyle: event.target.value, rightsConfirmed: false })} disabled={!brief.vocals}>
                    {MUSIC_VOCAL_STYLES.map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}
                  </select>
                </label>
                <label className="space-y-2 text-sm font-medium">
                  {translateCurrentStaticSourceText("domains.creator.music.StudioMusicPage", "ko", "가사 언어")}<select className={inputClass} value={brief.lyricsLanguage} onChange={(event) => patch({ lyricsLanguage: event.target.value, rightsConfirmed: false })}>
                    {MUSIC_LYRIC_LANGUAGES.map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}
                  </select>
                </label>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-2 text-sm font-medium">
                  {translateCurrentStaticSourceText("domains.creator.music.StudioMusicPage", "ko", "곡 구조")}<select className={inputClass} value={brief.songStructure} onChange={(event) => patch({ songStructure: event.target.value, rightsConfirmed: false })} disabled={!brief.vocals}>
                    {MUSIC_SONG_STRUCTURES.map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}
                  </select>
                  <span className="block text-xs font-normal leading-5 text-fg-3">{MUSIC_SONG_STRUCTURES.find((entry) => entry.id === brief.songStructure)?.hint}</span>
                </label>
                <label className="space-y-2 text-sm font-medium">
                  {translateCurrentStaticSourceText("domains.creator.music.StudioMusicPage", "ko", "가사 핵심 주제 · 후렴 아이디어")}<input className={inputClass} maxLength={180} value={brief.lyricTheme} onChange={(event) => patch({ lyricTheme: event.target.value, rightsConfirmed: false })} disabled={!brief.vocals} placeholder={translateCurrentStaticSourceText("domains.creator.music.StudioMusicPage", "ko", "예: 넘어져도 함께라면 다음 페이지를 열 수 있다")} />
                  <span className="block text-right text-xs font-normal text-fg-3">{brief.lyricTheme.length}/180</span>
                </label>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={cn(buttonClass, "border-accent/50 text-accent")}
                  disabled={lyricsBusy || busy || !brief.scene.trim()}
                  onClick={() => void generateLyrics()}
                >
                  <WandSparkles size={17} aria-hidden />
                  {lyricsBusy ? translateCurrentStaticSourceText("domains.creator.music.StudioMusicPage", "ko", "AI 가사 작성 중…") : translateCurrentStaticSourceText("domains.creator.music.StudioMusicPage", "ko", "장면으로 AI 가사 초안")}
                </button>
                {lyricsBusy ? (
                  <button type="button" className={buttonClass} onClick={cancelLyrics}>
                    <X size={16} aria-hidden />{translateCurrentStaticSourceText("domains.creator.music.StudioMusicPage", "ko", "가사 생성 취소")}</button>
                ) : null}
              </div>

              {brief.vocals ? (
                <label className="block space-y-2 text-sm font-medium">
                  {translateCurrentStaticSourceText("domains.creator.music.StudioMusicPage", "ko", "직접 작성한 가사 또는 AI 초안")}<textarea
                    className={formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.music.StudioMusicPage", "en", "{v0} min-h-40 resize-y leading-relaxed"), { v0: String(inputClass) })}
                    required
                    maxLength={1200}
                    value={brief.lyrics}
                    onChange={(event) => {
                      lyricsDraft.current = event.target.value;
                      patch({ lyrics: event.target.value });
                    }}
                    placeholder={translateCurrentStaticSourceText("domains.creator.music.StudioMusicPage", "ko", "[Verse]\\n우리의 이야기가 시작되는 밤...\\n\\n[Chorus]\\n")}
                  />
                  <span className="flex flex-wrap justify-between gap-2 text-xs font-normal text-fg-3">
                    <span>{translateCurrentStaticSourceText("domains.creator.music.StudioMusicPage", "ko", "AI 초안도 직접 검토·수정하세요. 기존 노래 가사나 특정 가수 모사 요청은 금지됩니다.")}</span>
                    <span>{brief.lyrics.length}/1200</span>
                  </span>
                </label>
              ) : (
                <div className="rounded-xl border border-dashed border-line p-4 text-xs leading-5 text-fg-3">
                  {translateCurrentStaticSourceText("domains.creator.music.StudioMusicPage", "ko", "현재는 순수 연주곡으로 생성합니다. AI 가사 초안을 만들면 보컬 옵션이 자동으로 켜집니다.")}</div>
              )}
            </section>

            <section className="space-y-4 rounded-2xl border border-line bg-panel/30 p-4" aria-labelledby="music-output-heading">
              <h3 id="music-output-heading" className="text-sm font-semibold">{brief.vocals ? translateCurrentStaticSourceText("domains.creator.music.StudioMusicPage", "ko", "6. 출력·프롬프트·권리 확인") : translateCurrentStaticSourceText("domains.creator.music.StudioMusicPage", "ko", "5. 반복·프롬프트·권리 확인")}</h3>
              <label className="flex min-h-10 items-center gap-3 text-sm">
                <input type="checkbox" checked={brief.loop} onChange={(event) => patch({ loop: event.target.checked })} />
                {translateCurrentStaticSourceText("domains.creator.music.StudioMusicPage", "ko", "반복 감상에 어울리는 루프 구성 요청")}</label>
              <p className="-mt-2 text-xs leading-relaxed text-fg-3">{translateCurrentStaticSourceText("domains.creator.music.StudioMusicPage", "ko", "끊김 없는 루프·정확한 BPM·길이·가사 재현은 보장되지 않습니다. 생성 후 미리듣기로 확인해 주세요.")}</p>
              <details className="rounded-xl border border-line p-3">
                <summary className="cursor-pointer text-sm font-medium">{translateCurrentStaticSourceText("domains.creator.music.StudioMusicPage", "ko", "생성 프롬프트 확인")}</summary>
                <pre className="mt-3 whitespace-pre-wrap break-words text-xs leading-relaxed text-fg-2">{preview}</pre>
              </details>
              <label className="flex items-start gap-3 rounded-xl border border-line bg-canvas p-3 text-xs leading-relaxed">
                <input type="checkbox" className="mt-1" required checked={brief.rightsConfirmed} onChange={(event) => patch({ rightsConfirmed: event.target.checked })} />
                <span>{translateCurrentStaticSourceText("domains.creator.music.StudioMusicPage", "ko", "입력한 장면·가사를 사용할 권한이 있으며, 음악 생성을 위해 외부 공급자 ElevenLabs로 전송됨에 동의합니다. 유료 생성과 이용 조건을 확인했습니다.")}</span>
              </label>
            </section>
          </fieldset>

          <div id="music-generate" tabIndex={-1} className="flex scroll-mt-24 gap-2 focus:outline-none">
            <button
              type="submit"
              className={formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.music.StudioMusicPage", "en", "{v0} flex-1 border-accent bg-accent font-semibold text-on-accent hover:bg-accent/90"), { v0: String(buttonClass) })}
              disabled={
                busy
                || lyricsBusy
                || libraryLoading
                || Boolean(library.loadError)
                || pendingIds.length > 0
                || brief.workId !== workId
                || brief.episodeId !== episodeId
                || !ownerId
                || !status?.enabled
                || !brief.rightsConfirmed
              }
            >
              <Music4 size={18} aria-hidden />
              {savingTrack ? translateCurrentStaticSourceText("domains.creator.music.StudioMusicPage", "ko", "OST 저장 중…") : busy ? translateCurrentStaticSourceText("domains.creator.music.StudioMusicPage", "ko", "OST 생성 중…") : brief.vocals ? translateCurrentStaticSourceText("domains.creator.music.StudioMusicPage", "ko", "AI 오리지널 OST 생성") : translateCurrentStaticSourceText("domains.creator.music.StudioMusicPage", "ko", "AI 장면 BGM 생성")}
            </button>
            {busy && !savingTrack ? (
              <button type="button" className={buttonClass} onClick={cancel}>
                <Square size={14} aria-hidden />{translateCurrentStaticSourceText("domains.creator.music.StudioMusicPage", "ko", "취소")}</button>
            ) : null}
          </div>
          <p className="text-xs leading-relaxed text-fg-3">{translateCurrentStaticSourceText("domains.creator.music.StudioMusicPage", "ko", "중복 클릭은 한 번만 접수합니다. 취소·시간 초과 후에도 공급자 처리분은 과금될 수 있습니다. 생성 요청을 자동 재시도하지 않습니다.")}</p>
        </form>

        <section id="music-library" tabIndex={-1} className="min-w-0 scroll-mt-24 space-y-4 focus:outline-none xl:sticky xl:top-4" aria-labelledby="music-library-heading">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="music-library-heading" className="text-xl font-semibold">{translateCurrentStaticSourceText("domains.creator.music.StudioMusicPage", "ko", "나의 사운드트랙")}</h2>
            <span className="text-sm text-fg-3">{tracks.length}{translateCurrentStaticSourceText("domains.creator.music.StudioMusicPage", "ko", "/20곡")}</span>
            {ownerId ? (
              <button type="button" className={buttonClass} disabled={busy || libraryLoading || pendingIds.length > 0} onClick={() => void refresh()}>
                <RotateCcw size={16} aria-hidden />{translateCurrentStaticSourceText("domains.creator.music.StudioMusicPage", "ko", "보관함 다시 확인")}</button>
            ) : null}
          </div>
          <p className="text-sm leading-relaxed text-fg-2">{translateCurrentStaticSourceText("domains.creator.music.StudioMusicPage", "ko", "이 브라우저·기기에 저장되는 개인 보관함입니다. 다른 기기와 동기화되지 않으며 브라우저 데이터 삭제 시 사라질 수 있어 MP3를 별도로 보관해 주세요.")}</p>

          {library.loadError ? (
            <div role="alert" className="rounded-xl border border-bad/30 p-4 text-sm text-bad">
              <p>{translateCurrentStaticSourceText("domains.creator.music.StudioMusicPage", "ko", "보관함을 확인하지 못해 새 유료 생성을 잠시 막았습니다. 위의 ‘보관함 다시 확인’을 눌러 주세요.")}</p>
              <p className="mt-2">{library.loadError}</p>
            </div>
          ) : null}
          {unsavedCount > 0 ? (
            <p role="status" className="rounded-xl border border-accent/30 bg-accent/5 p-4 text-sm">{translateCurrentStaticSourceText("domains.creator.music.StudioMusicPage", "ko", "저장 확인이 필요한 음원이 ")}{unsavedCount}{translateCurrentStaticSourceText("domains.creator.music.StudioMusicPage", "ko", "곡 있습니다. ‘기기에 다시 저장’은 새 생성 요청을 보내지 않습니다. 화면을 떠나기 전에 MP3도 보관해 주세요.")}</p>
          ) : null}

          <label className="block space-y-2 text-sm">
            {translateCurrentStaticSourceText("domains.creator.music.StudioMusicPage", "ko", "보관함 검색")}<input type="search" className={inputClass} value={query} onChange={(event) => setQuery(event.target.value)} placeholder={translateCurrentStaticSourceText("domains.creator.music.StudioMusicPage", "ko", "제목 또는 장면 검색")} />
          </label>
          {workId ? (
            <label className="flex min-h-10 items-center gap-2 text-sm">
              <input type="checkbox" checked={onlyWork} onChange={(event) => setOnlyWork(event.target.checked)} />
              {translateCurrentStaticSourceText("domains.creator.music.StudioMusicPage", "ko", "현재 작품에 연결해 만든 음악만 보기")}</label>
          ) : null}
          {episodeId ? (
            <label className="flex min-h-10 items-center gap-2 text-sm">
              <input type="checkbox" checked={onlyEpisode} onChange={(event) => setOnlyEpisode(event.target.checked)} />
              {translateCurrentStaticSourceText("domains.creator.music.StudioMusicPage", "ko", "현재 회차에 연결해 만든 음악만 보기")}</label>
          ) : null}

          {workId && publicationTracks.length > 0 ? (
            <MusicPublicationPanel
              key={`${workId}:${episodeId ?? ""}`}
              workId={workId}
              tracks={publicationTracks}
              onLinked={setBgmLinkedTrackId}
            />
          ) : (
            <MusicPublicationHint workLinked={Boolean(workId)} />
          )}

          <div aria-live="polite" aria-atomic="true">
            {busy ? (
              <p role="status" className="rounded-xl border border-accent/30 bg-accent/10 p-4 text-sm">{savingTrack ? translateCurrentStaticSourceText("domains.creator.music.StudioMusicPage", "ko", "음원 생성이 완료되어 기기 저장 결과를 확인하고 있습니다. MP3 다운로드는 지금도 가능합니다.") : translateCurrentStaticSourceText("domains.creator.music.StudioMusicPage", "ko", "장면에 맞는 음악을 생성하고 있습니다. 이 화면에서 결과를 받은 뒤 기기 보관함에 저장합니다.")}</p>
            ) : null}
            {lyricsBusy ? (
              <p role="status" className="rounded-xl border border-accent/30 bg-accent/10 p-4 text-sm">{translateCurrentStaticSourceText("domains.creator.music.StudioMusicPage", "ko", "장면의 감정과 길이에 맞는 독창적인 가사 초안을 작성하고 있습니다.")}</p>
            ) : null}
            {notice ? <p className="mt-3 rounded-xl border border-line bg-panel/40 p-4 text-sm leading-relaxed">{notice}</p> : null}
          </div>
          {error ? <AiRecoveryNotice message={error} /> : null}
          {libraryLoading ? <p role="status" className="p-5 text-sm text-fg-3">기기 보관함을 여는 중…</p> : null}

          {visibleTracks.map((track) => (
            <MusicTrackCard
              key={track.metadata.id}
              track={track}
              saved={savedIds.includes(track.metadata.id)}
              busy={busy || libraryLoading}
              pending={pendingIds.includes(track.metadata.id)}
              onSave={() => saveAgain(track)}
              onDelete={() => remove(track)}
              onReuse={() => {
                lyricsDraft.current = track.metadata.brief.lyrics;
                setBrief(scopeMusicBrief(track.metadata.brief, workId, episodeId));
                setNotice("이전 설정을 불러왔습니다. 내용을 수정한 뒤 생성하면 새로운 유료 요청이 접수됩니다.");
                formRef.current?.scrollIntoView({ block: "start" });
              }}
            />
          ))}

          {!libraryLoading && !library.loadError && visibleTracks.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-line p-10 text-center">
              <Headphones size={32} className="mx-auto mb-4 text-fg-3" aria-hidden />
              <h3 className="font-semibold">{tracks.length ? translateCurrentStaticSourceText("domains.creator.music.StudioMusicPage", "ko", "검색 조건에 맞는 음악이 없어요") : translateCurrentStaticSourceText("domains.creator.music.StudioMusicPage", "ko", "아직 만들어진 음악이 없어요")}</h3>
              <p className="mt-2 text-sm leading-relaxed text-fg-3">{translateCurrentStaticSourceText("domains.creator.music.StudioMusicPage", "ko", "웹툰 테마를 고르고 장면을 설명해 주세요.")}<br />{translateCurrentStaticSourceText("domains.creator.music.StudioMusicPage", "ko", "실제로 생성된 음원만 이곳에 표시됩니다.")}</p>
            </div>
          ) : null}

          <aside className="rounded-2xl border border-line bg-card p-5 text-sm leading-relaxed">
            <h3 className="flex items-center gap-2 font-semibold"><BookOpenText size={17} aria-hidden />{translateCurrentStaticSourceText("domains.creator.music.StudioMusicPage", "ko", "작품에 사용할 때")}</h3>
            <p className="mt-2 text-fg-2">{translateCurrentStaticSourceText("domains.creator.music.StudioMusicPage", "ko", "음악을 만든 후 MP3와 제작 정보를 별도로 보관하세요. 작품에 연결해 만든 곡은 위 게시 연결에서 직접 호스팅한 지속적인 HTTPS MP3 주소를 저장하면 효과툰 독자용 BGM으로 이어집니다. 사이트 전역 OST 승격은 별도 운영 검수를 거칩니다.")}</p>
            <a href={MUSIC_TERMS_URL} target="_blank" rel="noopener noreferrer" className="mt-3 inline-block min-h-9 text-accent underline underline-offset-4">{translateCurrentStaticSourceText("domains.creator.music.StudioMusicPage", "ko", "음원 이용 조건 확인")}</a>
            <p className="text-xs text-fg-3">{translateCurrentStaticSourceText("domains.creator.music.StudioMusicPage", "ko", "상용 이용 범위는 공급자 요금제·용도에 따라 달라집니다. 모든 배포·재판매에 대한 권리를 보장하지 않습니다.")}</p>
          </aside>
        </section>
      </div>

      <section aria-labelledby="music-alternatives-heading" className="space-y-4 border-t border-line pt-7">
        <div className="max-w-3xl">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-accent">Other ways</p>
          <h2 id="music-alternatives-heading" className="mt-1 text-xl font-semibold">{bt("다른 방법으로 음원 준비하기", "Other ways to get audio")}</h2>
          <p className="mt-1 text-sm leading-6 text-fg-3">{bt("다른 서비스에서 만든 음원을 가져오거나, 현재 장면 설정을 외부 도구로 넘겨 이어서 만들 수 있어요. 가져오기는 유료 생성 요청을 보내지 않아요.", "Import audio made elsewhere, or hand this scene's settings to an external tool. Importing never sends a paid generation request.")}</p>
        </div>
        <div id="music-import" tabIndex={-1} className="scroll-mt-24 focus:outline-none">
          <MusicExternalImportPanel
            brief={brief}
            ownerId={ownerId}
            trackCount={tracks.length}
            disabled={busy || lyricsBusy || libraryLoading || Boolean(library.loadError) || pendingIds.length > 0}
            onImport={importExternalTrack}
            onNotice={(message) => {
              setError("");
              setNotice(message);
            }}
            onError={(message) => {
              setNotice("");
              setError(message);
            }}
          />
        </div>
        <MusicProviderToolkit
          brief={brief}
          prompt={preview}
          onNotice={(message) => {
            setError("");
            setNotice(message);
          }}
          onError={(message) => {
            setNotice("");
            setError(message);
          }}
        />
      </section>
    </div>
  );
}

export function StudioMusicPage() {
  const session = useSession();
  const ownerId = session.data?.user.id ?? "";
  return <StudioMusicWorkspace key={ownerId || translateCurrentStaticSourceText("domains.creator.music.StudioMusicPage", "en", "guest")} ownerId={ownerId} />;
}
