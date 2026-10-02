/**
 * 컷츠 피드 — 세로형 숏폼 피드 (`/cuts`).
 *
 * 스크롤 스냅으로 한 번에 하나의 클립을 보여주고, 화면에 들어온 클립만
 * 자동 재생한다(음소거 시작). 둘러보기는 로그인 없이 가능하고,
 * 좋아요·공유는 로그인한 사용자만 할 수 있다(게스트는 로그인 유도).
 * 조회수는 1.5초 이상 시청했을 때 한 번만 집계한다.
 */

import { Clapperboard, Eye, Heart, Share2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import Link from "@/shared/navigation/router-link";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { requestAuthModalOpen } from "@/domains/auth/public/session/auth-modal-intent";
import { useAuthActorId } from "@/domains/auth/public/session/use-auth-actor-id";

import { CutsPlayer } from "./CutsPlayer";
import { buildSeedClips } from "./cuts-seed";
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
}: Readonly<{
  clip: CutsClip;
  active: boolean;
  muted: boolean;
  onToggleMute: () => void;
  registerItemRef: (clipId: string, element: HTMLElement | null) => void;
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

  const handleShare = useCallback(async () => {
    if (!actorId) {
      requestAuthModalOpen({ reason: "protected-action", source: "cuts-share" });
      return;
    }
    const shareUrl = `${window.location.origin}/cuts`;
    const shareData = {
      title: `${clip.title} ${clip.episodeNumber}화 컷츠`,
      text: clip.episodeTitle,
      url: shareUrl,
    };
    try {
      if (typeof navigator.share === "function") {
        await navigator.share(shareData);
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(shareUrl);
      }
    } catch {
      // 사용자가 공유를 취소한 경우는 무시한다.
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
          <p>{formatClipDuration(clip.durationMs)} · {t("컷츠", "Cuts")}</p>
          <div className="cuts-item__stats" aria-label={t("조회수 및 좋아요", "Views and likes")}>
            <span><Eye size={14} aria-hidden="true" /> {formatCutsCount(clip.views)}</span>
            <span><Heart size={14} aria-hidden="true" /> {formatCutsCount(clip.likes)}</span>
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
  const flushSyncQueue = useCutsStore((state) => state.flushSyncQueue);
  const actorId = useAuthActorId();

  const [activeId, setActiveId] = useState<string | null>(null);
  const [muted, setMuted] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef(new Map<string, HTMLElement>());
  const viewTimerRef = useRef<number | null>(null);

  // 첫 진입 시 시드 클립으로 피드를 채운다.
  useEffect(() => {
    if (useCutsStore.getState().clips.length === 0) {
      buildSeedClips().forEach((clip) => publishClip(clip));
    }
  }, [publishClip]);

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
  }, [clips.length]);

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

  const scrollToClip = useCallback((direction: 1 | -1) => {
    const container = containerRef.current;
    if (!container) return;
    const currentIndex = clips.findIndex((clip) => clip.id === activeId);
    const nextIndex = Math.min(
      clips.length - 1,
      Math.max(0, (currentIndex < 0 ? 0 : currentIndex) + direction),
    );
    const element = itemRefs.current.get(clips[nextIndex]?.id ?? "");
    element?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [clips, activeId]);

  // 키보드 탐색 — 위/아래 화살표로 클립 이동.
  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
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
        <Link href="/cuts/studio" className="cuts-feed__make">
          <Clapperboard size={16} aria-hidden="true" />
          {t("클립 만들기", "Create clip")}
        </Link>
      </header>
      {clips.length === 0 ? (
        <div className="cuts-feed__empty">
          <p>{t("아직 공개된 클립이 없어요.", "No published clips yet.")}</p>
          <Link href="/cuts/studio" className="cuts-button cuts-button--primary">
            {t("첫 클립 만들기", "Create the first clip")}
          </Link>
        </div>
      ) : (
        clips.map((clip) => (
          <CutsFeedItem
            key={clip.id}
            clip={clip}
            active={clip.id === activeId}
            muted={muted}
            onToggleMute={toggleMute}
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
