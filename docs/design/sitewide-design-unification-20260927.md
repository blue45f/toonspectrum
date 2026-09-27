# 사이트 디자인·동선 통일 — 2026-09-27

상태: **migration**. 전체 페이지의 인벤토리와 공통 화면 개선을 진행하며,
로그인·실데이터·전문 편집 동작 검증과 운영 배포는 구분한다.

## 문제와 적용 원칙

- 공개 목록에서 하위 목록·상세로 이동하면 작업 공간 셸로 바뀌던 공개 경로 누락을 보완한다.
- 헤더·본문·전체 메뉴는 좌우 여백을 포함한 1320px 외곽 폭과 같은 유동 gutter를 사용한다.
- 9개 테마의 의미 색상을 상속한다. 원고·브러시·렌더러의 색상 권위는 변경하지 않는다.
- 페이지가 자체 제목과 소개를 가지면 그 앞에 대형 공통 소개를 중복해서 붙이지 않는다.
- 메뉴의 기능을 유지하면서 중첩 프레임과 홍보 장식의 공간을 줄인다.
- 작품 시작은 `/studio/new`로 연결한다. 메인에서 같은 작업 목적지를 나열하던 두 묶음은
  검색·최근 작업을 가진 `ProductIntentStart` 한 묶음으로 통합하고 기존 fragment를 보존한다.
- 새 대표 아트는 브랜드 콘셉트이며 실제 사용자 작품이나 제품 실행 결과로 표시하지 않는다.

## 동선 개선

상태: **migration**. 아래 동선은 소스에 반영했으며, 최종 정적 preview의 통합 UI 검증은 대기 중이다.

- 전체 메뉴 상단에서 `새 작품`(`/studio/new`)과 `내 프로젝트`(`/studio`)를 바로 선택한다.
  알림·내 공간과 제작 그룹의 중복 항목은 정리하되 기존 목적지와 전체 기능(`/sitemap`)은 유지한다.
- 전역 메뉴와 검색이 같은 목적지·명칭을 공유한다. 배우기·리서치·제작 관리·팀·검수·갤러리 등
  주요 작업을 한국어·영어로 검색하고, 페이지명·설명도 선택한 언어로 표시한다.
  기존 검색어와 단축키는 보존한다.
- `/make`, `/shaper`, `/publishing`, `/create` 등의 이전 주소도 canonical 경로로 판정한다.
  제작 별칭의 활성 표시 누락과 `/create`·`/showcase` 사이의 활성 탭 불일치를 수정했다.
- 작품 상세에는 `작품 목록 → 현재 작품` 경로를 제공한다. 직접 방문·로딩·오류·없는 작품 상태에서도
  기존 상세 경로 정보와 같은 `/explore` 목록으로 돌아간다. 이전 필터를 전달하는 navigation state가
  없으므로 필터 복원을 보장하지 않으며, 브라우저 방문 기록에 의존하지 않는다.
- 학습 화면은 중복 탐색을 하나로 통합했다. 학습 홈·강좌·자료·Classroom을 먼저 두고, 학습 경로·사전·실습·기록 등은
  전체 메뉴에서 연다. 현재 위치 표시와 Escape 후 메뉴 버튼으로의 포커스 복귀를 제공한다.
- 마켓 홈은 제목과 `소재 찾기`를 세부 메뉴보다 먼저 배치한다. 내 리소스·배포·비교·분류와
  리서치·학습 연결은 보존하며, 상세의 `/market/browse` 복귀 경로도 유지한다.
- 기술 플레이북은 소개·기술·서비스 관련 18개 목적지를 접이식 메뉴에 모았다.
  제목과 본문 목차는 펼치지 않아도 접근하고, 가로 목차와 본문 이동은 고정 헤더에 가려지지 않게 조정했다.

2026-09-27 동선 담당 검증: 메뉴·검색·별칭·공개 경로·사이트맵 관련 **12파일 184테스트 통과**,
작품 상세 복귀 및 검색 이동 관련 **3파일 10테스트 통과**. 두 결과는 각각 별도 실행한 focused 검증이다.
변경 TS/TSX의 ESLint와 변경 범위 `git diff --check`도 통과했다.
학습·마켓의 개별 검증 및 전체 통합 검증은 담당 결과와 구분한다.
개발 서버의 중간 관측은 최종 증거에서 분리하고, 정적 preview에서 실제 메뉴·검색·목록 복귀를 재검증한다.
현재 관측에서 발견한 후속 문제도 다음과 같이 수정했다. 최종 빌드와 재검증 결과는 별도로 기록한다.

- 학습 메뉴가 열려 있으면 베타 안내를 유예하고 이미 표시된 안내도 숨긴다. 본문 FAQ는 이 조건에서 제외한다.
- 페이지 검색 결과의 터치 영역을 최소 44px로 맞춘다.
- 카페 관리의 비로그인 안내를 명시적 blocked 상태로 표시하여 로딩 지연 복구 안내가 겹치지 않게 한다.
- 홈 아트 캡션은 불투명한 공통 카드 표면을 사용한다. 모션이 켜진 Chromium 관측에서 blur 합성의 색상 이상을 재현했고, 불필요한 backdrop-filter를 제거한 뒤 정상 색상을 확인했다.

## 벤치마킹

2026-09-27에 공식 사이트·공식 문서를 확인했다. 표현과 자산을 복제하지 않고 다음 패턴을 적용한다.

| 서비스 | 참고한 UX 원칙 | 적용 |
| --- | --- | --- |
| [Linear](https://linear.app/now/how-we-redesigned-the-linear-ui) | 공통 프레임, 표면·텍스트의 의미 토큰, 화면 간 정렬 | 헤더·Container·Section의 같은 규격 |
| [Figma](https://help.figma.com/hc/en-us/articles/1500005554982-Guide-to-files-and-folders) | 여러 도구에서도 파일 브라우저로 돌아오는 일관된 흐름 | 새 작품·내 프로젝트의 고정 진입, 작업 문맥 보존 |
| [Framer](https://www.framer.com/marketplace/templates/) | 작품 이미지 중심 카드와 목적별 탐색·필터 | 조작부를 정돈하고 콘텐츠 아트에 시각적 무게 집중 |
| [Behance](https://help.behance.net/hc/en-us/articles/204483864-Guide-Search-Filter-Creative-Work) | 탐색 목적을 먼저 구분하고 관련 자료로 연결 | 전체 메뉴의 목적 분류와 누락됐던 배우기 진입 보완 |

## 이미지 생성 기록

- 도구: 기본 내장 `image_gen` 도구, CLI/API 우회 미사용.
- 모델: 도구가 모델 버전 선택·응답 식별자를 노출하지 않아 특정 버전 2.5 사용은 확인할 수 없다.
- 파일: `apps/web/public/brand/atelier-20260927/creation-world.webp`.
- 원본: 1586×992 PNG. 동일 픽셀의 lossless WebP로 인코딩했다.
- 사용 위치: 공개 홈 대표 이미지. 모든 UI 글자와 행동은 HTML로 제공한다.
- 의미: 연필 스케치 → 웹툰 패널 → 입체적인 이야기 세계가 하나의 작업 공간에서 연결된다.
- 출처 표기: 화면에 `AI로 제작한 브랜드 콘셉트 아트`와 해당 대체 텍스트를 제공한다.

생성 프롬프트(생성기의 표현 지시이므로 영어 원문 유지):

> Use case: stylized-concept. Asset type: final wide website hero artwork for ToonStudio, a Korean all-in-one webtoon creation studio. Create an extraordinarily beautiful, polished editorial concept illustration, a panoramic composition in roughly 16:10 aspect ratio. An open creative atelier suspended above a richly detailed illustrated story city at sunset. Elegant sculptural sheets of comic paper curl into architectural frames, transitioning from delicate pencil line art at left through inked webtoon panels to sumptuous fully painted worlds at right. A luminous coral-orange ribbon connects the drawing desk, miniature 3D stage and finished panels, conveying one connected creative process. Tactile paper, ink, fine ceramic and brushed metal; warm ivory sunlight, persimmon coral, deep warm charcoal, selective sage accents and blue from the illustrated sky only. The composition should feel premium and imaginative, authored by a master animation background artist with modern editorial art direction; rich painterly detail, strong perspective and sophisticated lighting, no generic glassmorphism. Central visual focal point in middle/right, calm edges for responsive cropping, no words, no letters, no logos, no UI controls, no watermark. This is brand concept art, not a screenshot. Output a high-quality landscape image suitable as a full-bleed website hero.

## 검증의 경계

[전수 인벤토리](sitewide-review-20260927.routes.json)와
[소스 감사](sitewide-review-20260927.md)를 함께 확인한다.
브라우저의 HTTP 200이나 셸 표시만으로 페이지를 통과시키지 않으며,
실제 route readiness와 로딩 대체 화면의 종료를 검사한다.
비로그인 상태, 503 API fixture, 존재하지 않는 동적 ID는 정상 실데이터 화면 검증이 아니다.
화면 폭·색 대비·focus 검사는 로그인·결제·저장·GPU 렌더링의 완주를 대신하지 않는다.

운영 배포는 별도 승인 대상이다. 이 작업에서 호스팅 빌드·배포 설정을 변경하지 않는다.
