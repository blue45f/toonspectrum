import { useCallback, useEffect, useState } from "react";

import type { StudioSpaceUiEvent } from "../studio-virtual-space-engine-events";
import type { SpaceToastTone } from "./use-space-toasts";

type Bilingual = (ko: string, en: string) => string;

/** 이벤트 디렉터 배너. key가 바뀌면 같은 문구라도 새 배너로 본다. */
export interface SpaceUiBanner {
  readonly key: number;
  readonly title: string;
  readonly body: string;
}

/** 배너는 닫기 전까지 보이되, 잊힌 배너가 월드를 가리지 않게 이 시간이 지나면 스스로 숨는다. */
export const SPACE_UI_BANNER_DURATION_MS = 12_000;

export type SpaceUiSurface =
  | { readonly kind: "toast"; readonly message: string }
  | { readonly kind: "banner"; readonly banner: SpaceUiBanner }
  | null;

/**
 * 이벤트 디렉터 UI 이벤트를 HUD 표면으로 옮긴다(main 병합본 계약과 같다).
 * toast → 알림 토스트, banner → 상단 배너. highlight·dialogue는 월드가 직접 연출하므로 HUD에 그리지 않는다.
 */
export function spaceUiEventSurface(event: StudioSpaceUiEvent, bt: Bilingual): SpaceUiSurface {
  const title = bt(event.titleKo, event.titleEn).trim();
  const body = event.bodyKo ? bt(event.bodyKo, event.bodyEn ?? event.bodyKo).trim() : "";
  if (!title && !body) return null;
  if (event.kind === "toast") return { kind: "toast", message: [title, body].filter(Boolean).join(" · ") };
  if (event.kind === "banner") return { kind: "banner", banner: { key: event.at, title: title || body, body: title ? body : "" } };
  return null;
}

/** Canvas onSpaceUiEvent 수신기와 배너 상태. */
export function useSpaceUiEvents(
  bt: Bilingual,
  notify: (message: string, tone?: SpaceToastTone) => void,
  durationMs = SPACE_UI_BANNER_DURATION_MS,
) {
  const [banner, setBanner] = useState<SpaceUiBanner | null>(null);
  const handleSpaceUiEvent = useCallback((event: StudioSpaceUiEvent) => {
    const surface = spaceUiEventSurface(event, bt);
    if (surface?.kind === "toast") notify(surface.message, "info");
    else if (surface?.kind === "banner") setBanner(surface.banner);
  }, [bt, notify]);
  useEffect(() => {
    if (!banner) return undefined;
    const timer = globalThis.setTimeout(() => setBanner((current) => current?.key === banner.key ? null : current), durationMs);
    return () => globalThis.clearTimeout(timer);
  }, [banner, durationMs]);
  const dismissBanner = useCallback(() => setBanner(null), []);
  return { banner, dismissBanner, handleSpaceUiEvent };
}
