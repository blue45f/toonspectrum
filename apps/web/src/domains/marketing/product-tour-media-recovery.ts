export const PRODUCT_TOUR_MAX_AUTOMATIC_RECOVERIES = 2;
export const PRODUCT_TOUR_STALL_TIMEOUT_MS = 8_000;

export function productTourSourceForAttempt(source: string, attempt: number): string {
  if (!Number.isFinite(attempt) || attempt <= 0) return source;
  const url = new URL(source, "https://toonstudio.invalid");
  url.searchParams.set("recovery", String(Math.floor(attempt)));
  return `${url.pathname}${url.search}${url.hash}`;
}

export function canAutomaticallyRecoverProductTour(
  recoveryCount: number,
  online: boolean,
): boolean {
  return online
    && Number.isFinite(recoveryCount)
    && recoveryCount >= 0
    && recoveryCount < PRODUCT_TOUR_MAX_AUTOMATIC_RECOVERIES;
}

export function isExpectedMediaPlayRejection(reason: unknown): boolean {
  if (!reason || typeof reason !== "object" || !("name" in reason)) return false;
  return reason.name === "AbortError" || reason.name === "NotAllowedError";
}

export function productTourRecoveryLabel(
  reason: "decode" | "network" | "stall" | "online" | "manual",
  locale: "ko" | "en",
): string {
  const messages = {
    ko: {
      decode: "영상 디코딩을 다시 연결하고 있습니다.",
      network: "영상 전송을 다시 연결하고 있습니다.",
      stall: "멈춘 재생을 현재 위치에서 복구하고 있습니다.",
      online: "인터넷 연결이 돌아와 재생을 복구하고 있습니다.",
      manual: "현재 챕터에서 영상을 다시 불러오고 있습니다.",
    },
    en: {
      decode: "Reconnecting the video decoder.",
      network: "Reconnecting the video stream.",
      stall: "Recovering stalled playback from the current position.",
      online: "The connection is back. Recovering playback.",
      manual: "Reloading the video from the current chapter.",
    },
  } as const;
  return messages[locale][reason];
}
