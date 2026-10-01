import { useId } from "react";

import type { LocalizedText } from "./engineering-story-content";
import "./engineering-surfaces.css";

import { cx } from "@/shared/lib/cx";
import {
  translateBilingualValueForActiveLocale,
  useBilingualI18nRevision,
} from "@/shared/lib/i18n-bilingual-copy";

const bi = <TKo, TEn>(ko: TKo, en: TEn): TKo =>
  translateBilingualValueForActiveLocale("EngineeringArchitectureDiagram", ko, en);

const t = (ko: string, en: string): LocalizedText => ({ ko, en });

type ZoneTone = "local" | "edge" | "server";

interface ArchitectureBox {
  readonly id: string;
  readonly title: LocalizedText;
  readonly lines: readonly LocalizedText[];
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

interface ArchitectureZone {
  readonly id: string;
  readonly tone: ZoneTone;
  readonly title: LocalizedText;
  readonly caption?: LocalizedText;
  readonly x: number;
  readonly width: number;
  readonly boxes: readonly ArchitectureBox[];
}

/**
 * 운영 구조의 정본은 DEPLOY.md·render.yaml·deploy/cloudflare-realtime/wrangler.jsonc이다.
 * 이 도식은 그 내용을 발표용으로 요약하며, 값이나 공급자를 새로 추가하지 않는다.
 */
const ZONES: readonly ArchitectureZone[] = [
  {
    id: "browser",
    tone: "local",
    title: t("사용자 브라우저 · 로컬 우선", "User's browser · local-first"),
    caption: t("React 19 SPA · Vite", "React 19 SPA · Vite"),
    x: 12,
    width: 452,
    boxes: [
      { id: "drawing", title: t("드로잉 엔진", "Drawing engine"), lines: [t("Canvas · WebGPU", "Canvas · WebGPU"), t("Rust / WASM", "Rust / WASM")], x: 32, y: 98, width: 200, height: 96 },
      { id: "three", title: t("3D · 캐릭터", "3D · characters"), lines: [t("three.js · R3F", "three.js · R3F"), t("VRM 뼈대", "VRM skeleton")], x: 244, y: 98, width: 200, height: 96 },
      { id: "space", title: t("가상 스튜디오", "Virtual studio"), lines: [t("Phaser 2D 공간", "Phaser 2D space"), t("근접 반응", "Proximity")], x: 32, y: 206, width: 200, height: 96 },
      { id: "collab", title: t("협업 문서", "Shared document"), lines: [t("Yjs CRDT", "Yjs CRDT"), t("의미 연산 병합", "Semantic merges")], x: 244, y: 206, width: 200, height: 96 },
      { id: "local", title: t("로컬 원본", "Local sources"), lines: [t("OPFS", "OPFS"), t("SQLite WASM", "SQLite WASM")], x: 32, y: 314, width: 200, height: 96 },
      { id: "worker", title: t("실행 계층", "Execution layer"), lines: [t("Web Worker", "Web Worker"), t("Service Worker", "Service Worker")], x: 244, y: 314, width: 200, height: 96 },
    ],
  },
  {
    id: "edge",
    tone: "edge",
    title: t("Cloudflare 엣지", "Cloudflare edge"),
    x: 528,
    width: 300,
    boxes: [
      { id: "static", title: t("Static Assets + Worker", "Static Assets + Worker"), lines: [t("SPA를 직접 제공", "Serves the SPA directly"), t("API·Socket.IO만 전달", "Forwards only API · Socket.IO")], x: 548, y: 98, width: 260, height: 150 },
      { id: "realtime", title: t("Durable Objects", "Durable Objects"), lines: [t("접속 상태·시그널링", "Presence · signaling"), t("API 발급 티켓으로 입장", "Joined with API tickets")], x: 548, y: 290, width: 260, height: 150 },
    ],
  },
  {
    id: "server",
    tone: "server",
    title: t("서버 원장", "Server ledger"),
    x: 892,
    width: 296,
    boxes: [
      { id: "core", title: t("Render · Core API", "Render · Core API"), lines: [t("NestJS 11 · Socket.IO", "NestJS 11 · Socket.IO"), t("인증·권한·원장", "Auth · permissions · ledger")], x: 912, y: 98, width: 256, height: 150 },
      { id: "db", title: t("Neon PostgreSQL", "Neon PostgreSQL"), lines: [t("Drizzle · 마이그레이션 원장", "Drizzle · migration ledger")], x: 912, y: 276, width: 256, height: 92 },
      { id: "files", title: t("비공개 파일 저장소", "Private file storage"), lines: [t("R2 · B2 · Supabase", "R2 · B2 · Supabase")], x: 912, y: 390, width: 256, height: 92 },
    ],
  },
];

const P2P_NOTE = {
  title: t("음성·영상 · WebRTC P2P", "Voice & video · WebRTC P2P"),
  line: t("브라우저끼리 직접 연결 · 서버에 저장하지 않음", "Browser to browser · never stored on servers"),
} as const;

const EDGE_NOTE = t("정적 트래픽은 API 서버를 깨우지 않음", "Static traffic never wakes the API");

const CONNECTIONS = [
  { id: "https", label: "HTTPS", path: "M 464 173 H 544", both: false },
  { id: "wss", label: "WSS", path: "M 468 365 H 544", both: true },
  { id: "api", label: "API", path: "M 808 173 H 908", both: false },
  { id: "db", label: "", path: "M 1040 248 V 272", both: false },
  { id: "files", label: "", path: "M 1168 205 H 1180 V 436 H 1172", both: false },
] as const;

const LABEL_POSITIONS: Record<string, { readonly x: number; readonly y: number }> = {
  https: { x: 504, y: 162 },
  wss: { x: 506, y: 354 },
  api: { x: 858, y: 162 },
};

export interface EngineeringArchitectureDiagramProps {
  readonly className?: string;
  /** 슬라이드 썸네일·인쇄처럼 폭이 좁아도 도식을 유지해야 할 때 사용한다. */
  readonly fixed?: boolean;
}

export function EngineeringArchitectureDiagram({ className, fixed = false }: EngineeringArchitectureDiagramProps) {
  useBilingualI18nRevision();
  const uid = useId().replace(/:/gu, "");
  const markerId = `eng-arch-arrow-${uid}`;
  const markerStartId = `eng-arch-arrow-start-${uid}`;
  const text = (value: LocalizedText): string => bi(value.ko, value.en);

  return (
    <figure className={cx("eng-arch", className)} data-fixed={fixed ? "true" : undefined}>
      <svg className="eng-arch__svg" viewBox="0 0 1200 540" aria-hidden="true" focusable="false">
        <defs>
          <marker id={markerId} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" className="eng-arch__arrowhead" />
          </marker>
          <marker id={markerStartId} viewBox="0 0 10 10" refX="1" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" className="eng-arch__arrowhead" />
          </marker>
        </defs>

        {ZONES.map((zone) => (
          <g key={zone.id} data-tone={zone.tone} className="eng-arch__zone">
            <rect x={zone.x} y={12} width={zone.width} height={516} rx={26} className="eng-arch__zone-frame" />
            <text x={zone.x + 22} y={52} className="eng-arch__zone-title">{text(zone.title)}</text>
            {zone.caption ? <text x={zone.x + 22} y={78} className="eng-arch__zone-caption">{text(zone.caption)}</text> : null}
            {zone.boxes.map((box) => (
              <g key={box.id} className="eng-arch__box">
                <rect x={box.x} y={box.y} width={box.width} height={box.height} rx={16} className="eng-arch__box-frame" />
                <text x={box.x + 16} y={box.y + 32} className="eng-arch__box-title">{text(box.title)}</text>
                {box.lines.map((line, lineIndex) => (
                  <text key={line.en} x={box.x + 16} y={box.y + 56 + lineIndex * 21} className="eng-arch__box-line">{text(line)}</text>
                ))}
              </g>
            ))}
          </g>
        ))}

        <g className="eng-arch__p2p">
          <rect x={32} y={426} width={412} height={82} rx={16} className="eng-arch__p2p-frame" />
          <text x={50} y={460} className="eng-arch__box-title">{text(P2P_NOTE.title)}</text>
          <text x={50} y={485} className="eng-arch__box-line">{text(P2P_NOTE.line)}</text>
        </g>
        <text x={548} y={492} className="eng-arch__zone-caption">{text(EDGE_NOTE)}</text>

        {CONNECTIONS.map((connection) => (
          <path
            key={connection.id}
            d={connection.path}
            className="eng-arch__link"
            markerEnd={`url(#${markerId})`}
            markerStart={connection.both ? `url(#${markerStartId})` : undefined}
          />
        ))}
        {CONNECTIONS.filter((connection) => connection.label).map((connection) => {
          const position = LABEL_POSITIONS[connection.id];
          return position ? (
            <text key={connection.id} x={position.x} y={position.y} textAnchor="middle" className="eng-arch__link-label">{connection.label}</text>
          ) : null;
        })}
      </svg>

      <div className="eng-arch__list">
        {ZONES.map((zone) => (
          <div key={zone.id} className="eng-arch__list-zone" data-tone={zone.tone}>
            <p className="eng-arch__list-title">{text(zone.title)}</p>
            <ul>
              {zone.boxes.map((box) => (
                <li key={box.id}>
                  <strong>{text(box.title)}</strong>
                  <span>{box.lines.map(text).join(" · ")}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
        <p className="eng-arch__list-note">
          {bi(
            "연결: 브라우저 → Cloudflare(HTTPS) → Core API · 브라우저 ↔ Durable Objects(WSS) · Core API → PostgreSQL·파일 저장소 · 음성·영상은 브라우저 간 WebRTC로 직접 연결하며 서버에 저장하지 않습니다.",
            "Connections: browser → Cloudflare (HTTPS) → Core API · browser ↔ Durable Objects (WSS) · Core API → PostgreSQL and file storage · voice and video connect browser to browser over WebRTC and are never stored on servers.",
          )}
        </p>
      </div>
    </figure>
  );
}
