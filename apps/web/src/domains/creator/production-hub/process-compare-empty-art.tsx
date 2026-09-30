/**
 * 공정 비교 모드의 빈 상태용 SVG 일러스트.
 * 텍스트 설명 대신 "보는 재미"를 주는 도식. 전부 장식용(aria-hidden)으로 쓴다.
 */

/** 비교할 데이터가 없을 때: 나란히 놓인 두 패널 + 가운데 슬라이더 핸들. */
export function ProcessCompareNoDataArt() {
  return (
    <svg
      className="pcv-empty-art"
      viewBox="0 0 220 150"
      role="img"
      aria-label="비교 일러스트"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="pcv-art-a" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#7aa2ff" />
          <stop offset="1" stopColor="#4a5fd0" />
        </linearGradient>
        <linearGradient id="pcv-art-b" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#c084fc" />
          <stop offset="1" stopColor="#7e3fd1" />
        </linearGradient>
      </defs>

      {/* 왼쪽 패널: 산 풍경 */}
      <rect x="14" y="28" width="88" height="94" rx="10" fill="url(#pcv-art-a)" opacity="0.9" />
      <path d="M14 96 L44 62 L66 88 L82 72 L102 96 Z" fill="#ffffff" opacity="0.35" />
      <circle cx="82" cy="48" r="9" fill="#ffffff" opacity="0.8" />

      {/* 오른쪽 패널: 다른 풍경 */}
      <rect x="118" y="28" width="88" height="94" rx="10" fill="url(#pcv-art-b)" opacity="0.9" />
      <path d="M118 100 L148 66 L168 90 L186 74 L206 100 Z" fill="#ffffff" opacity="0.35" />
      <circle cx="140" cy="50" r="7" fill="#ffffff" opacity="0.8" />

      {/* 가운데 슬라이더 핸들 */}
      <line x1="110" y1="20" x2="110" y2="130" stroke="#ffffff" strokeWidth="3" strokeLinecap="round" />
      <circle cx="110" cy="75" r="13" fill="#ffffff" />
      <path d="M107 70 l-5 5 5 5" fill="none" stroke="#4a5fd0" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M113 70 l5 5 -5 5" fill="none" stroke="#4a5fd0" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />

      {/* 반짝이 */}
      <path d="M34 18 l2.5 6 6 2.5 -6 2.5 -2.5 6 -2.5 -6 -6 -2.5 6 -2.5 Z" fill="#ffd76a" />
      <path d="M188 132 l2 4.5 4.5 2 -4.5 2 -2 4.5 -2 -4.5 -4.5 -2 4.5 -2 Z" fill="#ffd76a" opacity="0.85" />
    </svg>
  );
}

/** 페인에 소스가 없을 때: 위쪽 피커를 가리키는 점선 프레임. */
export function ProcessComparePaneEmptyArt() {
  return (
    <svg
      className="pcv-empty-art pcv-empty-art-sm"
      viewBox="0 0 160 120"
      role="img"
      aria-label="빈 페인 일러스트"
      aria-hidden="true"
    >
      <rect
        x="20" y="30" width="120" height="70" rx="12"
        fill="none" stroke="currentColor" strokeWidth="2.5" strokeDasharray="8 7" opacity="0.55"
      />
      <circle cx="80" cy="58" r="14" fill="currentColor" opacity="0.25" />
      <path
        d="M74 58 l4.5 4.5 L88 53"
        fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.7"
      />
      {/* 위쪽 화살표: 피커를 가리킴 */}
      <path
        d="M80 22 L80 8 M73 15 L80 8 L87 15"
        fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.7"
      />
    </svg>
  );
}
