import { Megaphone, ScreenShare } from "lucide-react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import type { MegaphoneScope, MegaphoneSessionSnapshot } from "./studio-virtual-space-megaphone";

export interface StudioVirtualSpaceMegaphoneBannerProps {
  /** 현재 방송 스냅샷. broadcasting이 아니면 null을 렌더한다. */
  readonly snapshot: MegaphoneSessionSnapshot;
  /** 방송 범위 표기. */
  readonly scope: MegaphoneScope;
  /** 닫기 (청취자가 자막 패널을 접을 때). */
  readonly onDismiss?: () => void;
}

/**
 * 메가폰 청취자 배너. 방송 중 뱃지 + 자막 목록(role=log) + 화면 공유 중 표시.
 * 방송자가 아닌 모든 참여자에게 보인다.
 */
export function StudioVirtualSpaceMegaphoneBanner({ snapshot, scope, onDismiss }: StudioVirtualSpaceMegaphoneBannerProps) {
  const bt = useBilingual("StudioVirtualSpaceMegaphoneBanner");
  if (snapshot.status !== "broadcasting") return null;
  const scopeLabel = scope === "world"
    ? bt("월드 전체 방송", "World-wide broadcast")
    : bt("방 전체 방송", "Room broadcast");
  return (
    <section className="studio-vspace-megaphone-banner" aria-label={bt("메가폰 방송", "Megaphone broadcast")}>
      <div className="studio-vspace-megaphone-banner__header">
        <Megaphone size={18} aria-hidden />
        <strong>{bt("메가폰 방송 중", "Megaphone live")}</strong>
        <span> · {scopeLabel}</span>
        {snapshot.broadcasterName ? <span> · {snapshot.broadcasterName}</span> : null}
        {snapshot.sharingScreen ? (
          <span className="studio-vspace-megaphone-banner__share">
            <ScreenShare size={14} aria-hidden />
            {bt("화면 공유 중", "Sharing screen")}
          </span>
        ) : null}
        {onDismiss ? (
          <button type="button" onClick={onDismiss} aria-label={bt("자막 닫기", "Dismiss captions")}>
            {bt("닫기", "Dismiss")}
          </button>
        ) : null}
      </div>
      {snapshot.captions.length > 0 ? (
        <ol className="studio-vspace-megaphone-banner__captions" role="log" aria-live="polite"
          aria-label={bt("방송 자막", "Broadcast captions")}>
          {snapshot.captions.map((caption) => (
            <li key={caption.id}>
              <span lang="ko">{caption.textKo}</span>
              {caption.textEn && caption.textEn !== caption.textKo ? (
                <span lang="en"> · {caption.textEn}</span>
              ) : null}
            </li>
          ))}
        </ol>
      ) : (
        <p className="studio-vspace-megaphone-banner__empty">
          {bt("자막이 도착하면 여기에 표시돼요.", "Captions will appear here.")}
        </p>
      )}
    </section>
  );
}
