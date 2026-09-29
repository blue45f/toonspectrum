import { useMemo, useState } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import {
  clampToWorld,
  createMinimapViewport,
  minimapToWorld,
  minimapZonePolygonPoints,
  minimapZoneRect,
  worldToMinimap,
  type StudioMinimapScreen,
  type StudioMinimapZone,
  type StudioMinimapZoneKind,
} from "./studio-virtual-space-minimap";

export interface StudioMinimapPeer {
  readonly id: string;
  readonly name: string;
  readonly x: number;
  readonly y: number;
}

export interface StudioVirtualSpaceMinimapProps {
  readonly worldWidth: number;
  readonly worldHeight: number;
  readonly zones: readonly StudioMinimapZone[];
  readonly screens: readonly StudioMinimapScreen[];
  /** 현재 공간에 있는 아바타 위치 (로컬 + 원격 피어 스냅샷). */
  readonly peers: readonly StudioMinimapPeer[];
  readonly selfId?: string;
  readonly width?: number;
  readonly height?: number;
  /** 미니맵 클릭/키보드로 목적지를 정하면 호출된다. 실제 이동은 부모가 연결한다. */
  readonly onTeleport: (x: number, y: number) => void;
}

const KIND_FILL: Record<StudioMinimapZoneKind, string> = {
  public: "rgba(148, 163, 184, 0.16)",
  private: "rgba(251, 191, 36, 0.14)",
  silent: "rgba(96, 165, 250, 0.12)",
  spotlight: "rgba(250, 204, 21, 0.20)",
};

const KIND_STROKE: Record<StudioMinimapZoneKind, string> = {
  public: "rgba(148, 163, 184, 0.55)",
  private: "rgba(251, 191, 36, 0.85)",
  silent: "rgba(96, 165, 250, 0.85)",
  spotlight: "rgba(250, 204, 21, 0.95)",
};

const KEYBOARD_STEP = 40;

function readReducedMotion(): boolean {
  if (typeof globalThis.matchMedia !== "function") return false;
  return globalThis.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * 공간 조감 미니맵. 월드 구역(프라이빗/사일런트/스포트라이트/퍼블릭), 스크린
 * 오브젝트, 아바타 위치를 SVG로 축소 렌더하고, 클릭 또는 방향키+Enter로
 * 텔레포트 목적지를 `onTeleport`에 전달한다.
 */
export function StudioVirtualSpaceMinimap({
  worldWidth,
  worldHeight,
  zones,
  screens,
  peers,
  selfId,
  width = 260,
  height = 200,
  onTeleport,
}: StudioVirtualSpaceMinimapProps) {
  const bt = useBilingual("StudioVirtualSpaceMinimap");
  const [reducedMotion] = useState(readReducedMotion);
  const [targetWorld, setTargetWorld] = useState<{ readonly x: number; readonly y: number } | null>(null);

  const viewport = useMemo(
    () => createMinimapViewport(worldWidth, worldHeight, width, height),
    [worldWidth, worldHeight, width, height],
  );

  const targetMinimap = useMemo(
    () => (targetWorld ? worldToMinimap(viewport, targetWorld) : null),
    [viewport, targetWorld],
  );

  const chooseWorldPoint = (minimapX: number, minimapY: number) => {
    const world = clampToWorld(viewport, minimapToWorld(viewport, { x: minimapX, y: minimapY }));
    setTargetWorld(world);
    onTeleport(world.x, world.y);
  };

  const hint = bt(
    "미니맵을 클릭하거나, 포커스 후 방향키로 목적지를 정하고 Enter를 눌러 이동해요.",
    "Click the minimap, or focus it and use arrow keys, then press Enter to teleport.",
  );

  return (
    <section aria-label={bt("미니맵", "Minimap")} className="vs2-panel">
      <h2 className="font-bold">{bt("미니맵", "Minimap")}</h2>
      <p className="mt-1 text-xs text-fg-2">{hint}</p>
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="button"
        tabIndex={0}
        aria-label={bt("공간 미니맵. 텔레포트 목적지 선택.", "Space minimap. Choose a teleport destination.")}
        className="mt-2 block cursor-crosshair rounded-lg border border-line bg-bg-2"
        onClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          chooseWorldPoint(event.clientX - rect.left, event.clientY - rect.top);
        }}
        onKeyDown={(event) => {
          const current = targetWorld ?? { x: worldWidth / 2, y: worldHeight / 2 };
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            chooseWorldPoint(worldToMinimap(viewport, current).x, worldToMinimap(viewport, current).y);
            return;
          }
          const delta =
            event.key === "ArrowLeft" ? { x: -KEYBOARD_STEP, y: 0 }
            : event.key === "ArrowRight" ? { x: KEYBOARD_STEP, y: 0 }
            : event.key === "ArrowUp" ? { x: 0, y: -KEYBOARD_STEP }
            : event.key === "ArrowDown" ? { x: 0, y: KEYBOARD_STEP }
            : null;
          if (!delta) return;
          event.preventDefault();
          setTargetWorld(clampToWorld(viewport, { x: current.x + delta.x, y: current.y + delta.y }));
        }}
      >
        {zones.map((zone) => (
          <g key={zone.id}>
            <polygon
              points={minimapZonePolygonPoints(viewport, zone)}
              fill={KIND_FILL[zone.kind]}
              stroke={KIND_STROKE[zone.kind]}
              strokeWidth={zone.kind === "spotlight" ? 2.5 : 1}
              strokeDasharray={zone.kind === "private" || zone.kind === "silent" ? "5 3" : undefined}
            >
              <title>{zone.labelKo}</title>
            </polygon>
          </g>
        ))}
        {screens.map((screen) => {
          const rect = minimapZoneRect(viewport, screen);
          return (
            <rect
              key={screen.id}
              x={rect.x}
              y={rect.y}
              width={Math.max(rect.width, 3)}
              height={Math.max(rect.height, 3)}
              fill="rgba(167, 139, 250, 0.85)"
              rx={1.5}
            >
              <title>{bt("스크린", "Screen")}</title>
            </rect>
          );
        })}
        {peers.map((peer) => {
          const point = worldToMinimap(viewport, peer);
          const isSelf = peer.id === selfId;
          return (
            <g key={peer.id}>
              <circle
                cx={point.x}
                cy={point.y}
                r={isSelf ? 5 : 3.5}
                fill={isSelf ? "#34d399" : "#e2e8f0"}
                stroke="#0f172a"
                strokeWidth={1}
              >
                <title>{peer.name}</title>
              </circle>
            </g>
          );
        })}
        {targetMinimap ? (
          <circle
            cx={targetMinimap.x}
            cy={targetMinimap.y}
            r={7}
            fill="none"
            stroke="#f472b6"
            strokeWidth={2}
            strokeDasharray="4 2"
          >
            {reducedMotion ? null : (
              <animate attributeName="r" values="7;10;7" dur="1.2s" repeatCount="indefinite" />
            )}
            <title>{bt("텔레포트 목적지", "Teleport destination")}</title>
          </circle>
        ) : null}
      </svg>
      <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-fg-2" aria-label={bt("구역 범례", "Zone legend")}>
        <li className="flex items-center gap-1">
          <span aria-hidden="true" className="inline-block h-2 w-2 rounded-sm" style={{ background: KIND_FILL.public, border: `1px solid ${KIND_STROKE.public}` }} />
          {bt("퍼블릭", "Public")}
        </li>
        <li className="flex items-center gap-1">
          <span aria-hidden="true" className="inline-block h-2 w-2 rounded-sm" style={{ background: KIND_FILL.private, border: `1px solid ${KIND_STROKE.private}` }} />
          {bt("프라이빗", "Private")}
        </li>
        <li className="flex items-center gap-1">
          <span aria-hidden="true" className="inline-block h-2 w-2 rounded-sm" style={{ background: KIND_FILL.silent, border: `1px solid ${KIND_STROKE.silent}` }} />
          {bt("사일런트", "Silent")}
        </li>
        <li className="flex items-center gap-1">
          <span aria-hidden="true" className="inline-block h-2 w-2 rounded-sm" style={{ background: KIND_FILL.spotlight, border: `1px solid ${KIND_STROKE.spotlight}` }} />
          {bt("스포트라이트", "Spotlight")}
        </li>
      </ul>
    </section>
  );
}
