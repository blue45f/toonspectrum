import { useEffect } from "react";

// 라우트별 브라우저 탭 제목을 설정한다. title이 비면 기본 "툰스펙트럼"으로 둔다.
// SPA라 페이지 전환 시 document.title이 그대로 남는 문제를 페이지마다 보정한다.
export function useDocumentTitle(title?: string | null) {
  useEffect(() => {
    const next = title ? `${title} · 툰스펙트럼` : "툰스펙트럼";
    if (document.title !== next) document.title = next;
  }, [title]);
}

// 라우트별 구조화 데이터(JSON-LD)를 head에 별도 <script type="application/ld+json">로 주입한다.
// 구글은 JS 렌더링으로 클라이언트 주입 JSON-LD도 수집한다(랭킹 등 허브 페이지 대응).
// index.html의 WebSite/Organization 그래프는 건드리지 않고, 언마운트·데이터 변경 시 제거한다.
export function useJsonLd(data: object | null | undefined) {
  // 직렬화 문자열을 의존성으로 사용 — 폴링 갱신으로 객체 참조가 바뀌어도 내용이 같으면 재주입하지 않는다.
  // '<'는 유니코드 이스케이프(역슬래시 u003c)로 치환 — HTML 직렬화 시 script 태그 조기 종료·주입 방지(api/og.js와 동일).
  const json = data ? JSON.stringify(data).replace(/</g, "\\u003c") : null;
  useEffect(() => {
    if (!json) return;
    const script = document.createElement("script");
    script.type = "application/ld+json";
    script.text = json;
    document.head.appendChild(script);
    return () => {
      script.remove();
    };
  }, [json]);
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
