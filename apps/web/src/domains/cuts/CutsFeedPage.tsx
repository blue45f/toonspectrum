/**
 * 컷츠 피드 — 세로형 숏폼 피드 (`/cuts`).
 *
 * 스크롤 스냅으로 한 번에 하나의 클립을 보여주고, 화면에 들어온 클립만
 * 자동 재생한다(음소거 시작). 둘러보기는 로그인 없이 가능하고,
 * 좋아요·공유는 로그인한 사용자만 할 수 있다(게스트는 로그인 유도).
 * 조회수는 1.5초 이상 시청했을 때 한 번만 집계한다.
 */

import { BookOpen, Clapperboard, Coins, Eye, Heart, Share2, Shuffle } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";

import Link from "@/shared/navigation/router-link";
import { ActionableEmptyState } from "@/shared/components/ActionableEmptyState";
import { ErrorState } from "@/shared/components/feedback/error-state";
import { LoadingState } from "@/shared/components/LoadingState";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { requestAuthModalOpen } from "@/domains/auth/public/session/auth-modal-intent";
import { useAuthActorId } from "@/domains/auth/public/session/use-auth-actor-id";

import { CutsPlayer } from "./CutsPlayer";
import { CutsRemixBadge } from "./CutsRemixBadge";
import { countFanRemixes, isClipRemixAllowed, resolveRemixAllowed, selectFanRemixes } from "./cuts-remix";
import { isRewardEligibleClip } from "./cuts-rewards";
import { buildSeedClips, DEMO_EPISODES } from "./cuts-seed";
import { formatCutsCount, useCutsStore } from "./cuts-store";
import { formatClipDuration } from "./cuts-clip-builder";
import type { CutsClip } from "./cuts-types";

import "./cuts.css";

/** 조회수로 인정하는 최소 시청 시간 (ms). */
const VIEW_MIN_WATCH_MS = 1500;

function CutsFeedItem({
  clip,
  active,
  muted,
  onToggleMute,
  registerItemRef,
  remixAllowed,
  fanRemixCount,
}: Readonly<{
  clip: CutsClip;
  active: boolean;
  muted: boolean;
  onToggleMute: () => void;
  registerItemRef: (clipId: string, element: HTMLElement | null) => void;
  /** 원작자가 팬 리믹스를 허용한 작품일 때만 true — 꺼져 있으면 진입 자체를 그리지 않는다. */
  remixAllowed: boolean;
  /** 이 작품의 팬 리믹스 수 (0이면 목록 링크를 그리지 않는다). */
  fanRemixCount: number;
}>) {
  const t = useBilingual("cuts");
  const actorId = useAuthActorId();
  const likedClipIds = useCutsStore((state) => state.likedClipIds);
  const toggleLike = useCutsStore((state) => state.toggleLike);
  const liked = likedClipIds.includes(clip.id);

  const handleLike = useCallback(() => {
    const result = toggleLike(clip.id, actorId);
    if (result.needsLogin) {
      requestAuthModalOpen({ reason: "protected-action", source: "cuts-like" });
    }
  }, [clip.id, actorId, toggleLike]);

  const [shareNotice, setShareNotice] = useState<"copied" | "failed" | null>(null);

  const handleShare = useCallback(async () => {
    if (!actorId) {
      requestAuthModalOpen({ reason: "protected-action", source: "cuts-share" });
      return;
    }
    const shareUrl = `${window.location.origin}/cuts?clip=${encodeURIComponent(clip.id)}`;
    const shareData = {
      title: `${clip.title} ${clip.episodeNumber}화 컷츠`,
      text: clip.episodeTitle,
      url: shareUrl,
    };
    setShareNotice(null);
    try {
      if (typeof navigator.share === "function") {
        await navigator.share(shareData);
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(shareUrl);
        setShareNotice("copied");
      } else {
        setShareNotice("failed");
      }
    } catch (error) {
      // 사용자가 공유를 취소한 경우(AbortError)만 조용히 넘어간다.
      // 클립보드 거부 등 실제 실패는 무반응으로 두지 않는다.
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        setShareNotice("failed");
      }
    }
  }, [actorId, clip.title, clip.episodeNumber, clip.episodeTitle]);

  return (
    <article
      className="cuts-feed__item"
      aria-label={`${clip.title} ${clip.episodeNumber}화`}
      data-clip-id={clip.id}
      ref={(element) => registerItemRef(clip.id, element)}
    >
      <CutsPlayer clip={clip} active={active} muted={muted} onToggleMute={onToggleMute} />
      <div className="cuts-item__overlay">
        <div className="cuts-item__meta">
          <h2>
            <Link href={`/title/${clip.titleId}`} className="cuts-item__title-link">
              {clip.title}
            </Link>
          </h2>
          <p>{t("{{author}} · {{episode}}화 {{episodeTitle}}", "{{author}} · Ep.{{episode}} {{episodeTitle}}")
            .replace("{{author}}", clip.author)
            .replace("{{episode}}", String(clip.episodeNumber))
            .replace("{{episodeTitle}}", clip.episodeTitle)}</p>
          {clip.remix ? <CutsRemixBadge clip={clip} /> : null}
          <p>{formatClipDuration(clip.durationMs)} · {t("컷츠", "Cuts")}</p>
          {isRewardEligibleClip(clip) ? (
            <p>
              <Link href="/cuts/rewards" className="cuts-item__fund">
                <Coins size={12} aria-hidden="true" /> {t("리워드 펀드 대상 작품 · 정산 보기", "In the reward fund · See settlement")}
              </Link>
            </p>
          ) : null}
          {fanRemixCount > 0 ? (
            <p>
              <Link href={`/cuts?fanOf=${clip.titleId}`} className="cuts-item__remix-link">
                {t("팬 리믹스 {{count}}개 보기", "See {{count}} fan remixes")
                  .replace("{{count}}", String(fanRemixCount))}
              </Link>
            </p>
          ) : null}
          <div className="cuts-item__stats" aria-label={t("조회수", "Views")}>
            <span><Eye size={14} aria-hidden="true" /> {formatCutsCount(clip.views)}</span>
          </div>
        </div>
        <div className="cuts-item__actions">
          <button
            type="button"
            className={`cuts-action${liked ? " cuts-action--liked" : ""}`}
            onClick={handleLike}
            aria-pressed={liked}
            aria-label={liked ? t("좋아요 취소", "Unlike") : t("좋아요", "Like")}
          >
            <span className="cuts-action__icon"><Heart size={22} aria-hidden="true" fill={liked ? "currentColor" : "none"} /></span>
            {formatCutsCount(clip.likes)}
          </button>
          <button
            type="button"
            className="cuts-action"
            onClick={handleShare}
            aria-label={t("공유하기", "Share")}
          >
            <span className="cuts-action__icon"><Share2 size={22} aria-hidden="true" /></span>
            {t("공유", "Share")}
          </button>
          {shareNotice ? (
            <span role="status" className="cuts-action__notice">
              {shareNotice === "copied" ? t("링크를 복사했어요", "Link copied") : t("공유하지 못했어요", "Couldn't share")}
            </span>
          ) : null}
          {clip.remix ? (
            <Link
              href={clip.remix.originalHref}
              className="cuts-action"
              aria-label={t("원작 보러 가기", "View the original work")}
            >
              <span className="cuts-action__icon"><BookOpen size={22} aria-hidden="true" /></span>
              {t("원작", "Original")}
            </Link>
          ) : null}
          {remixAllowed ? (
            <Link
              href={`/cuts/studio?remixOf=${clip.titleId}:${clip.episodeNumber}`}
              className="cuts-action"
              aria-label={t("이 작품으로 리믹스 만들기", "Create a remix of this title")}
            >
              <span className="cuts-action__icon"><Shuffle size={22} aria-hidden="true" /></span>
              {t("리믹스", "Remix")}
            </Link>
          ) : null}
        </div>
      </div>
    </article>
  );
}

export function CutsFeedPage() {
  const t = useBilingual("cuts");
  const clips = useCutsStore((state) => state.clips);
  const publishClip = useCutsStore((state) => state.publishClip);
  const recordView = useCutsStore((state) => state.recordView);
  const recordViewEvent = useCutsStore((state) => state.recordViewEvent);
  const flushSyncQueue = useCutsStore((state) => state.flushSyncQueue);
  const remixPolicyOverrides = useCutsStore((state) => state.remixPolicyOverrides);
  const actorId = useAuthActorId();
  const [searchParams] = useSearchParams();

  // 작품별 팬 리믹스 목록 필터 (?fanOf={titleId}) — 원작자 작품에서 들어오는 동선.
  const fanOf = searchParams.get("fanOf");
  const visibleClips = useMemo(
    () => (fanOf ? selectFanRemixes(clips, fanOf) : clips),
    [clips, fanOf],
  );
  const fanOfWork = useMemo(() => {
    if (!fanOf) return null;
    const fromRemix = clips.find((clip) => clip.remix?.titleId === fanOf)?.remix;
    if (fromRemix) return { title: fromRemix.title, author: fromRemix.author };
    const episode = DEMO_EPISODES.find((entry) => entry.titleId === fanOf);
    return episode ? { title: episode.title, author: episode.author } : null;
  }, [clips, fanOf]);
  const fanOfEpisode = useMemo(
    () => (fanOf ? DEMO_EPISODES.find((entry) => entry.titleId === fanOf) ?? null : null),
    [fanOf],
  );

  const [activeId, setActiveId] = useState<string | null>(null);
  const [muted, setMuted] = useState(true);
  // 저장소(IndexedDB) 하이드레이션이 끝나고 시드까지 확인한 뒤에만 피드를 연다.
  // 확인 전에 빈 상태를 그리면 첫 페인트에서 "클립이 없어요"가 깜빡이고,
  // 하이드레이션 전에 시드를 넣으면 복원된 클립과 순서가 뒤집힌다.
  const [feedReady, setFeedReady] = useState(false);
  // 시드 생성이 던지면 로딩 화면에 영원히 굳지 않도록 실패를 따로 들고 재시도를 연다.
  const [feedFailed, setFeedFailed] = useState(false);
  const [seedAttempt, setSeedAttempt] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef(new Map<string, HTMLElement>());
  const viewTimerRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    const ensureSeeded = () => {
      try {
        if (useCutsStore.getState().clips.length === 0) {
          buildSeedClips().forEach((clip) => publishClip(clip));
        }
      } catch {
        if (!cancelled) setFeedFailed(true);
        return;
      }
      if (!cancelled) {
        setFeedFailed(false);
        setFeedReady(true);
      }
    };
    if (useCutsStore.persist.hasHydrated()) {
      ensureSeeded();
      return () => {
        cancelled = true;
      };
    }
    const unsubscribe = useCutsStore.persist.onFinishHydration(ensureSeeded);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [publishClip, seedAttempt]);

  // 로그인하면 쌓인 전송 큐를 서버로 보낸다.
  useEffect(() => {
    if (actorId) {
      void flushSyncQueue();
    }
  }, [actorId, flushSyncQueue]);

  // 화면에 들어온 클립 감지 — 가장 많이 보이는 아이템을 활성화한다.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new IntersectionObserver(
      (entries) => {
        let best: { id: string; ratio: number } | null = null;
        for (const entry of entries) {
          const id = (entry.target as HTMLElement).dataset.clipId;
          if (!id) continue;
          if (!best || entry.intersectionRatio > best.ratio) {
            best = { id, ratio: entry.intersectionRatio };
          }
        }
        if (best && best.ratio > 0.6) setActiveId(best.id);
      },
      { root: container, threshold: [0, 0.6, 1] },
    );
    itemRefs.current.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [visibleClips]);

  // 공유 링크(?clip=<id>)로 들어오면 해당 클립으로 바로 이동한다.
  const sharedClipId = searchParams.get("clip");
  const sharedScrollDoneRef = useRef(false);
  useEffect(() => {
    if (!feedReady || !sharedClipId || sharedScrollDoneRef.current) return;
    const element = itemRefs.current.get(sharedClipId);
    if (!element) return;
    sharedScrollDoneRef.current = true;
    setActiveId(sharedClipId);
    element.scrollIntoView({ block: "start" });
  }, [feedReady, sharedClipId, visibleClips]);

  // 1.5초 이상 시청한 클립만 조회수로 집계한다.
  useEffect(() => {
    if (viewTimerRef.current !== null) {
      window.clearTimeout(viewTimerRef.current);
      viewTimerRef.current = null;
    }
    if (!activeId) return;
    viewTimerRef.current = window.setTimeout(() => {
      recordView(activeId);
    }, VIEW_MIN_WATCH_MS);
    return () => {
      if (viewTimerRef.current !== null) {
        window.clearTimeout(viewTimerRef.current);
        viewTimerRef.current = null;
      }
    };
  }, [activeId, recordView]);

  // 리워드 정산용 시청 이벤트 — 클립이 바뀌거나 화면을 떠날 때, 실제로
  // 화면에 머문 시간을 원장에 남긴다. 유효 판정은 cuts-rewards 가드가 한다.
  const actorIdRef = useRef(actorId);
  actorIdRef.current = actorId;
  const watchRef = useRef<{ clipId: string; startedAt: number } | null>(null);
  const flushWatchEvent = useCallback(() => {
    const current = watchRef.current;
    watchRef.current = null;
    if (!current) return;
    const clip = useCutsStore.getState().getClip(current.clipId);
    if (!clip) return;
    const watchedMs = Date.now() - current.startedAt;
    if (watchedMs < 500) return;
    recordViewEvent({
      clipId: current.clipId,
      viewerKey: actorIdRef.current ?? "guest:local",
      watchedMs,
      durationMs: clip.durationMs,
      viewedAt: new Date().toISOString(),
    });
  }, [recordViewEvent]);

  useEffect(() => {
    flushWatchEvent();
    if (activeId) {
      watchRef.current = { clipId: activeId, startedAt: Date.now() };
    }
  }, [activeId, flushWatchEvent]);

  useEffect(() => () => flushWatchEvent(), [flushWatchEvent]);

  const scrollToClip = useCallback((direction: 1 | -1) => {
    const container = containerRef.current;
    if (!container) return;
    const currentIndex = visibleClips.findIndex((clip) => clip.id === activeId);
    const nextIndex = Math.min(
      visibleClips.length - 1,
      Math.max(0, (currentIndex < 0 ? 0 : currentIndex) + direction),
    );
    const element = itemRefs.current.get(visibleClips[nextIndex]?.id ?? "");
    element?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [visibleClips, activeId]);

  // 키보드 탐색 — 위/아래 화살표로 클립 이동. 입력 필드·모달 안에서 누른 방향키는
  // 가로채지 않는다(로그인 모달 입력의 커서 이동까지 막히던 문제).
  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target?.closest("input, textarea, select, [contenteditable='true'], [role='dialog']")
      ) {
        return;
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        scrollToClip(1);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        scrollToClip(-1);
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [scrollToClip]);

  const toggleMute = useCallback(() => setMuted((value) => !value), []);

  return (
    <div className="cuts-feed" ref={containerRef} aria-label={t("컷츠 피드", "Cuts feed")}>
      <header className="cuts-feed__header">
        <h1 className="cuts-feed__title">{t("컷츠", "Cuts")}</h1>
        <div className="cuts-feed__header-actions">
          <Link href="/cuts/rewards" className="cuts-feed__rewards">
            <Coins size={15} aria-hidden="true" />
            {t("리워드", "Rewards")}
          </Link>
          <Link href="/cuts/studio" className="cuts-feed__make">
            <Clapperboard size={16} aria-hidden="true" />
            {t("클립 만들기", "Create clip")}
          </Link>
        </div>
      </header>
      {fanOf ? (
        <div className="cuts-feed__filter" role="status">
          <p>
            {fanOfWork
              ? t("「{{title}}」 팬 리믹스", "Fan remixes of “{{title}}”")
                  .replace("{{title}}", fanOfWork.title)
              : t("팬 리믹스", "Fan remixes")}
          </p>
          <Link href="/cuts" className="cuts-feed__filter-clear">
            {t("전체 피드 보기", "View full feed")}
          </Link>
        </div>
      ) : null}
      {feedFailed && !feedReady ? (
        <div className="cuts-feed__empty">
          <ErrorState
            title={t("클립을 준비하지 못했어요", "Couldn't prepare the clips")}
            message={t(
              "피드를 여는 중 문제가 생겼어요. 다시 시도해 주세요.",
              "Something went wrong while opening the feed. Please try again.",
            )}
            onRetry={() => setSeedAttempt((value) => value + 1)}
          />
        </div>
      ) : !feedReady ? (
        <div className="cuts-feed__empty">
          <LoadingState variant="pulse" label={t("클립을 불러오는 중", "Loading clips")} />
          <p>{t("클립을 불러오는 중…", "Loading clips…")}</p>
        </div>
      ) : clips.length === 0 ? (
        <div className="cuts-feed__empty">
          <ActionableEmptyState
            icon={Clapperboard}
            art="none"
            title={t("아직 공개된 클립이 없어요.", "No published clips yet.")}
            description={t(
              "작품의 한 장면을 짧은 클립으로 만들어 첫 컷츠를 올려 보세요.",
              "Turn a moment from a title into a short clip and post the first Cuts.",
            )}
            primary={{
              href: "/cuts/studio",
              label: t("첫 클립 만들기", "Create the first clip"),
            }}
          />
        </div>
      ) : visibleClips.length === 0 ? (
        <div className="cuts-feed__empty">
          <ActionableEmptyState
            icon={Shuffle}
            art="none"
            title={t("아직 이 작품의 팬 리믹스가 없어요.", "No fan remixes of this title yet.")}
            description={t(
              "원작의 장면을 골라 나만의 순서로 다시 편집한 리믹스를 만들 수 있어요.",
              "Pick scenes from the original and re-edit them into your own remix.",
            )}
            primary={
              fanOfEpisode && resolveRemixAllowed(fanOfEpisode, remixPolicyOverrides)
                ? {
                    href: `/cuts/studio?remixOf=${fanOfEpisode.titleId}:${fanOfEpisode.episodeNumber}`,
                    label: t("첫 리믹스 만들기", "Create the first remix"),
                  }
                : {
                    href: "/cuts",
                    label: t("전체 피드 보기", "View full feed"),
                  }
            }
          />
        </div>
      ) : (
        visibleClips.map((clip) => (
          <CutsFeedItem
            key={clip.id}
            clip={clip}
            active={clip.id === activeId}
            muted={muted}
            onToggleMute={toggleMute}
            remixAllowed={isClipRemixAllowed(clip, DEMO_EPISODES, remixPolicyOverrides)}
            fanRemixCount={countFanRemixes(clips, clip.titleId)}
            registerItemRef={(clipId, element) => {
              if (element) itemRefs.current.set(clipId, element);
              else itemRefs.current.delete(clipId);
            }}
          />
        ))
      )}
    </div>
  );
}
