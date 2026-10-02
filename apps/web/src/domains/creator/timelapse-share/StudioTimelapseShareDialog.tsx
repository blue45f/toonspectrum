import { CheckCircle2, Eye, Loader2, Share2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

import {
  TIMELAPSE_CLIP_VISIBILITY_OPTIONS,
  type TimelapseClipVisibility,
  type TimelapseSharedClip,
} from "./timelapse-share-model";
import { registerTimelapseClipBlob, useTimelapseShareStore } from "./timelapse-share-store";

import { useAccountGate } from "@/domains/auth/public/account-gate";
import { useSession } from "@/domains/auth/public/session/auth-session-store";
import { useGuestSession } from "@/domains/auth/public/session/guest-session";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import Link from "@/shared/navigation/router-link";

export interface TimelapseShareClipSource {
  readonly blob: Blob;
  readonly durationSec: number;
  readonly stepCount: number;
  readonly width: number;
  readonly height: number;
  readonly resolutionLabel: string;
  /** 내보낼 때 워터마크를 입혔는지(게스트는 항상 true). */
  readonly watermark: boolean;
  readonly thumbnailDataUrl: string;
}

export interface StudioTimelapseShareDialogProps {
  readonly open: boolean;
  readonly source: TimelapseShareClipSource | null;
  /** 작품 제목 기반 기본 클립 제목. */
  readonly defaultTitle: string;
  readonly onClose: () => void;
  readonly onPublished: (clip: TimelapseSharedClip) => void;
}

export const TIMELAPSE_GALLERY_PATH = "/community/timelapses";

const CONTROL_BUTTON =
  "inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-45";
const ICON_BUTTON =
  "inline-grid size-9 place-items-center rounded-lg border border-line bg-card text-fg-3 transition-colors hover:bg-accent-soft hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-45";

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

// 발화 없는 타임랩스용 빈 자막 트랙(접근성 lint 대응, 기존 Studio 패턴과 동일).
const EMPTY_TIMELAPSE_CAPTIONS = "data:text/vtt;charset=utf-8,WEBVTT%0A%0A";

function formatSeconds(sec: number): string {
  if (sec <= 0) return "0초";
  const rounded = Math.round(sec);
  return rounded < 60 ? `${rounded}초` : `${Math.floor(rounded / 60)}분 ${rounded % 60}초`;
}

export function StudioTimelapseShareDialog({
  open,
  source,
  defaultTitle,
  onClose,
  onPublished,
}: StudioTimelapseShareDialogProps) {
  const b = useBilingual("domains.creator.timelapse.share.dialog");
  const { status, data } = useSession();
  const { isGuest, guest } = useGuestSession();
  const { ensureAccount } = useAccountGate();
  const publishClip = useTimelapseShareStore((s) => s.publishClip);

  const [title, setTitle] = useState(defaultTitle);
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<TimelapseClipVisibility>("public");
  const [publishing, setPublishing] = useState(false);
  const [published, setPublished] = useState<TimelapseSharedClip | null>(null);

  // 다이얼로그가 열릴 때마다 입력 초기화.
  useEffect(() => {
    if (open) {
      setTitle(defaultTitle);
      setDescription("");
      setVisibility("public");
      setPublishing(false);
      setPublished(null);
    }
  }, [open, defaultTitle]);

  const previewUrl = useMemo(() => {
    if (!open || !source) return null;
    return URL.createObjectURL(source.blob);
  }, [open, source]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  // ESC로 닫기 — 게시 완료 화면이 아닐 때만(게시 중 실수로 닫히지 않게).
  useEffect(() => {
    if (!open || publishing) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, publishing, onClose]);

  if (!open || !source) return null;

  // 위 early return 이후 source는 null이 아님 — publish 클로저가 안전하게 참조하도록 별칭.
  const clipSource = source;

  function publish() {
    if (publishing || published) return;
    // 게스트-퍼스트: 게시는 로그인 유도. nudge에서 "나중에"를 누르면 여기서 멈춘다.
    if (!ensureAccount("publish")) return;
    setPublishing(true);
    try {
      const authorName =
        status === "authenticated"
          ? (data?.user?.name?.trim() ?? "")
          : b("게스트", "Guest");
      // 내 클립 판정용 소유자 키 — 로그인 사용자 id, 없으면 게스트 세션 id.
      const userId = status === "authenticated" ? data?.user?.id : undefined;
      const ownerKey = userId ? `user:${userId}` : `guest:${guest?.id ?? "anonymous"}`;
      const clip = publishClip({
        title,
        description,
        visibility,
        width: clipSource.width,
        height: clipSource.height,
        durationSec: clipSource.durationSec,
        stepCount: clipSource.stepCount,
        watermark: clipSource.watermark,
        authorName: authorName || b("익명의 창작자", "Anonymous creator"),
        authorIsGuest: status !== "authenticated" || isGuest,
        ownerKey,
        thumbnailDataUrl: clipSource.thumbnailDataUrl,
      });
      registerTimelapseClipBlob(clip.id, clipSource.blob);
      setPublished(clip);
      onPublished(clip);
    } finally {
      setPublishing(false);
    }
  }

  const modal = (
    <div
      aria-modal="true"
      role="dialog"
      aria-label={b("타임랩스 공유하기", "Share timelapse")}
      className="fixed inset-0 z-[90] bg-[oklch(0.08_0.01_70/0.82)] p-2 text-fg backdrop-blur-sm sm:p-4"
    >
      <div className="mx-auto flex h-full max-h-full max-w-[560px] flex-col overflow-hidden rounded-2xl border border-line bg-panel shadow-[0_24px_80px_oklch(0.05_0.01_70/0.55)]">
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-line px-4 py-3">
          <div className="min-w-0">
            <p className="eyebrow flex items-center gap-1.5 text-accent">
              <Share2 size={14} aria-hidden /> {b("타임랩스 공유", "Timelapse share")}
            </p>
            <h2 className="mt-1 text-lg font-bold tracking-tight text-fg">
              {published
                ? b("공유됐어요", "Shared")
                : b("타임랩스 공유하기", "Share timelapse")}
            </h2>
          </div>
          <button
            type="button"
            aria-label={b("닫기", "Close")}
            title={b("닫기", "Close")}
            disabled={publishing}
            className={ICON_BUTTON}
            onClick={onClose}
          >
            <X size={17} aria-hidden />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          {published ? (
            <div className="flex flex-col items-center py-6 text-center">
              <CheckCircle2 size={40} className="text-good" aria-hidden />
              <p className="mt-3 text-sm font-semibold text-fg">
                {b("클립이 갤러리에 올라갔어요.", "Your clip is live in the gallery.")}
              </p>
              <p className="mt-1 text-xs text-fg-3">
                {b(
                  "이 브라우저에서 만든 클립은 이 브라우저의 갤러리에서 재생할 수 있어요.",
                  "Clips made in this browser play back in this browser's gallery.",
                )}
              </p>
              <Link
                href={TIMELAPSE_GALLERY_PATH}
                className={cx(CONTROL_BUTTON, "mt-4 border-accent/60 bg-accent text-on-accent hover:bg-accent/90")}
                onClick={onClose}
              >
                <Eye size={14} aria-hidden />
                {b("타임랩스 갤러리에서 보기", "View in timelapse gallery")}
              </Link>
            </div>
          ) : (
            <>
              {previewUrl && (
                <figure className="mb-4 overflow-hidden rounded-xl border border-line bg-black">
                  <video
                    src={previewUrl}
                    controls
                    playsInline
                    preload="metadata"
                    className="aspect-[9/16] max-h-[300px] w-full bg-black object-contain"
                    aria-label={b("공유할 타임랩스 미리보기", "Timelapse preview")}
                  >
                    <track
                      kind="captions"
                      src={EMPTY_TIMELAPSE_CAPTIONS}
                      srcLang="zxx"
                      label={b("발화 없음", "No speech")}
                    />
                  </video>
                  <figcaption className="flex items-center justify-between gap-2 px-2.5 py-1.5 text-[0.68rem] text-fg-3">
                    <span>
                      {source.resolutionLabel} · {formatSeconds(source.durationSec)} ·{" "}
                      {b(`${source.stepCount}단계`, `${source.stepCount} steps`)}
                    </span>
                    {source.watermark && (
                      <span className="rounded-full bg-raised px-2 py-0.5 font-semibold text-fg-2">
                        {b("툰스튜디오 워터마크 포함", "Toonstudio watermark included")}
                      </span>
                    )}
                  </figcaption>
                </figure>
              )}

              <label className="mb-3 flex flex-col gap-1 text-xs text-fg-2">
                {b("제목", "Title")}
                <input
                  type="text"
                  value={title}
                  maxLength={80}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={b("예: 오늘의 드로잉 과정", "e.g. Today's drawing process")}
                  className="h-9 rounded-lg border border-line bg-canvas px-2.5 text-sm text-fg outline-none focus:border-accent/50"
                />
              </label>

              <label className="mb-3 flex flex-col gap-1 text-xs text-fg-2">
                {b("설명", "Description")}
                <textarea
                  value={description}
                  maxLength={500}
                  rows={3}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={b(
                    "이 타임랩스에 대해 짧게 소개해주세요.",
                    "Say a few words about this timelapse.",
                  )}
                  className="resize-none rounded-lg border border-line bg-canvas px-2.5 py-2 text-sm text-fg outline-none focus:border-accent/50"
                />
              </label>

              <label className="mb-1 flex flex-col gap-1 text-xs text-fg-2">
                {b("공개 범위", "Visibility")}
                <select
                  value={visibility}
                  onChange={(e) => setVisibility(e.target.value as TimelapseClipVisibility)}
                  className="h-9 rounded-lg border border-line bg-canvas px-2 text-sm text-fg outline-none focus:border-accent/50"
                >
                  {TIMELAPSE_CLIP_VISIBILITY_OPTIONS.map((option) => (
                    <option key={option.id} value={option.id}>
                      {b(option.ko, option.en)}
                    </option>
                  ))}
                </select>
              </label>
              <p className="mb-3 text-[0.68rem] text-fg-3">
                {visibility === "public" &&
                  b(
                    "타임랩스 갤러리에 공개돼요. 로그인 없이도 볼 수 있어요.",
                    "Shown in the timelapse gallery. Visible without sign-in.",
                  )}
                {visibility === "unlisted" &&
                  b(
                    "갤러리 목록에는 안 뜨고, 내 클립 목록에서만 볼 수 있어요.",
                    "Hidden from the gallery list; only visible in your own clips.",
                  )}
                {visibility === "private" &&
                  b("나만 볼 수 있어요.", "Only you can see it.")}
              </p>
            </>
          )}
        </div>

        {!published && (
          <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-line px-4 py-3">
            <button
              type="button"
              onClick={onClose}
              disabled={publishing}
              className={cx(CONTROL_BUTTON, "border-line bg-card text-fg-2 hover:bg-raised")}
            >
              {b("취소", "Cancel")}
            </button>
            <button
              type="button"
              onClick={publish}
              disabled={publishing}
              className={cx(CONTROL_BUTTON, "border-accent/60 bg-accent text-on-accent hover:bg-accent/90")}
            >
              {publishing ? (
                <Loader2 size={14} className="animate-spin" aria-hidden />
              ) : (
                <Share2 size={14} aria-hidden />
              )}
              {b("게시하기", "Publish")}
            </button>
          </footer>
        )}
      </div>
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(modal, document.body);
}
