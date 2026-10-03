import { useEffect, useState, type CSSProperties, type ReactNode } from "react";

import type { StudioVirtualAvatarProfile } from "./studio-virtual-space-model";
import type { StudioSpriteDirection } from "./studio-virtual-space-sprite";

/**
 * 파라메트릭 아바타 피규어 (SVG)
 *
 * `StudioVirtualAvatarProfile`(피부/헤어/의상/액세서리/표정)을 치비 캐릭터로 그린다.
 * PNG 스프라이트가 없어도 8방향 미리보기와 걷기 애니메이션을 제공한다.
 * 꾸미기 미리보기·프로필 표시·입장 로비용. 인월드 PNG 렌더러를 대체하지 않는다.
 */

const DARK = "#2b2b33";

function shade(opacity: number): string {
  return `rgba(0,0,0,${opacity})`;
}

/* ---------- 헤어 ---------- */

function hairCap(hairStyle: StudioVirtualAvatarProfile["hairStyle"], hair: string, highlight: string): ReactNode {
  const cap = <ellipse cx={48} cy={27} rx={18} ry={11} fill={hair} />;
  const shine = <path d="M38 22 q6 -4 13 -2" stroke={highlight} strokeWidth={3} strokeLinecap="round" fill="none" opacity={0.75} />;
  switch (hairStyle) {
    case "bob":
      return <g>{cap}{shine}
        <rect x={29} y={28} width={9} height={24} rx={4.5} fill={hair} />
        <rect x={58} y={28} width={9} height={24} rx={4.5} fill={hair} /></g>;
    case "long":
      return <g>{cap}{shine}
        <rect x={28} y={28} width={9} height={52} rx={4.5} fill={hair} />
        <rect x={59} y={28} width={9} height={52} rx={4.5} fill={hair} /></g>;
    case "short":
      return <g><ellipse cx={48} cy={27} rx={17} ry={10} fill={hair} />{shine}</g>;
    case "twin":
      return <g>{cap}{shine}
        <ellipse cx={22} cy={56} rx={7} ry={13} fill={hair} transform="rotate(-12 22 56)" />
        <ellipse cx={74} cy={56} rx={7} ry={13} fill={hair} transform="rotate(12 74 56)" />
        <circle cx={24} cy={42} r={3.2} fill={highlight} /><circle cx={72} cy={42} r={3.2} fill={highlight} /></g>;
    case "wave":
      return <g>{cap}{shine}
        <path d="M30 30 q-7 10 0 20 q7 10 0 18" stroke={hair} strokeWidth={9} strokeLinecap="round" fill="none" />
        <path d="M66 30 q7 10 0 20 q-7 10 0 18" stroke={hair} strokeWidth={9} strokeLinecap="round" fill="none" /></g>;
    case "crop":
      return <g><ellipse cx={48} cy={26} rx={18} ry={9} fill={hair} />{shine}
        <rect x={33} y={28} width={30} height={9} rx={4.5} fill={hair} /></g>;
    case "ponytail":
      return <g>{cap}{shine}
        <path d="M62 24 Q74 16 78 4" stroke={hair} strokeWidth={10} strokeLinecap="round" fill="none" />
        <circle cx={62} cy={24} r={3.5} fill={highlight} /></g>;
    case "bun":
      return <g>{cap}{shine}
        <circle cx={48} cy={13} r={8} fill={hair} />
        <circle cx={48} cy={13} r={8} fill="none" stroke={highlight} strokeWidth={2} opacity={0.6} /></g>;
    case "curly":
      return <g>{cap}
        <circle cx={32} cy={22} r={5.5} fill={hair} /><circle cx={41} cy={16} r={5.5} fill={hair} />
        <circle cx={50} cy={14} r={5.5} fill={hair} /><circle cx={59} cy={17} r={5.5} fill={hair} />
        <circle cx={65} cy={24} r={5.5} fill={hair} /><circle cx={29} cy={31} r={5} fill={hair} />
        <circle cx={67} cy={31} r={5} fill={hair} /></g>;
    case "braid":
      return <g>{cap}{shine}
        <ellipse cx={63} cy={48} rx={5} ry={6.5} fill={hair} />
        <ellipse cx={63} cy={59} rx={5} ry={6.5} fill={hair} />
        <ellipse cx={63} cy={70} rx={5} ry={6.5} fill={hair} />
        <circle cx={63} cy={77} r={3} fill={highlight} /></g>;
    case "pigtails":
      return <g>{cap}{shine}
        <ellipse cx={27} cy={42} rx={6} ry={9} fill={hair} />
        <ellipse cx={69} cy={42} rx={6} ry={9} fill={hair} />
        <circle cx={29} cy={33} r={2.8} fill={highlight} /><circle cx={67} cy={33} r={2.8} fill={highlight} /></g>;
    case "mohawk":
      return <g>
        <rect x={43} y={10} width={10} height={24} rx={5} fill={hair} />
        <path d="M48 12 v18" stroke={highlight} strokeWidth={2.5} strokeLinecap="round" opacity={0.8} /></g>;
    case "hime":
      return <g>{cap}{shine}
        <rect x={29} y={28} width={8} height={34} rx={4} fill={hair} />
        <rect x={59} y={28} width={8} height={34} rx={4} fill={hair} />
        <rect x={32} y={31} width={32} height={3} fill={hair} /></g>;
    case "side-part":
      return <g>
        <ellipse cx={46} cy={26} rx={18} ry={10} fill={hair} />
        <path d="M30 34 L66 26 L66 35 L30 38 Z" fill={hair} />{shine}</g>;
    case "shaggy":
      return <g>{cap}{shine}
        <path d="M29 28 L38 28 L38 48 L34 42 L30 50 Z" fill={hair} />
        <path d="M67 28 L58 28 L58 48 L62 42 L66 50 Z" fill={hair} /></g>;
    case "undercut":
      return <g><ellipse cx={48} cy={24} rx={16} ry={9} fill={hair} />{shine}
        <rect x={30} y={27} width={5} height={11} rx={2.5} fill={hair} opacity={0.55} />
        <rect x={61} y={27} width={5} height={11} rx={2.5} fill={hair} opacity={0.55} /></g>;
    case "double-bun":
      return <g>{cap}{shine}
        <circle cx={30} cy={15} r={7} fill={hair} />
        <circle cx={66} cy={15} r={7} fill={hair} /></g>;
    case "wolf":
      return <g>{cap}{shine}
        <path d="M27 28 L36 28 L36 64 L31 56 L27 64 Z" fill={hair} />
        <path d="M69 28 L60 28 L60 64 L65 56 L69 64 Z" fill={hair} /></g>;
  }
}

function hairBack(hairStyle: StudioVirtualAvatarProfile["hairStyle"], hair: string): ReactNode {
  const panel = <ellipse cx={48} cy={38} rx={19} ry={20} fill={hair} />;
  switch (hairStyle) {
    case "long":
      return <g>{panel}<rect x={28} y={40} width={10} height={44} rx={5} fill={hair} /><rect x={58} y={40} width={10} height={44} rx={5} fill={hair} /></g>;
    case "twin":
      return <g>{panel}
        <ellipse cx={22} cy={56} rx={7} ry={13} fill={hair} transform="rotate(-12 22 56)" />
        <ellipse cx={74} cy={56} rx={7} ry={13} fill={hair} transform="rotate(12 74 56)" /></g>;
    case "ponytail":
      return <g>{panel}<path d="M60 26 Q72 18 76 6" stroke={hair} strokeWidth={10} strokeLinecap="round" fill="none" /></g>;
    case "braid":
      return <g>{panel}
        <ellipse cx={48} cy={52} rx={6} ry={7} fill={hair} /><ellipse cx={48} cy={64} rx={6} ry={7} fill={hair} />
        <ellipse cx={48} cy={76} rx={6} ry={7} fill={hair} /></g>;
    case "bun":
      return <g>{panel}<circle cx={48} cy={16} r={8} fill={hair} /></g>;
    case "mohawk":
      return <g><rect x={43} y={12} width={10} height={26} rx={5} fill={hair} /></g>;
    case "hime":
      return <g>{panel}<rect x={29} y={40} width={38} height={44} rx={4} fill={hair} /></g>;
    case "double-bun":
      return <g>{panel}<circle cx={31} cy={17} r={7} fill={hair} /><circle cx={65} cy={17} r={7} fill={hair} /></g>;
    case "wolf":
      return <g>{panel}<rect x={27} y={40} width={9} height={40} rx={4} fill={hair} /><rect x={60} y={40} width={9} height={40} rx={4} fill={hair} /></g>;
    case "undercut":
      return <g><ellipse cx={48} cy={34} rx={17} ry={15} fill={hair} /></g>;
    default:
      return panel;
  }
}

/* ---------- 표정 ---------- */

function faceFront(expression: StudioVirtualAvatarProfile["expression"]): ReactNode {
  const eye = "#26262e";
  switch (expression) {
    case "bright":
      return <g>
        <circle cx={42} cy={38} r={2.8} fill={eye} /><circle cx={54} cy={38} r={2.8} fill={eye} />
        <circle cx={43} cy={37} r={0.9} fill="#fff" /><circle cx={55} cy={37} r={0.9} fill="#fff" />
        <path d="M43 45 q5 6 10 0" stroke={eye} strokeWidth={2} strokeLinecap="round" fill="none" /></g>;
    case "calm":
      return <g>
        <path d="M39.5 38 h5 M51.5 38 h5" stroke={eye} strokeWidth={2} strokeLinecap="round" />
        <path d="M44 46 q4 3 8 0" stroke={eye} strokeWidth={2} strokeLinecap="round" fill="none" /></g>;
    case "sparkle":
      return <g>
        <path d="M42 34 l1.2 2.8 2.8 1.2 -2.8 1.2 -1.2 2.8 -1.2 -2.8 -2.8 -1.2 2.8 -1.2 z" fill={eye} />
        <path d="M54 34 l1.2 2.8 2.8 1.2 -2.8 1.2 -1.2 2.8 -1.2 -2.8 -2.8 -1.2 2.8 -1.2 z" fill={eye} />
        <path d="M43 45 q5 6 10 0" stroke={eye} strokeWidth={2} strokeLinecap="round" fill="none" /></g>;
    case "smile":
      return <g>
        <path d="M39.5 38 q2.5 -3 5 0 M51.5 38 q2.5 -3 5 0" stroke={eye} strokeWidth={2} strokeLinecap="round" fill="none" />
        <path d="M42 44 q6 8 12 0" stroke={eye} strokeWidth={2.2} strokeLinecap="round" fill="none" /></g>;
  }
}

function faceSide(): ReactNode {
  return <g>
    <circle cx={55} cy={38} r={2.4} fill={DARK} />
    <path d="M62 40 q3 1 2 4" stroke={DARK} strokeWidth={1.8} strokeLinecap="round" fill="none" />
    <path d="M55 46 q3 2 6 0" stroke={DARK} strokeWidth={1.8} strokeLinecap="round" fill="none" />
  </g>;
}

/* ---------- 액세서리 ---------- */

function accessory(profile: StudioVirtualAvatarProfile, side: boolean): ReactNode {
  const accent = profile.accent;
  const hair = profile.hair;
  switch (profile.accessory) {
    case "beret":
      return <g><ellipse cx={40} cy={16} rx={12} ry={7} fill={accent} transform="rotate(-12 40 16)" />
        <circle cx={40} cy={8.5} r={1.8} fill={accent} /></g>;
    case "bow":
      return <g><path d="M62 20 L54 14 L56 24 Z M62 20 L70 14 L68 24 Z" fill={accent} />
        <circle cx={62} cy={20} r={3} fill={accent} stroke={shade(0.2)} /></g>;
    case "cat":
      return <g><path d="M36 22 L30 8 L45 17 Z" fill={hair} /><path d="M60 22 L66 8 L51 17 Z" fill={hair} />
        <path d="M37 19 L33 11 L42 16 Z" fill="#e8a0a0" /><path d="M59 19 L63 11 L54 16 Z" fill="#e8a0a0" /></g>;
    case "headphones":
      return <g><path d="M30 34 Q30 12 48 12 Q66 12 66 34" stroke={DARK} strokeWidth={5} fill="none" strokeLinecap="round" />
        <rect x={26} y={30} width={7} height={12} rx={3.5} fill={accent} /><rect x={63} y={30} width={7} height={12} rx={3.5} fill={accent} /></g>;
    case "leaf":
      return <g><path d="M62 18 q8 -6 12 0 q-6 6 -12 0" fill="#4caf6d" />
        <path d="M62 18 q6 -3 12 0" stroke="#2e7d4f" strokeWidth={1.2} fill="none" /></g>;
    case "star":
      return <g><path d="M63 14 l1.8 3.6 4 0.6 -2.9 2.8 0.7 4 -3.6 -1.9 -3.6 1.9 0.7 -4 -2.9 -2.8 4 -0.6 z" fill={accent} stroke={shade(0.25)} /></g>;
    case "glasses":
      return side
        ? <rect x={50} y={34} width={12} height={8} rx={3} fill="#fff" opacity={0.3} stroke={DARK} strokeWidth={2} />
        : <g><rect x={36} y={34} width={11} height={9} rx={3.5} fill="#fff" opacity={0.28} stroke={DARK} strokeWidth={2} />
          <rect x={49} y={34} width={11} height={9} rx={3.5} fill="#fff" opacity={0.28} stroke={DARK} strokeWidth={2} />
          <path d="M47 37 h2" stroke={DARK} strokeWidth={2} /></g>;
    case "cap":
      return <g><path d="M31 26 a17 13 0 0 1 34 0 z" fill={accent} />
        <rect x={30} y={24} width={36} height={5} rx={2.5} fill={accent} stroke={shade(0.2)} />
        <circle cx={48} cy={13} r={2} fill={shade(0.25)} /></g>;
    case "headband":
      return <path d="M32 28 Q48 18 64 28" stroke={accent} strokeWidth={5} strokeLinecap="round" fill="none" />;
    case "sunglasses":
      return side
        ? <rect x={50} y={33} width={12} height={9} rx={4} fill={DARK} opacity={0.88} />
        : <g><rect x={35} y={33} width={12} height={10} rx={4} fill={DARK} opacity={0.88} />
          <rect x={49} y={33} width={12} height={10} rx={4} fill={DARK} opacity={0.88} />
          <path d="M38 40 l4 -5 M52 40 l4 -5" stroke="#fff" strokeWidth={1.6} opacity={0.55} /></g>;
    case "beanie":
      return <g><path d="M30 27 a18 18 0 0 1 36 0 z" fill={accent} />
        <rect x={29} y={24} width={38} height={7} rx={3.5} fill={DARK} opacity={0.3} />
        <circle cx={48} cy={8} r={4} fill={accent} /></g>;
    case "backpack":
      return <g><rect x={64} y={62} width={8} height={18} rx={4} fill={accent} />
        <rect x={36} y={58} width={5} height={30} rx={2.5} fill={accent} opacity={0.9} />
        <rect x={55} y={58} width={5} height={30} rx={2.5} fill={accent} opacity={0.9} /></g>;
    case "tote":
      return <g><path d="M63 58 Q72 62 71 74" stroke={DARK} strokeWidth={2.5} fill="none" />
        <rect x={63} y={74} width={17} height={15} rx={3} fill={accent} />
        <rect x={67} y={79} width={9} height={5} rx={1.5} fill={shade(0.25)} /></g>;
    case "scarf":
      return <g><rect x={35} y={52} width={26} height={10} rx={5} fill={accent} />
        <rect x={51} y={60} width={8} height={17} rx={3.5} fill={accent} /></g>;
    case "flower":
      return <g><circle cx={64} cy={16} r={2.6} fill={accent} /><circle cx={67.8} cy={18.8} r={2.6} fill={accent} />
        <circle cx={66.4} cy={23.2} r={2.6} fill={accent} /><circle cx={61.6} cy={23.2} r={2.6} fill={accent} />
        <circle cx={60.2} cy={18.8} r={2.6} fill={accent} /><circle cx={64} cy={20} r={2.2} fill="#ffd94d" /></g>;
    case "none":
      return null;
  }
}

/* ---------- 의상 ---------- */

function outfitDetails(outfitStyle: StudioVirtualAvatarProfile["outfitStyle"], outfit: string, accent: string): ReactNode {
  void outfit;
  const line = shade(0.22);
  switch (outfitStyle) {
    case "hoodie":
      return <g><path d="M38 60 q10 -9 20 0" stroke={line} strokeWidth={6} fill="none" strokeLinecap="round" />
        <rect x={41} y={73} width={14} height={9} rx={3} fill={line} />
        <path d="M45 63 v8 M51 63 v8" stroke={accent} strokeWidth={1.6} strokeLinecap="round" /></g>;
    case "tee":
      return <circle cx={48} cy={69} r={4} fill={accent} opacity={0.9} />;
    case "jacket":
      return <g><path d="M48 60 L42 72 L48 80 L54 72 Z" fill={line} />
        <path d="M48 60 v30" stroke={DARK} strokeWidth={2} opacity={0.6} /></g>;
    case "dress":
      return <g><path d="M37 76 L29 96 L67 96 L59 76 Z" fill={accent} opacity={0.35} />
        <rect x={36} y={74} width={24} height={4} rx={2} fill={line} /></g>;
    case "suit":
      return <g><path d="M48 60 L43 70 L48 76 L53 70 Z" fill="#fff" opacity={0.25} />
        <path d="M48 63 l-3 6 3 13 3 -13 z" fill={accent} /></g>;
    case "sweater":
      return <g><rect x={42} y={56} width={12} height={5} rx={2.5} fill={line} />
        <path d="M34 70 h28 M34 78 h28" stroke={line} strokeWidth={2} /></g>;
    case "uniform":
      return <g><path d="M42 58 l6 5 6 -5" stroke="#fff" strokeWidth={2.5} fill="none" opacity={0.5} />
        <circle cx={48} cy={70} r={1.6} fill={DARK} /><circle cx={48} cy={76} r={1.6} fill={DARK} />
        <rect x={53} y={66} width={7} height={6} rx={1.5} fill={line} /></g>;
    case "apron":
      return <g><path d="M41 58 v10 M55 58 v10" stroke={accent} strokeWidth={3} />
        <rect x={39} y={66} width={18} height={22} rx={4} fill={accent} opacity={0.8} />
        <rect x={43} y={76} width={10} height={7} rx={2} fill={line} /></g>;
    case "coat":
      return <g><rect x={31} y={58} width={34} height={38} rx={10} fill={line} opacity={0.35} />
        <rect x={31} y={74} width={34} height={5} fill={DARK} opacity={0.45} />
        <path d="M42 58 l6 6 6 -6" stroke="#fff" strokeWidth={2.5} fill="none" opacity={0.4} /></g>;
    case "sportswear":
      return <g><rect x={33} y={66} width={30} height={5} fill={accent} opacity={0.9} />
        <path d="M27 66 h7 M62 66 h7" stroke={accent} strokeWidth={2.5} /></g>;
    case "cardigan":
      return <g><path d="M48 60 v30" stroke={line} strokeWidth={2.5} />
        <circle cx={48} cy={68} r={1.6} fill={DARK} /><circle cx={48} cy={75} r={1.6} fill={DARK} /><circle cx={48} cy={82} r={1.6} fill={DARK} /></g>;
    case "overalls":
      return <g><rect x={40} y={56} width={5} height={16} fill={accent} /><rect x={51} y={56} width={5} height={16} fill={accent} />
        <rect x={40} y={70} width={16} height={13} rx={3} fill={accent} opacity={0.85} />
        <rect x={44} y={74} width={8} height={5} rx={1.5} fill={line} /></g>;
    case "blazer":
      return <g><path d="M43 59 L53 59 L48 72 Z" fill="#fff" opacity={0.85} />
        <path d="M43 59 L47 72 M53 59 L49 72" stroke={line} strokeWidth={2.5} />
        <circle cx={48} cy={79} r={1.7} fill={DARK} />
        <rect x={54} y={72} width={7} height={5} rx={1.5} fill={line} /></g>;
    case "turtleneck":
      return <g><rect x={42} y={53} width={12} height={8} rx={3} fill={line} />
        <rect x={44} y={55} width={8} height={4} rx={2} fill={line} opacity={0.6} /></g>;
    case "denim":
      return <g><path d="M44 62 v26 M52 62 v26" stroke="#fff" strokeWidth={1.6} opacity={0.45} />
        <path d="M42 58 l6 7 6 -7" stroke={line} strokeWidth={2.5} fill="none" />
        <rect x={35} y={68} width={9} height={6} rx={1.5} fill={line} /><rect x={52} y={68} width={9} height={6} rx={1.5} fill={line} /></g>;
    case "polo":
      return <g><path d="M41 58 L48 66 L44 58 Z M55 58 L48 66 L52 58 Z" fill={line} />
        <circle cx={48} cy={70} r={1.5} fill={DARK} /><circle cx={48} cy={76} r={1.5} fill={DARK} />
        <rect x={46} y={82} width={4} height={4} fill={accent} opacity={0.9} /></g>;
    case "hanbok":
      return <g><path d="M40 58 L52 70 M56 58 L44 70" stroke="#fff" strokeWidth={3} opacity={0.8} />
        <rect x={44} y={70} width={4} height={15} rx={2} fill={accent} />
        <rect x={50} y={72} width={4} height={13} rx={2} fill={accent} />
        <path d="M36 76 L28 96 L68 96 L60 76 Z" fill={accent} opacity={0.3} /></g>;
    case "sailor":
      return <g><rect x={37} y={55} width={22} height={11} rx={3} fill={line} />
        <path d="M38 60 h20 M38 64 h20" stroke={accent} strokeWidth={2} />
        <path d="M48 66 L43 74 L53 74 Z" fill={accent} /><circle cx={48} cy={66} r={2.4} fill={accent} /></g>;
  }
}

/* ---------- 본체 ---------- */

export function StudioVirtualAvatarFigure({
  profile,
  direction = "down",
  frame = 0,
  animated = false,
  className,
  style,
  title,
}: {
  readonly profile: StudioVirtualAvatarProfile;
  readonly direction?: StudioSpriteDirection;
  /** 걷기 프레임 (0 | 1). animated면 자동 재생. */
  readonly frame?: 0 | 1;
  readonly animated?: boolean;
  readonly className?: string;
  readonly style?: CSSProperties;
  readonly title?: string;
}) {
  const [liveFrame, setLiveFrame] = useState<0 | 1>(frame);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    setReducedMotion(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, []);

  useEffect(() => {
    if (!animated || reducedMotion) {
      setLiveFrame(frame);
      return;
    }
    const timer = window.setInterval(() => {
      setLiveFrame((current) => (current === 0 ? 1 : 0));
    }, 320);
    return () => window.clearInterval(timer);
  }, [animated, reducedMotion, frame]);

  const walking = animated && !reducedMotion;
  const currentFrame = walking ? liveFrame : frame;
  const legOffset = currentFrame === 0 ? -2.5 : 2.5;

  const body = (
    <g>
      {/* 그림자 */}
      <ellipse cx={48} cy={104} rx={17} ry={4.5} fill="#000" opacity={0.18} />
      {/* 다리 */}
      <rect x={40} y={88 + legOffset} width={8} height={14} rx={3} fill="#3a3a44" />
      <rect x={50} y={88 - legOffset} width={8} height={14} rx={3} fill="#3a3a44" />
      {/* 팔 */}
      <rect x={26} y={62} width={7} height={19} rx={3.5} fill={profile.outfit} />
      <rect x={63} y={62} width={7} height={19} rx={3.5} fill={profile.outfit} />
      <circle cx={29.5} cy={83} r={3.5} fill={profile.skin} />
      <circle cx={66.5} cy={83} r={3.5} fill={profile.skin} />
      {/* 몸통 */}
      <rect x={33} y={58} width={30} height={32} rx={10} fill={profile.outfit} />
      {outfitDetails(profile.outfitStyle, profile.outfit, profile.accent)}
    </g>
  );

  const headFront = (
    <g>
      <circle cx={31.5} cy={38} r={3.2} fill={profile.skin} />
      <circle cx={64.5} cy={38} r={3.2} fill={profile.skin} />
      <circle cx={48} cy={38} r={17} fill={profile.skin} />
      {hairCap(profile.hairStyle, profile.hair, profile.hairHighlight)}
      {faceFront(profile.expression)}
      {accessory(profile, false)}
    </g>
  );

  const headSide = (mirror: boolean) => (
    <g transform={mirror ? "translate(96 0) scale(-1 1)" : undefined}>
      <circle cx={48} cy={38} r={17} fill={profile.skin} />
      {hairCap(profile.hairStyle, profile.hair, profile.hairHighlight)}
      {faceSide()}
      {accessory(profile, true)}
    </g>
  );

  const headBack = (
    <g>
      {hairBack(profile.hairStyle, profile.hair)}
      {accessory(profile, false)}
    </g>
  );

  const tilt = (deg: number) => `translate(48 62) rotate(${deg}) translate(-48 -62)`;

  let figure: ReactNode;
  switch (direction) {
    case "down":
      figure = <g>{body}{headFront}</g>;
      break;
    case "down-left":
      figure = <g transform={tilt(-14)}>{body}{headFront}</g>;
      break;
    case "down-right":
      figure = <g transform={tilt(14)}>{body}{headFront}</g>;
      break;
    case "left":
      figure = <g>{body}{headSide(true)}</g>;
      break;
    case "right":
      figure = <g>{body}{headSide(false)}</g>;
      break;
    case "up":
      figure = <g>{body}{headBack}</g>;
      break;
    case "up-left":
      figure = <g transform={tilt(-14)}>{body}{headBack}</g>;
      break;
    case "up-right":
      figure = <g transform={tilt(14)}>{body}{headBack}</g>;
      break;
  }

  return (
    <svg
      viewBox="0 0 96 112"
      className={className}
      style={style}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
      data-avatar-direction={direction}
    >
      {figure}
    </svg>
  );
}
