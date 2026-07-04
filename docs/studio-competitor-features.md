# 창작 스튜디오(/studio) — 경쟁사 기능 분석 & 구현 현황

> `docs/competitor-analysis.md`(툰스펙트럼 본체: 웹툰 검색/랭킹/리뷰 서비스)와는 다른 문서다. 이 문서는
> **창작 스튜디오(`src/domains/creator/StudioPage.tsx`, 컷툰 제작 캔버스 에디터)** 가 벤치마킹하는
> 드로잉/만화 제작 소프트웨어 대상이다.
>
> 작성일: 2026-07-04, 최종 갱신: 2026-07-04(3~6차 배치 + Google Fonts 전부 StudioPage.tsx 통합 완료
> 반영) · 목적: 나중에 다시 고도화할 때 재조사 없이 이어갈 수 있도록 조사 내용·구현 현황·보류 사유를
> 한곳에 남긴다.
>
> **매시간 자동 실행되는 클라우드 에이전트가 이 문서를 먼저 읽고 작업을 이어간다** — 새 기능을 붙일
> 때는 반드시 §2에 실제 배선 완료 여부와 커밋 해시를 기록하고, §3/§4를 그에 맞게 갱신해라. "설계 문서만
> 있고 StudioPage.tsx엔 미배선" 상태를 "완료"로 잘못 적으면 다음 실행이 중복 조사하게 된다.

---

## 1. 조사 대상 소프트웨어

### 핵심 드로잉/만화 제작 툴
- **Clip Studio Paint (CSP)** — 국내외 웹툰 작가 표준. 컷 분할, 말풍선 생성, 3D 데생 인형, 웹툰 전용
  브러시. PRO(일러스트)/EX(다중 페이지·장편 연재) 버전 구분.
- **MediBang Paint** — 무료 입문용. 컷 분할·톤 기능 등 기본 도구 무료 제공.
- **Procreate** — 아이패드 드로잉 필수 앱. 웹툰 전용 툴은 부족하나 브러시 성능·UI가 뛰어남.
- **Adobe Photoshop** — 범용 이미지 편집의 사실상 표준(레이어·마스크·블렌드·액션 등).
- **Krita** — 오픈소스 페인팅(대칭자·원근 가이드 등 만화가용 보조 도구가 풍부).
- **ibisPaint** — 모바일 드로잉(브러시/재질 라이브러리 UX).
- **Storyboarder** — 콘티/스토리보드 전용(샷 타입·카메라 앵글 태깅).
- **미리캔버스 / Canva** — 디자인 템플릿 툴(매직 리사이즈, 대량 생성/데이터 병합).

### 웹툰 3D 배경 및 콘티 보조
- **에이블러 (Ablur)** — 국산. 웹툰 배경으로 흔히 쓰이는 3D 스케치업(SketchUp) 파일을 가볍게 불러와
  선을 따고 연출하도록 돕는다.

### AI 기반 웹툰 생성(국내)
- **투닝 (Tooning)** — 툰스퀘어 개발. 문장/프롬프트 입력 → AI가 상황에 맞는 만화·캐릭터 생성. 에디터/
  매직 스튜디오 모드 구분.
- **젠툰 (GenToon)** — 텍스트 스토리 입력만으로 캐릭터 생성~컷 분할~말풍선 배치까지 자동 완성(~1분).
  **캐릭터 일관성**(같은 캐릭터를 여러 컷에서 동일 외모로 유지)이 강점. 인스타툰(1:1, 4:5)·4컷·세로
  스크롤 등 비율 다양 지원.
- **투툰 (TooToon)** — 아이디어 입력 → 시나리오~풀컬러 아트워크까지 올인원 생성. 키워드만으로 스토리
  트리트먼트·캐릭터 에셋 생성.
- **WeToon (위툰)** — 짧은 스토리 아이디어 → 시나리오+캐릭터 디자인 자동 생성.
- **ComicAI** — AI 만화 생성 도구(위 4개와 유사 카테고리).

---

## 2. 구현 완료 현황

모든 배치는 `src/domains/creator/studio-*.ts`(순수 로직) + `Studio*Panel.tsx`(프레젠테이션) 조합으로
구현되고, `StudioPage.tsx`에 통합됐다. 세션 내 배치 순서:

### CSP 갭 8개 (완료, 프로덕션 배포됨)
패널컷 자동분할 · 셀 애니메이션(프레임) · 원근자(perspective guide) · 매직 완드(색상 선택) · 타임랩스
녹화 · 참고 이미지 패널 · 벡터 노드 편집(점 이동/굵기) · 팔레트 라이브러리.

### 경쟁사 갭 1차 배치 10개 (완료, 프로덕션 배포됨)
말풍선 꼬리 자동 부착 · QuickShape(손그림 도형 보정) · 알파 락 · 문지르기 브러시(smudge) · 복구 브러시
(heal-clone) · 색상 투명화 · 다중 레이어 애니메이션 타임라인 · 스토리보드 그리드 뷰 · PDF 콘택트 시트 ·
브랜드 킷.

### 3D 배경 확장 (완료, 프로덕션 배포됨)
복합 오브젝트 프리셋 14종(건물/자연/차량/소품, 기존 13개 BgPrimitive 조합) · 뷰포트 하늘색 프리셋 4종 ·
사진→웹툰 필터 3종.

### 경쟁사 갭 2차 배치 6개 (완료, 프로덕션 배포됨)
아이소메트릭 원근 그리드(Procreate) · 자유형 페인터블 레이어 마스크(Photoshop, `ClipMaskGroup` 중첩
합성) · 팝업 원형 팔레트/색상환(Krita, 롱프레스) · 매직 리사이즈(미리캔버스/Canva, 비율 재배치) · 붓·
재질 라이브러리 UX(ibisPaint) · 패널별 샷타입/카메라앵글 태그(Storyboarder).

### UI/UX·성능 종합 리뷰 (완료)
6관점(발견성·상호배제·접근성·렌더성능·캔버스성능·번들크기) 병렬 검토로 16건 확정 수정. 핵심 성과:
`disarmAllPixelTools()` 통합 헬퍼(armed 캔버스 도구 상호배제), 타임라인 재생 루프 언마운트 누수 수정,
5개 패널 lazy 전환으로 번들 37~59% 감소.

### 경쟁사 갭 3차 배치 3개 — "아키텍처 리스크 큰 것" (완료, 프로덕션 배포됨)
- **인터랙티브 리퀴파이/워프 브러시**(Procreate) — 브러시 스트로크 변위 필드 누적 후 backward
  mapping으로 국소 워프. `studio-liquify.ts`.
- **콘텐츠 인식 채우기**(Photoshop) — 완전한 PatchMatch 대신 패치 기반 근사(경계 주변 후보 타일 SSD
  비교) + 단순 확산 폴백. `studio-content-aware-fill.ts`. 설계 문서: `docs/design-content-aware-fill.md`.
  StudioPage.tsx 통합: 커밋 `330a663`(원샷 액션 — 레이어 마스크 선택 영역에 즉시 적용, armed 도구
  아님).
- **퍼펫 워프**(Photoshop) — Delaunay 삼각분할 + 삼각형별 아핀 변환 텍스처 매핑(완전한 ARAP 변형은
  스코프 밖). `studio-puppet-warp.ts`. 설계 문서: `docs/studio-puppet-warp-design.md`. StudioPage.tsx
  통합: 커밋 `1b275f5`(armed 도구, `disarmAllPixelTools()`에 `setPuppetWarpActive(false)` 등록됨).

### 4차 배치 6개 (완료, 프로덕션 배포됨)
- **이메레스(스케치 밑그림) 고도화** — 삽입된 밑그림 원클릭 삭제 + 사용자 커스텀 스케치를 "내가 만든
  틀"로 저장/재사용(`studio-palette-library.ts`/`studio-brush-library.ts`와 동일 localStorage CRUD 패턴).
  커밋 `f9f5b7f`.
- **3D 배경 커스텀 모델 업로드** — VRM 업로드와 동일한 IndexedDB 저장 아키텍처로 .glb/.gltf/.obj
  업로드 지원(에이블러/SketchUp 벤치마크). `StudioBackground3D.tsx`에 "모델" 탭. 커밋 `00addb8`.
- **3D 배경 씬 템플릿** — "블록아웃 소품 배치"에 머물던 한계를 해소하기 위해, 여러 프리미티브/복합
  프리셋을 미리 정한 배치로 한 번에 생성하는 "완성된 공간" 카탈로그(교실/거리/카페/공원).
  `studio-background-3d-scene-templates.ts`. `StudioBackground3D.tsx` 통합: 커밋 `a4dce16`.
- **History Brush**(Photoshop) — heal-clone 패턴 재사용, 소스가 "다른 좌표"가 아니라 "같은 좌표의
  히스토리 시점 이미지"인 단순화 버전. 히스토리 패널에서 "이 시점을 브러시 소스로 지정". 커밋 `3590ae2`.
- **Kaleidoscope(만화경) 대칭**(Krita) — 기존 radial 대칭(회전 복제)에 거울 반사를 더해 확장. 커밋
  `4ef706d`(StudioPage.tsx + studio-svg-export.ts 양쪽 포트 동기화).
- **펜 도구 곡선 스무딩**(Illustrator 베지어 핸들 편집의 축소 스코프) — Catmull-Rom 스플라인 기반
  "구간 스무딩 강도" 슬라이더. `studio-curve-smoothing.ts`. 기존 node-edit(벡터 노드 편집) 도구를
  확장하는 형태로 통합(신규 armed 상태 아님). 완전한 접선 핸들 편집은 스코프 밖. 커밋 `3e2ddeb`.

### 5차 배치 3개 (완료, 프로덕션 배포됨)
- **말풍선 커스텀 모양** — node-edit 인프라 재사용, 둥근사각형 외곽선을 폴리곤 점으로 샘플링 후 자유
  편집(완전한 베지어가 아니라 폴리곤 점 편집). `studio-bubble-custom-shape.ts` +
  `StudioBubbleShapePanel.tsx`. 커밋 `3efdc77`(StudioPage.tsx + svg-export 양쪽).
- **말풍선 스타일 확장** — 폰트 크기 자동 축소(고정 크기 안에 텍스트 맞춤, `studio-bubble-text-fit.ts`),
  그라디언트 채우기(기존 `StudioGradientSpec` 재사용), 웹툰 특화 스타일 프리셋(속삭임=점선 테두리,
  전화/기계음=각진 브라켓 등), 별모양 진폭 조절. 커밋 `1dcd7b6`(스타일 프리셋 선행 배선) +
  `7a38ec3`(자동축소·그라디언트·별모양 진폭 후속 배선 — 앵커/`StudioBubbleAnchorPanel`은 그 이전에
  이미 별도로 완료돼 있었음).
- **AI 생성 기능 BYOK 구조** — 배경 생성·자동 채색·콘티→장면구성 제안 + 공용 설정 패널(API 키
  localStorage 저장, 클라이언트 직접 fetch, 서버 경유 없음). `studio-ai-client.ts` +
  `StudioAiSettingsPanel.tsx`/`StudioAiBackgroundPanel.tsx`/`StudioAiColorizePanel.tsx`/
  `StudioAiCompositionPanel.tsx`. 커밋 `2d6bc52`(대사번역 배선과 같은 패스에서 선행 완료 — design
  문서가 "전제조건 없으면 함께 통합" 지시).

### 6차 배치 5개 + 투닝/캔바/망고보드 벤치마크 3개 (완료, 프로덕션 배포됨)
- **패널 자동맞춤**(미리캔버스/투닝) — 프레임 안에서 이미지를 드래그하면 프레임 크기에 맞춰 자동
  cover 리사이즈. `studio-panel-autofit.ts`. 커밋 `8ec40f3`.
- **세로 스크롤 미리보기**(투닝/네이버웹툰 뷰어) — 전체 페이지를 이어붙여 실제 독자가 보는 세로
  스크롤 형태로 미리보기. `StudioScrollPreviewPanel.tsx`(자기완결형, 별도 순수 로직 파일 없음). 커밋
  `aeee042`.
- **유사 스타일 필터**(미리캔버스 "비슷한 요소 찾기") — 이메레스/장면 템플릿 피커에서 같은 카테고리의
  다른 항목을 가로 스크롤로 더 보여줌. `studio-similar-style.ts`. 커밋 `76069f1`.
- **GIF 애니메이션 요소**(미리캔버스 멀티미디어) — 업로드한 애니메이션 GIF를 원본 바이트 그대로
  보존해 캔버스 요소로 삽입(정적 GIF/기타 포맷은 기존 webp 다운스케일 경로 유지). `studio-gif-element.ts`.
  커밋 `5440da4`.
- **무료 스톡 이미지**(Unsplash, BYOK) — Access Key(무료 발급) 기반 검색·삽입. `studio-stock-image-client.ts` +
  `StudioStockImagePanel.tsx`. 커밋 `51a3ed6`.
- **PSD 파일 가져오기**(Photoshop/CSP 상호운용) — 기존 PSD **내보내기**와 대칭. `studio-psd-import.ts`.
  커밋 `48387c1`.
- **대사 다국어 번역**(투닝/WeToon 해외 진출 벤치마크, BYOK) — `studio-dialogue-translate.ts`. 커밋
  `2d6bc52`(AI BYOK 선행통합과 함께).

### Google Fonts 연동(완료, 프로덕션 배포됨) — design 문서 없이 신규 설계
브랜드 킷의 고정 9종 폰트 목록을 한글 지원 확인된 Google Fonts 19종으로 확장(제목/본문 글꼴 각각
카테고리 필터+검색 그리드에서 온디맨드 선택, 처음 고를 때만 1종짜리 CSS2 `<link>` 주입 — 19종
일괄 로드 안 함). API 키 불요(CSS2 엔드포인트 완전 공개)·OFL/Apache 라이선스(상업 임베딩 자유,
저작자 표시 의무 없음)라 BYOK 설정 UI 자체가 필요 없음. `studio-google-fonts.ts` +
`StudioBrandKitPanel.tsx` 확장. 커밋 `87f0907`.
실제 브라우저 검증(Chrome DevTools MCP)으로 발견한 함정: Konva 캔버스는 `<canvas>` 렌더라 브라우저의
지연 웹폰트 로딩 최적화(DOM 텍스트 기반)가 한글 유니코드 레인지 `@font-face`를 자동으로 안 당겨올 수
있음 → `document.fonts.load()`를 한글 샘플 문자열로 명시 호출해 해결.

### 그 외 개별 개선 (완료)
- **3D 배경 투명 삽입** — 체크박스로 하늘색/바닥 그리드를 빼고 오브젝트만 투명 배경 PNG로 캔버스에
  삽입(다른 배경 위에 자유 합성 가능). `gl.setClearColor`의 alpha를 캡처 프레임에서만 0으로.
- **VRM 캐릭터 발밑 그림자 제거** — 캡처 순간에만 `GroundShadow` mesh를 꺼서, 완전 투명 배경 PNG에
  타원형 접지 그림자가 함께 찍히지 않게 함.
- **모바일 하단 도구막대 겹침 수정** — 전역 사이트 헤더의 모바일 하단 탭바와 스튜디오 자체 도구막대가
  `/studio` 라우트에서 동시에 `fixed bottom-0`로 렌더링되어 겹치던 버그. `site-header.tsx`에
  `hideBottomTabs`(경로가 `/studio`로 시작하면 전역 하단 탭바 숨김) 추가 + 캔버스 max-height 계산을
  실측 기반으로 재조정(13rem→26rem 차감, 기존 값이 상단 UI 실제 높이를 과소평가해 캔버스가 하단
  도구막대 뒤로 넘쳐 숨었던 별도 버그도 같이 발견해 수정). 커밋 `dfeb2c1`.

---

## 3. 백로그 — 보류/스코프 밖 (사유 포함)

다음에 "이거 왜 안 했지?" 재고할 때 참고할 것 — 재조사 없이 사유부터 확인.

### 2차 배치 선정 시 제외(3차 배치 후보로 유예)
- **Actions/recordable batch automation**(Photoshop 매크로) — 범용 액션 녹화·재생 엔진 자체가 별도
  인프라 필요(모든 상태변경 함수 호출을 직렬화 가능한 로그로 인터셉트). 이 앱은 이미 브랜드킷/브러시
  라이브러리/룩 프리셋 등 "설정 저장·재적용" 패턴이 다수라 유사 가치를 상당 부분 커버 중.
- **Blend-if 톤레인지 슬라이더**(Photoshop) — 니치 기능(정교한 사진 합성/리터칭용). freeform layer
  mask(2차 배치 완료)로 유사 니즈를 브러시로 수동 커버 가능.
- **Wrap-around seamless tile mode**(Krita) — 웹툰 제작과 무관(텍스처/패턴 아티스트용). 기존
  `studio-pattern-fill.ts`(패턴 채우기)로 반복 배경 니즈는 커버.
- **Bulk create/data-merge**(미리캔버스/Canva) — 스프레드시트 기반 대량 카드뉴스 생성. 웹툰(스토리
  기반 순차 컷)과 사용 사례 자체가 불일치(각 컷이 스토리상 고유함).

### 애초 "아키텍처 리스크 커서 별도 세션" 분류 → 3차 배치로 착수·완료함
Liquify/Content-aware fill/Puppet warp — 위 §2 "3차 배치"(완료) 참고. 완벽한 상용 알고리즘 대신
실용적 근사로 스코프를 좁혀 착수, StudioPage.tsx 배선까지 전부 완료.

### 스코프 밖(명시적 제외, 원칙적으로 재고 안 함)
- **Real-time collaborative co-editing** — 웹소켓/서버 인프라 필요, 이 프로젝트의 "$0 서버비용" 원칙과
  정면 충돌. 사용자가 서버비용 감수를 명시적으로 승인하지 않는 한 착수 금지.
- **Smart objects**(Photoshop) — `El` 유니언 타입 전체를 링크드-인스턴스 모델로 리팩토링해야 해서
  리스크 과다. "클립" 라이브러리(재사용 요소 묶음)로 유사 가치 어느 정도 커버.
- **Multi-finger touch gesture shortcuts**(Procreate) — 데스크톱 마우스/펜 우선 앱이라 가치 낮음.
- **Rulers percentage-based snapping**(Photoshop) — 가치가 작음.
- **Parallel-ruler/concentric-ellipse assistants**(Krita) — 기존 perspective-guide/symmetry와 상당
  부분 겹침.
- **Per-panel duration/timing override**(Storyboarder) — "재생 시간"이라는 개념이 이 앱(정적 컷 웹툰)
  과 안 맞음.

### AI 생성 플랫폼(투닝/젠툰/투툰/WeToon/ComicAI)이 강조하는, 아직 미착수인 것
5차 배치의 "AI 생성 BYOK 구조"(배경 생성/자동 채색/장면구성 제안) 완료 후, 그 인프라 위에 얹을 확장
후보 — **완전한 구현이 아니라 다음 배치의 확장 지점으로 기록만 해둠**:
- **캐릭터 일관성 유지 생성**(젠툰 핵심 기능) — 같은 캐릭터를 여러 컷에서 동일 외모로 재생성하는 건
  이미지 생성 AI 중에서도 특히 어려운 문제(IP-Adapter/캐릭터 LoRA 등 전문 기법 필요, 단순 프롬프트로는
  일관성이 잘 안 나옴). 참고 이미지를 함께 전송하는 방식(OpenAI Images Edit API의 image-to-image류)
  으로 근사할 여지는 있으나, 별도 설계·검증이 필요.
- **시나리오 기반 완전 자동 컷+말풍선 배치**(투닝/투툰/WeToon 공통) — 텍스트 생성(장면 분할)+이미지
  생성(각 컷)+기존 말풍선 시스템을 체이닝하는 멀티스텝 워크플로. 비율 다양 지원은 이미 Magic Resize
  (2차 배치)로 상당 부분 커버됨.
- **미리캔버스 스타일 카드뉴스 대량 생성** — 위 "Bulk create/data-merge" 배제 사유와 동일(웹툰 사용
  사례와 불일치)이라 재검토 시에도 낮은 우선순위로 유지 권장.

### 실제 파일/에셋 소싱이 필요해 별도 트랙인 것
- **VRM 캐릭터 "노인" 카테고리** — 사용자 요청("악당/남자/아이/노인 등 다양한 무료 캐릭터"). 현재
  캐릭터 라이브러리 87명 중 악당류(데빌/블러디/나이트메어/스컬/드라큘라/좀비/위치)·남자류(로버트/지미/
  굿나이트/바오사무라이)·아이류(디노키드)는 이미 다수 확보돼 있으나 "노인" 캐릭터는 없음. 이건 코드
  구현이 아니라 VRoid Hub/BOOTH에서 실제 무료 라이선스 VRM 파일을 소싱→다운로드→라이선스 확인→
  커밋하는 별도 작업 트랙(이전 세션들의 VRM 캐릭터 추가 작업과 동일 절차, `project_webtoon-vrm-poser`
  메모리 참고).

---

## 4. 향후 구현 로드맵(우선순위 제안)

다시 고도화할 때 이 순서를 권장한다(가치·리스크 대비 판단):

1. **AI 생성 BYOK 구조의 실제 키 검증** — 코드 통합은 완료됐으나(§2), 키 없이도 앱이 정상 작동하는지는
   확인됐고 **실제 API 키를 등록한 상태의 호출 형식·에러 처리**는 아직 실사용자 키로 1차 검증이 안 됨.
2. **캐릭터 일관성 생성**(젠툰 벤치마크) — AI BYOK 인프라가 안정화된 후, "참고 이미지 첨부 + 동일
   프롬프트 재생성" 근사부터 시작(완벽한 일관성은 기대하지 않되 젠툰류 대비 체감 격차를 좁히는 정도).
   IP-Adapter/캐릭터 LoRA 같은 전문 기법은 스코프 밖(별도 설계 필요).
3. **VRM 캐릭터 노인 카테고리 소싱** — 코드 작업이 아니라 리소스 소싱이라 별도 세션에서 짧게 처리
   가능. VRoid Hub "Free" 태그로 노인/할머니/할아버지류 검색.
4. **시나리오 기반 자동 컷+말풍선 배치**(투닝/투툰/WeToon 공통) — 텍스트 생성(장면 분할)+이미지
   생성(각 컷)+기존 말풍선 시스템을 체이닝하는 멀티스텝 워크플로. 스코프가 가장 크므로 위 항목들이
   안정화된 후 마지막에. 비율 다양 지원은 이미 Magic Resize(2차 배치)로 상당 부분 커버됨.
5. **Pexels/Pixabay 등 스톡 이미지 소스 추가** — Unsplash와 완전히 동일한 BYOK 아키텍처 복제 수준이라
   구현 리스크는 낮지만, 이미 Unsplash가 있어 한계효용은 "소스 다양화" 정도(우선순위 낮음).

### 조사했으나 연동 불가로 확정된 것(재조사 불필요)
- **네이버 AI Painter 연동** — 실존하는 네이버웹툰 자동채색 도구(2021년 출시, WACV 2022 논문으로
  기술 검증됨)이나 **네이버웹툰 소속/계약 창작자 전용 내부 툴이라 외부 개발자용 API·SDK가 전혀
  없음**(2026-07 조사, WebSearch로 재확인해도 결과 동일할 가능성 높음). NAVER Cloud Platform이 공개
  AI API(CLOVA Studio 등)를 운영하지만 이 목록에 자동채색 API는 없음.
- **Adobe Photoshop API(Firefly Services)** — 공식 API 존재하나 엔터프라이즈 전용(월 $1,000+ 협상
  계약), 개인 무료 키 발급 불가 — BYOK($0) 구조와 근본 불일치.
- **Canva Connect API** — 공식 API 존재하나 Enterprise 플랜(30석+) 전용, 퍼블릭 통합은 Canva 사전
  심사 필수 — 개인 셀프서브 불가.
- **Adobe Color(Kuler) API / Figma REST API** — Adobe Color는 비공개(요청 기반 승인제), Figma는
  API는 있으나 무료 플랜 rate limit이 파일당 월 6회로 실용성 없음. 자체 팔레트 라이브러리(.gpl
  가져오기/내보내기)로 이미 충분히 대체됨.
- **Clip Studio Paint(.clip) 포맷 직접 파싱** — CELSYS 공식 스펙 비공개, 커뮤니티 리버스엔지니어링
  스펙만 존재(법적 회색지대 + 유지보수 리스크). CSP가 이미 공식적으로 PSD 내보내기를 지원하므로,
  이 앱의 기존 PSD 가져오기(§2)로 이미 상호운용 가능 — 신규 연동 불필요.
- **실시간 공동편집(팀 기능)** — 사용자에게 직접 확인 후 보류 결정(2026-07-04). 웹소켓 서버가 반드시
  필요해 실제 호스팅 비용이 발생 — "$0 서버비용" 원칙과 정면 충돌. 대안으로 제시한 "비동기 공유
  (.json 백업/복구를 공유 링크로 확장)"도 사용자가 보류를 택함 — 재제안 시 이 히스토리부터 확인.

관련 문서: `docs/design-content-aware-fill.md`, `docs/studio-puppet-warp-design.md`,
`docs/studio-liquify-integration.md`, `docs/studio-kaleidoscope-integration.md`,
`docs/studio-panel-autofit-integration.md`, `docs/studio-scroll-preview-integration.md`,
`docs/studio-similar-style-integration.md`, `docs/studio-animated-gif-design.md`,
`docs/studio-stock-image-integration.md`, `docs/studio-psd-import-integration.md`,
`docs/studio-dialogue-translate-integration.md`, `docs/studio-ai-assist-integration.md`,
`docs/studio-bubble-custom-shape-integration.md`, `docs/studio-bubble-upgrade-integration.md`,
`docs/studio-curve-smoothing-design.md`, `docs/studio-bg3d-scene-templates-design.md`,
`docs/studio-bg3d-custom-model-upload.md`, `docs/studio-history-brush-design.md`,
`docs/studio-emeres-library-integration.md`(3~6차 배치 설계 문서 — 통합 완료 후에도 알고리즘/아키텍처
설계 근거로 보존. Google Fonts는 design 문서 없이 처음부터 구현·통합까지 한 번에 완료됨).
