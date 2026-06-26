// 토스 콘텐츠 정책 프리미티브 — 데이터/엔진은 공유(src/catalog-static), 정책만 여기서 정의.
//
// 이전엔 이 파일이 자체 fetch(/api/titles) + isAdult + coverUrl + sample-data.json 폴백을 들고
// 16개 토스 페이지 포크가 이걸 소비했다. 이제 토스는 웹 페이지(src/domains/*)를 그대로 렌더하고,
// 데이터는 공유 정적 카탈로그 엔진(웹과 단일 출처)이 배포 오리진에서 가져온다. 여기 남는 건
// installStaticCatalog 에 주입할 두 가지 토스 정책뿐이다:
//   ① API_BASE  — 교차 출처 WebView 라 /data·/api 를 가져올 배포 오리진(데이터 베이스).
//   ② isAdultTitle — 19+ 성인물 판별(비게임 미니앱 심사 요건). 카탈로그 시드에서 제외한다.

/** 카탈로그 타이틀의 최소 형태(연령등급만 본다 — 공유 Title 과 호환). */
type AgeRated = { ageRating?: string | null };

// 배포된 toonspectrum API 오리진. 공유 fetch 패치가 /data·/api 를 이 오리진으로 절대화한다.
// (예전 VITE_API_BASE_URL 은 마이그레이션 호환을 위해 폴백으로만 받는다.)
export const API_BASE = (
  import.meta.env.VITE_API_BASE ||
  import.meta.env.VITE_API_BASE_URL ||
  "https://toonspectrum.vercel.app"
).replace(/\/+$/, "");

// 토스 콘텐츠 정책: 성인물(19+/adult) 판별. 공유 카탈로그 시드 필터에 사용한다.
export const isAdultTitle = (t: AgeRated): boolean => /19|adult/i.test(t.ageRating || "");
