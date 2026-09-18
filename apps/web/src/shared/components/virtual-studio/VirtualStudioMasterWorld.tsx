import type { CSSProperties } from "react";

import Link from "@/compat/router-link";
import {
  StudioChibiSprite,
  type StudioChibiMotion,
} from "./StudioChibiSprite";

import "./virtual-studio-master.css";

type MasterRoom = {
  readonly id: string;
  readonly label: string;
  readonly sublabel: string;
  readonly href: string;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
};

type MasterActor = {
  readonly name: string;
  readonly variant: number;
  readonly x: number;
  readonly y: number;
  readonly size: number;
  readonly motion: StudioChibiMotion;
  readonly message?: string;
};

const ROOMS: readonly MasterRoom[] = [
  { id: "lounge", label: "LOUNGE", sublabel: "라운지", href: "/community", x: 0, y: 0, w: 31, h: 35 },
  { id: "writers", label: "WRITERS ROOM", sublabel: "작가실", href: "/story-lab", x: 32, y: 0, w: 31, h: 35 },
  { id: "storyboard", label: "STORYBOARD WALL", sublabel: "콘티 보드", href: "/studio/new", x: 64, y: 0, w: 36, h: 35 },
  { id: "assets", label: "ASSET LIBRARY", sublabel: "에셋 라이브러리", href: "/studio/assets", x: 0, y: 36, w: 31, h: 30 },
  { id: "drawing", label: "DRAWING STUDIO", sublabel: "드로잉 스튜디오", href: "/studio", x: 69, y: 36, w: 31, h: 30 },
  { id: "review", label: "REVIEW ROOM", sublabel: "리뷰룸", href: "/production", x: 0, y: 67, w: 42, h: 33 },
  { id: "assistant", label: "ASSISTANT DESK", sublabel: "어시스트 데스크", href: "/collaborate", x: 66, y: 67, w: 34, h: 33 },
] as const;

const ACTORS: readonly MasterActor[] = [
  { name: "하늘", variant: 0, x: 25, y: 24, size: 74, motion: "talk", message: "오늘도 화이팅!" },
  { name: "시나", variant: 1, x: 46, y: 22, size: 70, motion: "idle" },
  { name: "PD 지훈", variant: 2, x: 57, y: 25, size: 72, motion: "review", message: "스토리 어떨까요?" },
  { name: "민준", variant: 5, x: 79, y: 24, size: 70, motion: "review" },
  { name: "유리", variant: 3, x: 91, y: 27, size: 70, motion: "talk", message: "이 컷 좋아요!" },
  { name: "리호", variant: 4, x: 18, y: 54, size: 74, motion: "idle" },
  { name: "나비", variant: 8, x: 82, y: 55, size: 76, motion: "draw", message: "지금 작업 중이에요!" },
  { name: "PD 지훈", variant: 2, x: 20, y: 85, size: 70, motion: "review" },
  { name: "민준", variant: 9, x: 31, y: 85, size: 68, motion: "talk", message: "여기는 좀 길게 해주세요!" },
  { name: "루나", variant: 8, x: 75, y: 84, size: 72, motion: "talk" },
  { name: "제이", variant: 2, x: 84, y: 86, size: 72, motion: "idle" },
  { name: "트리", variant: 6, x: 93, y: 87, size: 72, motion: "idle" },
] as const;

function Plant({ x, y, scale = 1 }: { readonly x: number; readonly y: number; readonly scale?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`} className="vs-master-plant">
      <ellipse cx="0" cy="22" rx="12" ry="5" fill="#4d3425" opacity=".45" />
      <path d="M-7 19h14l-2 15H-5z" fill="#9a5b36" />
      <ellipse cx="-10" cy="3" rx="8" ry="15" fill="#2f7d4a" transform="rotate(-30 -10 3)" />
      <ellipse cx="7" cy="-2" rx="8" ry="16" fill="#3e9656" transform="rotate(24 7 -2)" />
      <ellipse cx="-2" cy="-11" rx="8" ry="17" fill="#2f874c" transform="rotate(-3 -2 -11)" />
      <ellipse cx="14" cy="10" rx="7" ry="14" fill="#4ba865" transform="rotate(42 14 10)" />
      <circle cx="-7" cy="-5" r="2" fill="#ffd66c" />
      <circle cx="8" cy="7" r="2" fill="#ffb55e" />
    </g>
  );
}

function Desk({ x, y, scale = 1, monitors = 1 }: { readonly x: number; readonly y: number; readonly scale?: number; readonly monitors?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`} className="vs-master-prop">
      <rect x="-42" y="-7" width="84" height="25" rx="4" fill="#9d6a42" />
      <rect x="-39" y="13" width="7" height="28" rx="2" fill="#6e452f" />
      <rect x="32" y="13" width="7" height="28" rx="2" fill="#6e452f" />
      {Array.from({ length: monitors }, (_, index) => {
        const ox = monitors === 1 ? 0 : (index - (monitors - 1) / 2) * 29;
        return (
          <g key={index} transform={`translate(${ox} -20)`}>
            <rect x="-13" y="-13" width="26" height="19" rx="2" fill="#151d2a" stroke="#697996" strokeWidth="2" />
            <rect x="-10" y="-10" width="20" height="13" rx="1" fill="#cfe7ff" />
            <path d="M-7-5h14M-7-1h9" stroke="#8a9dcc" strokeWidth="1.4" />
            <rect x="-2" y="6" width="4" height="7" fill="#414c5c" />
          </g>
        );
      })}
      <rect x="-14" y="-1" width="28" height="7" rx="3" fill="#d9d1c5" />
    </g>
  );
}

function Sofa({ x, y, scale = 1 }: { readonly x: number; readonly y: number; readonly scale?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`} className="vs-master-prop">
      <rect x="-54" y="-17" width="108" height="41" rx="13" fill="#c8a17d" />
      <rect x="-48" y="-29" width="96" height="28" rx="12" fill="#d6b18d" />
      <rect x="-52" y="20" width="10" height="11" rx="3" fill="#6a4a37" />
      <rect x="42" y="20" width="10" height="11" rx="3" fill="#6a4a37" />
      <rect x="-8" y="-22" width="22" height="18" rx="5" fill="#ffcf66" />
    </g>
  );
}

function Bookshelf({ x, y, scale = 1 }: { readonly x: number; readonly y: number; readonly scale?: number }) {
  const books = ["#bf6372", "#5f82b8", "#dda957", "#6e9566", "#8e68a9"];
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`} className="vs-master-prop">
      <rect x="-32" y="-55" width="64" height="94" rx="5" fill="#8d5a36" />
      {[-31, -3, 25].map((yy, row) => (
        <g key={row}>
          <rect x="-27" y={yy} width="54" height="4" fill="#5e3b28" />
          {Array.from({ length: 7 }, (_, i) => (
            <rect key={i} x={-24 + i * 7} y={yy - 19} width="5" height={15 + (i % 3) * 2} rx="1" fill={books[(i + row) % books.length]} />
          ))}
        </g>
      ))}
    </g>
  );
}

function StoryboardWall() {
  return (
    <g transform="translate(726 80)">
      <rect x="-89" y="-52" width="178" height="104" rx="6" fill="#f6e8d3" stroke="#b7865a" strokeWidth="4" />
      {Array.from({ length: 12 }, (_, i) => {
        const col = i % 4;
        const row = Math.floor(i / 4);
        return (
          <g key={i} transform={`translate(${-72 + col * 40} ${-37 + row * 31})`}>
            <rect width="31" height="23" rx="2" fill="#fffaf1" stroke="#bba590" />
            <path d="M5 17 12 9l5 5 5-8 5 11z" fill="#d4c9ca" />
          </g>
        );
      })}
    </g>
  );
}

export function VirtualStudioMasterBackdrop() {
  return (
    <svg className="vs-master-world-svg" viewBox="0 0 850 798" aria-hidden="true">
      <defs>
        <linearGradient id="worldFloor" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#bd906a" />
          <stop offset=".5" stopColor="#d9b58f" />
          <stop offset="1" stopColor="#b47d5a" />
        </linearGradient>
        <linearGradient id="roomWall" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f0d8bf" />
          <stop offset="1" stopColor="#d5b08d" />
        </linearGradient>
        <radialGradient id="plazaGlow">
          <stop offset="0" stopColor="#fff" />
          <stop offset=".2" stopColor="#d8c7ff" />
          <stop offset=".45" stopColor="#997aff" />
          <stop offset="1" stopColor="#574581" />
        </radialGradient>
        <filter id="softShadow" x="-40%" y="-40%" width="180%" height="180%">
          <feDropShadow dx="0" dy="8" stdDeviation="8" floodColor="#1a1015" floodOpacity=".34" />
        </filter>
        <filter id="plazaLight" x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur stdDeviation="10" />
        </filter>
        <pattern id="floorGrid" width="34" height="34" patternUnits="userSpaceOnUse">
          <path d="M34 0H0V34" fill="none" stroke="#fff" strokeOpacity=".075" />
        </pattern>
      </defs>
      <rect width="850" height="798" rx="24" fill="#5b4338" />
      <rect x="4" y="4" width="842" height="790" rx="22" fill="url(#worldFloor)" />
      <rect x="4" y="4" width="842" height="790" rx="22" fill="url(#floorGrid)" />

      <g className="vs-master-room-bases" filter="url(#softShadow)">
        <path d="M0 0h264v243H0z" fill="#7c563f" />
        <path d="M274 0h264v243H274z" fill="#78533d" />
        <path d="M548 0h302v243H548z" fill="#76523d" />
        <path d="M0 253h264v221H0z" fill="#704d3b" />
        <path d="M586 253h264v221H586z" fill="#704d3b" />
        <path d="M0 484h352v314H0z" fill="#684739" />
        <path d="M565 484h285v314H565z" fill="#684739" />
      </g>

      <g className="vs-master-room-walls">
        <path d="M8 8h248v46H8zM8 8h42v227H8z" fill="url(#roomWall)" />
        <path d="M282 8h248v46H282zM282 8h42v227h-42z" fill="url(#roomWall)" />
        <path d="M556 8h286v46H556zM800 8h42v227h-42z" fill="url(#roomWall)" />
        <path d="M8 261h248v42H8zM8 261h40v205H8z" fill="url(#roomWall)" />
        <path d="M594 261h248v42H594zM802 261h40v205h-40z" fill="url(#roomWall)" />
        <path d="M8 492h336v46H8zM8 492h42v298H8z" fill="url(#roomWall)" />
        <path d="M573 492h269v46H573zM802 492h40v298h-40z" fill="url(#roomWall)" />
      </g>

      <g opacity=".95">
        <Sofa x={116} y={126} scale={.86} />
        <rect x="62" y="183" width="96" height="34" rx="9" fill="#a06e49" />
        <ellipse cx="110" cy="192" rx="28" ry="12" fill="#7f543b" />
        <Bookshelf x={396} y={102} scale={.85} />
        <Desk x={420} y={175} scale={.75} monitors={1} />
        <StoryboardWall />
        <Bookshelf x={95} y={365} scale={1.02} />
        <Desk x={725} y={385} scale={.82} monitors={3} />
        <rect x="620" y="338" width="56" height="84" rx="6" fill="#9a6d4b" />
        <rect x="631" y="348" width="34" height="55" rx="4" fill="#5e3e31" />
        <Desk x={202} y={676} scale={1.04} monitors={1} />
        <Sofa x={160} y={736} scale={.92} />
        <Desk x={705} y={678} scale={.92} monitors={2} />
        <rect x="770" y="594" width="58" height="95" rx="5" fill="#f4ead7" stroke="#a67c55" strokeWidth="3" />
        {Array.from({ length: 5 }, (_, i) => <path key={i} d={`M783 ${615 + i * 13}h30`} stroke="#7184b1" strokeWidth="3" strokeLinecap="round" />)}
      </g>

      <g>
        <Plant x={33} y={204} scale={1.15} /><Plant x={249} y={207} scale={.95} />
        <Plant x={290} y={206} scale={.88} /><Plant x={533} y={202} scale={.95} />
        <Plant x={568} y={205} scale={1.02} /><Plant x={813} y={205} scale={1.25} />
        <Plant x={45} y={448} scale={.95} /><Plant x={244} y={445} scale={1.1} />
        <Plant x={604} y={444} scale={1.05} /><Plant x={815} y={443} scale={.9} />
        <Plant x={54} y={760} scale={1.2} /><Plant x={330} y={749} scale={.95} />
        <Plant x={590} y={748} scale={1.05} /><Plant x={815} y={748} scale={1.2} />
      </g>

      <g className="vs-master-plaza">
        <ellipse cx="425" cy="365" rx="124" ry="100" fill="#3f2f43" opacity=".48" filter="url(#plazaLight)" />
        <ellipse cx="425" cy="365" rx="105" ry="82" fill="#66536e" stroke="#8e77aa" strokeWidth="7" />
        <ellipse cx="425" cy="365" rx="79" ry="59" fill="#344047" stroke="#bd9cff" strokeWidth="5" />
        <ellipse cx="425" cy="365" rx="55" ry="40" fill="url(#plazaGlow)" opacity=".24" />
        <circle cx="425" cy="351" r="38" fill="url(#plazaGlow)" filter="url(#softShadow)" />
        <path d="M407 347c7-20 30-20 36 0 11 4 15 14 10 23-10 12-45 12-56 0-5-9 0-19 10-23z" fill="#fff9ff" opacity=".9" />
        <circle cx="416" cy="354" r="3" fill="#8b73b5" /><circle cx="435" cy="354" r="3" fill="#8b73b5" />
        <path d="M421 363c4 3 7 3 10 0" fill="none" stroke="#ab8fd0" strokeWidth="2" strokeLinecap="round" />
        <rect x="366" y="423" width="118" height="48" rx="7" fill="#20283b" stroke="#4d5874" strokeWidth="3" />
        <text x="425" y="444" textAnchor="middle" fill="#fff" fontSize="17" fontWeight="800">ToonSpectrum</text>
        <text x="425" y="459" textAnchor="middle" fill="#aeb7d5" fontSize="8" letterSpacing="2">VIRTUAL STUDIO</text>
      </g>

      <g className="vs-master-entry">
        <rect x="344" y="615" width="165" height="106" rx="7" fill="#6d4a4c" opacity=".82" />
        <text x="426" y="651" textAnchor="middle" fill="#ffc27b" fontSize="13" fontWeight="800" letterSpacing="1.5">TOGETHER</text>
        <text x="426" y="671" textAnchor="middle" fill="#ffc27b" fontSize="13" fontWeight="800" letterSpacing="1.5">CREATORS</text>
        <text x="426" y="691" textAnchor="middle" fill="#ffc27b" fontSize="13" fontWeight="800" letterSpacing="1.5">A BRIGHTER TOMORROW</text>
      </g>
    </svg>
  );
}

export function VirtualStudioAmbientActors({
  compact = false,
}: {
  readonly compact?: boolean;
}) {
  const actors = compact ? ACTORS.filter((_, index) => index % 2 === 0) : ACTORS;
  return (
    <div className="vs-master-actors" aria-hidden="true">
      {actors.map((actor, index) => (
        <span
          key={actor.name + index}
          className="vs-master-actor"
          style={{ left: `${actor.x}%`, top: `${actor.y}%` } as CSSProperties}
        >
          {!compact && actor.message ? <span className="vs-master-speech">{actor.message}</span> : null}
          <StudioChibiSprite
            variant={actor.variant}
            motion={actor.motion}
            size={compact ? Math.round(actor.size * 0.9) : actor.size}
            label={compact ? undefined : actor.name}
            online
          />
        </span>
      ))}
    </div>
  );
}

export function VirtualStudioMasterWorld() {
  return (
    <div className="vs-master-world">
      <VirtualStudioMasterBackdrop />
      {ROOMS.map((room) => (
        <Link
          key={room.id}
          href={room.href}
          className={"vs-master-room-hotspot vs-master-room-hotspot--" + room.id}
          style={{
            left: `${room.x}%`,
            top: `${room.y}%`,
            width: `${room.w}%`,
            height: `${room.h}%`,
          } as CSSProperties}
          aria-label={room.label + " " + room.sublabel}
        >
          <span><strong>{room.label}</strong><small>{room.sublabel}</small></span>
        </Link>
      ))}
      <VirtualStudioAmbientActors />
      <span className="vs-master-pet vs-master-pet--cat" aria-hidden="true">🐈</span>
      <span className="vs-master-pet vs-master-pet--dog" aria-hidden="true">🐕</span>
      <span className="vs-master-pet vs-master-pet--bun" aria-hidden="true">🐇</span>
    </div>
  );
}
