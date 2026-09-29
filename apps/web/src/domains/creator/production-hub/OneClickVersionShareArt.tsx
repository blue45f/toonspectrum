/**
 * 원클릭 버전 공유 — SVG 일러스트 모듈.
 *
 * 프로젝트에 재활용 가능한 이미지 에셋이 없어(public/는 i18n JSON뿐)
 * 꼭 필요한 곳에만 직접 그린 SVG를 둔다. 전부 벡터라 다크모드·고해상도에서
 * 깨지지 않고, 애니메이션이 없어 prefers-reduced-motion 대응이 필요 없다.
 * 원격 이미지·폰트 요청 없음.
 */

/** 문자열에서 결정적 시드를 만든다 (FNV-1a 32bit). */
function seedFromString(value: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** mulberry32 결정적 난수. */
function mulberry32(seed: number): () => number {
  let state = seed;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const THUMB_PALETTES: ReadonlyArray<readonly [string, string, string]> = [
  ["#6366f1", "#a5b4fc", "#eef2ff"], // indigo
  ["#8b5cf6", "#c4b5fd", "#f5f3ff"], // violet
  ["#ec4899", "#f9a8d4", "#fdf2f8"], // pink
  ["#06b6d4", "#67e8f9", "#ecfeff"], // cyan
  ["#f59e0b", "#fcd34d", "#fffbeb"], // amber
  ["#10b981", "#6ee7b7", "#ecfdf5"], // emerald
];

function pickPalette(rand: () => number): readonly [string, string, string] {
  const fallback: readonly [string, string, string] = ["#6366f1", "#a5b4fc", "#eef2ff"];
  return THUMB_PALETTES[Math.floor(rand() * THUMB_PALETTES.length)] ?? fallback;
}

/** 4점 반짝이 별. */
function Sparkle({ x, y, size, fill, opacity = 1 }: {
  readonly x: number; readonly y: number; readonly size: number;
  readonly fill: string; readonly opacity?: number;
}) {
  const s = size;
  return <path
    d={`M${x} ${y - s}q0 ${s} ${s} ${s}-${s} 0-${s} ${s} 0-${s}-${s} ${s} ${s} 0 ${s}-${s}Z`}
    fill={fill}
    opacity={opacity}
  />;
}

/**
 * 버전 썸네일 아트.
 *
 * 실제 원고 이미지가 데이터 모델에 없으므로 스냅샷 ID 기반 결정적 SVG로
 * 각 버전에 고유한 비주얼 아이덴티티를 부여한다. 같은 ID는 항상 같은 아트.
 */
export function VersionThumbnailArt({ snapshotId, name, className }: {
  readonly snapshotId: string;
  readonly name: string;
  readonly className?: string;
}) {
  const rand = mulberry32(seedFromString(snapshotId || "empty"));
  const [deep, mid, light] = pickPalette(rand);
  const rotA = -9 + rand() * 4;
  const rotB = rand() * 5 - 2.5;
  const rotC = 5 + rand() * 5;
  const lineCount = 2 + Math.floor(rand() * 2);
  const bubbleX = 98 + rand() * 22;
  const bubbleY = 24 + rand() * 12;
  const dotX = 30 + rand() * 100;
  const dotY = 12 + rand() * 66;
  const badgeLabel = name.slice(0, 4) || "v?";

  return <svg viewBox="0 0 160 90" className={className} aria-hidden="true" focusable="false">
    <rect width="160" height="90" fill={light} />
    <circle cx={dotX} cy={dotY} r="14" fill={mid} opacity={0.45} />
    <circle cx={160 - dotX * 0.5} cy={90 - dotY * 0.4} r="9" fill={mid} opacity={0.35} />
    {/* 쌓인 원고 페이지 */}
    <g transform={`rotate(${rotA} 80 45)`}>
      <rect x="42" y="19" width="76" height="52" rx="4" fill="#ffffff" stroke={deep} strokeOpacity=".25" />
    </g>
    <g transform={`rotate(${rotB} 80 45)`}>
      <rect x="42" y="19" width="76" height="52" rx="4" fill="#ffffff" stroke={deep} strokeOpacity=".3" />
    </g>
    <g transform={`rotate(${rotC} 80 45)`}>
      <rect x="42" y="19" width="76" height="52" rx="4" fill="#ffffff" stroke={deep} strokeOpacity=".4" />
      {/* 콘티 패널 선 */}
      {Array.from({ length: lineCount }, (_, i) => <line
        key={i}
        x1="50" x2="110"
        y1={32 + i * 9} y2={32 + i * 9}
        stroke={deep} strokeOpacity=".28" strokeWidth="2.5" strokeLinecap="round"
      />)}
      {/* 말풍선 */}
      <circle cx={bubbleX} cy={bubbleY} r="7" fill="#ffffff" stroke={deep} strokeOpacity=".55" strokeWidth="1.6" />
      <path d={`M${bubbleX - 4} ${bubbleY + 5}l-3 6 7-4Z`} fill="#ffffff" stroke={deep} strokeOpacity=".55" strokeWidth="1.2" />
      <rect x="50" y="58" width="14" height="8" rx="2" fill={mid} opacity={0.8} />
    </g>
    {/* 버전 배지 */}
    <circle cx="134" cy="66" r="16" fill={deep} />
    <circle cx="134" cy="66" r="16" fill="none" stroke="#ffffff" strokeOpacity=".35" strokeWidth="1.5" />
    <text
      x="134" y="66" textAnchor="middle" dy=".35em"
      fontSize="11" fontWeight="800" fill="#ffffff"
      fontFamily="system-ui, sans-serif"
    >
      {badgeLabel}
    </text>
    <Sparkle x={24} y={20} size={5} fill={deep} opacity={0.5} />
  </svg>;
}

/**
 * 빈 버전 목록 일러스트 — "아직 버전이 없습니다" 상태용.
 */
export function EmptyVersionsArt({ className }: { readonly className?: string }) {
  return <svg viewBox="0 0 220 150" className={className} aria-hidden="true" focusable="false">
    <rect x="10" y="10" width="200" height="130" rx="18" fill="none"
      stroke="#6366f1" strokeWidth="2" strokeDasharray="9 7" opacity={0.45} />
    {/* 뒤 페이지 */}
    <g transform="rotate(-8 95 85)">
      <rect x="60" y="52" width="70" height="66" rx="6" fill="#eef2ff" stroke="#a5b4fc" strokeWidth="1.5" />
    </g>
    {/* 앞 페이지 */}
    <rect x="80" y="44" width="70" height="66" rx="6" fill="#ffffff" stroke="#6366f1" strokeWidth="2" />
    <path d="M150 44v14a4 4 0 0 1-4 4h-14Z" fill="#e0e7ff" />
    <line x1="92" y1="66" x2="128" y2="66" stroke="#c7d2fe" strokeWidth="4" strokeLinecap="round" />
    <line x1="92" y1="78" x2="138" y2="78" stroke="#c7d2fe" strokeWidth="4" strokeLinecap="round" />
    <line x1="92" y1="90" x2="118" y2="90" stroke="#c7d2fe" strokeWidth="4" strokeLinecap="round" />
    {/* 버전 추가 배지 */}
    <circle cx="152" cy="104" r="17" fill="#6366f1" />
    <path d="M152 96v16M144 104h16" stroke="#ffffff" strokeWidth="3.5" strokeLinecap="round" />
    {/* 반짝임 */}
    <Sparkle x={42} y={42} size={7} fill="#f59e0b" />
    <Sparkle x={182} y={56} size={6} fill="#ec4899" opacity={0.85} />
    <Sparkle x={168} y={122} size={5} fill="#6366f1" opacity={0.6} />
    <Sparkle x={52} y={112} size={5} fill="#06b6d4" opacity={0.7} />
  </svg>;
}

/**
 * 3단계 플로우 도식 — 히어로용 (작업본 → 버전 저장 → 링크 공유).
 * 라벨은 부모에서 i18n(bt)으로 번역해 전달한다.
 * 라벨은 장식용이므로 사용처에서 aria-hidden 처리한다.
 */
export function VersionFlowDiagram({ labels, className }: {
  readonly labels: readonly [string, string, string];
  readonly className?: string;
}) {
  const nodes = [
    { cx: 52, label: labels[0] ?? "", step: "1" },
    { cx: 180, label: labels[1] ?? "", step: "2" },
    { cx: 308, label: labels[2] ?? "", step: "3" },
  ];
  return <svg viewBox="0 0 360 104" className={className} aria-hidden="true" focusable="false">
    {/* 연결 화살표 */}
    <g stroke="currentColor" strokeWidth="2" opacity={0.4}>
      <line x1="92" y1="34" x2="132" y2="34" />
      <path d="M126 28l10 6-10 6Z" fill="currentColor" stroke="none" />
      <line x1="220" y1="34" x2="260" y2="34" />
      <path d="M254 28l10 6-10 6Z" fill="currentColor" stroke="none" />
    </g>
    {nodes.map((node) => <g key={node.step}>
      {/* 단계 배지 */}
      <circle cx={node.cx - 22} cy="14" r="9" fill="#6366f1" />
      <text x={node.cx - 22} y="14" textAnchor="middle" dy=".35em"
        fontSize="10" fontWeight="800" fill="#ffffff" fontFamily="system-ui, sans-serif">
        {node.step}
      </text>
      {/* 아이콘 박스 */}
      <rect x={node.cx - 24} y="14" width="48" height="42" rx="12"
        fill="#ffffff" stroke="#6366f1" strokeWidth="1.8" strokeOpacity=".55" />
      {node.step === "1" ? <g stroke="#6366f1" strokeWidth="2" strokeLinecap="round">
        <rect x={node.cx - 10} y="24" width="20" height="24" rx="3" fill="none" />
        <line x1={node.cx - 5} y1="31" x2={node.cx + 5} y2="31" />
        <line x1={node.cx - 5} y1="37" x2={node.cx + 5} y2="37" />
      </g> : null}
      {node.step === "2" ? <g>
        <rect x={node.cx - 12} y="22" width="24" height="18" rx="3" fill="#eef2ff" stroke="#6366f1" strokeWidth="1.6" />
        <rect x={node.cx - 8} y="28" width="24" height="18" rx="3" fill="#ffffff" stroke="#6366f1" strokeWidth="1.8" />
        <path d={`M${node.cx - 2} 34v8M${node.cx - 6} 38h8`} stroke="#6366f1" strokeWidth="2" strokeLinecap="round" />
      </g> : null}
      {node.step === "3" ? <g stroke="#6366f1" strokeWidth="2.2" fill="none" strokeLinecap="round">
        <circle cx={node.cx - 7} cy="35" r="6" />
        <circle cx={node.cx + 7} cy="35" r="6" />
        <line x1={node.cx - 2} y1="35" x2={node.cx + 2} y2="35" />
      </g> : null}
      {/* 라벨 */}
      <text x={node.cx} y="82" textAnchor="middle" fontSize="12.5" fontWeight="700"
        fill="currentColor" fontFamily="system-ui, sans-serif">
        {node.label}
      </text>
    </g>)}
  </svg>;
}
