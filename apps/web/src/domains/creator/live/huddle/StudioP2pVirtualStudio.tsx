import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import {
  BookOpenText,
  Boxes,
  Brush,
  ClipboardCheck,
  Focus,
  Handshake,
  MapPinned,
  MessageCircle,
  Radio,
  Sparkles,
  Users,
  type LucideIcon,
} from "lucide-react";

import { formatI18nTemplate, translateCurrentStaticSourceText } from "@/shared/lib/i18n-bilingual-copy";
import type { StudioLiveParticipant } from "../studio-live-collaboration-protocol";
import type { StudioLiveDirectPort } from "../studio-live-direct-port";
import {
  STUDIO_P2P_SPACE_ZONES,
  StudioP2pSpaceController,
  type StudioP2pSpaceActivity,
  type StudioP2pSpaceSnapshot,
  type StudioP2pSpaceZoneId,
} from "./studio-p2p-space-controller";

import "./studio-p2p-virtual-studio.css";

interface StudioP2pVirtualStudioProps {
  self: StudioLiveParticipant;
  port: StudioLiveDirectPort;
  proximityMedia: boolean;
  onProximityMediaChange: (enabled: boolean) => void;
  onNearbyChange: (sessionIds: string[]) => void;
}

const AVATARS = [
  "/images/characters/ara.jpg",
  "/images/characters/danwoo.jpg",
  "/images/characters/gaon.jpg",
  "/images/characters/leona.jpg",
] as const;

const ZONE_META: Record<StudioP2pSpaceZoneId, { icon: LucideIcon; image: string; href: string; ko: string }> = {
  lobby: { icon: Sparkles, image: "/brand/studio-scene.svg", href: "/studio/home", ko: "프로젝트의 현재 상황과 다음 작업을 확인합니다." },
  writers: { icon: BookOpenText, image: "/assets/studio/backgrounds/webtoon_classroom.jpg", href: "/story-lab", ko: "시놉시스·대본·설정을 함께 다듬습니다." },
  storyboard: { icon: MapPinned, image: "/assets/studio/backgrounds/webtoon_creator_room.png", href: "/studio/new", ko: "에피소드와 컷 흐름을 한눈에 검토합니다." },
  lounge: { icon: MessageCircle, image: "/assets/studio/backgrounds/webtoon_cafe.jpg", href: "/community", ko: "작업 사이 가볍게 대화하고 아이디어를 나눕니다." },
  assets: { icon: Boxes, image: "/brand/atelier-materials-640.webp", href: "/studio/assets", ko: "배경·브러시·캐릭터·3D 에셋을 찾습니다." },
  drawing: { icon: Brush, image: "/assets/studio/backgrounds/webtoon_creator_room.png", href: "/studio", ko: "원고와 캔버스의 실제 제작 작업으로 이동합니다." },
  review: { icon: ClipboardCheck, image: "/assets/studio/backgrounds/webtoon_drama_boardroom.jpg", href: "/production", ko: "코멘트·수정 요청·승인 흐름을 확인합니다." },
  assistant: { icon: Handshake, image: "/brand/atelier-process-640.webp", href: "/collaborate", ko: "어시스트·외주 인력을 배정하고 작업을 넘깁니다." },
};

function activityLabel(activity: StudioP2pSpaceActivity): string {
  const scope = "domains.creator.live.huddle.StudioP2pVirtualStudio";
  if (activity === "focused") return translateCurrentStaticSourceText(scope, "ko", "집중 작업");
  if (activity === "reviewing") return translateCurrentStaticSourceText(scope, "ko", "리뷰 중");
  if (activity === "away") return translateCurrentStaticSourceText(scope, "ko", "잠시 자리 비움");
  return translateCurrentStaticSourceText(scope, "ko", "대화 가능");
}

function avatarFor(seed: string): string {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) hash = ((hash << 5) - hash + seed.charCodeAt(index)) | 0;
  return AVATARS[Math.abs(hash) % AVATARS.length] ?? AVATARS[0];
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

  function moveFromPointer(event: PointerEvent<HTMLButtonElement>, force: boolean): void {
    const rect = event.currentTarget.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    controllerRef.current?.moveTo(
      ((event.clientX - rect.left) / rect.width) * 100,
      ((event.clientY - rect.top) / rect.height) * 100,
      force,
    );
  }

  function handleKeyboard(event: KeyboardEvent<HTMLButtonElement>): void {
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

  if (!snapshot) return null;
  const activeZone = STUDIO_P2P_SPACE_ZONES.find((zone) => zone.id === snapshot.self.zone) ?? STUDIO_P2P_SPACE_ZONES[0];
  const activeMeta = ZONE_META[activeZone.id];
  const ActiveIcon = activeMeta.icon;

  return (
    <section className="p2p-vs-shell" data-studio-p2p-space="true">
      <header className="p2p-vs-header">
        <div>
          <span className="p2p-vs-kicker"><Sparkles size={12} /> VIRTUAL CREATOR STUDIO</span>
          <h4><MapPinned size={15} />{translateCurrentStaticSourceText("domains.creator.live.huddle.StudioP2pVirtualStudio", "ko", "가상 창작 스튜디오")}</h4>
          <p>{translateCurrentStaticSourceText(
            "domains.creator.live.huddle.StudioP2pVirtualStudio",
            "ko",
            "위치·존 상태는 RTCDataChannel로만 공유하며 서버에 저장하지 않습니다.",
          )}</p>
        </div>
        <span className="p2p-vs-count"><Users size={12} />{snapshot.peers.length + 1}</span>
      </header>

      <div className="p2p-vs-map">
        <button
          type="button"
          className="p2p-vs-map-surface"
          aria-label={translateCurrentStaticSourceText(
            "domains.creator.live.huddle.StudioP2pVirtualStudio",
            "ko",
            "가상 스튜디오 지도 배경. 클릭하거나 드래그해 이동하고 방향키로 미세 이동할 수 있습니다.",
          )}
          onKeyDown={handleKeyboard}
          onPointerDown={(event) => {
            dragging.current = true;
            event.currentTarget.setPointerCapture?.(event.pointerId);
            moveFromPointer(event, true);
          }}
          onPointerMove={(event) => { if (dragging.current) moveFromPointer(event, false); }}
          onPointerUp={(event) => {
            if (!dragging.current) return;
            dragging.current = false;
            moveFromPointer(event, true);
            event.currentTarget.releasePointerCapture?.(event.pointerId);
          }}
          onPointerCancel={() => { dragging.current = false; controllerRef.current?.flush(); }}
        />
        <div className="p2p-vs-grid-glow" aria-hidden="true" />
        {STUDIO_P2P_SPACE_ZONES.map((zone) => {
          const meta = ZONE_META[zone.id];
          const Icon = meta.icon;
          return (
            <button
              key={zone.id}
              type="button"
              className="p2p-vs-zone"
              data-zone={zone.id}
              data-current={snapshot.self.zone === zone.id || undefined}
              style={{
                left: `${zone.x}%`,
                top: `${zone.y}%`,
                width: `${zone.width}%`,
                height: `${zone.height}%`,
                "--p2p-vs-room-image": `url("${meta.image}")`,
              } as CSSProperties}
              onClick={(event) => { event.stopPropagation(); controllerRef.current?.enterZone(zone.id); }}
              aria-label={formatI18nTemplate(
                translateCurrentStaticSourceText("domains.creator.live.huddle.StudioP2pVirtualStudio", "ko", "{v0} 공간으로 이동"),
                { v0: zone.label },
              )}
            >
              <span className="p2p-vs-zone-overlay" />
              <span className="p2p-vs-zone-name"><Icon size={12} /><strong>{zone.label}</strong></span>
            </button>
          );
        })}

        {snapshot.peers.map((peer) => (
          <button
            key={peer.participant.sessionId}
            type="button"
            className="p2p-vs-person"
            data-nearby={peer.nearby || undefined}
            style={{ left: `${peer.state.x}%`, top: `${peer.state.y}%` }}
            title={`${peer.participant.displayName} · ${activityLabel(peer.state.activity)}`}
            aria-label={formatI18nTemplate(
              translateCurrentStaticSourceText("domains.creator.live.huddle.StudioP2pVirtualStudio", "ko", "{v0} 근처로 이동 · {v1}"),
              { v0: peer.participant.displayName, v1: activityLabel(peer.state.activity) },
            )}
            onClick={(event) => {
              event.stopPropagation();
              controllerRef.current?.moveTo(peer.state.x + 2.5, peer.state.y + 2.5, true);
            }}
          >
            <img src={avatarFor(peer.participant.sessionId)} alt="" />
            <span>{peer.participant.displayName}</span>
          </button>
        ))}

        <div
          className="p2p-vs-person p2p-vs-person--self"
          style={{ left: `${snapshot.self.x}%`, top: `${snapshot.self.y}%` }}
          aria-label={translateCurrentStaticSourceText("domains.creator.live.huddle.StudioP2pVirtualStudio", "ko", "내 아바타")}
        >
          <img src={avatarFor(self.sessionId)} alt="" />
          <span>{translateCurrentStaticSourceText("domains.creator.live.huddle.StudioP2pVirtualStudio", "ko", "나")}</span>
        </div>
      </div>

      <div className="p2p-vs-zone-focus">
        <span className="p2p-vs-zone-focus-icon"><ActiveIcon size={17} /></span>
        <span>
          <strong>{activeZone.label}</strong>
          <small>{translateCurrentStaticSourceText("domains.creator.live.huddle.StudioP2pVirtualStudio", "ko", activeMeta.ko)}</small>
        </span>
        <a href={activeMeta.href}>
          {translateCurrentStaticSourceText("domains.creator.live.huddle.StudioP2pVirtualStudio", "ko", "작업 화면 열기")}<span aria-hidden="true">→</span>
        </a>
      </div>

      <div className="p2p-vs-quick-zones" aria-label={translateCurrentStaticSourceText("domains.creator.live.huddle.StudioP2pVirtualStudio", "ko", "공간 바로가기")}>
        {STUDIO_P2P_SPACE_ZONES.map((zone) => {
          const Icon = ZONE_META[zone.id].icon;
          return (
            <button key={zone.id} type="button" aria-pressed={snapshot.self.zone === zone.id} onClick={() => controllerRef.current?.enterZone(zone.id)}>
              <Icon size={12} /><span>{zone.label}</span>
            </button>
          );
        })}
      </div>

      <div className="p2p-vs-presence-controls">
        <div className="p2p-vs-activity" role="group" aria-label={translateCurrentStaticSourceText("domains.creator.live.huddle.StudioP2pVirtualStudio", "ko", "내 작업 상태")}>
          {(["available", "focused", "reviewing", "away"] as const).map((activity) => (
            <button
              key={activity}
              type="button"
              aria-pressed={snapshot.self.activity === activity}
              onClick={() => controllerRef.current?.setActivity(activity)}
            >
              {activityLabel(activity)}
            </button>
          ))}
        </div>

        <div className="p2p-vs-proximity">
          <label htmlFor="studio-p2p-proximity-media">
            <strong><Radio size={12} />{translateCurrentStaticSourceText("domains.creator.live.huddle.StudioP2pVirtualStudio", "ko", "근접 미디어")}</strong>
            <small>{formatI18nTemplate(
              translateCurrentStaticSourceText(
                "domains.creator.live.huddle.StudioP2pVirtualStudio",
                "ko",
                "같은 공간의 가까운 사용자 {v0}명만 음성·영상 연결",
              ),
              { v0: String(snapshot.nearbySessionIds.length) },
            )}</small>
          </label>
          <input id="studio-p2p-proximity-media" type="checkbox" checked={proximityMedia} onChange={(event) => onProximityMediaChange(event.target.checked)} />
        </div>
      </div>

      {proximityMedia && snapshot.peers.length > 0 && snapshot.nearbySessionIds.length === 0 && (
        <p className="p2p-vs-hint" role="status">
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
