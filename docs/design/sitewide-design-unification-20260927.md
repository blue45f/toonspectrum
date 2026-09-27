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

상태: **migration**. 아래 동선은 소스에 반영했으며, 정적 preview에서 아래 실제 이동 검증을 수행했다. 인증·실데이터 기능은 별도 범위다.

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
- 법적 안내(`/terms`, `/privacy`, `/copyright`)는 공통 헤더·푸터를 유지하면서 창작 홍보
  카드와 장식 섹션을 제외한다. 공개 셸 사용과 다음 작업 추천은 별도 조건으로 검사한다.
- 개인 작업실 `/home`에서 서비스 장애 안내를 문서 흐름 안에 배치하여 작업 바로가기 위를
  덮지 않게 한다. 상태 설명·다시 확인·상태 자세히 행동은 유지한다.
- 소스에 남아 있던 4개 전역 메뉴 계약을 실제 공통 헤더의 5개 목적지
  (홈·제작·탐색·커뮤니티·전체)와 일치시킨다. 팀·허브는 전체 메뉴의 기존 경로로 유지한다.

2026-09-27 동선 담당 검증: 메뉴·검색·별칭·공개 경로·사이트맵 관련 **12파일 184테스트 통과**,
작품 상세 복귀 및 검색 이동 관련 **3파일 10테스트 통과**. 두 결과는 각각 별도 실행한 focused 검증이다.
변경 TS/TSX의 ESLint와 변경 범위 `git diff --check`도 통과했다.
학습·마켓의 개별 검증 및 전체 통합 검증은 담당 결과와 구분한다.
개발 서버의 중간 관측은 최종 증거에서 분리하고, 정적 preview의 12조건에서 메뉴·검색·목록 복귀 68검사를 통과했다.
현재 관측에서 발견한 후속 문제도 다음과 같이 수정했다. 최종 빌드와 재검증 결과는 별도로 기록한다.

- 학습 메뉴가 열려 있으면 베타 안내를 유예하고 이미 표시된 안내도 숨긴다. 본문 FAQ는 이 조건에서 제외한다.
  안내를 띄우는 포인터 이벤트도 클릭 완료 이후로 바꾸어 본문 링크의 hit target을 누르는 도중 바꾸지 않는다.
  실제 하단 링크의 pointerdown/up/click과 해시 이동으로 회귀를 확인했다.
- 페이지 검색 결과의 터치 영역을 최소 44px로 맞춘다. 같은 Playwright 검사가 수정 전 36px에서 실패하고 수정 후 44px 이상으로 통과했다.
- 모바일 학습 메뉴가 열린 동안에만 접힌 OST 조작부를 유예하여 메뉴의 학습 기록 링크를 가리지 않게 한다. 재생 상태와 컴포넌트는 유지한다.
- 카페 관리의 비로그인 안내를 명시적 blocked 상태로 표시하여 로딩 지연 복구 안내가 겹치지 않게 한다.
- 홈 아트 캡션은 불투명한 공통 카드 표면을 사용한다. 모션이 켜진 Chromium 관측에서 blur 합성의 색상 이상을 재현했고, 불필요한 backdrop-filter를 제거한 뒤 정상 색상을 확인했다.

## 추가 전수 점검에서 복구한 사용자 흐름

- 공간 메뉴 분류에서 빠진 40개 등록 경로를 리서치·제작·팀·설정에 연결했다.
  최상위 250개 등록을 모두 분류하며 개인 공간의 전용 화면, 온보딩·팀 가입의 보호
  화면을 유지한다. 대소문자가 다른 URL도 같은 가림·보호 분류를 적용한다.
- 모바일 그리기 옵션이 열렸을 때 저장 런처가 지우개 옵션을 가리지 않게 했다.
  옵션을 닫은 뒤 저장 상태 상세를 다시 열 수 있고 상태·오류 표시는 유지된다.
- 첫 오프라인 편집을 보호한 뒤 안내 행이 새로 생겨 캔버스를 62px 밀던 문제를 고쳤다.
  성공 안내는 기존 고정 저장 버튼과 저장 센터 상세에서 확인한다. 문서·계정이 다른
  안내는 표시하지 않으며, 상세 알림을 닫은 뒤에도 대화상자 안의 키보드 초점을 유지한다.
  필수 오류·권한 거절·재시도는 기존 오류 채널에 남긴다.
- 필터 적용이 거절되었을 때 열린 창 뒤에 가려졌던 오류를 필터 대화상자 안에도 표시한다.
  적용을 다시 시작할 때 이전 오류를 지우며, 적용·저장·실행 취소 권한과 판정은 바꾸지 않는다.
- 오프라인에서 수락된 요소·그룹·Smart Shape 편집이 정본 병합 직후 이전 값으로
  돌아가던 오류를 고쳤다. 기존 pending 제안을 화면에 다시 투영하며 정본이나 권한을
  변경하지 않는다. 온라인 정본 연결이 필요한 페이지 크기 메뉴는 정확한 거절 사유를 알린다.
  [권한과 메뉴 검증의 범위](../engineering/studio-menu-authority-verification-20260927.md)를 따른다.
- 번역 원본에서 손상된 보간 토큰을 복원하고 기존 생성기로 호환 번역 자산을 동기화했다.
  번역 문장의 품질·의미를 바꾸는 자동 재번역은 하지 않았다. 현재 제품명의 음성 발음도
  이전 브랜드 별칭과 구분했다.

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

## 2026-09-28 추가 고도화 — 공개 홈 아트 밀도

상태: **current**. PR #2145가 병합된 뒤 남은 과제는 레이아웃이 아니라 아트 밀도였다.
홈은 7개 섹션에 이미지 3개뿐이라 텍스트가 화면을 지배했다. 2026-09-25 Codex 컨셉
렌더(쿨 바이올렛 네온, 하단 4×2 모듈 그리드 + 시네마틱 아트 레일)를 레퍼런스로 검토했다.

채택한 것과 채택하지 않은 것:

- **채택** — 모듈마다 다른 tinted 표면, 한글 제목 + 영문 대문자 마이크로 라벨, 콘텐츠 아트가
  크롬을 압도하는 밀도. 이 구조는 테마 중립적이라 9개 테마와 함께 유지된다.
- **채택하지 않음** — 쿨 바이올렛/인디고 뉴트럴. `DESIGN.md`가 장식 맥락의 hue 23x–27x를
  금지하고 18개 장르 스펙트럼이 제품의 실제 시그니처라, 레퍼런스의 팔레트를 그대로 따르지 않는다.
  모듈 tint는 전부 기존 시맨틱 토큰의 `color-mix` 파생값이라 warm-ink 축이 자동으로 유지된다.
- **채택하지 않음** — 참고 이미지의 작품 진열대. `docs/COMPLIANCE.md`와 이 문서가 AI 콘셉트 아트를
  실제 사용자 게시물·편집기 결과물로 표시하는 것을 금지하므로, 근거 없는 작품 카드는 만들지 않는다.

`CreatorEcosystemAtlas`가 8개 모듈을 4열(→2→1)로 노출한다. 아트는 저장소에 이미 커밋된
브랜드 콘셉트 3종을 서로 다른 `object-position` 크롭으로 잘라 8개의 서로 다른 그림처럼 읽히게
한다. 화면에는 `AI로 제작한 브랜드 콘셉트 아트` 고지가 함께 표시된다.

한글 타이포는 레퍼런스가 쓰는 `-0.06em` 음각을 **따르지 않았다.** 한글 음각은 sidebearing이
0.0566em뿐이라 그 값을 쓰면 인접 글자가 서로 붙는다. 한글 제목은 `-0.02em`, 본문은
`word-break: keep-all`로 어절 단위 줄바꿈을 지킨다. 영문 대문자 라벨만 디스플레이 폰트
`+0.12em`을 쓴다.

미완료: 이 작업은 아트를 **배치**한 것이지 새로 생성한 것이 아니다. 신규 아트 생성은 이
환경에서 불가능했다(사용 가능한 생성기가 워터마크를 강제하고 종횡비를 무시하며 팔레트가
어긋남). 고품질 신규 아트가 필요하면 `OPENAI_API_KEY`를 설정한 뒤 별도 작업으로 진행한다.
`toonstudio-route-header-*.jpg` 4장과 `toonstudio-premium-icons/projects.webp`는 지금도
코드 참조가 없어 별도 배치 대상이다. `creator-home.css`는 현재 라이브인 레거시 파일로
하드코딩 hex와 초록 focus ring을 품고 있어 별도 정리 대상이다.

## 검증의 경계

[전수 인벤토리](sitewide-review-20260927.routes.json)와
[소스 감사](sitewide-review-20260927.md)를 함께 확인한다.
브라우저의 HTTP 200이나 셸 표시만으로 페이지를 통과시키지 않으며,
실제 route readiness와 로딩 대체 화면의 종료를 검사한다.
비로그인 상태, 503 API fixture, 존재하지 않는 동적 ID는 정상 실데이터 화면 검증이 아니다.
화면 폭·색 대비·focus 검사는 로그인·결제·저장·GPU 렌더링의 완주를 대신하지 않는다.

운영 배포는 별도 승인 대상이다. 이 작업에서 호스팅 빌드·배포 설정을 변경하지 않는다.
