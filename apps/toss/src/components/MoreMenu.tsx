import { useEffect, useId, useRef } from "react";
import { useNavigate } from "react-router-dom";

import { hapticFeedback } from "../lib/toss.ts";
import { theme } from "../theme.ts";

/**
 * 토스 셸 "더보기"(More) 시트.
 *
 * 토스 재아키텍처로 하단 탭(홈·랭킹·연재·탐색·서재·놀이터)에는 6개만 노출되고,
 * 웹의 SiteHeader 내비/SiteFooter 메뉴가 토스 셸엔 없어 부가 기능(창작 게시판·커뮤니티·
 * 추천·운세·리뷰·비교 등)으로 가는 길이 사라졌다. 이 시트가 모든 라우트를 그룹으로 묶어
 * 노출해 "아무 것도 잃지 않게" 한다(웹 NAV + site-footer COLS + 홈 창작 링크 미러).
 *
 * 접근성: role=dialog + aria-modal, Esc/백드롭으로 닫기, 열릴 때 본문 스크롤 잠금 +
 * 시트 안 첫 포커스 + 포커스 트랩(Tab 루프). 각 항목 탭 시 navigate() 후 시트를 닫는다.
 */

type Item = { label: string; to: string; emoji: string; hint?: string };
type Group = { title: string; items: Item[] };

// 웹 site-header NAV + site-footer COLS + 홈 창작 링크를 그룹으로 미러. 전 라우트 도달 보장.
const GROUPS: Group[] = [
  {
    title: "탐색",
    items: [
      { label: "통합 검색", to: "/search", emoji: "🔍", hint: "제목·작가·태그" },
      { label: "통합 랭킹", to: "/ranking", emoji: "🏆" },
      { label: "연재 캘린더", to: "/calendar", emoji: "📅" },
      { label: "맞춤 추천", to: "/recommend", emoji: "✨" },
      { label: "장르 스펙트럼", to: "/explore", emoji: "🧭" },
      { label: "태그로 찾기", to: "/tags", emoji: "🏷️" },
      { label: "작가 인덱스", to: "/authors", emoji: "✍️" },
    ],
  },
  {
    title: "커뮤니티",
    items: [
      { label: "커뮤니티 허브", to: "/community", emoji: "💬" },
      { label: "장르 카페", to: "/community/cafes", emoji: "☕" },
      { label: "리뷰 피드", to: "/reviews", emoji: "⭐" },
      { label: "작품 비교", to: "/compare", emoji: "⚖️" },
      { label: "트렌드 대시보드", to: "/insights", emoji: "📈" },
      { label: "의견 게시판", to: "/feedback", emoji: "📮" },
    ],
  },
  {
    title: "창작·놀이터",
    items: [
      { label: "창작 스튜디오", to: "/studio", emoji: "🎨", hint: "3D 캐릭터 포즈" },
      { label: "창작 게시판", to: "/create", emoji: "🖌️", hint: "컷툰 만들기" },
      { label: "오늘의 운세", to: "/fortune", emoji: "🔮" },
      { label: "놀이터", to: "/play", emoji: "🎮" },
      { label: "랜덤 작품", to: "/random", emoji: "🎲" },
    ],
  },
  {
    title: "내 정보",
    items: [
      { label: "내 서재", to: "/library", emoji: "📖" },
      { label: "취향 분석", to: "/library?tab=taste", emoji: "🧬" },
      { label: "내 계정", to: "/me", emoji: "👤" },
      { label: "설정", to: "/settings", emoji: "⚙️" },
    ],
  },
  {
    title: "안내",
    items: [
      { label: "웹툰·웹소설 소식", to: "/news", emoji: "📰" },
      { label: "서비스 소개", to: "/about", emoji: "ℹ️" },
      { label: "랭킹 산정 방식", to: "/guide", emoji: "📐" },
      { label: "사이트맵", to: "/sitemap", emoji: "🗺️" },
      { label: "문의", to: "/support", emoji: "🛟" },
      { label: "이용약관", to: "/terms", emoji: "📄" },
      { label: "개인정보처리방침", to: "/privacy", emoji: "🔒" },
      { label: "저작권·콘텐츠 안내", to: "/copyright", emoji: "©️" },
    ],
  },
];

/** 시트 안 포커스 가능한 요소 목록(포커스 트랩용). */
function focusable(root: HTMLElement | null): HTMLElement[] {
  if (!root) return [];
  return Array.from(
    root.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
    ),
  );
}

export function MoreMenu({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const titleId = useId();
  const sheetRef = useRef<HTMLDivElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);

  // 열릴 때: Esc 닫기 + 본문 스크롤 잠금 + 첫 포커스 + Tab 포커스 트랩.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const nodes = focusable(sheetRef.current);
      if (nodes.length === 0) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // 시트가 마운트된 다음 프레임에 첫 포커스(닫기 버튼)로 이동.
    const raf = requestAnimationFrame(() => closeBtnRef.current?.focus());
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      cancelAnimationFrame(raf);
    };
  }, [open, onClose]);

  if (!open) return null;

  const go = (to: string) => {
    hapticFeedback("tickWeak");
    onClose();
    navigate(to);
  };

  return (
    <div
      role="presentation"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 80,
        background: "rgba(0,0,0,0.5)",
        backdropFilter: "blur(2px)",
        display: "flex",
        flexDirection: "column",
        justifyContent: "flex-end",
      }}
    >
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
        style={{
          background: theme.bg,
          borderTopLeftRadius: 22,
          borderTopRightRadius: 22,
          borderTop: `1px solid ${theme.border}`,
          boxShadow: "0 -16px 40px rgba(0,0,0,0.45)",
          maxHeight: "min(86vh, 760px)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* 시트 헤더(grabber + 타이틀 + 닫기) */}
        <div
          style={{
            position: "sticky",
            top: 0,
            padding: "10px 16px 12px",
            background: theme.bg,
            borderBottom: `1px solid ${theme.border}`,
          }}
        >
          <div
            aria-hidden
            style={{
              width: 40,
              height: 4,
              borderRadius: 999,
              background: theme.border,
              margin: "0 auto 12px",
            }}
          />
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <strong id={titleId} style={{ fontSize: 18, fontWeight: 800, color: theme.text }}>
              더보기
            </strong>
            <button
              ref={closeBtnRef}
              type="button"
              className="pressable"
              onClick={onClose}
              aria-label="더보기 닫기"
              style={{
                width: 44,
                height: 44,
                display: "grid",
                placeItems: "center",
                borderRadius: 999,
                border: `1px solid ${theme.border}`,
                background: theme.surface,
                color: theme.text,
                fontSize: 18,
                cursor: "pointer",
              }}
            >
              ✕
            </button>
          </div>
        </div>

        {/* 스크롤 본문 — 모든 라우트를 그룹으로 노출 */}
        <div
          style={{
            overflowY: "auto",
            padding: "8px 16px calc(20px + env(safe-area-inset-bottom))",
            WebkitOverflowScrolling: "touch",
          }}
        >
          {GROUPS.map((group) => (
            <section key={group.title} style={{ marginTop: 14 }}>
              <h3
                style={{
                  margin: "0 2px 8px",
                  fontSize: 12,
                  fontWeight: 800,
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                  color: theme.textMuted,
                }}
              >
                {group.title}
              </h3>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                  gap: 8,
                }}
              >
                {group.items.map((it) => (
                  <button
                    key={it.to}
                    type="button"
                    className="pressable"
                    onClick={() => go(it.to)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      textAlign: "left",
                      padding: "12px 12px",
                      borderRadius: 14,
                      border: `1px solid ${theme.border}`,
                      background: theme.surface,
                      color: theme.text,
                      cursor: "pointer",
                      minHeight: 52,
                    }}
                  >
                    <span aria-hidden style={{ fontSize: 20, lineHeight: 1, flexShrink: 0 }}>
                      {it.emoji}
                    </span>
                    <span style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                      <span
                        style={{
                          fontSize: 14,
                          fontWeight: 700,
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {it.label}
                      </span>
                      {it.hint && (
                        <span
                          style={{
                            fontSize: 11,
                            color: theme.textMuted,
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {it.hint}
                        </span>
                      )}
                    </span>
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
