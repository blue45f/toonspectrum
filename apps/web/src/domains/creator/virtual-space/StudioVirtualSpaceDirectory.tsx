import { Footprints, Home, MapPin, Search, UsersRound, Zap } from "lucide-react";
import { useEffect, useId, useRef, useState, type RefObject, type KeyboardEvent } from "react";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { spaceKoParticle } from "./hud/space-korean";
import type { StudioVirtualSpacePeer, StudioVirtualSpacePoint } from "./studio-virtual-space-model";
import { studioQuickTravelPointForRoom } from "./studio-virtual-space-locate-stages";
import { studioVirtualPlaceById, studioVirtualPlaceIdFromPortalHref } from "./studio-virtual-space-place-world";
import type { StudioVirtualSpaceWorldManifest, StudioWorldRoomDefinition } from "./studio-virtual-space-world-manifest";
import { studioTeammateMatches, studioTeammatePresentation } from "./studio-virtual-space-teammates";
import "./studio-virtual-space-teammates.css";

/** An equivalent keyboard/mobile route to places and people, independent of avatar movement. */
export function StudioVirtualSpaceDirectory({ manifest, peers, onMove, onOpen, onSelectPeer, onApproachPeer, approachingPeerId, approachDisabled = false, onJump, onJumpToPlace, onRespawn, inputRef, expanded = false }: {
  readonly inputRef?: RefObject<HTMLInputElement | null>;
  readonly expanded?: boolean;
  readonly manifest: StudioVirtualSpaceWorldManifest;
  readonly peers: readonly StudioVirtualSpacePeer[];
  readonly onMove: (point: StudioVirtualSpacePoint) => void;
  readonly onOpen: (action: NonNullable<StudioWorldRoomDefinition["action"]>) => void;
  readonly onSelectPeer: (id: string) => void;
  readonly onApproachPeer?: (sessionId: string) => void;
  readonly approachingPeerId?: string | null;
  readonly approachDisabled?: boolean;
  /** 같은 월드 안 "바로 가기"(확인 후 순간이동). 걸어가기와 나란히 둔다. */
  readonly onJump?: (point: StudioVirtualSpacePoint) => void;
  /** 게이트 너머 다른 장소로 "바로 가기"(기존 포털 경로로 장소 전환). */
  readonly onJumpToPlace?: (placeId: string) => void;
  /** 길을 잃었을 때 시작 위치로 돌아가기. */
  readonly onRespawn?: () => void;
}) {
  const bt = useBilingual("StudioVirtualSpaceDirectory");
  const inputId = useId();
  const results = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [armedJumpKey, setArmedJumpKey] = useState<string | null>(null);
  const search = query.trim().normalize("NFKC").toLocaleLowerCase();
  const matches = (value: string) => value.normalize("NFKC").toLocaleLowerCase().includes(search);
  const nameMatch = (room: StudioWorldRoomDefinition) => matches(`${room.labelKo} ${room.labelEn}`);
  const rooms = manifest.rooms.filter((room) => matches(`${room.labelKo} ${room.labelEn} ${room.descriptionKo ?? ""} ${room.descriptionEn ?? ""}`))
    .sort((a, b) => Number(nameMatch(b)) - Number(nameMatch(a)));
  const people = peers.filter((peer) => studioTeammateMatches(peer, query, manifest));
  const gates = onJumpToPlace ? manifest.portals.flatMap((portal) => {
    const placeId = studioVirtualPlaceIdFromPortalHref(portal.href);
    if (!placeId) return [];
    const place = studioVirtualPlaceById(placeId);
    if (!matches(`${place.labelKo} ${place.labelEn}`)) return [];
    return [{ portalId: portal.id, placeId, labelKo: place.labelKo, labelEn: place.labelEn, point: portal.point }];
  }) : [];
  // 바로 가기는 한 번 눌러 무장하고, 한 번 더 눌러야 실행한다(오작동 방지). 검색이 바뀌면 해제.
  useEffect(() => { setArmedJumpKey(null); }, [search]);
  useEffect(() => {
    if (!armedJumpKey) return undefined;
    const timeout = globalThis.setTimeout(() => setArmedJumpKey(null), 3500);
    return () => globalThis.clearTimeout(timeout);
  }, [armedJumpKey]);
  const requestJump = (key: string, execute: () => void) => {
    if (armedJumpKey === key) { setArmedJumpKey(null); execute(); }
    else setArmedJumpKey(key);
  };
  const onResultKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
      if (event.key !== "Escape") event.stopPropagation();
      if (event.nativeEvent.isComposing || !["ArrowDown", "ArrowUp"].includes(event.key)) return;
      const buttons = Array.from(results.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? []);
      const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
      if (index < 0 || !buttons.length) return;
      event.preventDefault();
      buttons[(index + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length]?.focus();

  };
  return <section className="vs2-panel studio-vspace-directory" aria-label={bt("작업실 찾기", "Studio directory")} data-space-interactive="true">
    <h2><Search size={16} aria-hidden />{bt("작업실 찾기", "Find a place or teammate")}</h2>
    <label htmlFor={inputId}>{bt("방·팀원 이름·작업 상태", "Room, teammate or work status")}</label>
    <input ref={inputRef} id={inputId} type="search" value={query} maxLength={120} autoComplete="off"
      placeholder={bt("리뷰, 드로잉, 팀원…", "Review, drawing, teammate…")}
      onChange={(event) => setQuery(event.target.value)}
      onKeyDown={(event) => {
        if (event.key !== "Escape") event.stopPropagation();
        if (event.nativeEvent.isComposing) return;
        if (event.key === "ArrowDown" || event.key === "Enter") {
          event.preventDefault();
          const first = results.current?.querySelector<HTMLButtonElement>("button[data-space-result-primary]");
          if (event.key === "Enter") first?.click(); else first?.focus();
        }
      }} />
    <details open={expanded || search ? true : undefined}><summary>{bt("방과 팀원 둘러보기", "Browse rooms and teammates")}</summary><div ref={results} role="group" aria-label={bt("찾기 결과", "Search results")} className="studio-vspace-directory-results">
      {people.length ? <div role="group" aria-label={bt("팀원", "Teammates")}>
        {people.map((peer) => {
          const presentation = studioTeammatePresentation(peer, manifest);
          const approaching = approachingPeerId === peer.participant.sessionId;
          const unavailable = approachDisabled || approaching || peer.state.activity === "focused" || peer.state.activity === "away";
          return <div key={peer.participant.sessionId} className="mb-2 grid min-w-0 gap-1 rounded-xl border border-line p-2">
          <button type="button" onKeyDown={onResultKeyDown} className="studio-vspace-directory-person min-h-11" data-space-result-primary="true" data-activity={peer.state.activity}
          onClick={() => onSelectPeer(peer.participant.sessionId)}>
          <UsersRound size={15} aria-hidden /><span><strong>{peer.participant.displayName}</strong>
            <small><span className="studio-vspace-presence-dot" aria-hidden />{bt(presentation.location.ko, presentation.location.en)} · {bt(presentation.activity.ko, presentation.activity.en)}</small>
            <small>{bt(presentation.role.ko, presentation.role.en)}</small></span>
        </button>
          {onApproachPeer ? <button type="button" className="min-h-11 justify-center" onKeyDown={onResultKeyDown}
            disabled={unavailable} aria-label={bt(`${peer.participant.displayName} 님에게 다가가기`, `Go to ${peer.participant.displayName}`)}
            onClick={() => { if (!unavailable) onApproachPeer(peer.participant.sessionId); }}>
            <Footprints size={16} aria-hidden />{approaching ? bt("다가가는 중…", "Walking over…") : bt("다가가기", "Go to teammate")}
          </button> : null}
        </div>; })}
      </div> : null}
      {rooms.map((room) => {
        const walkPoint = manifest.interactions.find((interaction) => interaction.zoneId === room.id)?.point
          ?? { x: room.x + room.width / 2, y: room.y + room.height / 2 };
        const jumpKey = `room:${room.id}`;
        const jumpArmed = armedJumpKey === jumpKey;
        return <div className="studio-vspace-directory-place" key={room.id}>
        <strong><MapPin size={14} aria-hidden />{bt(room.labelKo, room.labelEn)}</strong>
        <div><button type="button" onKeyDown={onResultKeyDown} data-space-result-primary={room.action ? undefined : "true"} aria-label={bt(`${spaceKoParticle(room.labelKo, "으로")} 걷기`, `Walk to ${room.labelEn}`)}
          onClick={() => onMove(walkPoint)}>
          {bt("걸어가기", "Walk there")}</button>
        {onJump ? <button type="button" onKeyDown={onResultKeyDown} data-jump-armed={jumpArmed || undefined}
          aria-label={jumpArmed
            ? bt(`${room.labelKo} 바로 가기 확인`, `Confirm quick travel to ${room.labelEn}`)
            : bt(`${spaceKoParticle(room.labelKo, "으로")} 바로 가기`, `Quick travel to ${room.labelEn}`)}
          onClick={() => { const point = studioQuickTravelPointForRoom(manifest, room.id) ?? walkPoint; requestJump(jumpKey, () => onJump(point)); }}>
          <Zap size={14} aria-hidden />{jumpArmed ? bt("한 번 더 누르면 이동", "Tap again to go") : bt("바로 가기", "Quick travel")}</button> : null}
        {room.action ? <button type="button" onKeyDown={onResultKeyDown} data-space-result-primary="true" aria-label={bt(`${room.labelKo} 도구 바로 열기`, `Open ${room.labelEn} tool`)}
          onClick={() => { if (room.action) onOpen(room.action); }}>{bt("바로 열기", "Open tool")}</button> : null}</div>
      </div>; })}
      {gates.length ? <div role="group" aria-label={bt("다른 장소 게이트", "Gates to other places")}>
        {gates.map((gate) => {
          const jumpKey = `gate:${gate.placeId}`;
          const jumpArmed = armedJumpKey === jumpKey;
          return <div className="studio-vspace-directory-place" key={gate.portalId}>
          <strong><MapPin size={14} aria-hidden />{bt(gate.labelKo, gate.labelEn)}</strong>
          <div><button type="button" onKeyDown={onResultKeyDown} aria-label={bt(`${gate.labelKo} 게이트까지 걷기`, `Walk to the ${gate.labelEn} gate`)}
            onClick={() => onMove(gate.point)}>
            {bt("게이트까지 걷기", "Walk to gate")}</button>
          <button type="button" onKeyDown={onResultKeyDown} data-jump-armed={jumpArmed || undefined}
            aria-label={jumpArmed
              ? bt(`${gate.labelKo} 바로 가기 확인`, `Confirm quick travel to ${gate.labelEn}`)
              : bt(`${spaceKoParticle(gate.labelKo, "으로")} 바로 가기`, `Quick travel to ${gate.labelEn}`)}
            onClick={() => requestJump(jumpKey, () => onJumpToPlace?.(gate.placeId))}>
            <Zap size={14} aria-hidden />{jumpArmed ? bt("한 번 더 누르면 이동", "Tap again to go") : bt("바로 가기", "Quick travel")}</button></div>
        </div>; })}
      </div> : null}
      {!people.length && !rooms.length && !gates.length ? <p role="status">{bt("일치하는 방이나 팀원이 없어요.", "No matching rooms or teammates.")}</p> : null}
      {onRespawn ? <div className="studio-vspace-directory-place">
        <strong><Home size={14} aria-hidden />{bt("길을 잃었나요?", "Lost your way?")}</strong>
        <div><button type="button" onKeyDown={onResultKeyDown} onClick={onRespawn}>
          {bt("시작 위치로 돌아가기", "Back to the start position")}</button></div>
      </div> : null}
    </div></details>
  </section>;
}
