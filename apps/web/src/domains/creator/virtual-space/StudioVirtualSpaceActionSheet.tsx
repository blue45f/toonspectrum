import { AlertTriangle, ArrowRight, Hand, ShieldCheck, UsersRound, X } from "lucide-react";
import { useEffect, useRef } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import type { StudioSpatialAction, StudioSpatialActionId } from "./studio-virtual-space-spatial-actions";
import type { StudioWorldInteractionDefinition, StudioWorldRoomDefinition } from "./studio-virtual-space-world-manifest";

export function StudioVirtualSpaceActionSheet({
  interaction,
  room,
  actions,
  onChoose,
  onClose,
}: {
  readonly interaction: StudioWorldInteractionDefinition;
  readonly room?: StudioWorldRoomDefinition;
  readonly actions: readonly StudioSpatialAction[];
  readonly onChoose: (id: StudioSpatialActionId) => void;
  readonly onClose: () => void;
}) {
  const bt = useBilingual("StudioVirtualSpaceActionSheet");
  const first = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    first.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    globalThis.addEventListener("keydown", closeOnEscape);
    return () => globalThis.removeEventListener("keydown", closeOnEscape);
  }, [interaction.id, onClose]);
  return <div className="studio-vspace-action-backdrop" data-space-interactive="true">
    <section className="studio-vspace-action-sheet" role="dialog" aria-modal="true" aria-labelledby="studio-vspace-action-title">
      <header>
        <div>
          <p><Hand size={14} aria-hidden /> {room ? bt(room.labelKo, room.labelEn) : bt("공간 오브젝트", "World object")}</p>
          <h2 id="studio-vspace-action-title">{bt(interaction.labelKo, interaction.labelEn)}</h2>
          <span>{bt("가까이 왔습니다. 실행할 동작을 선택하세요. 아무 기능도 자동으로 실행하지 않습니다.", "You are close enough. Choose an action; proximity never starts a tool automatically.")}</span>
        </div>
        <button type="button" onClick={onClose} aria-label={bt("닫기", "Close")}><X size={19} aria-hidden /></button>
      </header>
      <div className="studio-vspace-action-list">
        {actions.map((item, index) => <button key={item.id} ref={index === 0 ? first : undefined} type="button"
          data-risk={item.risk} onClick={() => onChoose(item.id)}>
          <span className="studio-vspace-action-icon" aria-hidden>{item.risk === "collaborative" ? <UsersRound size={18} />
            : item.risk === "authority" ? <ShieldCheck size={18} /> : <ArrowRight size={18} />}</span>
          <span><strong>{bt(item.labelKo, item.labelEn)}{item.recommended ? <b>{bt("추천", "Recommended")}</b> : null}</strong>
            <small>{bt(item.descriptionKo, item.descriptionEn)}</small></span>
          <ArrowRight size={17} aria-hidden />
        </button>)}
      </div>
      <footer><AlertTriangle size={14} aria-hidden />{bt(
        "대화·회의·검수 초대는 상대방의 수락 후 시작되고, 마이크·카메라는 별도로 직접 켭니다.",
        "Conversation, meeting and review invitations start only after consent; microphone and camera remain explicit choices.",
      )}</footer>
    </section>
  </div>;
}
