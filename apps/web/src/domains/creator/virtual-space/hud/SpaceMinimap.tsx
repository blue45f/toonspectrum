import { Map as MapIcon, Maximize2, Zap } from "lucide-react";
import { memo, useEffect, useMemo, useState, type CSSProperties, type MouseEvent } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import { STUDIO_VIRTUAL_CAMPUS_COMMONS_ID, studioVirtualCampusZoneMeta } from "../studio-virtual-space-campus-world";
import { createMinimapViewport, minimapToWorld } from "../studio-virtual-space-minimap";
import type { StudioVirtualSpacePoint } from "../studio-virtual-space-model";
import { studioVirtualPlaceById, studioVirtualPlaceIdFromPortalHref } from "../studio-virtual-space-place-world";
import { clampStudioWorldPoint } from "../studio-virtual-space-world-pathfinding";
import { studioWorldSpawn, type StudioVirtualSpaceWorldManifest } from "../studio-virtual-space-world-manifest";
import { SPACE_ZONE_FALLBACK_TONE, SPACE_ZONE_TONE_TOKENS } from "./space-zone-visuals";
import { spaceKoParticle } from "./space-korean";

export interface SpaceMinimapPerson {
  readonly id: string;
  readonly name: string;
  readonly point: StudioVirtualSpacePoint;
}

interface MinimapZone {
  readonly id: string;
  readonly label: string;
  readonly sign: string;
  readonly tone: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly spawn: StudioVirtualSpacePoint;
}

interface MinimapGate {
  readonly id: string;
  readonly placeId: string;
  readonly label: string;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly point: StudioVirtualSpacePoint;
}

/** 캠퍼스 방은 영문 표지판, 그 밖의 방은 방 이름을 라벨로 쓴다. 산책로는 라벨 없이 바닥만 남긴다. */
function minimapZones(manifest: StudioVirtualSpaceWorldManifest, bt: (ko: string, en: string) => string): readonly MinimapZone[] {
  return manifest.rooms.filter((room) => room.id !== STUDIO_VIRTUAL_CAMPUS_COMMONS_ID).map((room) => {
    const meta = studioVirtualCampusZoneMeta(room.id);
    const label = bt(meta?.labelKo ?? room.labelKo, meta?.labelEn ?? room.labelEn);
    return {
      id: room.id,
      label,
      sign: meta?.signEn ?? label,
      tone: meta ? SPACE_ZONE_TONE_TOKENS[meta.tone] : SPACE_ZONE_FALLBACK_TONE,
      x: room.x, y: room.y, width: room.width, height: room.height,
      spawn: manifest.spawns.find((spawn) => spawn.id === room.id)?.point ?? studioWorldSpawn(manifest, room.id).point,
    };
  });
}

function minimapGates(manifest: StudioVirtualSpaceWorldManifest, bt: (ko: string, en: string) => string): readonly MinimapGate[] {
  return manifest.portals.flatMap((portal) => {
    const placeId = studioVirtualPlaceIdFromPortalHref(portal.href);
    if (!placeId) return [];
    const place = studioVirtualPlaceById(placeId);
    return [{ id: portal.id, placeId, label: bt(place.labelKo, place.labelEn), labelKo: place.labelKo, labelEn: place.labelEn, point: portal.point }];
  });
}

/**
 * 미니맵: 구역 사각형과 라벨, 내 위치·다른 사람 점, 하위 맵 게이트를 그린다.
 * 지도를 누르면 그 지점으로 걷고, 큰 지도(full)에서는 구역 라벨 버튼으로 그 구역 입구까지 걷는다.
 */
export const SpaceMinimap = memo(function SpaceMinimap({
  manifest, self, people, currentRoomId, variant = "mini", expanded = true, onToggleExpanded, onOpenFull, onMoveTo, destination = null, onJumpTo, onJumpToPlace,
}: {
  readonly manifest: StudioVirtualSpaceWorldManifest;
  readonly self: StudioVirtualSpacePoint;
  readonly people: readonly SpaceMinimapPerson[];
  readonly currentRoomId: string | null;
  readonly variant?: "mini" | "full";
  readonly expanded?: boolean;
  readonly onToggleExpanded?: () => void;
  readonly onOpenFull?: () => void;
  readonly onMoveTo: (point: StudioVirtualSpacePoint) => void;
  /** 클릭 이동 목적지 마커 (null이면 숨김). */
  readonly destination?: StudioVirtualSpacePoint | null;
  /** 구역 "바로 가기"(확인 없이 즉시, 큰 지도 전용 작은 버튼). 걷기와 구분해 번개 아이콘으로 표기한다. */
  readonly onJumpTo?: (point: StudioVirtualSpacePoint) => void;
  /** 게이트 칩 "바로 가기"(한 번 더 눌러 확인 후 장소 전환). 없으면 칩은 게이트까지 걷기다. */
  readonly onJumpToPlace?: (placeId: string) => void;
}) {
  const bt = useBilingual("SpaceMinimap");
  const zones = useMemo(() => minimapZones(manifest, bt), [manifest, bt]);
  const gates = useMemo(() => minimapGates(manifest, bt), [manifest, bt]);
  const full = variant === "full";
  const [armedGateId, setArmedGateId] = useState<string | null>(null);
  useEffect(() => {
    if (!armedGateId) return undefined;
    const timeout = globalThis.setTimeout(() => setArmedGateId(null), 3500);
    return () => globalThis.clearTimeout(timeout);
  }, [armedGateId]);
  const currentZone = zones.find((zone) => zone.id === currentRoomId) ?? null;
  const moveFromClick = (event: MouseEvent<HTMLElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const viewport = createMinimapViewport(manifest.width, manifest.height, rect.width, rect.height, 0);
    onMoveTo(clampStudioWorldPoint(manifest, minimapToWorld(viewport, { x: event.clientX - rect.left, y: event.clientY - rect.top })));
  };
  // 미니맵 라벨이 232px 폭에서도 11px 이상이 되도록 월드 크기에 비례해 정한다.
  const labelSize = Math.max(manifest.width, manifest.height) / (full ? 48 : 20);
  const stage = <div className="space-minimap__stage" data-variant={variant}
    style={{ aspectRatio: `${manifest.width} / ${manifest.height}` } as CSSProperties}>
    <button type="button" className="space-minimap__surface" onClick={moveFromClick}
      aria-label={bt("지도에서 걸어갈 곳 선택", "Choose where to walk on the map")}>
      <svg viewBox={`0 0 ${manifest.width} ${manifest.height}`} preserveAspectRatio="xMidYMid meet" aria-hidden focusable="false">
        <rect className="space-minimap__ground" x={0} y={0} width={manifest.width} height={manifest.height} rx={labelSize} />
        {zones.map((zone) => <g key={zone.id} className="space-minimap__zone" data-active={zone.id === currentRoomId || undefined}
          style={{ "--space-zone-tone": zone.tone } as CSSProperties}>
          <rect x={zone.x} y={zone.y} width={zone.width} height={zone.height} rx={labelSize * 0.35} />
          {full ? null : <text x={zone.x + zone.width / 2} y={zone.y + zone.height / 2} fontSize={labelSize} textAnchor="middle" dominantBaseline="middle">{zone.sign}</text>}
        </g>)}
        {gates.map((gate) => <g key={gate.id} className="space-minimap__gate" transform={`translate(${gate.point.x} ${gate.point.y})`}>
          <rect x={-labelSize * 0.45} y={-labelSize * 0.45} width={labelSize * 0.9} height={labelSize * 0.9} transform="rotate(45)" />
        </g>)}
        {people.map((person) => <circle key={person.id} className="space-minimap__peer" cx={person.point.x} cy={person.point.y} r={labelSize * 0.38} />)}
        {destination ? <g className="space-minimap__destination" transform={`translate(${destination.x} ${destination.y})`}>
          <circle className="space-minimap__destination-ring" r={labelSize * 0.95} />
          <circle className="space-minimap__destination-dot" r={labelSize * 0.42} />
        </g> : null}
        <circle className="space-minimap__self-ring" cx={self.x} cy={self.y} r={labelSize * 0.95} />
        <circle className="space-minimap__self" cx={self.x} cy={self.y} r={labelSize * 0.5} />
      </svg>
    </button>
    {full ? zones.map((zone) => <button key={zone.id} type="button" className="space-minimap__zone-button"
      data-active={zone.id === currentRoomId || undefined}
      style={{
        left: `${((zone.x + zone.width / 2) / manifest.width) * 100}%`,
        top: `${((zone.y + zone.height / 2) / manifest.height) * 100}%`,
        "--space-zone-tone": zone.tone,
      } as CSSProperties}
      onClick={() => onMoveTo(zone.spawn)}
      aria-label={bt(`${spaceKoParticle(zone.label, "으로")} 걸어가기`, `Walk to ${zone.label}`)}>
      <span aria-hidden>{zone.sign}</span>
    </button>) : null}
    {full && onJumpTo ? zones.map((zone) => <button key={`${zone.id}-jump`} type="button"
      className="space-minimap__zone-jump"
      style={{
        left: `${((zone.x + zone.width) / manifest.width) * 100}%`,
        top: `${((zone.y + zone.height) / manifest.height) * 100}%`,
      } as CSSProperties}
      onClick={() => onJumpTo(zone.spawn)}
      aria-label={bt(`${spaceKoParticle(zone.label, "으로")} 바로 가기`, `Quick travel to ${zone.label}`)}
      title={bt("바로 가기", "Quick travel")}>
      <Zap size={12} aria-hidden />
    </button>) : null}
  </div>;

  if (full) {
    return <div className="space-minimap space-minimap--full" data-space-interactive="true">
      {stage}
      {gates.length ? <div className="space-minimap__gates" role="group" aria-label={bt("다른 장소 게이트", "Gates to other places")}>
        {gates.map((gate) => {
          const armed = armedGateId === gate.id;
          return <button key={gate.id} type="button" className="space-minimap__gate-chip" data-armed={armed || undefined}
            aria-label={onJumpToPlace
              ? (armed
                ? bt(`${gate.labelKo} 바로 가기 확인`, `Confirm quick travel to ${gate.labelEn}`)
                : bt(`${spaceKoParticle(gate.labelKo, "으로")} 바로 가기`, `Quick travel to ${gate.labelEn}`))
              : bt(`${gate.labelKo} 게이트까지 걷기`, `Walk to the ${gate.labelEn} gate`)}
            onClick={() => {
              if (!onJumpToPlace) { onMoveTo(gate.point); return; }
              if (armed) { setArmedGateId(null); onJumpToPlace(gate.placeId); }
              else setArmedGateId(gate.id);
            }}>
            {onJumpToPlace ? <Zap size={12} aria-hidden /> : null}
            {gate.label}{armed ? bt(" · 한 번 더 눌러 이동", " · tap again to go") : ""}
          </button>;
        })}
      </div> : null}
      <ul className="space-minimap__legend" aria-label={bt("지도 범례", "Map legend")}>
        <li><span className="space-minimap__legend-self" aria-hidden />{bt("나", "You")}</li>
        <li><span className="space-minimap__legend-peer" aria-hidden />{bt("다른 사람", "Others")}</li>
        <li><span className="space-minimap__legend-destination" aria-hidden />{bt("목적지", "Destination")}</li>
        {gates.length ? <li><span className="space-minimap__legend-gate" aria-hidden />{bt("하위 맵 게이트", "Sub-map gate")}</li> : null}
      </ul>
    </div>;
  }
  return <section className="space-minimap" data-expanded={expanded || undefined} data-space-interactive="true"
    aria-label={bt("미니맵", "Minimap")}>
    <header className="space-minimap__header">
      <button type="button" className="space-minimap__toggle" onClick={onToggleExpanded} aria-expanded={expanded}
        aria-label={expanded ? bt("미니맵 접기", "Collapse minimap") : bt("미니맵 펼치기", "Expand minimap")}>
        <MapIcon size={15} aria-hidden />
        <span className="space-minimap__title" aria-hidden>{bt("지도", "Map")}</span>
        {currentZone ? <span className="space-minimap__current" aria-hidden>{currentZone.label}</span> : null}
      </button>
      {onOpenFull ? <button type="button" className="space-icon-button" onClick={onOpenFull} data-space-toggle="map"
        aria-label={bt("큰 지도 열기 (M)", "Open the large map (M)")} aria-keyshortcuts="M">
        <Maximize2 size={15} aria-hidden />
      </button> : null}
    </header>
    {expanded ? stage : null}
  </section>;
});
