import { memo } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import type { StudioVirtualSpacePresenceState } from "../studio-virtual-space-model";
import { SpaceAvatar } from "./SpaceAvatar";
import { spaceStatusOption } from "./space-dock-model";

/** 참가자 탭 맨 위의 내 카드: 얼굴·이름·상태·현재 위치와 캐릭터 바꾸기. */
export const SpaceSelfCard = memo(function SpaceSelfCard({ identity, name, self, zoneLabelKo, zoneLabelEn, onEditCharacter, roleLabelKo, roleLabelEn }: {
  readonly identity: string;
  readonly name: string;
  readonly self: Pick<StudioVirtualSpacePresenceState, "activity" | "avatarIndex" | "appearance" | "userStatus">;
  readonly zoneLabelKo: string;
  readonly zoneLabelEn: string;
  readonly onEditCharacter: () => void;
  /** 내 직군 표시명 (커스텀 라벨 우선). 직군이 없으면 배지를 그리지 않는다. */
  readonly roleLabelKo?: string | null;
  readonly roleLabelEn?: string | null;
}) {
  const bt = useBilingual("SpaceSelfCard");
  const status = spaceStatusOption(self.activity, self.userStatus);
  return <section className="space-panel-section space-self-card" aria-label={bt("나", "Me")}>
    <SpaceAvatar identity={identity} activity={self.activity} avatarIndex={self.avatarIndex} appearance={self.appearance} self size="lg" />
    <div>
      <strong>{name} · {bt("나", "Me")}{roleLabelKo ? <span className="space-self-card__role">{bt(roleLabelKo, roleLabelEn ?? roleLabelKo)}</span> : null}</strong>
      <small><span className="space-status-dot" data-activity={self.activity} data-status={status.id} aria-hidden />{bt(status.labelKo, status.labelEn)}
        {zoneLabelKo ? ` · ${bt(zoneLabelKo, zoneLabelEn)}` : null}</small>
    </div>
    <button type="button" className="space-pill-button" onClick={onEditCharacter}>{bt("캐릭터 바꾸기", "Change character")}</button>
  </section>;
});
