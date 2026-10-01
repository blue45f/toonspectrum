import { Footprints, Hand, MessageCircle } from "lucide-react";
import { memo } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import { StudioVirtualCharacterPreview } from "../StudioVirtualCharacterPreview";
import type { StudioVirtualArtStyleKey } from "../studio-virtual-space-art-style";
import type { StudioVirtualSpaceActivity, StudioVirtualSpacePresenceState } from "../studio-virtual-space-model";
import { studioNpcCastSkinByKey } from "../studio-virtual-space-npc-cast";
import { SpaceAvatar } from "./SpaceAvatar";
import { spaceActivityOption } from "./space-dock-model";
import { spaceKoParticle } from "./space-korean";

export interface SpaceNearbyPerson {
  readonly id: string;
  readonly name: string;
  readonly activity: StudioVirtualSpaceActivity;
  readonly avatarIndex: number;
  readonly appearance?: StudioVirtualSpacePresenceState["appearance"];
  readonly inConversation: boolean;
}

export interface SpaceNearbyNpcCard {
  readonly id: string;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly activityKo: string;
  readonly activityEn: string;
  readonly skinKey: string;
  readonly canTalk: boolean;
}

const PERSON_LIMIT = 3;
const NPC_LIMIT = 2;
const NPC_PREFIX = /^NPC\s*·\s*/u;

/**
 * 상단 중앙 근접 스트립. 가까운 사람(최대 3)과 NPC(별도 표기)를 카드로 보여 준다.
 * NPC 카드는 'NPC' 배지와 다른 테두리를 쓰고, 온라인 인원 수에는 넣지 않는다.
 */
export const SpaceProximityStrip = memo(function SpaceProximityStrip({
  people, npcs, artStyle, socialDisabled, followingPeerId, onWave, onTalk, onFollow, onNpcTalk,
}: {
  readonly people: readonly SpaceNearbyPerson[];
  readonly npcs: readonly SpaceNearbyNpcCard[];
  readonly artStyle: StudioVirtualArtStyleKey;
  /** 요청을 보낼 수 없는 이유(집중 모드·연결 없음 등). 있으면 사람 카드 버튼을 비활성으로 둔다. */
  readonly socialDisabled: string | null;
  readonly followingPeerId: string | null;
  readonly onWave: (id: string) => void;
  readonly onTalk: (id: string) => void;
  readonly onFollow: (id: string) => void;
  readonly onNpcTalk: (id: string) => void;
}) {
  const bt = useBilingual("SpaceProximityStrip");
  const shownPeople = people.slice(0, PERSON_LIMIT);
  const shownNpcs = npcs.slice(0, NPC_LIMIT);
  if (!shownPeople.length && !shownNpcs.length) return null;
  return <section className="space-proximity" aria-label={bt("근처에 있는 사람과 NPC", "People and NPCs nearby")} data-space-interactive="true">
    {shownPeople.map((person) => {
      const status = spaceActivityOption(person.activity);
      const busy = person.activity === "focused" || person.activity === "away";
      const reason = socialDisabled ?? (busy ? bt("상대가 집중 중이거나 자리를 비웠어요", "They are focusing or away") : null);
      return <article key={person.id} className="space-proximity__card" data-kind="person" data-in-conversation={person.inConversation || undefined}>
        <SpaceAvatar identity={person.id} activity={person.activity} avatarIndex={person.avatarIndex} appearance={person.appearance} size="md" />
        <div className="space-proximity__text">
          <strong>{person.name}</strong>
          <small><span className="space-status-dot" data-activity={person.activity} aria-hidden />
            {person.inConversation ? bt("대화 중", "In conversation") : bt(status.labelKo, status.labelEn)}</small>
        </div>
        <div className="space-proximity__actions">
          <button type="button" className="space-icon-button" aria-label={bt(`${person.name}에게 손 흔들기`, `Wave to ${person.name}`)}
            aria-disabled={reason ? true : undefined} title={reason ?? undefined} onClick={() => { if (!reason) onWave(person.id); }}>
            <Hand size={17} aria-hidden />
          </button>
          <button type="button" className="space-icon-button" aria-label={bt(`${person.name}에게 대화 요청`, `Ask ${person.name} to talk`)}
            aria-disabled={reason ? true : undefined} title={reason ?? undefined} onClick={() => { if (!reason) onTalk(person.id); }}>
            <MessageCircle size={17} aria-hidden />
          </button>
          <button type="button" className="space-icon-button" aria-pressed={followingPeerId === person.id}
            aria-label={bt(`${person.name} 따라가기`, `Follow ${person.name}`)} onClick={() => onFollow(person.id)}>
            <Footprints size={17} aria-hidden />
          </button>
        </div>
      </article>;
    })}
    {shownNpcs.map((npc) => <article key={npc.id} className="space-proximity__card" data-kind="npc">
      <span className="space-avatar space-avatar--md space-avatar--npc" aria-hidden>
        <StudioVirtualCharacterPreview skin={studioNpcCastSkinByKey(npc.skinKey, artStyle)} className="studio-vspace-reference-compact-player" />
      </span>
      <div className="space-proximity__text">
        <strong><span className="space-proximity__npc-badge">NPC</span>{bt(npc.labelKo.replace(NPC_PREFIX, ""), npc.labelEn.replace(NPC_PREFIX, ""))}</strong>
        <small>{bt(npc.activityKo, npc.activityEn)}</small>
      </div>
      {npc.canTalk ? <button type="button" className="space-proximity__talk" onClick={() => onNpcTalk(npc.id)}
        aria-label={bt(`${spaceKoParticle(npc.labelKo, "과")} 대화하기`, `Talk with ${npc.labelEn}`)}>
        <MessageCircle size={16} aria-hidden />{bt("대화하기", "Talk")}
      </button> : null}
    </article>)}
  </section>;
});
