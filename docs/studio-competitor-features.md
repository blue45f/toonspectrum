# 창작 스튜디오(/studio) — 경쟁사 기능 분석 & 구현 현황

> `docs/competitor-analysis.md`(툰스펙트럼 본체: 웹툰 검색/랭킹/리뷰 서비스)와는 다른 문서다. 이 문서는
> **창작 스튜디오(`src/domains/creator/StudioPage.tsx`, 컷툰 제작 캔버스 에디터)** 가 벤치마킹하는
> 드로잉/만화 제작 소프트웨어 대상이다.
>
> 작성일: 2026-07-04, 최종 갱신: 2026-07-11(잔액 소진 자동 전환·실제 provider provenance + Writer Room→canvas +
> 단일 ZIP Publish Package + self-contained 프로젝트 archive + 서버 revision/충돌 복구 + typed Auto Actions +
> 캡처 readiness·모바일 복구 안전성 + 말풍선 꼬리/이중 로브/벡터 선택기 + 검수형 투명 소재·모바일
> 자산 관리 + Babylon.js 실측 ADR. 모바일 검증 캡처는 `docs/screenshots/studio-commercial-suite/`) ·
> 2026-07-10 갱신: 공식 자료 재벤치마크 + 서버 전용 Z.ai/DeepSeek 텍스트 transport +
> 초안/비용/업로드 편집/autosave 안전성 + 캐릭터 바이블/연속성 검사/페이지 검토 잠금 + 실제 AI 취소/
> 적용 대상/권리 체크리스트/문맥 댓글/프로덕션 인사이트 배치. 상세 매트릭스는
> `docs/studio-competitor-benchmark-2026-07-10.md`). 모바일·전문 제작 흐름의 상용 프로그램 공식 매뉴얼
> 비교는 `docs/studio-commercial-manual-benchmark-2026-07-10.md`에 별도 정리했다.
> · 이전 갱신: 2026-07-05(3~6차 배치 + Google Fonts + 캐릭터 일관성 유지 생성(젠툰
> 벤치마크) + VRM 캐릭터 "노인" 카테고리 리소스 소싱 + 시나리오 기반 자동 컷+말풍선 배치(투닝/투툰/
> WeToon 벤치마크, §4 로드맵 마지막 우선순위였던 최종 항목) + **API 키 통합 "연동 설정" 패널 + 툴바
> 20개 이상 플랫 버튼을 4개 논리 그룹(배경/에셋/스타일/AI 연동)으로 재구성** + **AI 대사/나레이션 제안 +
> AI 색상 팔레트 추천**(둘 다 BYOK, "AI 연동" 그룹의 "AI 어시스트" 서브탭에 4/5번째 섹션으로 편입) 전부
> StudioPage.tsx 통합 완료 반영) · 목적: 나중에 다시 고도화할 때 재조사 없이 이어갈 수 있도록 조사
> 내용·구현 현황·보류 사유를 한곳에 남긴다.
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

### 2026-07-11 상용 제작·복구 하드닝 배치 (현재 작업 트리 통합 완료)

- **잔액/패키지 소진 전용 AI failover**: DeepSeek HTTP 402와 Z.ai HTTP 429의 공식 잔액·패키지 오류
  코드만 다음 공급자로 전환한다. 일반 rate limit, 인증, 서버 오류, 네트워크 단절, timeout, 사용자 취소,
  malformed 응답은 이중 과금 위험 때문에 자동 재전송하지 않는다. 최종 응답에는 요청 선호값이 아니라 실제
  provider/model과 안전한 failover 사유만 남긴다.
- **중앙 AI 작업 원장**: Writer Room, 시나리오 텍스트·이미지, 구도, 대사, 번역, 팔레트, 배경·채색·캐릭터
  요청을 각각 pending→success/failure/cancelled 상태로 기록한다. 원문 프롬프트·API 키·원시 오류는 보존하지
  않으며 중단된 세션은 `SESSION_INTERRUPTED`로 복구한다. BYOK AI 키는 현재 탭의 `sessionStorage`에만
  유지하고 이전 영구 저장값은 삭제한다.
- **Writer Room→canvas 제작 투영**: premise부터 dialogue/SFX까지 7단계 문서를 페이지·컷·대사 계획으로
  결정적으로 검증하고, 준비 오류가 없을 때만 한 번의 히스토리 커밋으로 캔버스에 적용한다.
- **실제 단일 Publish Package ZIP**: 목적지별 slice PNG/JPEG, thumbnail, manifest, 검토 보고서, 공개용 AI
  provenance, credits를 하나의 저메모리 ZIP으로 생성한다. 렌더 후 실제 byte size·SHA-256을 manifest에
  확정하고 ZIP signature/CRC/파일 목록을 테스트한다.
- **명시적 캡처 readiness**: 임의 지연시간 대신 React 페이지 commit, 웹폰트, 래스터·마스크 decode,
  Konva `batchDraw`, 두 paint frame을 기다린 뒤 저장·다운로드·클립보드·전체 스크롤·Publish Package·
  타임랩스를 캡처한다. 페이지 전환·중단·timeout·asset 실패를 구분하고 원본 URL은 오류에 반사하지 않는다.
- **self-contained `.toonproject.zip`**: canonical `project.json`, manifest, SHA-256 content-addressed attachment를
  결정적으로 패키징한다. 동일 이미지/마스크를 중복 제거하고 ZIP path traversal, case-fold collision,
  CRC/SHA/MIME 위조, 숨은 entry, 크기/개수/압축비 한도와 외부 glTF/OBJ 종속성을 검사한다. 모바일은 더 낮은
  메모리 상한을 적용한다.
- **서버 owner-only revision**: 작품 생성·수정·복원을 snapshot과 같은 PostgreSQL transaction으로 처리하고
  `baseRevision` 불일치를 안전한 409로 반환한다. 복원도 새 revision을 만들며 최근 20개만 보존한다.
  Studio의 버전 패널에서 로컬 이름 있는 복구 지점과 서버 자동 버전을 분리해 조회·복원한다. 공개 응답에는
  revision/snapshot과 재귀적 private note 필드를 노출하지 않는다.
- **typed Auto Actions**: 임의 JavaScript를 실행하지 않는 버전형 JSON allowlist로 글꼴·크기·색, opacity,
  blend, 표시, 잠금, 페이지 배경·색보정을 현재/선택/전체 페이지에 적용한다. 페이지 다중 선택, dry run,
  영향 수치·경고, 진행률, 취소, 실행 직전 자동 복구 지점, 원자적 롤백, 단일 undo 커밋을 제공한다.
- **모바일 회귀 검증**: 375×812 실제 브라우저에서 Writer Room, AI 작업 이력, Publish Package,
  Auto Actions를 조작하고 44px 핵심 터치 타깃과 가로 overflow 0을 확인했다. 프로젝트 archive와 Publish
  Package는 브라우저 실제 다운로드 후 `unzip -t`, entry·hash manifest를 함께 확인했다.

증거 캡처: [`docs/screenshots/studio-commercial-suite/`](screenshots/studio-commercial-suite/README.md).

### 2026-07-11 말풍선·소재·모바일 조작성 배치 (현재 작업 트리 통합 완료)

공식 기능 근거는 Clip Studio Paint의 [Balloons 매뉴얼](https://help.clip-studio.com/en-us/manual_en/540_comic/Balloons.htm),
MediBang의 [말풍선 종류 튜토리얼](https://medibangpaint.com/en/use/2021/11/mangatutorialforbeginners08/)과
[Tiles/Tones/Items 소재 매뉴얼](https://medibangpaint.com/en/use/2016/12/pc-use-materials-tiles-tones-items/),
ibisPaint의 [타원자 말풍선 제작](https://ibispaint.com/lecture/index.jsp?lang=en&no=45)을 기준으로 삼았다.
경쟁사의 실제 소재 파일·썸네일·아이콘은 복제하지 않고 편집 규칙과 작업 흐름만 자체 구현했다.

- **말풍선 꼬리 정밀 편집**: 주 꼬리와 추가 꼬리마다 부착면·위치·길이·밑동 너비·끝 기울기·곡률을
  독립 편집한다. 본체와 꼬리는 하나의 SVG path라 밑동의 이중 외곽선 이음새가 없고, 화면·페이지
  썸네일·SVG 내보내기·커스텀 모양 전환이 같은 기하 규칙을 사용한다. 최대 세 화자의 동시 대사를
  표현할 수 있다.
- **이어 말하기 이중 말풍선**: MediBang의 긴 대사/시간차용 double bubble을 기능 기준으로 재해석해,
  위·아래 두 로브를 내부 이음선 없는 하나의 벡터 path로 구현했다. 상·하·좌·우 주 꼬리와 밑동·곡률,
  SVG·썸네일 직렬화를 지원하며 의미가 다른 다중 화자 꼬리는 의도적으로 비활성화한다.
- **실물 형태 벡터 선택기**: 운영체제마다 달라지는 이모지 10종을 제거하고 실제 캔버스 실루엣과 맞는
  자체 SVG 11종을 2열 갤러리로 제공한다. 용도 설명, 메뉴 역할, 키보드 포커스와 99px 높이 모바일
  선택 영역을 포함한다.
- **앵커·자산 관리 접근성**: 말풍선 앵커 상태의 이모지와 하드코딩 색을 Lucide/semantic token으로
  교체하고 live status를 추가했다. 내 에셋의 20px hover-only 이름변경·공유·삭제를 항상 발견 가능한
  44px 작업 행으로 바꾸고, 업로드·생성·검색·정렬도 터치 기준을 맞췄다.
- **검수형 투명 전경 소재 4종**: 카페 2인 테이블, 교실 책상·학습 소품, 왕실 편지·봉인, 도시 거리
  시설물을 1536×1024 RGBA WebP로 자체 생성했다. 에셋 ID·한/영 태그·배치 기본값·내부 라이선스 참조·
  provider/model·날짜·원문 없는 prompt/edit SHA-256을 `studio-raster-assets.ts` 한 곳에서 관리한다.
  삽입 시 정적 URL을 WebP data URL로 바꿔 프로젝트 archive가 self-contained 상태를 유지하고 Publish
  preflight용 AI provenance도 요소에 보존한다.
- **메뉴 아이콘·터치 품질**: 장면/효과/내 에셋 중복 아이콘을 Clapperboard/Sticker/Library로 분리하고,
  집중선·속도선의 이모지를 ScanLine/Wind로 바꿨다. 검색, 필터 칩, 효과음·이모지·선 효과도 coarse
  pointer에서 최소 44px이 되게 했다.
- **Babylon.js 도입 결론 — 보류**: 격리 Vite PoC에서 Babylon creator WebGL 시작 경로는 305,625 B
  gzip, 현재 Three 기반 3D 배경 시작 경로는 79,398 B gzip이었다. 현재 VRM 포저가
  `@pixiv/three-vrm`에 깊게 의존하고 두 엔진 병행 비용이 크므로 프로덕션 의존성을 추가하지 않는다.
  WebGPU 대표 장면이 p95 frame time 25% 이상 개선되는 등 정량 기준을 충족할 때만 별도 실험으로
  재검토한다. 전체 수치와 채택 게이트는
  [`studio-babylonjs-adoption-evaluation-2026-07-11.md`](studio-babylonjs-adoption-evaluation-2026-07-11.md)에 기록했다.

모바일 375×812 실제 브라우저에서 말풍선 갤러리·꼬리 편집·자산 작업·래스터 소재를 각각 조작했고,
가로 overflow 0과 핵심 44px 터치 영역을 측정했다. 관련 집중 테스트 173개와 전체 회귀
244개 파일·4,281개 테스트, TypeScript, warning 0 엄격 ESLint, Vite 프로덕션 빌드를 모두 통과했다.

### 2026-07-10 공식 경쟁사 재벤치마크 배치 (현재 작업 트리 통합 완료)

- 서버 전용 DeepSeek 텍스트 transport, 인증·task allowlist·rate limit·timeout·사용자 식별 HMAC과 비용형
  이미지 kill switch. DeepSeek는 구조화 텍스트에만 사용하고 이미지 capability와 분리.
- Z.ai 일반 API의 공식 최신 `glm-5.1` transport를 같은 서버 경계에 추가. 제공자 선택/자동 전환,
  disconnect abort, 분산 UTC 일일 request/token quota와 최소 usage ledger를 공유하며 키·프롬프트·응답
  본문은 원장에 저장하지 않음. 제공된 키는 일반 API 잔액/패키지 부족(1113)으로 실호출 차단 상태.
- 초안 가시성·좋아요·댓글·조회수 안전성, 업로드 작품 형식 보존 편집, 사용자/작품별 v2 autosave와
  프로젝트 v2 백업.
- 이미지 생성 전 구조화 비트 시트 검토: 서사 역할·변화 요약·프롬프트·대사·연속성 메타를 장면별 수정,
  텍스트 설계와 비용형 이미지 생성을 분리, 장면별 삭제/재생성/이미지 없는 컷 적용.
- AI provenance와 WEBTOON/Tapas/일반 Publish Pack 정책 사전검사, Tapas의 현재 AI 생성 콘텐츠 금지
  차단, JSON 검사 보고서.
- Adobe/Storyboard That식 이름 있는 복구 지점(작품별 최신 10개).
- Dashtoon/Anifusion식 작품 내 캐릭터 바이블: 9개 설정 필드, 필드별 AI 고정 제약, 자동저장·게시 문서·
  프로젝트 백업·복구 지점 포함, 시나리오/이미지 요청 컨텍스트 연결.
- 구조화 continuity lint: 캐릭터 바이블 누락·중복/미등록 인물과 장면 순서별 장소·시간·의상·소품 변화를
  결정적으로 비교하고, 명시한 전환 이유가 있으면 의도된 변화로 허용. AI 초안과 적용된 프레임 양쪽에서
  메타 편집 가능.
- Clip Studio/Adobe식 페이지 검토 상태·담당·메모·승인 시 로컬 편집 잠금. 잠긴 페이지 변경을 공용
  커밋 관문에서 차단하며, 서버 권한/실시간 협업 잠금과는 구분해 UI에 고지.
- 장면 설계·일괄/개별 이미지 생성 요청에 실제 `AbortSignal` 전달, 현재 페이지/다음 새 페이지 적용 대상,
  텍스트 provider/model/transport/prompt version/token usage provenance를 검토 UI→프레임→Publish Pack까지
  보존.
- 예상 독자 등급·민감 표현·원본/참고/제3자 소재 권리·AI 고지·최신 정책 검토를 묻는 버전형 Publish Pack
  자체 점검. 필수 누락은 게시를 차단하고 자동저장·게시 문서·프로젝트·복구 지점에 함께 보존하되 법률 인증이나
  플랫폼 승인으로 표현하지 않음.
- Canva/Adobe식 페이지·컷·요소 문맥 댓글의 로컬 우선 구현: 댓글/답글/담당/해결 상태와 필터·앵커 이동,
  프로젝트 보존. 실시간 동기화·알림·계정 조회·서버 권한 검사는 제공하지 않는다는 경계 표시.
- 비소유자가 게시 작품 상세를 읽을 때 문서 댓글·캐릭터 내부 기획·권리 체크 답변·페이지 검토 메모가
  공개되지 않도록 서버 공개용 문서 투영을 적용하고, 렌더 구조와 AI 사용 고지만 유지.
- 로컬 문서 기반 프로덕션 인사이트: 페이지/컷/대사/내레이션, 공개 계산식의 읽기 시간 추정, 검토·잠금
  커버리지, AI 에셋, 연속성·게시·권리·댓글 이슈. 독자 행동 분석이나 원격 텔레메트리가 아님을 명시.
- 외부 자동 게시를 가장하지 않는 연재 운영: 회차/마일스톤별 목적지·현지 날짜/시간·IANA 시간대·상태를
  로컬 문서에 보존하고 DST·중복 슬롯·과거 예약·목적지 정책 재확인을 검사하며 RFC 5545 캘린더로 내보냄.
- 플랫폼 API가 없는 경우를 위한 CSV/수동 성과 가져오기: WEBTOON/Tapas/기타별 조회·좋아요·댓글·신규
  구독·통화별 수익, 합계·비율·시계열·기간 비교. 안전한 CSV 파싱, 수식 주입 무력화, 입력 한도와 구조화
  진단을 적용하고 사용자 제공 로컬 수치라는 근거를 계속 표시.
- 검증: 관련 순수 모듈 테스트, 전체 TypeScript/ESLint, 실제 Vite 브라우저 왕복. 375px 모바일에서
  캐릭터 바이블 가로 넘침 없음, AI 요청에 `[고정]` 바이블 포함, continuity 경고 장면 이동, 잠금 뒤 편집
  차단을 확인. 후속 왕복에서 체크리스트 입력/저장, 새 페이지 적용의 원본 페이지 무변경, 모델·토큰 이력,
  컷 댓글/답글/해결 자동저장, 인사이트 집계와 375px 무가로넘침도 확인.
- 연재 운영 왕복에서 목적지 정책 경고와 메모 기본 제외 `.ics`, 수동·CSV 성과 병합/게시처 비교,
  수식형 CSV 셀 중립화, 일정·성과 자동저장, 375px 가로 넘침 0과 새 브라우저 세션 콘솔 오류 0을 확인.

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

### VRM 캐릭터 "노인" 카테고리 소싱 (완료) — 코드 구현이 아니라 리소스 소싱
§3 "실제 파일/에셋 소싱이 필요해 별도 트랙인 것"에 있던 백로그 항목. `OldMoustache.vrm`(할아버지) ·
`Eugenia.vrm`(할머니) 2종을 `public/vrm/`에 추가하고 `SAMPLE_VRMS`(87→89개)에 등록.
- 출처: 기존 69종과 동일한 오픈소스 아바타 레지스트리(<https://github.com/ToxSam/open-source-avatars>,
  Polygonal Mind 100Avatars R1/R3) — **CC0(퍼블릭 도메인)**. 레지스트리 `projects.json` 선언뿐 아니라
  다운로드한 `.vrm` 바이너리에 임베드된 VRM 0.x `extensions.VRM.meta`를 직접 파싱해 `licenseName:
  "CC0"` · `commercialUssageName/allowCommercialUse: Allow/true` · `allowRedistribution: true`를
  파일 자체에서 재확인(2중 검증).
- VRoid Hub·BOOTH도 "노인/할머니/할아버지/elderly/grandpa/grandma"로 실제 조사했으나, 검색된 개별
  창작자 아바타는 대부분 `redistribution: disallow` 또는 상업적 이용 disallow라 채택하지 않음(전량
  조사 근거는 `public/vrm/LICENSES.md` "노인 카테고리 소싱 근거" 절에 원문 인용 포함).
- 전체 라이선스 근거·제외 사유 원문: `public/vrm/LICENSES.md`. 테스트: `vrm-library.test.ts`(89개
  카운트 + 신규 파일 2종 라이선스 문서화 검증) 갱신 완료.

### 캐릭터 일관성 유지 생성(젠툰 벤치마크, 완료) — design 문서 없이 신규 설계
"AI 생성 BYOK 구조"(5차 배치) 위에 얹는 확장 — 젠툰의 핵심 차별점인 "같은 캐릭터를 여러 컷에서 동일
외모로 유지"를 근사한다. IP-Adapter/캐릭터 LoRA 같은 전문 기법(모델 파인튜닝·임베딩 주입)은 이 프로젝트가
자체 추론 서버를 가질 수 없어 여전히 스코프 밖이다(아래 §3에 잔존) — 대신 `colorizeLineArt`와 완전히
동일한 패턴(마스크 없이 참고 이미지 전체 + 텍스트 프롬프트만 Images Edits API로 전송)을 재사용해, 캔버스
에서 선택한 "기준 캐릭터" 이미지를 참고로 함께 보내는 image-to-image 방식으로 근사했다.

- `studio-ai-client.ts`: `buildCharacterConsistencyPrompt`(사용자의 "상황" 프롬프트를 "캐릭터 외모
  유지" 고정 지시문으로 감싸는 순수 함수, fetch 없음) + `generateConsistentCharacterImage`(그 프롬프트
  + 참고 이미지 blob을 Images Edits API로 전송 — `colorizeLineArt`와 달리 기존 요소를 덮어쓰지 않고
  새 이미지로 삽입되도록 `{ dataUrl }`만 반환). 유닛 테스트 13개 추가(프롬프트 조합 3개 + 네트워크
  계약 10개 — 미설정/빈 프롬프트/기준 이미지 없음/원격 URL 소스 거부 시 fetch 미호출 확인, multipart
  요청 형태 검증, parse/http/network 에러 분기).
- `StudioAiCharacterConsistencyPanel.tsx`(신규, 프레젠테이션 전용·무상태) — 기준 캐릭터 미선택/API 키
  미설정 상태를 각각 안내하고, 선택된 이미지의 썸네일을 보여준다. "완벽한 동일 인물 재현은 보장하지
  않는다"는 기대치를 안내 문구로 명시(정직성 규약).
- `StudioPage.tsx` 통합: 기존 "AI 어시스트" 툴바 팝오버(`StudioAiBackgroundPanel`/
  `StudioAiCompositionPanel` 옆)에 나란히 배선. "기준 캐릭터"는 별도 상태로 고정하지 않고 캔버스에서
  선택된 요소(`selected`)가 이미지 타입인지의 파생값으로만 판단(다른 이미지를 선택하면 자동으로 최신
  기준 캐릭터로 전환돼 stale 상태가 될 여지가 없음). 생성 결과는 참고 이미지의 온-캔버스 표시 크기를
  그대로 재사용해 `addRenderedImage`로 새 이미지 요소를 삽입한다(생성된 이미지를 다시 디코딩해 원본
  픽셀 크기를 알아낼 필요가 없음 — `generateBackgroundImage`가 요청 size 문자열에서 width/height를
  동기적으로 아는 것과 같은 이유의 왕복 절감). 기존 "생성형 AI 최초 사용 고지"(`runWithAiNotice`) 게이트를
  그대로 재사용.
- design 문서 없이 코드+이 문서 갱신을 한 커밋에 함께 반영(Google Fonts와 동일 방식 — §4 배선 지시가
  "처음부터 설계·구현·통합까지 완결"이었음).

### 시나리오 기반 자동 컷+말풍선 배치(투닝/투툰/WeToon 벤치마크, 완료) — design 문서 없이 신규 설계
"AI 생성 BYOK 구조"(5차 배치)와 "캐릭터 일관성 유지 생성"(직전 사이클) 위에 얹는 최종 확장 — §4 로드맵의
마지막 우선순위이자 스코프가 가장 큰 항목. 스토리 텍스트 한 줄만 입력하면 장면 분할 → 컷(프레임) 생성 →
이미지 생성 → 말풍선 배치까지 자동 완성한다. **완벽한 자동화가 아니라 실용적인 첫 버전으로 의도적으로
스코프를 좁혔다** — 세부 편집(컷 위치 미세조정 등)은 기존 도구로 이어서 할 수 있다(자동 생성 결과이
잠금 없는 일반 `El` 요소이기 때문).

- `studio-scenario-scenes.ts`(순수) — 장면 분할 프롬프트 구성(`buildScenarioScenesPrompt`,
  sceneCountHint 없으면 "3~8개 자연스럽게", 2~10 사이 유효값이면 "정확히 N개") + 응답 파싱
  (`parseScenarioScenesResponse` — 코드펜스·설명 문장이 섞여도 첫 JSON **객체**만 중괄호 짝matching으로
  추출. studio-dialogue-translate.ts의 `extractJsonArrayLiteral`(대괄호 버전)과 동일 전략을 객체용으로
  변형). **대사 필드는 새 JSON 스키마를 만들지 않고, 기존 "대사 한 번에" 말풍선 삽입 기능이 이미 파싱하는
  미니 문법("이름: 대사" / "(지문)", `studio-dialogue.parseDialogueScript`)을 그대로 쓰도록 프롬프트에
  지시** — 이중 파서를 만들지 않기 위한 설계 결정.
- `studio-ai-client.ts`: `generateScenarioScenes` 추가(Chat Completions 얇은 래퍼, `suggestSceneComposition`
  과 동일 패턴이되 "자유 텍스트"가 아니라 "구조화 JSON" 응답을 기대).
- `studio-scenario-layout.ts`(순수) — 장면 배열을 프레임+말풍선 배치로 변환. 프레임 위치는
  `addFrame()`과 동일한 "가장 아래 프레임 다음에 이어붙이기" 정책을 여러 장면용으로 일반화(항상 현재
  페이지에 이어붙임 — 새 페이지를 만들지 않는다, 기존 장면 템플릿/대사 일괄 삽입과 동일 관례). 말풍선
  배치는 `studio-dialogue.ts`의 `parseDialogueScript`/`layoutDialogueBubbles`를 그대로 재사용(재구현
  없음). 패널 높이는 그 장면 대사량(말풍선 스택 높이)에 맞춰 자동 산정(최소 360px/최대 900px).
- 이미지 생성(캐릭터 일관성 생성 재사용, 직전 사이클 완료분 그대로 오케스트레이션): 첫 장면은
  `generateBackgroundImage`(장면 묘사 + `characterDescription`을 합쳐 "기준 캐릭터" 외모를 확립)로,
  이후 장면들은 그 이미지를 참고로 `generateConsistentCharacterImage`로 생성한다(첫 성공 이미지를 고정
  앵커로 유지 — 매 장면 결과로 앵커를 계속 갱신하면 외모 오차가 누적되므로 의도적으로 고정). 첫 장면
  생성이 실패해도 성공할 때까지 계속 배경 생성을 재시도하는 폴백 포함. **부분 실패를 허용한다** — 한
  장면의 이미지 생성이 실패해도 나머지 장면은 계속 진행하고, 실패한 장면은 배경 없는 빈 컷으로 미리보기에
  남는다(정직성 규약 — 조용히 건너뛰지 않음).
- `StudioScenarioAutoLayoutPanel.tsx`(신규, 전체화면 모달) — 스토리 입력 + 장면 수 힌트(자동/2~10개
  선택) + 진행 상태(장면 분할 중/이미지 생성 중 N/M) + 취소(다음 장면부터 중단, 이미 생성된 장면은
  보존) + 미리보기 그리드(썸네일+대사 발췌) + 적용/다시 만들기. 다른 AI 기능들의 320px 툴바 팝오버가
  아니라 `StudioStoryboardGridPanel`/`StudioScrollPreviewPanel`과 동일한 전체화면 모달 패턴을 따른다
  (미리보기 그리드가 커서 팝오버엔 맞지 않음).
- `StudioPage.tsx` 통합: 툴바에 전용 버튼("시나리오 자동 생성", `Clapperboard` 아이콘, 마스터 편집
  중엔 비활성) — AI 어시스트 팝오버에 끼워넣지 않고 독립 버튼으로 노출(스토리보드 그리드 등과 동일
  급의 기능 범위이므로). "자동 생성" 클릭은 (장면 분할 자체는 텍스트뿐이라도) 파이프라인 전체가 결국
  이미지를 생성하므로 `runWithAiNotice`로 통째로 게이팅한다. 적용은 프레임+말풍선 전체를 단일
  `commit()` 호출로 커밋(undo 1회로 전부 되돌릴 수 있음).
- **헤드리스 브라우저(Playwright)로 실제 동작을 왕복 검증하다가 발견한 버그 2건, 둘 다 이번에 수정**:
  1. AI 최초 사용 고지(`AiAssetNotice`, 기존 `z-[70]`)가 시나리오 모달(`z-[80]`) 뒤에 가려 "이해했어요"
     확인 버튼을 누를 수 없었다(z-index 숫자 비교는 같은 스태킹 컨텍스트 안에서만 유효 — 기존엔
     z-80짜리 전체화면 모달이 열린 채로 그 **안에서** AI 고지를 띄우는 조합 자체가 없어서 드러나지
     않던 잠재 버그였다).
  2. 더 근본적인 문제: 이 앱의 라우트 콘텐츠 래퍼(`route-stage`, `src/app/routes/AppRouter.tsx`)가
     `isolation:isolate`를 걸어놔서, 그 안에서 z-index를 아무리 높여도(예: 기존 z-[80] 전체화면
     모달들) 사이트 전역 고정 헤더(`z-50`, route-stage 밖의 형제 — z-index는 같은 스태킹 컨텍스트
     안에서만 비교된다)보다 항상 뒤에 그려진다. 시나리오 모달의 제목표시줄이 사이트 헤더에 완전히
     가려지는 것으로 발견했다. `components/auth/auth-modal.tsx`가 이미 쓰고 있던 해법
     (`createPortal(..., document.body)`)을 시나리오 모달과 `AiAssetNotice` 양쪽에 적용해 해결.
     **기존 z-[80] 전체화면 모달 4개(StoryboardGrid/ScrollPreview/Timelapse/Background3D)도 제목표시줄이
     같은 결함으로 사이트 헤더에 가려질 가능성이 높지만(단, 이들은 AiAssetNotice를 트리거하지 않아
     "버튼을 못 누르는" 기능적 장애까지는 아니고 제목표시줄 시각적 가림 정도), 이번 스코프는 이번에
     새로 만든 두 컴포넌트 수정으로 한정했다** — §4 로드맵에 후속 확인·수정 항목으로 기록.
- 유닛 테스트: `studio-scenario-scenes.test.ts`(프롬프트 조합 + 응답 파싱 방어적 케이스 다수) +
  `studio-scenario-layout.test.ts`(프레임 스태킹·말풍선 배치·종횡비 계산) + `studio-ai-client.test.ts`에
  `generateScenarioScenes` 계약 테스트 추가. `StudioPage.tsx` 오케스트레이션 자체는(기존 관례대로,
  이 파일은 단위 테스트 대상이 아님) 직접 테스트하지 않는 대신, 실제 dev 서버 + 헤드리스 브라우저로
  전체 파이프라인을 왕복 검증했다 — 미설정 안내 → BYOK 설정 → 생성 → AI 고지 → (실패 경로) 네트워크
  에러 처리, 그리고 (성공 경로, fetch 모킹) 장면분할 1회 호출 + 배경생성 1회 호출 + 캐릭터 일관성
  생성 1회 호출 → 미리보기 2장 렌더 → 적용 → 캔버스에 프레임 2개·말풍선 2개 실제 반영(레이어 패널
  4개로 확인) + 실행취소 버튼 활성화까지 스크린샷으로 확인.

### API 키 통합 "연동 설정" 패널 (완료, 프로덕션 배포됨)
API 키를 등록해야 하는 곳이 AI 어시스트(baseURL/API키/모델)와 스톡 사진(Unsplash Access Key) 두 곳으로
나뉘어 있어, 사용자가 설정을 등록하려면 팝오버 두 개를 오가야 했던 문제를 해소.
`StudioIntegrationsSettingsPanel.tsx`(신규) — AI 어시스트 설정 섹션(기존 `StudioAiSettingsPanel`을 그대로
합성/재사용, 폼·연결테스트 로직 복제 없음)과 Unsplash Access Key 입력 섹션을 세로로 배치한 단일 패널.
`StudioStockImagePanel.tsx`의 Access Key 입력 UI는 제거하고 "연동 설정 열기" 버튼으로 대체.

### 툴바 UX 재구성 — 20개 이상 플랫 버튼을 4개 논리 그룹으로 통합 (완료, 프로덕션 배포됨)
배경: 위 "연동 설정" 통합 패널까지 만들었어도, 툴바 자체는 여전히 템플릿/배경씬/톤/이메레스/장면/클립/
팔레트/브랜드킷/AI어시스트/시나리오자동생성/연동설정/스톡사진 등 20개 이상의 버튼이 플랫하게 나열돼
화면을 가로/세로로 매우 길게 차지하고 있었다(사용자 직접 요청 — "도구 배치가 하단으로 계속 길어진다").

- **4개 논리 그룹으로 축소**: 배경(배경 씬+톤+3D 배경) / 에셋(템플릿+이메레스+장면+클립+효과+내 에셋) /
  스타일(팔레트+브랜드 킷) / AI 연동(AI 어시스트+시나리오 자동 생성+스톡 사진+연동 설정 — "API 키가
  필요한 기능은 한 곳에 모은다"는 요청과 자연스럽게 일치). 사용 빈도가 매우 높은 핵심 도구(선택/펜/
  지우개/텍스트/말풍선)는 의도적으로 그룹화하지 않고 그대로 1줄에 유지했다.
- **상태관리**: 새 상태를 추가하지 않고 기존 `menu`(단일 nullable `StudioMenu`) 하나로 "그룹 열림"과
  "활성 서브탭"을 동시에 표현한다. 모듈 상수 `STUDIO_TOOLBAR_GROUP_OF`(`StudioMenu` → 그룹 id 매핑)에서
  파생하는 `activeToolbarGroup`이 현재 어느 그룹이 열려 있는지 결정하고, 그룹 버튼 클릭은 그 그룹의
  첫 멤버로 `setMenu`할 뿐이다. 그룹 팝오버는 개별 팝오버와 동일한 `z-[60]`·
  `max-h-[calc(100dvh-13rem)]` 관례(2026-07-04 통일)를 그대로 물려받는 공용 wrapper
  (`groupPopoverClass`) 하나 안에, 서브탭 칩 행(`groupTabBtn`) + 현재 선택된 탭의 콘텐츠를 넣는 구조다.
  3D 배경·시나리오 자동 생성처럼 팝오버 콘텐츠가 없는 액션(별도 전체화면 모달을 여는 기능)은 그룹 안에서
  "누르면 그룹을 닫고 그 모달을 여는" 액션 칩으로만 존재한다(StudioMenu 값이 없음).
- **자기완결형 컴포넌트 3개 리팩터**: `StudioPaletteLibraryPanel.tsx`/`StudioBrandKitPanel.tsx`/
  `StudioAssetMenuPanel.tsx`는 원래 각자 자체 `fixed/absolute` 위치 wrapper를 갖고 있었는데(팔레트/
  브랜드킷/내 에셋 그룹 멤버가 됨), 그룹의 공유 wrapper와 이중으로 겹치지 않도록 각 컴포넌트의 자체
  wrapper를 제거하고 순수 콘텐츠만 반환하도록 바꿨다(`StudioStockImagePanel`은 `flex flex-col gap-2`
  레이아웃만 남기고 위치 클래스만 제거 — 자식들이 margin이 아니라 부모 gap에 의존했기 때문).
  **부수 발견**: 이 세 컴포넌트가 z-30·`max-h-[calc(100dvh-9.5rem)]`(구형 관례)에 머물러 있던 드리프트를
  발견했다 — 2026-07-04 z-index 통일 커밋이 StudioPage.tsx 인라인 팝오버만 반영하고 이 컴포넌트들 자체
  wrapper는 놓쳤던 부분(같은 종류의 드리프트가 `StudioStockImagePanel`에도 있었고 그건 직전 커밋에서
  이미 z-[60]으로 고쳐져 있었음). 그룹으로 흡수되면서 공용 wrapper의 z-[60]을 상속해 자동으로 함께
  해소됐다.
- **부수 UX 개선**(의도한 설계는 아니었으나 자연스럽게 좋아짐): "AI 어시스트 설정" 진입 버튼과
  `StudioStockImagePanel`의 "연동 설정 열기" 버튼이 이제 AI 연동 그룹 **안에서 탭만 전환**하므로, 예전엔
  클릭할 때마다 팝오버 하나가 닫히고 툴바의 다른 위치에서 새 팝오버가 열리던 것이 같은 박스 안에서
  부드럽게 전환된다.
- 검증: tsc / `eslint --max-warnings=0` / vitest(197 files·3726 tests) 전부 클린. 데스크톱(1440x900)·
  모바일(390x844) 둘 다 브라우저로 4개 그룹 전부 열어 하위 항목 전부(에셋 6개/배경 3개/스타일 2개/AI
  연동 4개) 클릭 확인 — 헤더(z-50)·하단 도구막대(z-[55])에 안 가려짐, 3D 배경·시나리오 자동 생성
  액션칩이 그룹을 정확히 닫고 해당 전체화면 모달을 여는 것까지 확인.
- 함정: 개발 서버가 여러 세션이 동시에 접속하는 공유 브라우저/포트일 수 있다 — 이번 검증 중에도 무관한
  다른 세션의 `src/components/error-boundary.tsx` 동시 수정이 Vite HMR 풀 리로드를 유발해 팝오버 상태
  (`menu`)가 예고 없이 초기화되는 걸 실제로 겪었다. 앱 버그가 아니라 dev 환경 노이즈이므로, 자동화
  클릭이 다른 세션의 리로드 타이밍과 겹쳐 간헐적으로 실패하면 그냥 스냅샷을 새로 떠서 재시도하면 된다.

### AI 대사/나레이션 제안 (완료, 프로덕션 배포됨) — design 문서 없이 신규 설계
장면 상황을 짧게 설명하면 자연스러운 대사·나레이션 후보 3~5개를 제안받는 기능. "AI 생성 BYOK 구조"(5차
배치) 위에 얹는 텍스트 전용 확장이라 서버 비용·이미지 생성 고지 게이트가 필요 없다.

- `studio-dialogue-suggest.ts`(순수) — 프롬프트 구성(`buildDialogueSuggestPrompt`, 캔버스에 이미
  배치된 대사를 "맥락"으로 선택적으로 포함) + 응답 파싱(`parseDialogueSuggestResponse` — 코드펜스·설명
  문장이 섞여도 첫 JSON **배열**만 대괄호 짝matching으로 추출, `studio-dialogue-translate.ts`의 전략을
  배열용으로 재사용) + `formatDialogueSuggestionLine`("이름: 대사"/"(지문)" 미니 문법 한 줄로 변환 —
  새 스키마를 만들지 않고 기존 "대사 한 번에"(`parseDialogueScript` → `layoutDialogueBubbles`) 파이프라인에
  그대로 태운다).
- `studio-ai-client.ts`: `suggestDialogueLines` 추가(Chat Completions 얇은 래퍼, `suggestSceneComposition`
  과 동일 패턴).
- `StudioDialogueSuggestPanel.tsx`(신규, 프레젠테이션 전용·무상태) — "AI 연동" 그룹의 "AI 어시스트"
  서브탭에 기존 배경생성/캐릭터일관성/구도제안과 나란히 4번째 섹션으로 편입. 후보를 "대사 스크립트에
  추가"(dialogueScript에 이어붙임) 또는 "선택한 말풍선에 삽입"(`patchDialogueText` 재사용, 이중 구현
  없음) 두 경로로 반영. 캔버스에 이미 배치된 대사가 있으면 맥락으로 함께 보낼지 선택하는 체크박스 포함
  (`joinDialogueContextLines`가 문자수 상한 초과 시 최근 대사부터 보존).
- 검증: tsc / `eslint --max-warnings=0` / vitest(199 files·3763 tests) 전부 클린. 브라우저 검증
  (데스크톱 1440x900 + 모바일 390x844)으로 미설정 안내·API 키 등록 후 활성화·실제 fetch 엔드포인트·실패
  에러 렌더링까지 확인.
- 함정: 새 팝오버 섹션이 popover의 `overflow-y-auto` 스크롤 영역 밖(뷰포트 아래)에 있으면
  chrome-devtools MCP의 click 툴이 "interactive 상태 안 됨" 타임아웃을 낸다 — `scrollIntoView` 후
  `evaluate_script`로 직접 `.click()`을 디스패치하면 우회된다(아래 팔레트 추천 검증에도 동일하게 적용).

### AI 색상 팔레트 추천 (완료, 프로덕션 배포됨) — design 문서 없이 신규 설계
장르/무드를 텍스트로 설명하면("스릴러, 어둡고 차가운 느낌" 등) 웹툰 장면에 어울리는 색상 팔레트(5~6색 +
각 색의 용도 설명)를 제안받고, 바로 기존 팔레트 라이브러리에 저장할 수 있는 기능. 대사/나레이션 제안과
동일한 이유(결과가 이미지가 아니라 구조화 데이터)로 `runWithAiNotice` 게이트를 타지 않는다.

- **새 팔레트 타입을 만들지 않았다** — `studio-palette-library.ts`의 기존
  `StudioNamedPalette`(`{ id, name, createdAt, updatedAt, colors: string[] }`, 정규화된 소문자
  `#rrggbb`)와 GPL 가져오기/내보내기 포맷을 그대로 조사한 뒤, AI 제안 색을 같은 `colors: string[]`
  형태로만 반환하도록 설계해 `createPalette(name, colors)` + `savePalette`를 그대로 재사용했다.
- `studio-palette-suggest.ts`(순수) — 프롬프트 구성(`buildPaletteSuggestPrompt`, 정확히 5~6색 지시) +
  응답 파싱(`parsePaletteSuggestResponse` — 최상위가 이름+색 목록을 함께 담는 JSON **객체**라
  `studio-scenario-scenes.ts`와 동일하게 중괄호 짝matching으로 추출). 색 값 검증은 새로 만들지 않고
  `studio-color-utils.normalizeHexColor`를 재사용 — 통과하지 못하는 hex 항목은 환각/오타로 간주해
  조용히 건너뛴다(대사 제안의 "빈 text 건너뛰기"와 동일한 방어 전략).
- `studio-ai-client.ts`: `suggestColorPalette` 추가(Chat Completions 얇은 래퍼, `suggestDialogueLines`와
  동일 패턴).
- `StudioPaletteSuggestPanel.tsx`(신규, 프레젠테이션 전용·무상태) — "AI 어시스트" 서브탭에 5번째 섹션으로
  편입(대사/나레이션 제안 바로 아래). 색상 스와치 + 용도 설명을 나열하고 "내 팔레트에 저장" 버튼 하나로
  끝난다 — 저장 자체는 `StudioPage.tsx`가 `createPalette`/`savePalette`를 직접 호출해서 하고, 이 패널은
  `PaletteSuggestion`을 그대로 부모에 넘기기만 한다(`studio-palette-library` 타입조차 모른다).
  `StudioPaletteLibraryPanel`은 `menu==="palette"`일 때만 마운트되는 자기완결형 컴포넌트라(팔레트
  목록을 자체 `useState` lazy 초기화로 들고 있음), 저장 직후 별도 동기화 없이도 다음에 "스타일 → 팔레트"
  탭을 열면 localStorage에서 새로 저장된 팔레트를 자동으로 읽어온다.
- 검증: tsc / `eslint --max-warnings=0` / vitest(201 files·3791 tests, 신규 3파일 28개 테스트 포함)
  전부 클린. 브라우저 검증(데스크톱 1440x900 + 모바일 390x844, `window.fetch`를 팔레트 JSON으로
  모킹)으로 미설정 안내 → 생성 → 스와치·용도 렌더 → "내 팔레트에 저장" → localStorage
  `toonspectrum-studio-palette-library`에 `StudioNamedPalette`와 완전히 같은 구조로 반영 → "스타일 →
  팔레트" 탭에서 5개 스와치 그대로 노출까지 왕복 확인. 콘솔 에러 없음.

### 전체 스위트 최종 검증(2026-07-05) 중 발견 & 수정 — "AI 어시스트" 5섹션 팝오버가 데스크톱에서 푸터와
겹치는 렌더 깨짐
대사/나레이션 제안 + 색상 팔레트 추천 두 섹션이 추가되면서 "AI 어시스트" 서브탭 콘텐츠가 배경생성·
캐릭터일관성·구도제안·대사제안·팔레트추천 5개 섹션(약 1335px)으로 늘어났다. `groupPopoverClass`는
데스크톱(`lg:`)에서 `lg:max-h-none lg:overflow-visible`로 높이 제한을 풀어(중첩 select/드롭다운이
잘리지 않도록) 페이지 자체 스크롤에 위임하는 설계인데, 이 콘텐츠 높이가 처음으로 뷰포트+본문 자연
높이를 넘어서면서 절대 위치(`position: absolute`)로 렌더되는 팝오버가 시각적으로 푸터 영역까지
내려가는 상황이 처음 발생했다. 이때 라우트 래퍼(`route-stage--settled`)에 걸린 `isolation: isolate`가
팝오버의 `z-[60]`을 그 스택 컨텍스트 안에 가둬버려서, DOM에서 나중에 오는 형제 요소인 `<footer>`가
그 위에 그려짐 — 브라우저에서 실측(1440×900)해 보니 "이용 안내/문의/이용약관/저작권·콘텐츠 안내" 등
푸터 텍스트가 "AI 캐릭터 일관성 생성"·"AI 배경 생성" 섹션의 입력창·버튼 위에 그대로 겹쳐 그려졌다
(단순 시각적 결함이 아니라 `elementFromPoint` 실측으로 겹치는 영역의 클릭도 푸터가 가로챌 수 있는
상태였다). **수정**: 그룹 팝오버 전체(`groupPopoverClass`)를 건드리지 않고(다른 그룹의 중첩 드롭다운
보존), "AI 어시스트" 콘텐츠를 감싸는 내부 div에만 `max-h-[calc(100dvh-13rem)] overflow-y-auto`를
브레이크포인트 상관없이 항상 적용 — 말풍선 그룹이 이미 쓰던 "그룹 팝오버는 열어두고 내부 리스트만
따로 스크롤"(`overflow-y-auto max-h-[56vh] lg:max-h-[calc(100dvh-24rem)]`, line ~11494) 패턴과 동일한
결의 독립 스크롤 컨테이너다. 수정 후 실측: 내부 컨테이너 `scrollHeight 1335 / clientHeight 692`로
스크롤 가능 확인, 5개 섹션 전부 팝오버 안에서만 스크롤되고 푸터와의 겹침 없음. 앞으로 이 서브탭에
섹션이 더 늘어나도(다음 사이클) 같은 방식으로 안전하다 — **다만 다른 그룹(에셋/배경/스타일)의 서브탭도
콘텐츠가 이 정도로 늘어나면 동일한 패턴(개별 콘텐츠 wrapper에 자체 max-height+overflow-y-auto)을
적용해야 한다는 점을 새 기능 추가 시 유념할 것**. tsc/eslint/vitest(201 files·3791 tests) 전부 재검증
클린.

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
- **캐릭터 일관성 유지 생성**(젠툰 핵심 기능) — 완료됨(2026-07). 위 §2 "캐릭터 일관성 유지 생성" 참고
  (참고 이미지 image-to-image 근사로 착수·통합 완료됨). IP-Adapter/캐릭터 LoRA 같은 완전한 전문 기법은
  여전히 스코프 밖(이 프로젝트는 자체 추론 서버를 둘 수 없음).
- **시나리오 기반 완전 자동 컷+말풍선 배치**(투닝/투툰/WeToon 공통) — 완료됨(2026-07, 실용적 "첫
  버전" 스코프). 위 §2 "시나리오 기반 자동 컷+말풍선 배치" 참고. 텍스트 생성(장면 분할)+이미지 생성
  (각 컷, 캐릭터 일관성 생성 재사용)+기존 말풍선 시스템(studio-dialogue.ts)을 체이닝하는 멀티스텝
  워크플로로 착수·통합 완료. 비율 다양 지원은 이미 Magic Resize(2차 배치)로 상당 부분 커버돼 이번엔
  손대지 않음. 다음에 확장할 수 있는 부분(§4 참고): 장면 텍스트를 이미지 생성 전에 검토·수정하는
  중간 단계, 장면별 재시도(전체 재생성 없이), 진짜 네트워크 레벨 취소(AbortController), 새 페이지에
  생성하는 옵션.
- **미리캔버스 스타일 카드뉴스 대량 생성** — 위 "Bulk create/data-merge" 배제 사유와 동일(웹툰 사용
  사례와 불일치)이라 재검토 시에도 낮은 우선순위로 유지 권장.

### 실제 파일/에셋 소싱이 필요해 별도 트랙인 것
- **VRM 캐릭터 "노인" 카테고리** — 완료됨(2026-07). 위 §2 "VRM 캐릭터 '노인' 카테고리 소싱" 참고.

---

## 4. 향후 구현 로드맵(우선순위 제안)

다시 고도화할 때 이 순서를 권장한다(가치·리스크 대비 판단):

1. **AI 생성 transport의 운영 검증** — 서버/BYOK 호출 형식과 안전한 오류 표시는 검증됨. 서버 경로의
   브라우저 연결 종료를 upstream 취소로 전달하고, 다중 인스턴스 공용 사용량 원장을 추가하는 비용 안전성
   보강이 다음 우선순위. 실제 제공자 호출은 유효하고 잔액이 있는 사용자 키가 있을 때만 가능.
2. ~~**캐릭터 일관성 생성**(젠툰 벤치마크)~~ — 완료됨(2026-07, §2 "캐릭터 일관성 유지 생성" 참고).
3. ~~**VRM 캐릭터 노인 카테고리 소싱**~~ — 완료됨(2026-07, §2 참고).
4. ~~**시나리오 기반 자동 컷+말풍선 배치**(투닝/투툰/WeToon 공통)~~ — 완료됨(2026-07, "첫 버전"
   스코프. §2 "시나리오 기반 자동 컷+말풍선 배치" 참고). 텍스트 생성(장면 분할)+이미지 생성(각 컷,
   캐릭터 일관성 생성 재사용)+기존 말풍선 시스템(studio-dialogue.ts)을 체이닝. 장면별 검토·재시도,
   프런트 네트워크 취소, 현재/새 페이지 적용은 완료됐고, 다음 확장은 premise→outline→beats→dialogue/SFX
   단계와 필드별 제안 수락/거절을 갖춘 작가실 문서임.
5. **Pexels/Pixabay 등 스톡 이미지 소스 추가** — Unsplash와 완전히 동일한 BYOK 아키텍처 복제 수준이라
   구현 리스크는 낮지만, 이미 Unsplash가 있어 한계효용은 "소스 다양화" 정도(우선순위 낮음).
6. **전체화면 모달 4개의 사이트 헤더 가림 확인·수정**(StoryboardGrid/ScrollPreview/Timelapse/
   Background3D) — 시나리오 자동 생성 개발 중 헤드리스 브라우저로 발견한 잠재 버그(§2 "시나리오 기반
   자동 컷+말풍선 배치" 마지막 항목 참고): 이 앱의 라우트 콘텐츠 래퍼(`route-stage`)가
   `isolation:isolate`를 걸어놔서, 그 안에 있는 z-[80] 전체화면 모달은 z-index를 아무리 높여도 사이트
   전역 고정 헤더(z-50, route-stage 밖의 형제)보다 뒤에 그려질 가능성이 높다(제목표시줄이 사이트
   헤더에 가려짐). 시나리오 모달/AI 최초 사용 고지는 `createPortal(..., document.body)`로 이번에
   수정했지만, 이 4개 기존 모달은 실제로 재현되는지 확인 후 같은 방식으로 고쳐야 한다(이번 사이클은
   범위 밖으로 남겨둠).

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
