// 발행 직후 "공유하기" — 링크 복사 · 카카오톡 · 기기 공유(Web Share)를 한 줄에 두고,
// 나머지 채널·QR은 공용 공유 창으로 잇는다. 발행 → 공유가 끊기지 않도록 발행 결과 영수증 안에 둔다.
// 아직 공개되지 않은 작품(예약·비공개·초안)에는 열리지 않는 링크를 만들지 않고, 왜 아직 공유할 수 없는지와
// 무엇을 하면 되는지를 알린다. 카카오톡은 앱 키가 설정된 배포에서만, 기기 공유는 브라우저가 지원할 때만 보인다.
import { Check, Copy, Link2, LoaderCircle, Share2, Smartphone } from "lucide-react";
import { useId, useMemo, useRef, useState } from "react";

import type { StudioPublishResultKind } from "../studio-publish-result";
import { creatorWorkHref } from "./showcase-links";

import { SharePageButton } from "@/shared/components/share-page-button";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { isKakaoShareConfigured, shareWithKakao } from "@/shared/lib/kakao-share";
import {
  canNativeShare,
  copyShareLink,
  emitShareEvent,
  isShareCancellation,
  nativeShare,
  withShareAttribution,
  type SharePayload,
} from "@/shared/lib/share";
import { cn } from "@/shared/lib/utils";

export interface PublishShareActionsProps {
  /** 발행 결과 — 공개된 작품(`published`)만 공유 링크가 열린다. */
  readonly kind: StudioPublishResultKind;
  readonly workId: string;
  readonly title: string;
  readonly description?: string;
  /** 공유 미리보기 이미지(절대·상대 경로 모두 가능). 없으면 서비스 기본 이미지를 쓴다. */
  readonly imageUrl?: string;
  readonly className?: string;
}

type Notice = { readonly kind: "success" | "error"; readonly message: string } | null;
type Busy = "native" | "kakao" | null;

const ACTION = "min-h-11 gap-2";

export function PublishShareActions({ kind, workId, title, description, imageUrl, className }: PublishShareActionsProps) {
  const bt = useBilingual("PublishShareActions");
  const headingId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState<Busy>(null);

  const shareTitle = title.trim() || bt("창작 작품", "Creative work");
  const payload = useMemo<SharePayload>(
    () => ({
      title: shareTitle,
      text: description?.trim() || undefined,
      url: creatorWorkHref(workId),
      imageUrl,
      buttonLabel: bt("작품 감상하기", "View the work"),
    }),
    [bt, description, imageUrl, shareTitle, workId],
  );
  const shareUrl = withShareAttribution(payload.url, "copy");
  const nativeAvailable = canNativeShare(payload);
  const kakaoAvailable = isKakaoShareConfigured();

  const copy = async () => {
    setNotice(null);
    setCopied(false);
    const succeeded = await copyShareLink(payload);
    emitShareEvent("copy", succeeded ? "completed" : "failed", payload);
    if (succeeded) {
      setCopied(true);
      setNotice({ kind: "success", message: bt("링크를 복사했어요. 원하는 곳에 붙여 넣어 보세요.", "Link copied. Paste it wherever you like.") });
      return;
    }
    // 클립보드가 막힌 환경에서는 주소를 선택해 두어 직접 복사할 수 있게 한다.
    inputRef.current?.select();
    setNotice({ kind: "error", message: bt("복사 권한이 없어요. 위 주소를 선택해 직접 복사해 주세요.", "Clipboard is blocked. Select the address above and copy it yourself.") });
  };

  const runNative = async () => {
    if (busy) return;
    setBusy("native");
    setNotice(null);
    setCopied(false);
    try {
      await nativeShare(payload);
      emitShareEvent("native", "completed", payload);
      setNotice({ kind: "success", message: bt("공유 창에서 보냈어요.", "Shared from the system share sheet.") });
    } catch (error) {
      if (isShareCancellation(error)) {
        emitShareEvent("native", "cancelled", payload);
      } else {
        emitShareEvent("native", "failed", payload);
        setNotice({ kind: "error", message: bt("기기 공유를 열지 못했어요. 링크 복사를 이용해 주세요.", "Couldn't open device sharing. Use Copy link instead.") });
      }
    } finally {
      setBusy(null);
    }
  };

  const runKakao = async () => {
    if (busy) return;
    setBusy("kakao");
    setNotice(null);
    setCopied(false);
    try {
      await shareWithKakao(payload);
      emitShareEvent("kakao", "opened", payload);
      setNotice({ kind: "success", message: bt("카카오톡 공유 창을 열었어요. 받을 사람을 골라 보내세요.", "Opened Kakao Talk sharing. Pick who to send it to.") });
    } catch {
      emitShareEvent("kakao", "failed", payload);
      setNotice({ kind: "error", message: bt("카카오톡 공유를 열지 못했어요. 링크 복사를 이용해 주세요.", "Couldn't open Kakao Talk sharing. Use Copy link instead.") });
    } finally {
      setBusy(null);
    }
  };

  const ready = kind === "published";
  const blockedReason = kind === "scheduled"
    ? bt("예약한 시각에 공개되면 공유 링크가 열려요. 공개된 뒤 작품 페이지의 ‘작품 공유’에서 보낼 수 있어요.", "The share link opens once the work goes public at the scheduled time. Share it from the work page after that.")
    : kind === "private"
      ? bt("비공개 작품은 링크가 열리지 않아 공유할 수 없어요. 공개 범위를 ‘링크 공개’나 ‘전체 공개’로 바꾸면 공유할 수 있어요.", "A private work's link doesn't open, so it can't be shared. Switch visibility to Unlisted or Public to share it.")
      : bt("초안은 아직 공개되지 않았어요. 게시하면 바로 공유할 수 있어요.", "A draft isn't public yet. Publish it and you can share it right away.");

  return (
    <section
      aria-labelledby={headingId}
      data-publish-share={ready ? "ready" : kind}
      className={cn("rounded-2xl border border-line bg-card/70 p-4 sm:p-5", className)}
    >
      <div className="flex items-start gap-3">
        <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
          <Share2 size={18} />
        </span>
        <div className="min-w-0">
          <h3 id={headingId} className="text-base font-black text-fg">{bt("공유하기", "Share")}</h3>
          <p className="mt-1 text-pretty break-keep text-sm leading-6 text-fg-2">
            {ready
              ? bt("링크를 복사하거나 카카오톡·기기 공유로 바로 알려 보세요.", "Copy the link, or send it through Kakao Talk or your device's share sheet.")
              : blockedReason}
          </p>
        </div>
      </div>

      {ready ? (
        <>
          <div className="mt-4 flex min-h-11 items-center gap-2 rounded-xl border border-line bg-panel px-3">
            <Link2 size={15} aria-hidden className="shrink-0 text-fg-3" />
            <input
              ref={inputRef}
              readOnly
              value={shareUrl}
              aria-label={bt("공유 주소", "Share address")}
              onFocus={(event) => event.currentTarget.select()}
              className="min-w-0 flex-1 bg-transparent py-2 text-sm text-fg outline-none"
            />
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void copy()}
              className={buttonClass({ size: "md", variant: "solid", className: ACTION })}
            >
              {copied ? <Check size={16} aria-hidden /> : <Copy size={16} aria-hidden />}
              {copied ? bt("복사됨", "Copied") : bt("링크 복사", "Copy link")}
            </button>
            {kakaoAvailable ? (
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => void runKakao()}
                className={buttonClass({ size: "md", variant: "outline", className: ACTION })}
              >
                {busy === "kakao"
                  ? <LoaderCircle size={16} aria-hidden className="animate-spin motion-reduce:animate-none" />
                  : <span aria-hidden className="grid size-5 place-items-center rounded-full bg-[#fee500] text-xs font-black text-[#191919]">K</span>}
                {bt("카카오톡", "Kakao Talk")}
              </button>
            ) : null}
            {nativeAvailable ? (
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => void runNative()}
                className={buttonClass({ size: "md", variant: "outline", className: ACTION })}
              >
                {busy === "native"
                  ? <LoaderCircle size={16} aria-hidden className="animate-spin motion-reduce:animate-none" />
                  : <Smartphone size={16} aria-hidden />}
                {bt("기기 공유", "Device share")}
              </button>
            ) : null}
            <SharePageButton
              path={payload.url}
              text={shareTitle}
              description={payload.text}
              imageUrl={imageUrl}
              label={bt("다른 방법·QR", "More ways · QR")}
              actionLabel={payload.buttonLabel}
              className={buttonClass({ size: "md", variant: "ghost", className: ACTION })}
            />
          </div>
        </>
      ) : null}

      {/* 알림 영역은 늘 두고 내용만 바꾼다 — 나중에 끼워 넣은 live region은 화면낭독기가 놓치기 쉽다. */}
      <p
        role="status"
        aria-live="polite"
        className={cn(
          "mt-3 text-sm leading-6",
          notice ? (notice.kind === "success" ? "text-fg-2" : "text-bad") : "sr-only",
        )}
      >
        {notice?.message ?? ""}
      </p>
    </section>
  );
}
