import { useEffect } from "react";

// 라우트별 브라우저 탭 제목을 설정한다. title이 비면 기본 "WEBDEX"로 둔다.
// SPA라 페이지 전환 시 document.title이 그대로 남는 문제를 페이지마다 보정한다.
export function useDocumentTitle(title?: string | null) {
  useEffect(() => {
    const next = title ? `${title} · WEBDEX` : "WEBDEX";
    if (document.title !== next) document.title = next;
  }, [title]);
}
