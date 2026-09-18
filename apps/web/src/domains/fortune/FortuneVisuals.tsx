import { useId } from "react";
import type { CSSProperties } from "react";
import type { FortuneExperience, FortuneGroup, SajuResult } from "@toonspectrum/core/fortune";

const GROUP_PALETTES: Record<FortuneGroup, [string, string, string]> = {
  "전체": ["#21182f", "#c8a7ef", "#f0d18d"],
  "사주·역법": ["#162c31", "#87d4c6", "#f1cf8d"],
  "시간의 흐름": ["#1d2140", "#a6b7ff", "#f3d28c"],
  "관계·궁합": ["#3a2032", "#f0aac2", "#ffd5a3"],
  "카드·상징": ["#281d3d", "#c5a1f2", "#e9ca8e"],
  "창작·일상": ["#1d3030", "#9dd8bf", "#f1c983"],
};

const STAR_POINTS = [
  [24, 22], [53, 40], [82, 19], [117, 34], [148, 16],
  [189, 31], [214, 18], [33, 92], [101, 103], [204, 93],
] as const;

interface ArtProps {
  experience: Pick<FortuneExperience, "id" | "group" | "glyph" | "title">;
  compact?: boolean;
}
export function FortuneExperienceArt({ experience, compact = false }: ArtProps) {
  const uid = useId().replace(/:/g, "");
  const [night, accent, gold] = GROUP_PALETTES[experience.group];
  return <svg
    className="fo-experience-art"
    data-compact={compact}
    data-experience={experience.id}
    viewBox="0 0 240 128"
    role="img"
    aria-label={`${experience.title} 분위기 일러스트`}
  >
    <defs>
      <radialGradient id={`${uid}-glow`} cx="70%" cy="20%" r="85%">
        <stop stopColor={accent} stopOpacity=".45" />
        <stop offset=".58" stopColor={night} stopOpacity=".92" />
        <stop offset="1" stopColor="#0b0b13" />
      </radialGradient>
      <linearGradient id={`${uid}-line`} x1="0" x2="1">
        <stop stopColor={accent} stopOpacity=".15" />
        <stop offset=".5" stopColor={gold} stopOpacity=".9" />
        <stop offset="1" stopColor={accent} stopOpacity=".15" />
      </linearGradient>
    </defs>
    <rect width="240" height="128" rx="18" fill={`url(#${uid}-glow)`} />
    <g className="fo-art-stars" fill={gold}>
      {STAR_POINTS.map(([x, y], index) => <circle key={`${x}-${y}`} cx={x} cy={y} r={index % 3 === 0 ? 1.5 : 1} opacity={.28 + (index % 4) * .12} />)}
    </g>
    {experience.group === "사주·역법" && <g className="fo-art-motif fo-art-motif-orbit" fill="none" stroke={accent}>
      <circle cx="120" cy="64" r="42" opacity=".42" />
      <circle cx="120" cy="64" r="27" opacity=".58" />
      <path d="M120 18v92M74 64h92M88 32l64 64M152 32 88 96" opacity=".25" />
      {[[-36, 0], [-11, -34], [29, -21], [29, 21], [-11, 34]].map(([dx, dy], index) => <circle key={`${dx}-${dy}`} cx={120 + dx} cy={64 + dy} r={index === 0 ? 5 : 4} fill={index % 2 ? gold : accent} stroke="none" />)}
    </g>}
    {experience.group === "시간의 흐름" && <g className="fo-art-motif fo-art-motif-time" fill="none" stroke={accent}>
      <path d="M53 88c37-58 96-66 139-25" strokeWidth="1.5" opacity=".6" />
      <path d="M49 94h144" stroke={gold} strokeWidth="1.5" opacity=".72" />
      {[58, 91, 124, 157, 190].map((x, index) => <circle key={x} cx={x} cy={94 - index * 8} r={index === 2 ? 6 : 3.5} fill={index === 2 ? gold : accent} stroke="none" />)}
      <path d="M164 22a24 24 0 1 0 18 39 20 20 0 0 1-18-39Z" fill={gold} stroke="none" opacity=".9" />
    </g>}
    {experience.group === "관계·궁합" && <g className="fo-art-motif fo-art-motif-match" fill="none">
      <circle cx="86" cy="64" r="28" stroke={accent} strokeWidth="1.6" opacity=".75" />
      <circle cx="154" cy="64" r="28" stroke={gold} strokeWidth="1.6" opacity=".75" />
      <path d="M108 48c16 10 9 22 25 31 9 5 18 1 25-7" stroke={gold} strokeWidth="2" opacity=".72" />
      <circle cx="120" cy="64" r="5" fill="#fff4dc" opacity=".92" />
    </g>}
    {experience.group === "카드·상징" && <g className="fo-art-motif fo-art-motif-cards">
      <rect x="68" y="28" width="52" height="72" rx="7" fill="#171322" stroke={accent} transform="rotate(-9 94 64)" />
      <rect x="120" y="24" width="52" height="74" rx="7" fill="#20172f" stroke={gold} transform="rotate(8 146 61)" />
      <circle cx="121" cy="61" r="12" fill="none" stroke={accent} opacity=".8" />
      <path d="M121 41v40M101 61h40" stroke={accent} opacity=".55" />
    </g>}
    {experience.group === "창작·일상" && <g className="fo-art-motif fo-art-motif-creative" fill="none">
      <path d="M48 90c28-46 52 12 82-24 23-28 39-5 63-32" stroke={accent} strokeWidth="3" strokeLinecap="round" opacity=".72" />
      <path d="M49 99c36-23 61 9 96-16 20-14 33-12 48-7" stroke={gold} strokeWidth="1.5" strokeLinecap="round" opacity=".6" />
      {[64, 102, 141, 181].map((x, index) => <circle key={x} cx={x} cy={34 + index * 13} r="7" fill={index % 2 ? gold : accent} stroke="none" opacity=".75" />)}
    </g>}
    <g className="fo-art-seal">
      <circle cx="120" cy="64" r="18" fill="#0d0b15" opacity=".72" stroke={gold} strokeOpacity=".55" />
      <text x="120" y="70" textAnchor="middle" fill="#fff4dd" fontSize="20" fontFamily="Georgia, serif">{experience.glyph}</text>
    </g>
  </svg>;
}

const ELEMENT_NODES = [
  { key: "wood", label: "목", hanja: "木", x: 120, y: 28, color: "#89d0a7" },
  { key: "fire", label: "화", hanja: "火", x: 198, y: 84, color: "#f0a28f" },
  { key: "earth", label: "토", hanja: "土", x: 168, y: 176, color: "#ddbd7f" },
  { key: "metal", label: "금", hanja: "金", x: 72, y: 176, color: "#cbd4e4" },
  { key: "water", label: "수", hanja: "水", x: 42, y: 84, color: "#8dc7e8" },
] as const;

export function FortuneElementOrbit({ chart, label = "오행의 흐름" }: { chart: SajuResult; label?: string }) {
  const ratios = chart.elementsRatio;
  return <figure className="fo-element-orbit" aria-label={`${label}. 목 ${ratios.wood}%, 화 ${ratios.fire}%, 토 ${ratios.earth}%, 금 ${ratios.metal}%, 수 ${ratios.water}%`}>
    <svg viewBox="0 0 240 210" aria-hidden="true" focusable="false">
      <path className="fo-element-cycle" d="M120 28 198 84 168 176 72 176 42 84Z" />
      <path className="fo-element-star" d="M120 28 168 176 42 84 198 84 72 176Z" />
      {ELEMENT_NODES.map((node) => {
        const value = ratios[node.key];
        const radius = 14 + value * .23;
        return <g key={node.key} className="fo-element-node">
          <circle cx={node.x} cy={node.y} r={radius + 7} fill={node.color} opacity=".08" />
          <circle cx={node.x} cy={node.y} r={radius} fill={node.color} opacity=".9" />
          <text x={node.x} y={node.y + 4} textAnchor="middle" className="fo-element-hanja">{node.hanja}</text>
          <text x={node.x} y={node.y + radius + 16} textAnchor="middle" className="fo-element-value">{node.label} {value}%</text>
        </g>;
      })}
      <circle cx="120" cy="104" r="29" className="fo-element-core" />
      <text x="120" y="100" textAnchor="middle" className="fo-element-core-label">일간</text>
      <text x="120" y="118" textAnchor="middle" className="fo-element-core-kan">{chart.dayPillar.kanKorean}</text>
    </svg>
    <figcaption>{label}<small>상생의 순환과 오행 비율을 한눈에 봅니다.</small></figcaption>
  </figure>;
}

export function FortuneAmbientLayer({ theme = "violet" }: { theme?: string }) {
  return <div className="fo-ambient-layer" data-theme={theme} aria-hidden="true">
    <span className="fo-ambient-orbit fo-ambient-orbit-a" />
    <span className="fo-ambient-orbit fo-ambient-orbit-b" />
    {Array.from({ length: 9 }, (_, index) => <i key={index} style={{ "--fo-particle-index": index } as CSSProperties} />)}
  </div>;
}
