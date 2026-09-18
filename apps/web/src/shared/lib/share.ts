export type ShareChannel =
  | "native"
  | "kakao"
  | "naver"
  | "line"
  | "x"
  | "facebook"
  | "telegram"
  | "email"
  | "copy"
  | "qr";

export interface SharePayload {
  readonly title: string;
  readonly url: string;
  readonly text?: string;
  readonly imageUrl?: string;
  readonly buttonLabel?: string;
}

export type ShareOutcome = "opened" | "completed" | "cancelled" | "failed";

export interface ShareEventDetail {
  readonly channel: ShareChannel;
  /**
   * `opened` means an external picker/target or QR was presented. It is not proof that a
   * recipient received a message. `completed` is reserved for operations the browser can
   * positively confirm, such as copying a link or a resolved Web Share request.
   */
  readonly outcome: ShareOutcome;
  readonly path: string;
}

export const TOONSPECTRUM_SHARE_EVENT = "toonspectrum:share";
const SHARE_CAMPAIGN = "content_share";

function browserOrigin(): string {
  return typeof window === "undefined"
    ? "https://www.toonstudio.cloud"
    : window.location.origin;
}

export function absoluteShareUrl(
  value: string,
  origin = browserOrigin(),
): string {
  try {
    return new URL(value, origin).toString();
  } catch {
    return new URL("/", origin).toString();
  }
}

export function absoluteShareImageUrl(
  value?: string,
  origin = browserOrigin(),
): string {
  return absoluteShareUrl(value?.trim() || "/brand/toonstudio-og.png", origin);
}

function shareMedium(channel: ShareChannel): "email" | "share" | "social" {
  if (channel === "email") return "email";
  if (["native", "copy", "qr"].includes(channel)) return "share";
  return "social";
}

export function withShareAttribution(
  url: string,
  channel: ShareChannel,
): string {
  const target = new URL(absoluteShareUrl(url));
  target.searchParams.set("utm_source", channel);
  target.searchParams.set("utm_medium", shareMedium(channel));
  target.searchParams.set("utm_campaign", SHARE_CAMPAIGN);
  return target.toString();
}

function compact(value: string | undefined, maxLength: number): string {
  return (value ?? "")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, maxLength);
}

export function shareText(payload: SharePayload): string {
  return compact(payload.text, 240) || compact(payload.title, 120);
}

export type LinkShareChannel = Exclude<
  ShareChannel,
  "native" | "kakao" | "copy" | "qr"
>;

export function shareTargetUrl(
  channel: LinkShareChannel,
  payload: SharePayload,
): string {
  const url = withShareAttribution(payload.url, channel);
  const title = compact(payload.title, 120);
  const text = shareText(payload);

  switch (channel) {
    case "naver":
      return `https://share.naver.com/web/shareView?url=${encodeURIComponent(url)}&title=${encodeURIComponent(title)}`;
    case "line":
      return `https://social-plugins.line.me/lineit/share?url=${encodeURIComponent(url)}`;
    case "x":
      return `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
    case "facebook":
      return `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`;
    case "telegram":
      return `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`;
    case "email": {
      const body = `${text}\n\n${url}`;
      return `mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`;
    }
  }
}

function nativeShareData(payload: SharePayload): ShareData {
  return {
    title: compact(payload.title, 120),
    text: shareText(payload),
    url: withShareAttribution(payload.url, "native"),
  };
}

export function canNativeShare(payload: SharePayload): boolean {
  if (
    typeof navigator === "undefined"
    || typeof navigator.share !== "function"
  ) {
    return false;
  }
  const data = nativeShareData(payload);
  try {
    return typeof navigator.canShare !== "function" || navigator.canShare(data);
  } catch {
    return false;
  }
}

export async function nativeShare(payload: SharePayload): Promise<void> {
  if (!canNativeShare(payload)) {
    throw new Error("Web Share API is unavailable.");
  }
  await navigator.share(nativeShareData(payload));
}

export function isShareCancellation(error: unknown): boolean {
  return Boolean(
    error
      && typeof error === "object"
      && "name" in error
      && error.name === "AbortError",
  );
}

export async function copyShareLink(payload: SharePayload): Promise<boolean> {
  const url = withShareAttribution(payload.url, "copy");
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(url);
      return true;
    }
  } catch {
    // Restricted webviews and non-secure localhost can still use selection copy.
  }

  const textArea = document.createElement("textarea");
  textArea.value = url;
  textArea.setAttribute("readonly", "");
  textArea.style.position = "fixed";
  textArea.style.opacity = "0";
  document.body.append(textArea);
  textArea.select();

  try {
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    textArea.remove();
  }
}

export function emitShareEvent(
  channel: ShareChannel,
  outcome: ShareEventDetail["outcome"],
  payload: SharePayload,
): void {
  if (typeof window === "undefined") return;
  let path = "/";
  try {
    path = new URL(absoluteShareUrl(payload.url)).pathname;
  } catch {
    // Keep the privacy-safe root fallback instead of emitting an unparsed URL.
  }

  window.dispatchEvent(
    new CustomEvent<ShareEventDetail>(TOONSPECTRUM_SHARE_EVENT, {
      detail: { channel, outcome, path },
    }),
  );
}
