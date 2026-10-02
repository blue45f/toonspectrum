import { Eye, Heart, Play, X } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import {
  getTimelapseClipObjectUrl,
  useTimelapseShareStore,
} from "./timelapse-share-store";

import type { TimelapseSharedClip } from "./timelapse-share-model";

import { useAccountGate } from "@/domains/auth/public/account-gate";
import { useSession } from "@/domains/auth/public/session/auth-session-store";
import { getActiveI18nLocale, useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { formatCount, relativeDate } from "@/shared/lib/utils";

const SCOPE = "domains.creator.timelapse.clip.card";

// 발화 없는 타임랩스용 빈 자막 트랙(접근성 lint 대응, 기존 Studio 패턴과 동일).
const EMPTY_TIMELAPSE_CAPTIONS = "data:text/vtt;charset=utf-8,WEBVTT%0A%0A";

function formatSeconds(sec: number): string {
  const rounded = Math.max(0, Math.round(sec));
  if (rounded < 60) return `${rounded}초`;
  return `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, "0")}`;
}

/** 좋아요 버튼 — 게스트 클릭 시 로그인 nudge, 로그인 사용자는 낙관적 토글(+서버 reconcile). */
export function TimelapseClipLikeButton({ clip }: { readonly clip: TimelapseSharedClip }) {
  const b = useBilingual(SCOPE);
  const { status } = useSession();
  const { ensureAccount } = useAccountGate();
  const toggleLike = useTimelapseShareStore((s) => s.toggleLike);
  const applyServerLike = useTimelapseShareStore((s) => s.applyServerLike);
  const serverAdapter = useTimelapseShareStore((s) => s.serverAdapter);
  const [syncing, setSyncing] = useState(false);

  async function onLike() {
    if (syncing) return;
    // 게스트-퍼스트: 좋아요는 로그인 유도.
    if (!ensureAccount("like")) return;
    const nextLiked = toggleLike(clip.id);
    if (status === "authenticated" && serverAdapter) {
      // CreateWorkPage의 toggleWorkLike와 같은 낙관적 토글 → 서버 reconcile 패턴.
      setSyncing(true);
      try {
        const server = await serverAdapter.toggleLike(clip.id, nextLiked);
        applyServerLike(clip.id, server.liked, server.likes);
      } catch {
        // 서버 실패 — 로컬 낙관 상태를 유지한다(조용히 실패).
      } finally {
        setSyncing(false);
      }
    }
  }

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        void onLike();
      }}
      aria-pressed={clip.liked}
      aria-label={b("좋아요", "Like")}
      className={`inline-flex min-h-8 items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
        clip.liked
          ? "border-accent/60 bg-accent-soft text-accent"
          : "border-line bg-card text-fg-3 hover:text-fg"
      }`}
    >
      <Heart size={13} aria-hidden className={clip.liked ? "fill-accent" : ""} />
      <span className="numeral">{formatCount(clip.likes, getActiveI18nLocale())}</span>
    </button>
  );
}

/** 클립 상세 모달 — 영상 재생 + 조회수 집계(본인 1회). 로그인 없이 볼 수 있다. */
export function TimelapseClipDetailModal({
  clip,
  onClose,
}: {
  readonly clip: TimelapseSharedClip;
  readonly onClose: () => void;
}) {
  const b = useBilingual(SCOPE);
  const recordView = useTimelapseShareStore((s) => s.recordView);
  const [objectUrl] = useState(() => getTimelapseClipObjectUrl(clip.id));

  // 모달을 열 때 조회수 1회 집계(스토어가 중복을 막는다).
  useEffect(() => {
    recordView(clip.id);
  }, [clip.id, recordView]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const modal = (
    <div
      aria-modal="true"
      role="dialog"
      aria-label={clip.title}
      className="fixed inset-0 z-[80] bg-[oklch(0.08_0.01_70/0.85)] p-2 backdrop-blur-sm sm:p-6"
    >
      <div className="mx-auto flex h-full max-h-full max-w-[480px] flex-col overflow-hidden rounded-2xl border border-line bg-panel">
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-line px-4 py-3">
          <div className="min-w-0">
            <h2 className="truncate text-base font-bold text-fg">{clip.title}</h2>
            <p className="mt-0.5 text-xs text-fg-3">
              {clip.authorName}
              {clip.authorIsGuest ? ` · ${b("게스트", "Guest")}` : ""} ·{" "}
              {relativeDate(clip.createdAt)}
            </p>
          </div>
          <button
            type="button"
            aria-label={b("닫기", "Close")}
            onClick={onClose}
            className="inline-grid size-9 shrink-0 place-items-center rounded-lg border border-line bg-card text-fg-3 transition-colors hover:bg-accent-soft hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <X size={17} aria-hidden />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto bg-black">
          {objectUrl ? (
            <video
              src={objectUrl}
              controls
              playsInline
              preload="metadata"
              className="h-full max-h-[60vh] w-full object-contain"
            >
              <track
                kind="captions"
                src={EMPTY_TIMELAPSE_CAPTIONS}
                srcLang="zxx"
                label={b("발화 없음", "No speech")}
              />
            </video>
          ) : (
            <div className="flex h-full min-h-[280px] flex-col items-center justify-center gap-2 p-6 text-center">
              {clip.thumbnailDataUrl ? (
                <img
                  src={clip.thumbnailDataUrl}
                  alt={b("클립 썸네일", "Clip thumbnail")}
                  className="max-h-[40vh] rounded-lg object-contain"
                />
              ) : null}
              <p className="max-w-[300px] text-xs leading-relaxed text-fg-3">
                {b(
                  "이 브라우저의 이전 세션에서 공유된 클립이라 영상 재생은 안 돼요. 썸네일과 정보만 볼 수 있어요.",
                  "This clip was shared in a previous browser session, so the video can't play here. Thumbnail and info only.",
                )}
              </p>
            </div>
          )}
        </div>

        <div className="shrink-0 border-t border-line px-4 py-3">
          {clip.description && (
            <p className="mb-2 whitespace-pre-wrap text-sm leading-relaxed text-fg-2">
              {clip.description}
            </p>
          )}
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1 text-xs text-fg-3">
              <Eye size={13} aria-hidden />
              <span className="numeral">{formatCount(clip.views, getActiveI18nLocale())}</span>
              {b("조회", "views")}
            </span>
            <TimelapseClipLikeButton clip={clip} />
          </div>
        </div>
      </div>
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(modal, document.body);
}

/** 갤러리 피드 카드 — 썸네일·제목·작성자·길이·좋아요·조회수. 클릭하면 상세 모달. */
export function TimelapseClipCard({ clip }: { readonly clip: TimelapseSharedClip }) {
  const b = useBilingual(SCOPE);
  const [detailOpen, setDetailOpen] = useState(false);

  return (
    <>
      <article className="group flex flex-col overflow-hidden rounded-2xl border border-line bg-card transition-colors hover:border-accent/40">
        <button
          type="button"
          onClick={() => setDetailOpen(true)}
          aria-label={b("클립 보기: ", "View clip: ") + clip.title}
          className="relative block aspect-[9/16] w-full overflow-hidden bg-raised text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          {clip.thumbnailDataUrl ? (
            <img
              src={clip.thumbnailDataUrl}
              alt=""
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
              loading="lazy"
            />
          ) : (
            <span className="grid h-full w-full place-items-center text-fg-3">
              <Play size={28} aria-hidden />
            </span>
          )}
          <span className="absolute inset-0 grid place-items-center bg-black/0 transition-colors group-hover:bg-black/25">
            <span className="grid size-12 place-items-center rounded-full bg-black/55 text-white opacity-0 transition-opacity group-hover:opacity-100">
              <Play size={20} aria-hidden className="translate-x-[1px]" />
            </span>
          </span>
          <span className="numeral absolute bottom-2 right-2 rounded-md bg-black/65 px-1.5 py-0.5 text-[0.68rem] font-semibold text-white">
            {formatSeconds(clip.durationSec)}
          </span>
          {clip.watermark && (
            <span className="absolute left-2 top-2 rounded-md bg-black/55 px-1.5 py-0.5 text-[0.62rem] font-semibold text-white">
              {b("툰스튜디오", "Toonstudio")}
            </span>
          )}
        </button>

        <div className="flex min-h-0 flex-1 flex-col gap-1.5 p-3">
          <h3 className="line-clamp-2 text-sm font-bold leading-snug text-fg">{clip.title}</h3>
          <p className="truncate text-xs text-fg-3">
            {clip.authorName}
            {clip.authorIsGuest ? ` · ${b("게스트", "Guest")}` : ""}
          </p>
          <div className="mt-auto flex items-center justify-between gap-2 pt-1">
            <TimelapseClipLikeButton clip={clip} />
            <span className="inline-flex items-center gap-1 text-xs text-fg-3">
              <Eye size={13} aria-hidden />
              <span className="numeral">{formatCount(clip.views, getActiveI18nLocale())}</span>
            </span>
          </div>
        </div>
      </article>

      {detailOpen && <TimelapseClipDetailModal clip={clip} onClose={() => setDetailOpen(false)} />}
    </>
  );
}
