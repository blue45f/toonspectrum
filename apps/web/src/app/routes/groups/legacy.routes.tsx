import { Navigate } from "react-router-dom";

import { defineAppRoutes } from "../app-route-definition";

/**
 * 레거시 단축 URL을 인앱 404 대신 실제 목적지로 연결한다.
 *
 * `/new`, `/more`, `/tour`, `/principles`, `/story`, `/canvas`는 현재 등록된
 * 라우트가 아니며, 이전에 배포된 헤더·히어로·탭바나 북마크에서 유입될 수 있다.
 * 각각 가장 가까운 실제 목적지로 리다이렉트한다. 사용자 화면에 노출되는 코드는
 * canonical 경로만 사용하고, 이 redirect는 호환성 목적 전용이다.
 */
export const legacyRedirectRoutes = defineAppRoutes([
  // 헤더 "제작" CTA -> 새 작품 진입점. 기존 `/make` redirect와 동일 목적지.
  { id: "legacy-new", path: "/new", element: <Navigate to="/studio/new" replace /> },
  // 헤더 "전체" 메뉴 -> 현재 내비게이션이 쓰는 사이트맵 디렉터리.
  { id: "legacy-more", path: "/more", element: <Navigate to="/sitemap" replace /> },
  // 히어로 "8분 제품 투어" -> 제품 투어 페이지.
  { id: "legacy-tour", path: "/tour", element: <Navigate to="/product-tour" replace /> },
  // 히어로 "12가지 제품 원칙" -> 제품 원칙 페이지.
  { id: "legacy-principles", path: "/principles", element: <Navigate to="/about/principles" replace /> },
  // 모바일 탭 "스토리" -> 스토리 기획 랩.
  { id: "legacy-story", path: "/story", element: <Navigate to="/story-lab" replace /> },
  // 모바일 탭 "캔버스" -> Studio 캔버스 에디터 (`/studio/*` 라우터가 처리).
  { id: "legacy-canvas", path: "/canvas", element: <Navigate to="/studio/canvas" replace /> },
]);
