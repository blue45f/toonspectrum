import { translateCurrentStaticSourceText } from "@/shared/lib/i18n-bilingual-copy";
import * as Dialog from "@radix-ui/react-dialog";
import {
  Check,
  Copy,
  LoaderCircle,
  Mail,
  QrCode,
  Share2,
  Smartphone,
  X,
} from "lucide-react";
import { useState } from "react";

import type { ReactElement } from "react";

import {
  absoluteShareImageUrl,
  absoluteShareUrl,
  canNativeShare,
  copyShareLink,
  emitShareEvent,
  isShareCancellation,
  nativeShare,
  shareTargetUrl,
  shareText,
  withShareAttribution,
  type LinkShareChannel,
  type SharePayload,
} from "@/shared/lib/share";
import {
  isKakaoShareConfigured,
  shareWithKakao,
} from "@/shared/lib/kakao-share";
import { useT } from "@/shared/lib/i18n";
import { cn } from "@/shared/lib/utils";

type Notice =
  | { readonly kind: "success"; readonly message: string }
  | { readonly kind: "error"; readonly message: string }
  | null;

interface ShareChannelOption {
  readonly channel: LinkShareChannel;
  readonly labelKey?: string;
  readonly label?: string;
  readonly badge: string;
  readonly badgeClassName: string;
}

const LINK_CHANNELS: readonly ShareChannelOption[] = [
  {
    channel: "naver",
    labelKey: "share.social.naver",
    badge: "N",
    badgeClassName: "bg-[#03c75a] text-white",
  },
  {
    channel: "line",
    labelKey: "share.social.line",
    badge: "L",
    badgeClassName: "bg-[#06c755] text-white",
  },
  {
    channel: "x",
    labelKey: "share.social.x",
    badge: "X",
    badgeClassName: "bg-fg text-panel",
  },
  {
    channel: "facebook",
    labelKey: "share.social.facebook",
    badge: "f",
    badgeClassName: "bg-[#1877f2] text-white",
  },
  {
    channel: "linkedin",
    label: "LinkedIn",
    badge: "in",
    badgeClassName: "bg-[#0a66c2] text-white",
  },
  {
    channel: "telegram",
    labelKey: "share.social.telegram",
    badge: "T",
    badgeClassName: "bg-[#229ed9] text-white",
  },
  {
    channel: "email",
    labelKey: "share.social.email",
    badge: "@",
    badgeClassName: "bg-raised text-fg",
  },
];

const CHANNEL_CLASS =
  "group flex min-h-20 flex-col items-center justify-center gap-2 rounded-xl border border-line bg-card px-2 py-3 text-center text-xs font-semibold text-fg-2 transition-colors hover:border-accent/50 hover:bg-accent-soft/35 hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70";
export interface ShareDialogProps {
  readonly payload: SharePayload;
  readonly trigger: ReactElement;
  readonly defaultOpen?: boolean;
}

function shareHost(url: string): string {
  try {
    return new URL(absoluteShareUrl(url)).host;
  } catch {
    return "www.toonstudio.cloud";
  }
}

export function ShareDialog({ payload, trigger, defaultOpen = false }: ShareDialogProps) {
  const t = useT();
  const [open, setOpen] = useState(defaultOpen);
  const [notice, setNotice] = useState<Notice>(null);
  const [busy, setBusy] = useState<"native" | "kakao" | "qr" | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [qrVisible, setQrVisible] = useState(false);
  const kakaoConfigured = isKakaoShareConfigured();
  const previewText = shareText(payload);
  const previewImage = absoluteShareImageUrl(payload.imageUrl);

  function changeOpen(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) {
      setNotice(null);
      setQrVisible(false);
    }
  }

  async function runNativeShare() {
    if (busy) return;
    setBusy("native");
    setNotice(null);
    try {
      await nativeShare(payload);
      emitShareEvent("native", "completed", payload);
      setNotice({ kind: "success", message: t("share.status.shared") });
    } catch (error) {
      if (isShareCancellation(error)) {
        emitShareEvent("native", "cancelled", payload);
      } else {
        emitShareEvent("native", "failed", payload);
        setNotice({ kind: "error", message: t("share.status.failed") });
      }
    } finally {
      setBusy(null);
    }
  }

  async function runKakaoShare() {
    if (busy || !kakaoConfigured) return;
    setBusy("kakao");
    setNotice(null);
    try {
      await shareWithKakao(payload);
      emitShareEvent("kakao", "opened", payload);
      setNotice({ kind: "success", message: t("share.status.kakaoOpened") });
    } catch {
      emitShareEvent("kakao", "failed", payload);
      setNotice({ kind: "error", message: t("share.status.kakaoFailed") });
    } finally {
      setBusy(null);
    }
  }

  async function copyLink() {
    setNotice(null);
    const copied = await copyShareLink(payload);
    emitShareEvent("copy", copied ? "completed" : "failed", payload);
    setNotice({
      kind: copied ? "success" : "error",
      message: t(copied ? "share.status.copied" : "share.status.copyFailed"),
    });
  }

  function recordLinkShare(channel: LinkShareChannel) {
    emitShareEvent(channel, "opened", payload);
    setNotice({
      kind: "success",
      message: t(
        channel === "email"
          ? "share.status.emailOpened"
          : "share.status.channelOpened",
      ),
    });
  }

  async function showQrCode() {
    if (busy) return;
    if (qrDataUrl) {
      setQrVisible((value) => !value);
      return;
    }
    setBusy("qr");
    setNotice(null);
    try {
      const { toDataURL } = await import("qrcode");
      const dataUrl = await toDataURL(withShareAttribution(payload.url, "qr"), {
        errorCorrectionLevel: "M",
        margin: 1,
        width: 280,
      });
      setQrDataUrl(dataUrl);
      setQrVisible(true);
      emitShareEvent("qr", "opened", payload);
    } catch {
      emitShareEvent("qr", "failed", payload);
      setNotice({ kind: "error", message: t("share.status.qrFailed") });
    } finally {
      setBusy(null);
    }
  }

  const nativeAvailable = canNativeShare(payload);

  return (
    <Dialog.Root open={open} onOpenChange={changeOpen}>
      <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[180] bg-[oklch(0.12_0.012_70/0.72)] backdrop-blur-sm" />
        <Dialog.Content
          aria-modal="true"
          className="fixed bottom-0 left-1/2 z-[181] max-h-[calc(100dvh-1rem)] w-full max-w-xl -translate-x-1/2 overflow-y-auto rounded-t-3xl border border-line-strong bg-panel p-5 shadow-2xl focus:outline-none sm:bottom-auto sm:top-1/2 sm:w-[calc(100%-2rem)] sm:-translate-y-1/2 sm:rounded-3xl sm:p-6"
        >
          <div className="flex items-start gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-2xl border border-accent/25 bg-accent-soft text-accent">
              <Share2 size={20} aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <Dialog.Title className="font-display text-lg font-bold text-fg">
                {t("share.dialogTitle")}
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-xs leading-relaxed text-fg-3">
                {t("share.dialogDescription")}
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label={t("share.close")}
                className="grid size-11 shrink-0 place-items-center rounded-xl text-fg-3 transition-colors hover:bg-raised hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
              >
                <X size={19} aria-hidden="true" />
              </button>
            </Dialog.Close>
          </div>

          <article className="mt-5 grid grid-cols-[4.5rem_1fr] gap-3 rounded-2xl border border-line bg-card p-3">
            <img
              src={previewImage}
              alt=""
              loading="lazy"
              className="aspect-square size-[4.5rem] rounded-xl bg-raised object-cover"
              onError={(event) => {
                event.currentTarget.onerror = null;
                event.currentTarget.src = absoluteShareImageUrl();
              }}
            />
            <div className="min-w-0 self-center">
              <h3 className="line-clamp-2 text-sm font-bold leading-snug text-fg">
                {payload.title}
              </h3>
              {previewText && (
                <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-fg-3">
                  {previewText}
                </p>
              )}
              <p className="mt-1 truncate text-[0.68rem] text-fg-3">
                {shareHost(payload.url)}
              </p>
            </div>
          </article>

          {nativeAvailable && (
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => void runNativeShare()}
              className="mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 text-sm font-bold text-on-accent transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70 focus-visible:ring-offset-2 focus-visible:ring-offset-panel disabled:cursor-wait disabled:opacity-55"
            >
              {busy === "native" ? (
                <LoaderCircle size={17} className="animate-spin" aria-hidden="true" />
              ) : (
                <Smartphone size={17} aria-hidden="true" />
              )}
              {t("share.native")}
            </button>
          )}

          <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-4">
            {kakaoConfigured && (
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => void runKakaoShare()}
                className={CHANNEL_CLASS}
              >
                <span className="grid size-9 place-items-center rounded-full bg-[#fee500] text-sm font-black text-[#191919]">
                  {busy === "kakao" ? (
                    <LoaderCircle size={16} className="animate-spin" aria-hidden="true" />
                  ) : (
                    "K"
                  )}
                </span>
                {t("share.social.kakao")}
              </button>
            )}
            {LINK_CHANNELS.map((option) => {
              const email = option.channel === "email";
              return (
                <a
                  key={option.channel}
                  href={shareTargetUrl(option.channel, payload)}
                  target={email ? undefined : translateCurrentStaticSourceText("shared.components.share.dialog", "en", "_blank")}
                  rel={email ? undefined : translateCurrentStaticSourceText("shared.components.share.dialog", "en", "noopener noreferrer")}
                  onClick={() => recordLinkShare(option.channel)}
                  className={CHANNEL_CLASS}
                >
                  <span
                    className={cn(
                      "grid size-9 place-items-center rounded-full text-sm font-black",
                      option.badgeClassName,
                    )}
                  >
                    {email ? <Mail size={16} aria-hidden="true" /> : option.badge}
                  </span>
                  {option.label ?? (option.labelKey ? t(option.labelKey) : option.channel)}
                </a>
              );
            })}
            <button
              type="button"
              onClick={() => void copyLink()}
              className={CHANNEL_CLASS}
            >
              <span className="grid size-9 place-items-center rounded-full bg-raised text-fg">
                {notice?.kind === "success"
                && notice.message === t("share.status.copied") ? (
                  <Check size={16} className="text-good" aria-hidden="true" />
                ) : (
                  <Copy size={16} aria-hidden="true" />
                )}
              </span>
              {t("share.copy")}
            </button>

            <button
              type="button"
              disabled={busy !== null}
              onClick={() => void showQrCode()}
              className={CHANNEL_CLASS}
              aria-expanded={qrVisible}
            >
              <span className="grid size-9 place-items-center rounded-full bg-raised text-fg">
                {busy === "qr" ? (
                  <LoaderCircle size={16} className="animate-spin" aria-hidden="true" />
                ) : (
                  <QrCode size={17} aria-hidden="true" />
                )}
              </span>
              {t(qrVisible ? "share.qrHide" : "share.qr")}
            </button>
          </div>

          {qrVisible && qrDataUrl && (
            <section
              aria-label={t("share.qrTitle")}
              className="mt-4 flex flex-col items-center rounded-2xl border border-line bg-white p-4 text-center text-slate-900"
            >
              <img
                src={qrDataUrl}
                width={220}
                height={220}
                alt={t("share.qrAlt")}
                className="size-[min(55vw,13.75rem)]"
              />
              <h3 className="mt-2 text-sm font-bold">{t("share.qrTitle")}</h3>
              <p className="mt-1 max-w-sm text-xs leading-relaxed text-slate-600">
                {t("share.qrDescription")}
              </p>
            </section>
          )}

          {notice && (
            <p
              role={notice.kind === "error" ? translateCurrentStaticSourceText("shared.components.share.dialog", "en", "alert") : translateCurrentStaticSourceText("shared.components.share.dialog", "en", "status")}
              aria-live="polite"
              className={cn(
                "mt-4 rounded-xl border px-3 py-2 text-xs font-medium",
                notice.kind === "success"
                  ? "border-good/30 bg-good/10 text-good"
                  : "border-bad/30 bg-bad/10 text-bad",
              )}
            >
              {notice.message}
            </p>
          )}

          <p className="mt-4 text-center text-[0.68rem] leading-relaxed text-fg-3">
            {nativeAvailable
              ? t("share.nativeHint")
              : t("share.desktopHint")}
          </p>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
