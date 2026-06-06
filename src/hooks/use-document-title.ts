import { useEffect } from "react";

// 라우트별 브라우저 탭 제목을 설정한다. title이 비면 기본 "툰스펙트럼"으로 둔다.
// SPA라 페이지 전환 시 document.title이 그대로 남는 문제를 페이지마다 보정한다.
export function useDocumentTitle(title?: string | null) {
  useEffect(() => {
    const next = title ? `${title} · 툰스펙트럼` : "툰스펙트럼";
    if (document.title !== next) document.title = next;
  }, [title]);
}

// 라우트별 <meta name="description">를 설정한다(검색 스니펫·JS 실행 크롤러 대응).
// 언마운트/변경 시 직전 값으로 복원해 다른 페이지에 잔류하지 않게 한다.
// 작품 상세의 크롤러용 메타는 서버(api/og.js)에서 별도 주입한다.
export function useMetaDescription(description?: string | null) {
  useEffect(() => {
    const el = document.querySelector('meta[name="description"]');
    const next = description?.trim();
    if (!el || !next) return;
    const prev = el.getAttribute("content");
    el.setAttribute("content", next.slice(0, 200));
    return () => {
      if (prev != null) el.setAttribute("content", prev);
    };
  }, [description]);
}
