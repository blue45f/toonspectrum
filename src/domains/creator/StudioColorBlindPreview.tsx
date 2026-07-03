import type { CSSProperties } from "react";

import { cn } from "@/lib/utils";

// 색맹 시뮬레이션 미리보기 — 캔버스(Stage)에 CSS filter(SVG feColorMatrix)로 적록/청황 색각이상을
// 실시간 근사 시뮬레이션한다. 서버·비동기 처리 없는 순수 뷰 필터라 el 데이터를 건드리지 않는다.
//
// 행렬 출처: Colorblindly(oftheheadland/Colorblindly) filters/{protanopia,deuteranopia,tritanopia}.js —
// Viénot, Brettel & Mollon 1999 단일행렬 dichromat 근사(DaltonLens 재확인). colorjack.com 계열의
// "sRGB-direct" 행렬은 원작자가 부정확하다고 공개 철회한 것이라 의도적으로 배제했다.
//
// 반드시 linearRGB 색공간에서 곱해야 정확하다(감마 보정 없이 sRGB에 바로 곱하면 색이 심하게 왜곡된다) —
// 그래서 각 <filter>에 color-interpolation-filters="linearRGB" 를 명시한다(브라우저가 sRGB↔linear 변환을
// 자동으로 앞뒤에 끼워준다). 이 속성을 빠뜨리는 게 가장 흔한 구현 실수다.
//
// 청색맹(tritanopia)은 단일 행렬로는 구조적 한계가 있다(Brettel 1997의 2-행렬+픽셀별 부호판정이 정확하지만
// 단일 CSS filter로는 표현 불가) — 실제 배포되는 도구들이 쓰는 최선의 단일행렬 근사치이며, 셋 중 신뢰도가
// 가장 낮음을 UI 문구(title)에 "근사치"로 명시한다.
export type CvdMode = "none" | "protanopia" | "deuteranopia" | "tritanopia";

const CVD_MATRIX: Record<Exclude<CvdMode, "none">, string> = {
  protanopia:
    "0.10889,0.89111,-0.00000,0,0 0.10889,0.89111,0.00000,0,0 0.00447,-0.00447,1.00000,0,0 0,0,0,1,0",
  deuteranopia:
    "0.29031,0.70969,-0.00000,0,0 0.29031,0.70969,-0.00000,0,0 -0.02197,0.02197,1.00000,0,0 0,0,0,1,0",
  tritanopia:
    "1.00000,0.15236,-0.15236,0,0 0.00000,0.86717,0.13283,0,0 -0.00000,0.86717,0.13283,0,0 0,0,0,1,0",
};

// 숨김 SVG defs — filter id 는 문서 전역 네임스페이스라 어디에 마운트하든 위치는 상관없다(clipPath/gradient와
// 동일한 참조 방식). width/height=0 + position:absolute 로 화면에는 아무 흔적도 남기지 않는다. 비용이 거의
// 없으므로(정적 SVG 3개) 조건 없이 항상 마운트해도 안전하다.
export function StudioColorBlindFilterDefs() {
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
      <defs>
        <filter id="cvd-protanopia" colorInterpolationFilters="linearRGB">
          <feColorMatrix type="matrix" values={CVD_MATRIX.protanopia} />
        </filter>
        <filter id="cvd-deuteranopia" colorInterpolationFilters="linearRGB">
          <feColorMatrix type="matrix" values={CVD_MATRIX.deuteranopia} />
        </filter>
        <filter id="cvd-tritanopia" colorInterpolationFilters="linearRGB">
          <feColorMatrix type="matrix" values={CVD_MATRIX.tritanopia} />
        </filter>
      </defs>
    </svg>
  );
}

// 순수 헬퍼 — "none" 이면 빈 객체, 아니면 url() filter 하나짜리 스타일 객체를 돌려준다.
// 호출부가 기존 filter(예: 페이지 색보정 pageGradeCss)와 문자열로 합성해 같은 style.filter 키에 쓴다.
// 컴포넌트와 강결합된 순수 헬퍼라 한 파일에 둔다(이 파일 편집 시 fast-refresh 대신 풀 리로드 — 의도적).
// eslint-disable-next-line react-refresh/only-export-components
export function colorBlindFilterStyle(mode: CvdMode): CSSProperties {
  if (mode === "none") return {};
  return { filter: `url(#cvd-${mode})` };
}

const CVD_OPTIONS: { mode: CvdMode; label: string; title: string }[] = [
  { mode: "none", label: "없음", title: "색맹 시뮬레이션 미리보기 끄기" },
  {
    mode: "protanopia",
    label: "적색맹",
    title: "적색맹(1형 색각이상) 미리보기 — Viénot 1999 시뮬레이션",
  },
  {
    mode: "deuteranopia",
    label: "녹색맹",
    title: "녹색맹(2형 색각이상) 미리보기 — Viénot 1999 시뮬레이션",
  },
  {
    mode: "tritanopia",
    label: "청색맹",
    title: "청색맹(3형 색각이상) 미리보기 — 근사치(단일 행렬 한계로 세 유형 중 정확도가 가장 낮아요)",
  },
];

// 기존 뷰포트 컨트롤 바의 toolBtn(active) 스타일을 그대로 재현(h-9→h-8/px-2.5→px-2/text-xs→text-[10px]
// 오버라이드는 "넓게"/"브라우저 맞춤"/"전체화면" 버튼이 이미 쓰는 조합과 동일하다) — 새 버튼 스타일을
// 발명하지 않고 기존 시각 언어를 그대로 맞춘다.
function cvdBtnClass(active: boolean) {
  return cn(
    "inline-flex h-8 shrink-0 items-center gap-1 whitespace-nowrap rounded-lg border px-2 text-[10px] font-semibold transition-colors pointer-coarse:h-10 pointer-coarse:px-3 pointer-coarse:text-[0.8125rem]",
    active ? "border-accent/60 bg-accent-soft/50 text-fg" : "border-line bg-card text-fg-2 hover:bg-raised"
  );
}

export function StudioColorBlindPreviewToggle({
  value,
  onChange,
}: {
  value: CvdMode;
  onChange: (mode: CvdMode) => void;
}) {
  return (
    <div role="group" aria-label="색맹 시뮬레이션 미리보기" className="flex items-center gap-1">
      {CVD_OPTIONS.map(({ mode, label, title }) => (
        <button
          key={mode}
          type="button"
          onClick={() => onChange(mode)}
          aria-pressed={value === mode}
          className={cvdBtnClass(value === mode)}
          title={title}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
