import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { Focus, MapPinned, Radio, Users } from "lucide-react";

import {
  formatI18nTemplate,
  translateCurrentStaticSourceText,
} from "@/shared/lib/i18n-bilingual-copy";
import type { StudioLiveParticipant } from "../studio-live-collaboration-protocol";
import type { StudioLiveDirectPort } from "../studio-live-direct-port";
import {
  STUDIO_P2P_SPACE_ZONES,
  StudioP2pSpaceController,
  type StudioP2pSpaceActivity,
  type StudioP2pSpaceSnapshot,
  type StudioP2pSpaceZoneId,
} from "./studio-p2p-space-controller";

interface StudioP2pVirtualStudioProps {
  self: StudioLiveParticipant;
  port: StudioLiveDirectPort;
  proximityMedia: boolean;
  onProximityMediaChange: (enabled: boolean) => void;
  onNearbyChange: (sessionIds: string[]) => void;
}

function activityLabel(activity: StudioP2pSpaceActivity): string {
  const scope = "domains.creator.live.huddle.StudioP2pVirtualStudio";
  switch (activity) {
    case "focused":
      return translateCurrentStaticSourceText(scope, "ko", "집중 작업");
    case "reviewing":
      return translateCurrentStaticSourceText(scope, "ko", "리뷰 중");
    case "away":
      return translateCurrentStaticSourceText(scope, "ko", "잠시 자리 비움");
    default:
      return translateCurrentStaticSourceText(scope, "ko", "대화 가능");
  }
}

export function StudioP2pVirtualStudio({
  self,
  port,
  proximityMedia,
  onProximityMediaChange,
  onNearbyChange,
}: StudioP2pVirtualStudioProps) {
  const controllerRef = useRef<StudioP2pSpaceController | null>(null);
  const dragging = useRef(false);
  const [snapshot, setSnapshot] = useState<StudioP2pSpaceSnapshot | null>(null);

  useEffect(() => {
    const controller = new StudioP2pSpaceController(self, port);
    controllerRef.current = controller;
    const off = controller.subscribe(() => setSnapshot(controller.snapshot()));
    controller.start();
    setSnapshot(controller.snapshot());
    return () => {
      off();
      controller.close();
      if (controllerRef.current === controller) controllerRef.current = null;
    };
  }, [port, self]);

  useEffect(() => {
    onNearbyChange(snapshot?.nearbySessionIds ?? []);
  }, [onNearbyChange, snapshot]);

  function moveFromPointer(event: PointerEvent<HTMLDivElement>, force: boolean): void {
    const rect = event.currentTarget.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    controllerRef.current?.moveTo(
      ((event.clientX - rect.left) / rect.width) * 100,
      ((event.clientY - rect.top) / rect.height) * 100,
      force,
    );
  }

  function handleKeyboard(event: KeyboardEvent<HTMLDivElement>): void {
    if (!snapshot) return;
    const delta = 4;
    const next = { x: snapshot.self.x, y: snapshot.self.y };
    if (event.key === "ArrowLeft") next.x -= delta;
    else if (event.key === "ArrowRight") next.x += delta;
    else if (event.key === "ArrowUp") next.y -= delta;
    else if (event.key === "ArrowDown") next.y += delta;
    else return;
    event.preventDefault();
    controllerRef.current?.moveTo(next.x, next.y, true);
  }

  function enterZone(zoneId: StudioP2pSpaceZoneId): void {
    controllerRef.current?.enterZone(zoneId);
  }

  if (!snapshot) return null;

  return (
    <section className="space-y-2 rounded-xl border border-line bg-card/60 p-2.5" data-studio-p2p-space="true">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h4 className="flex items-center gap-1.5 text-xs font-bold">
            <MapPinned size={14} />
            {translateCurrentStaticSourceText("domains.creator.live.huddle.StudioP2pVirtualStudio", "ko", "가상 창작 스튜디오")}
          </h4>
          <p className="mt-0.5 text-[10px] leading-relaxed text-fg-3">
            {translateCurrentStaticSourceText(
              "domains.creator.live.huddle.StudioP2pVirtualStudio",
              "ko",
              "위치·존 상태는 RTCDataChannel로만 공유하며 서버에 저장하지 않습니다.",
            )}
          </p>
        </div>
        <span className="shrink-0 rounded-full border border-line px-2 py-1 text-[10px] text-fg-3">
          <Users size={11} className="mr-1 inline" />
          {snapshot.peers.length + 1}
        </span>
      </div>

      <div
        className="relative h-48 overflow-hidden rounded-xl border border-line bg-panel/80 touch-none outline-none focus-visible:ring-2 focus-visible:ring-accent"
        role="application"
        tabIndex={0}
        aria-label={translateCurrentStaticSourceText(
          "domains.creator.live.huddle.StudioP2pVirtualStudio",
          "ko",
          "가상 스튜디오 지도. 클릭하거나 드래그해 이동하고 방향키로 미세 이동할 수 있습니다.",
        )}
        onKeyDown={handleKeyboard}
        onPointerDown={(event) => {
          dragging.current = true;
          event.currentTarget.setPointerCapture?.(event.pointerId);
          moveFromPointer(event, true);
        }}
        onPointerMove={(event) => {
          if (dragging.current) moveFromPointer(event, false);
        }}
        onPointerUp={(event) => {
          if (!dragging.current) return;
          dragging.current = false;
          moveFromPointer(event, true);
          event.currentTarget.releasePointerCapture?.(event.pointerId);
        }}
        onPointerCancel={() => {
          dragging.current = false;
          controllerRef.current?.flush();
        }}
      >
        {STUDIO_P2P_SPACE_ZONES.map((zone) => (
          <button
            key={zone.id}
            type="button"
            className="absolute overflow-hidden rounded-lg border border-line/70 bg-card/70 px-1 text-left text-[9px] text-fg-3 hover:border-accent/60 hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
            style={{ left: `${zone.x}%`, top: `${zone.y}%`, width: `${zone.width}%`, height: `${zone.height}%` }}
            onClick={(event) => {
              event.stopPropagation();
              enterZone(zone.id);
            }}
            aria-label={formatI18nTemplate(
              translateCurrentStaticSourceText(
                "domains.creator.live.huddle.StudioP2pVirtualStudio",
                "ko",
                "{v0} 공간으로 이동",
              ),
              { v0: zone.label },
            )}
          >
            <span className="block truncate font-semibold">{zone.label}</span>
          </button>
        ))}

        {snapshot.peers.map((peer) => (
          <div
            key={peer.participant.sessionId}
            className={`absolute z-20 grid size-8 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 text-[10px] font-bold shadow ${peer.nearby ? "border-accent bg-accent/20 text-fg" : "border-line bg-card text-fg-2"}`}
            style={{ left: `${peer.state.x}%`, top: `${peer.state.y}%` }}
            title={`${peer.participant.displayName} · ${activityLabel(peer.state.activity)}`}
            aria-label={formatI18nTemplate(
              translateCurrentStaticSourceText(
                "domains.creator.live.huddle.StudioP2pVirtualStudio",
                "ko",
                "{v0}, {v1}",
              ),
              { v0: peer.participant.displayName, v1: activityLabel(peer.state.activity) },
            )}
          >
            {peer.participant.displayName.slice(0, 1)}
          </div>
        ))}

        <div
          className="absolute z-30 grid size-9 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 border-accent bg-accent/30 text-[10px] font-black text-fg shadow-lg"
          style={{ left: `${snapshot.self.x}%`, top: `${snapshot.self.y}%` }}
          aria-label={translateCurrentStaticSourceText(
            "domains.creator.live.huddle.StudioP2pVirtualStudio",
            "ko",
            "내 아바타",
          )}
        >
          {self.displayName.slice(0, 1)}
        </div>
      </div>

      <div className="flex flex-wrap gap-1">
        {STUDIO_P2P_SPACE_ZONES.map((zone) => (
          <button
            key={zone.id}
            type="button"
            className={`min-h-9 rounded-lg border px-2 text-[10px] ${snapshot.self.zone === zone.id ? "border-accent bg-accent/15 text-fg" : "border-line text-fg-3"}`}
            onClick={() => enterZone(zone.id)}
          >
            {zone.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-1">
        {(["available", "focused", "reviewing", "away"] as const).map((activity) => (
          <button
            key={activity}
            type="button"
            className={`min-h-9 rounded-lg border px-2 text-[10px] ${snapshot.self.activity === activity ? "border-accent bg-accent/15 text-fg" : "border-line text-fg-3"}`}
            aria-pressed={snapshot.self.activity === activity}
            onClick={() => controllerRef.current?.setActivity(activity)}
          >
            {activityLabel(activity)}
          </button>
        ))}
      </div>

      <label className="flex min-h-11 items-center justify-between gap-3 rounded-lg border border-line px-2.5 text-[11px]">
        <span>
          <strong className="flex items-center gap-1">
            <Radio size={12} />
            {translateCurrentStaticSourceText(
              "domains.creator.live.huddle.StudioP2pVirtualStudio",
              "ko",
              "근접 미디어",
            )}
          </strong>
          <span className="block text-[10px] text-fg-3">
            {formatI18nTemplate(
              translateCurrentStaticSourceText(
                "domains.creator.live.huddle.StudioP2pVirtualStudio",
                "ko",
                "같은 공간의 가까운 사용자 {v0}명만 음성·영상 연결",
              ),
              { v0: String(snapshot.nearbySessionIds.length) },
            )}
          </span>
        </span>
        <input
          type="checkbox"
          checked={proximityMedia}
          onChange={(event) => onProximityMediaChange(event.target.checked)}
          className="size-4 accent-current"
        />
      </label>

      {proximityMedia && snapshot.peers.length > 0 && snapshot.nearbySessionIds.length === 0 && (
        <p className="flex items-center gap-1 text-[10px] leading-relaxed text-fg-3" role="status">
          <Focus size={11} />
          {translateCurrentStaticSourceText(
            "domains.creator.live.huddle.StudioP2pVirtualStudio",
            "ko",
            "대화하려는 사람과 같은 공간에서 가까이 이동하면 미디어 연결이 열립니다.",
          )}
        </p>
      )}
    </section>
  );
}
