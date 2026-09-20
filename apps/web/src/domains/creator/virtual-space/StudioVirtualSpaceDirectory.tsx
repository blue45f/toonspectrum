import { MapPin, Search, UsersRound } from "lucide-react";
import { useId, useMemo, useState } from "react";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import type { StudioVirtualSpacePeer, StudioVirtualSpacePoint } from "./studio-virtual-space-model";
import type { StudioVirtualSpaceWorldManifest, StudioWorldRoomDefinition } from "./studio-virtual-space-world-manifest";

/** An equivalent keyboard/mobile route to places and people, independent of avatar movement. */
export function StudioVirtualSpaceDirectory({ manifest, peers, onMove, onOpen, onSelectPeer }: {
  readonly manifest: StudioVirtualSpaceWorldManifest;
  readonly peers: readonly StudioVirtualSpacePeer[];
  readonly onMove: (point: StudioVirtualSpacePoint) => void;
  readonly onOpen: (action: NonNullable<StudioWorldRoomDefinition["action"]>) => void;
  readonly onSelectPeer: (id: string) => void;
}) {
  const bt = useBilingual("StudioVirtualSpaceDirectory");
  const inputId = useId();
  const [query, setQuery] = useState("");
  const search = query.trim().normalize("NFKC").toLocaleLowerCase();
  const matches = (value: string) => value.normalize("NFKC").toLocaleLowerCase().includes(search);
  const rooms = manifest.rooms.filter((room) => matches(`${room.labelKo} ${room.labelEn} ${room.descriptionKo ?? ""} ${room.descriptionEn ?? ""}`));
  const people = peers.filter((peer) => matches(peer.participant.displayName));
  const roomNames = useMemo(() => new Map(manifest.rooms.map((room) => [room.id, bt(room.labelKo, room.labelEn)])), [bt, manifest.rooms]);
  return <section className="vs2-panel studio-vspace-directory" aria-label={bt("작업실 찾기", "Studio directory")} data-space-interactive="true">
    <h2><Search size={16} aria-hidden />{bt("작업실 찾기", "Find a place or teammate")}</h2>
    <label htmlFor={inputId}>{bt("방 또는 팀원 이름", "Room or teammate name")}</label>
    <input id={inputId} type="search" value={query} maxLength={120} autoComplete="off"
      placeholder={bt("리뷰, 드로잉, 팀원…", "Review, drawing, teammate…")}
      onChange={(event) => setQuery(event.target.value)} />
    <details open={search ? true : undefined}><summary>{bt("방과 팀원 둘러보기", "Browse rooms and teammates")}</summary><div className="studio-vspace-directory-results">
      {people.length ? <div role="group" aria-label={bt("팀원", "Teammates")}>
        {people.map((peer) => <button type="button" className="studio-vspace-directory-person" key={peer.participant.sessionId}
          onClick={() => onSelectPeer(peer.participant.sessionId)}>
          <UsersRound size={15} aria-hidden /><span><strong>{peer.participant.displayName}</strong>
            <small>{roomNames.get(peer.state.zoneId)} · {peer.state.activity === "focused" ? bt("집중 중", "Focusing")
              : peer.state.activity === "away" ? bt("자리비움", "Away") : bt("접속 중", "Online")}</small></span>
        </button>)}
      </div> : null}
      {rooms.map((room) => <div className="studio-vspace-directory-place" key={room.id}>
        <strong><MapPin size={14} aria-hidden />{bt(room.labelKo, room.labelEn)}</strong>
        <div><button type="button" aria-label={bt(`${room.labelKo}로 걷기`, `Walk to ${room.labelEn}`)}
          onClick={() => onMove(manifest.interactions.find((interaction) => interaction.zoneId === room.id)?.point
            ?? { x: room.x + room.width / 2, y: room.y + room.height / 2 })}>
          {bt("걸어가기", "Walk there")}</button>
        {room.action ? <button type="button" aria-label={bt(`${room.labelKo} 도구 바로 열기`, `Open ${room.labelEn} tool`)}
          onClick={() => { if (room.action) onOpen(room.action); }}>{bt("바로 열기", "Open tool")}</button> : null}</div>
      </div>)}
      {!people.length && !rooms.length ? <p role="status">{bt("일치하는 방이나 팀원이 없어요.", "No matching rooms or teammates.")}</p> : null}
    </div></details>
  </section>;
}
