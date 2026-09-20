import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import type { StudioVirtualSlotLeaseSnapshot } from "./studio-virtual-space-slot-lease";
import type { StudioWorldInteractionSlotDefinition } from "./studio-virtual-space-world-manifest";

export function StudioVirtualSpaceSeatsPanel({ slots, snapshot, approachingSlotId, onSelect, onRelease }: {
  readonly slots: readonly StudioWorldInteractionSlotDefinition[];
  readonly snapshot: StudioVirtualSlotLeaseSnapshot;
  readonly approachingSlotId: string | null;
  readonly onSelect: (slotId: string) => void;
  readonly onRelease: () => void;
}) {
  const bt = useBilingual("StudioVirtualSpaceSeatsPanel");
  if (!slots.length) return null;
  return <section className="vs2-panel" aria-label={bt("함께 쓰는 작업 자리", "Shared workspaces")} data-space-interactive="true">
    <h2 className="font-bold">{bt("작업 자리", "Workspaces")}</h2>
    <p className="mt-2 text-xs text-fg-2">{bt("빈 자리로 이동한 뒤 사용할 수 있어요. 문서 편집 권한은 달라지지 않아요.", "Walk to an available space to use it. Document permissions remain separate.")}</p>
    {!snapshot.available ? <p role="status" className="mt-2 text-xs text-fg-2">{bt("공유 자리 확인을 지원하는 팀 서버 연결이 필요해요.", "Shared spaces require a team connection that supports server-confirmed reservations.")}</p> : null}
    <ul className="mt-3 space-y-2">
      {slots.map((slot) => {
        const occupied = snapshot.occupied.find((item) => item.slotId === slot.id);
        const held = snapshot.status === "held" && snapshot.slotId === slot.id;
        const pending = approachingSlotId === slot.id || (snapshot.status === "requesting" && snapshot.slotId === slot.id);
        return <li key={slot.id} className="flex items-center justify-between gap-2 rounded-xl border border-line p-2">
          <span className="text-xs"><strong>{bt(slot.labelKo, slot.labelEn)}</strong><span className="mt-1 block text-fg-2">{held ? bt("내가 사용 중", "In use by you") : pending ? bt("자리로 이동·확인 중", "Approaching / confirming") : occupied ? bt(`${occupied.owner.displayName} 사용 중`, `In use by ${occupied.owner.displayName}`) : snapshot.available ? bt("비어 있음", "Available") : bt("확인 필요", "Not confirmed")}</span></span>
          {held || pending ? <button type="button" className="min-h-11 rounded-lg border border-line px-3 text-xs" onClick={onRelease}>{bt("그만 사용", "Leave")}</button>
            : <button type="button" className="min-h-11 rounded-lg border border-line px-3 text-xs disabled:opacity-50" disabled={!snapshot.available || Boolean(occupied)} onClick={() => onSelect(slot.id)} aria-label={bt(`${slot.labelKo} 사용하기`, `Use ${slot.labelEn}`)}>{bt("사용하기", "Use")}</button>}
        </li>;
      })}
    </ul>
    {snapshot.status === "lost" || snapshot.status === "denied" ? <p role="status" className="mt-2 text-xs text-fg-2">{bt("자리 사용을 확인하지 못했어요. 연결과 빈 자리를 확인한 뒤 다시 선택해 주세요.", "The reservation could not be confirmed. Check your connection and choose an available space again.")}</p> : null}
  </section>;
}
