// 표지 이미지 노출 정책 — 저작권·청소년보호 리스크를 데이터 레이어에서 중앙 통제한다.
//
// 배경: 표지 이미지의 저작권은 각 플랫폼·권리자에게 있다. 본 서비스는 색인·발견 목적의
// 썸네일 표시이지만, ① 성인(만 19세+) 작품 표지는 본인확인 없는 노출을 피하고,
// ② 운영자가 권리자 요청·정책 변화에 따라 실제 표지 표시를 즉시 끌 수 있어야 한다.
//
// 이 모듈은 순수(process.env 만 읽음)하며, 모든 적재 경로가 통과하는 replaceCatalogData
// (./catalog-store) 한 곳에서 적용된다 → 정적 빌드·런타임 API·라이브 어댑터 공통.
// 추가로 표지 프록시(apps/api .../catalog.controller)가 정책 off 를 서빙 단에서 한 번 더
// 강제한다(이미 배포·캐시된 정적 JSON 의 표지 URL 도 무력화 — 방어 심층).
//
// 위치: 소비자가 카탈로그 스토어(이 패키지)와 apps/api 표지 프록시뿐이고, DB/노드 API 없이
// process.env 만 읽는 순수 모듈이라 공유 커널에 둔다. 앱 트리(lib/)로 climb 하면
// packages → 앱 방향의 역참조가 생기므로 여기가 정본이다.
import type { Title } from "../types";

export type CoverImagePolicy = "proxy" | "off";

// "proxy"(기본): 허용 호스트 표지를 프록시로 표시한다. 단 프록시는 플랫폼 도메인으로 Referer 를
//   위조하지 않으며(핫링크 보호 우회 금지), 출처는 항상 원 플랫폼으로 링크된다.
// "off": 제3자 표지 이미지를 일절 표시하지 않고 자체 타이포그래픽 커버만 쓴다(최대 안전·즉시 킬스위치).
export function coverImagePolicy(): CoverImagePolicy {
  return process.env.COVER_IMAGE_POLICY === "off" ? "off" : "proxy";
}

// 성인 전문 플랫폼(탑툰·투믹스·레진 성인관·봄툰 등) — 표지 자체가 노골적일 수 있고 원 플랫폼도
// 본인확인 전 표지를 가린다. 이 호스트의 19+ 표지만 비노출한다. 일반 플랫폼(네이버·카카오·리디·
// 포스타입 등)의 19+ 표지는 비노골적이고 원 플랫폼이 19 배지만 달아 공개하므로(작품 자체가
// 19+여도 표지 썸네일은 청소년유해매체물로 보기 어렵다) 막지 않고 클라이언트 연령확인 오버레이로
// 처리한다. 현재 카탈로그엔 인증 없이 수집된 성인 전문 플랫폼 표지가 없지만, 향후 유입 대비 가드다.
const ADULT_EXPLICIT_COVER_HOST = /(toptoon|toomics|lezhin|balcony\.studio|bomtoon|toonkor)/i;

// coverImage(/api/cover?u=<원본 URL> 또는 원본 URL)에서 원본 호스트를 뽑는다. 판별 불가 시 null.
function coverOriginHost(coverImage: string | undefined): string | null {
  if (!coverImage) return null;
  const match = coverImage.match(/[?&]u=([^&]+)/);
  try {
    return new URL(match ? decodeURIComponent(match[1]) : coverImage).hostname;
  } catch {
    return null;
  }
}

// 표지 노출 허용 여부. 정책 off 면 전부 비노출. 그 외엔 성인 전문 플랫폼의 19+ 표지만 비노출하고,
// 일반 플랫폼 표지는(19+ 포함) 유지한다 — 비례 원칙. 작품 메타데이터는 어느 경우든 색인에 남는다.
export function isCoverAllowed(
  title: Pick<Title, "ageRating" | "coverImage">,
  policy: CoverImagePolicy = coverImagePolicy()
): boolean {
  if (policy === "off") return false;
  if (title.ageRating === "19") {
    const host = coverOriginHost(title.coverImage);
    if (host && ADULT_EXPLICIT_COVER_HOST.test(host)) return false;
  }
  return true;
}

// 정책상 허용되지 않는 표지의 coverImage 를 제거한다(인플레이스). normalizeCatalog 가 갓 만든
// 스토어 소유 객체에만 적용되므로 변형이 안전하다(어댑테이션 그래프는 id 기반이라 영향 없음).
// 반환: 제거된 표지 수(로깅·검증용).
export function applyCoverPolicy(titles: Title[], policy: CoverImagePolicy = coverImagePolicy()): number {
  let stripped = 0;
  for (const title of titles) {
    if (title.coverImage && !isCoverAllowed(title, policy)) {
      delete title.coverImage;
      stripped += 1;
    }
  }
  return stripped;
}
