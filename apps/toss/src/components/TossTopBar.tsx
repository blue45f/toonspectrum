import { Menu, Search, type LucideIcon } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { ToonSpectrumMark } from "@/components/visual-marks";

import { theme } from "../theme";

/**
 * 토스 셸 상단 브랜드 바 — 웹의 sticky SiteHeader 를 토스 크롬에 맞춰 얇게(≈46px) 옮긴 것.
 *
 * 세 가지 어색함을 한 번에 해소한다:
 *  ① 상단 safe-area / 상태바 인셋 — 이 바가 `env(safe-area-inset-top)` 만큼의 warm-ink 스크림이 되어
 *     full-bleed 히어로 아트(홈 캐러셀·작품 상세)가 토스 상태바 밑으로 파고드는 충돌을 막는다.
 *  ② 브랜드 부재 — ToonSpectrum 마크 + '툰스펙트럼' 워드마크 + BETA 칩으로 첫인상 브랜딩을 회복한다.
 *  ③ FAB 충돌 — 검색·더보기 액션을 이 바가 소유하므로, 재사용 페이지의 자체 eyebrow/타이틀 밴드 위에
 *     플로팅 알약이 겹치던 문제가 사라진다(본문은 paddingTop 으로 바 아래에서 시작한다).
 *
 * 토스 네이티브 뒤로가기는 토스가 제공하므로 이 바는 '브랜드 + 액션' 전용(뒤로가기 없음).
 * 색은 전부 globals.css 의 OKLCH 토큰(var(--color-*)) — #000/#fff·raw rgb 금지(DESIGN.md).
 */

// 상단 바 높이(콘텐츠 영역, safe-area 제외). BottomNav 의 시각 무게와 균형을 맞춘 얇은 밴드.
export const TOP_BAR_HEIGHT = 46;

// 반투명 글래스 — 패널 토큰을 살짝 투과(backdrop-blur 위)시켜 warm-ink 위에 떠 있게 한다.
// raw rgba 대신 color-mix(토큰)로 단일 출처 유지(App.tsx 의 NAV_GLASS 와 동일 언어).
const BAR_GLASS = "color-mix(in oklab, var(--color-panel) 90%, transparent)";

// 우상단 액션 버튼(검색·더보기) 공통 — 토큰 표면 + warm-ink 보더. 40px 터치 타깃(바 높이 안에서).
const actionStyle: React.CSSProperties = {
  width: 40,
  height: 40,
  display: "grid",
  placeItems: "center",
  borderRadius: 999,
  border: `1px solid ${theme.border}`,
  background: theme.surface,
  color: theme.text2,
  cursor: "pointer",
};

function ActionButton({
  Icon,
  label,
  onClick,
  haspopup,
}: {
  Icon: LucideIcon;
  label: string;
  onClick: () => void;
  haspopup?: boolean;
}) {
  return (
    <button
      type="button"
      className="pressable"
      onClick={onClick}
      aria-label={label}
      aria-haspopup={haspopup ? "dialog" : undefined}
      title={label}
      style={actionStyle}
    >
      <Icon size={18} aria-hidden />
    </button>
  );
}

export function TossTopBar({
  showSearch,
  onSearch,
  onMore,
}: {
  showSearch: boolean;
  onSearch: () => void;
  onMore: () => void;
}) {
  const navigate = useNavigate();

  return (
    <header
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 60,
        // safe-area 만큼 위쪽 패딩을 줘 상태바 영역까지 바(스크림)가 덮게 한다.
        paddingTop: "env(safe-area-inset-top)",
        height: `calc(${TOP_BAR_HEIGHT}px + env(safe-area-inset-top))`,
        background: BAR_GLASS,
        backdropFilter: "blur(14px)",
        WebkitBackdropFilter: "blur(14px)",
        borderBottom: `1px solid ${theme.border}`,
        // 하단 미세 그림자(다크 표면 깊이감) — warm-ink 축.
        boxShadow: "0 1px 0 0 color-mix(in oklab, var(--color-canvas) 60%, transparent)",
      }}
    >
      <div
        style={{
          height: TOP_BAR_HEIGHT,
          maxWidth: 1180,
          margin: "0 auto",
          padding: "0 12px",
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        {/* 브랜드 — 마크 + 워드마크 + BETA 칩. 탭하면 홈으로(웹 SiteHeader 로고와 동일 동작). */}
        <button
          type="button"
          className="pressable"
          onClick={() => navigate("/")}
          aria-label="툰스펙트럼 홈"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            minWidth: 0,
            padding: "4px 6px 4px 2px",
            background: "none",
            border: "none",
            cursor: "pointer",
            color: theme.text,
          }}
        >
          <ToonSpectrumMark className="!size-7 !rounded-[0.55rem]" />
          <span
            className="font-display"
            style={{
              fontSize: 16,
              fontWeight: 700,
              letterSpacing: "-0.01em",
              whiteSpace: "nowrap",
              color: theme.text,
            }}
          >
            툰스펙트럼
          </span>
          <span
            className="font-display"
            aria-hidden
            style={{
              fontSize: 9.5,
              fontWeight: 700,
              lineHeight: 1,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              padding: "2.5px 4.5px",
              borderRadius: 6,
              border: "1px solid color-mix(in oklab, var(--color-accent) 40%, transparent)",
              background: theme.accentSoft,
              color: theme.accent,
            }}
          >
            BETA
          </span>
        </button>

        {/* 우상단 액션 클러스터 — 검색(통합 검색)·더보기(전 라우트 시트). 바가 소유한다. */}
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
          {showSearch && (
            <ActionButton Icon={Search} label="통합 검색" onClick={onSearch} />
          )}
          <ActionButton Icon={Menu} label="더보기 메뉴" onClick={onMore} haspopup />
        </div>
      </div>
    </header>
  );
}
