# ToonSpectrum Studio — 웹 드로잉·협업 도구 벤치마크

조사일: 2026-07-12

대상: Clip Studio Paint Companion/Simple Mode, Photopea, Kleki, Magma, Pixlr

원칙: 공식 제품 문서와 공식 도움말에서 확인되는 동작만 기능 근거로 사용한다. 경쟁사의 화면이나 명칭을
복제하지 않고, 웹툰 작가의 반복 작업·입력 품질·모바일 조작성·협업·파일 호환성 문제를 해결하는 방향으로
ToonSpectrum의 문서 모델과 UI에 번역한다.

## 제품별로 가져올 장점

| 제품 | 공식 문서에서 확인한 장점 | ToonSpectrum 적용 방향 |
| --- | --- | --- |
| Clip Studio Paint | 설치형 본 앱의 pressure/tilt/velocity 브러시 입력, Simple/Studio 모드, Companion의 Quick Access·색상환·제스처·참조·세로 웹툰 미리보기, 페이지 단위 Teamwork | 실제 펜 입력을 마우스 폴백보다 우선하고, Simple/Full/Focus UI와 향후 제한 권한의 휴대폰 보조 세션으로 확장 |
| Photopea | 브라우저 로컬 처리, PSD 중심 문서, 중첩 레이어·래스터/벡터 마스크·조정 레이어·클리핑·스마트 필터·레이어 스타일 | PSD 구조 보존도를 높이고 현재 이미지별 보정 엔진을 재정렬 가능한 조정 레이어/스마트 필터 스택으로 승격 |
| Kleki | 설치 없는 즉시 시작, 작은 화면 UI, 터치 제스처, 필압 크기/불투명도, 간단한 레이어·보정·PSD 출력 | 초보용 Simple 모드와 빠른 첫 획, 모바일에서 핵심 도구 우선, 고급 기능은 검색·전체 화면 시트로 접근 |
| Magma | 브라우저 공동 드로잉, 최대 30명 실시간 커서·채팅, 역할·권한·레이어 소유권·댓글·버전, Super Simple/Simple/Full, pressure/tilt 기반 팁 동역학 | 서버 역할·초대·댓글→presence/remote cursor→soft lock→요소 operation 순으로 협업을 구축하고, tilt/twist 캘리그래피를 먼저 제공 |
| Pixlr | 웹/모바일 사진 편집, 레이어·마스크, 밝기/대비·커브·레벨·색상·LUT/HDR 계열 보정, 템플릿 중심 빠른 결과 | 이미 넓은 보정 기능을 새 필터 수보다 비파괴 스택·검색·즐겨찾기·최근 사용 UX로 정리 |

> Clip Studio Companion은 독립 브라우저 편집기가 아니라 설치형 Clip Studio Paint를 스마트폰에서
> 보조 조작하는 연결 모드라는 것이 공식 연결 절차와 지원 플랫폼을 종합한 결론이다. 따라서 브라우저
> 엔진으로 모사하기보다 ToonSpectrum의 향후 협업 세션 transport 위에 제한 권한 controller로 설계한다.

## 공식 근거

- Clip Studio Paint:
  [Companion Mode](https://help.clip-studio.com/en-us/manual_en/840_options/Companion_Mode.htm),
  [Simple/Studio Mode](https://help.clip-studio.com/en-us/manual_en/090_tablet/Simple_Mode_and_Studio_Mode.htm),
  [브러시 입력 설정](https://help.clip-studio.com/en-us/manual_en/240_brushes/Customizing_brush_tools.htm),
  [Teamwork](https://help.clip-studio.com/en-us/manual_en/570_pages/Teamwork.htm),
  [웹툰 미리보기·분할 출력](https://help.clip-studio.com/en-us/manual_en/540_comic/Webtoons.htm)
- Photopea:
  [공식 Learn](https://www.photopea.com/learn/),
  [브러시·스타일러스 필압](https://www.photopea.com/learn/brush-tools),
  [PSD 열기·저장](https://www.photopea.com/learn/opening-saving),
  [마스크](https://www.photopea.com/learn/masks),
  [조정·스마트 필터](https://www.photopea.com/learn/adjustments-filters),
  [레이어 스타일](https://www.photopea.com/learn/layer-styles)
- Kleki:
  [소개·로드맵](https://kleki.com/about/),
  [공식 도움말](https://kleki.com/help/),
  [변경 내역](https://kleki.com/changelog-summary/)
- Magma:
  [제품 소개](https://help.magma.com/en/articles/6383647-what-is-magma),
  [실시간 공동 작업](https://help.magma.com/en/articles/6613957-first-steps),
  [필압 설정](https://help.magma.com/en/articles/6413264-setting-up-pen-pressure-sensitivity),
  [브러시 tilt 동역학](https://help.magma.com/en/articles/6871478-brush),
  [레이아웃 모드](https://help.magma.com/en/articles/10586978-magma-layout-modes),
  [역할·권한](https://help.magma.com/en/articles/13713941-managing-your-canvas-permissions-roles-and-participants),
  [채팅·통화·댓글](https://help.magma.com/en/articles/8422203-how-to-chat-with-others-calls-chats-and-comments)
- Pixlr:
  [제품 페이지](https://pixlr.com/),
  [Pixlr Editor](https://pixlr.com/editor/),
  [필압 브러시 공식 글](https://pixlr.com/blog/get-creative-with-pixlrs-brand-new-brush-feature/),
  [모바일](https://pixlr.com/mobile/),
  [레이어 PSD 지원 제품군](https://pixlr.com/tools/pixlr-suite/)

Pixlr의 필압 근거는 2022년 공식 게시물이므로 현재 브라우저·기기 조합별 런타임 검증을 계속 유지한다.
Photopea·Kleki·Pixlr의 tilt 및 실시간 역할 기반 협업은 조사한 공식 문서에서 확인하지 못했으며, 기능이
절대 없다고 단정하지 않는다.

## 현재 ToonSpectrum의 강점과 확인된 격차

이미 제공하는 강점:

- PointerEvent 하드웨어 필압, coalesced event, 손떨림 보정, 속도 기반 마우스 폴백
- 펜/G펜/마커/형광펜/붓/연필/스크린톤과 사용자 브러시 JSON 라이브러리
- 레이어·그룹·블렌드·클리핑·알파 잠금·이미지 마스크
- 커브·레벨·색상 균형·채널 믹서·Selective HSL·그라디언트 맵·하프톤 등 광범위한 보정
- 모바일 하단 도크, visual viewport·safe area, 두/세 손가락 제스처, Quick Actions
- 웹툰 목적지별 자동 분할·검증, PNG/JPEG/WebP/PDF/PSD/SVG 출력

우선 격차:

1. Magma 수준의 서버 역할·초대·댓글·presence·remote cursor·soft lock
2. Photopea 수준의 PSD 중첩 그룹·마스크·편집 가능한 텍스트·스마트 오브젝트 왕복
3. 공통 마스크를 가진 조정 레이어와 재정렬 가능한 스마트 필터 스택
4. Clip Studio/Magma/Kleki식 Simple/Full/Focus UI 밀도
5. 레이어·마스크 썸네일, 병합/평탄화, 효과 검색·즐겨찾기·최근 사용

실시간 공동 편집은 전체 문서 JSON을 매 포인터 이동마다 전송하지 않는다. 먼저
`owner/admin/editor/commenter/viewer` ACL과 서버 댓글을 만들고, presence와 원격 커서, 페이지/요소 soft
lock, 요소 add/update/delete operation stream, 필요한 요소에만 세밀한 충돌 해결을 순차 적용한다.

## 2026-07-12 구현 체크포인트

- `calligraphy` 브러시 프리셋 추가
- coalesced PointerEvent마다 pressure, `tiltX`, `tiltY`, `twist`를 포인트와 같은 길이로 저장
- 타원형 펜촉의 이동 방향·각도·원형도·필압·tilt 강도·barrel twist를 반영하는 결정적 선분 엔진
- 마우스·터치·tilt 미지원 기기는 저장된 기본 촉 각도/원형도로 동일 결과 재현
- 실제 `pointerType=pen`의 0.2/0.5/0.9 필압을 속도 폴백보다 항상 우선
- 속도 필압을 “마우스 속도 필압”으로 명시하고 실제 스타일러스 필압이 없을 때만 사용
- 스무딩/포인트 솎기 뒤 필압을 출력 포인트 수에 선형 재표본화해 좌표·필압 인덱스 정렬
- `pointercancel`에서 미완성 획·원근/아이소메트릭 락·QuickShape 임시 상태 정리
- 브러시 라이브러리 JSON v2에 `tiltEnabled`, `tipAngle`, `tipRoundness` 저장 및 v1 자동 마이그레이션
- 캔버스, SVG 벡터 출력, 자동저장에서 같은 펜촉 결과와 스타일러스 메타데이터 보존
- 데스크톱 검사기와 모바일 독립 스크롤 시트에 캘리그래피 설정 제공

검증 범위:

- 관련 순수 로직·라이브러리·SVG·자동저장 테스트 150개 통과
- 합성 pen PointerEvent 5개 입력 후 point/pressure/tiltX/tiltY/twist 각 5개 자동저장 확인
- `pointercancel` 입력은 문서에 커밋되지 않음 확인
- 375×812 모바일 시트가 하단 도크와 겹치지 않고 독립 스크롤됨을 확인
- 브라우저 콘솔 오류·경고 0건

## 2026-07-12 팀 역할·초대 기반 체크포인트

Magma의 역할·권한 장점을 그대로 이름만 복제하지 않고, 이후 서버 댓글·presence·원격 커서·소프트
잠금이 같은 권한 근거를 쓰도록 작품 단위 팀 기반을 먼저 구축했다.

- 작품 소유자는 `creator_work.userId`로 단일 판정하고 멤버 테이블에서 중복하지 않음
- `admin / editor / commenter / viewer` 역할과 `pending / active / declined` 초대 상태를 PostgreSQL에 영속화
- 팀 조회·초대·역할 변경·제거·초대 수락/거절 API와 Zod strict DTO 제공
- 소유자·관리자는 전체 명단, 일반 멤버·초대 대상은 소유자와 자기 정보만 받는 최소 공개 응답
- 오래 열린 화면의 잘못된 수락을 막도록 초대·재초대·대기 역할 변경마다 UUID 동의 토큰 회전
- 초대 응답은 현재 UUID와 `pending` 상태가 모두 일치할 때만 같은 트랜잭션에서 반영
- 팀 조회도 작품 행 잠금 안에서 권한 판정과 명단 투영을 수행해 권한 철회 사이의 roster 노출 방지
- 비거절 멤버 100명 상한, 거절 후 24시간 재초대 쿨다운, 초대 요청 속도 제한
- 초대자 탈퇴 시 멤버십을 지우지 않도록 `invitedBy`를 nullable `ON DELETE SET NULL`로 보존
- 모바일 팀 패널을 하단 112px 도크 위에 고정하고 내부 스크롤·44px 조작·safe area·포커스 트랩 제공
- 다른 작품의 팀 응답, 알 수 없는 역할·상태·capability는 클라이언트에서도 fail-closed

이 체크포인트가 실제로 강제하는 범위는 **팀 멤버·초대·역할 관리**다. 기존 원본 문서 조회·저장·revision과
공개 댓글 API는 아직 소유자 전용이므로 non-owner의 `view / comment / edit` capability는 `false`로 유지한다.
다음 단계에서 원본 문서 조회, 공동 저장의 동일 SQL 권한 predicate, 실제 작업자 revision 감사, 서버 검토
댓글을 각각 연결한 뒤에만 “편집 가능” 또는 “실시간 협업”으로 표시한다.

브라우저 검증:

- 1280px 데스크톱 우측 패널과 375×812 모바일 하단 시트 확인
- 모바일 패널 하단 `700px`, 도크 상단 `700.4px`, 겹침 `0px`
- 모달을 앱 루트 밖 portal에 렌더링하고 배경 `inert`, Escape 닫기, 스크롤·포커스 복원 확인
- 브라우저 콘솔 오류·경고 0건

## 2026-07-12 팀 초대함·감사 활동 체크포인트

Magma의 협업은 캔버스 안의 커서뿐 아니라 초대 수락, 역할 변경, 변경 이력까지 하나의 운영 흐름으로
이어진다. ToonSpectrum도 실시간 편집을 성급히 표시하지 않고, 먼저 초대 대상이 직접 동의하고 관리자가
권한 변경을 추적할 수 있는 서버 기반을 연결했다.

- 저장 전 원고에서도 다른 작품의 `pending` 초대를 확인하는 **내 팀 초대** 인박스 제공
- 초대 카드에 작품 제목·소유자·요청 역할·초대 시각을 최소 공개하고 44px 수락·거절·새로고침 제공
- 수락/거절 시 현재 UUID 초대 조건을 함께 보내고, `409 invitation_changed`이면 낡은 카드를 버린 뒤 자동 재조회
- 작품 소유자와 활성 관리자만 접힌 **최근 팀 변경 기록**을 처음 펼칠 때 지연 조회
- 초대·재초대·수락·거절·역할 변경·내보내기를 멤버 변경과 같은 작품 행 잠금 트랜잭션에서 애플리케이션 append-only로 기록
- 감사 이벤트 저장 실패 시 멤버십 변경도 롤백해 권한 상태와 이력이 어긋나지 않도록 보장
- 감사 테이블에는 표시명·초대 UUID를 저장하지 않고 현재 사용자 이름을 조회 시 조인하며, 탈퇴자는 ID를 숨기고 익명화
- 동일 시각·서버 clock skew에도 실제 삽입 순서를 유지하는 PostgreSQL identity `sequence`와 동작별 JSON 전이 제약 사용
- 초대함은 로그인 사용자 자신의 대기 초대만, 감사 기록은 소유자/활성 관리자만 조회
- 정지·탈퇴 소유자의 초대는 목록에서 제외하고 응답 트랜잭션에서 소유자 행까지 잠근 뒤 `active`를 재검증
- 원본 프로필 data URL을 팀·초대 응답에서 제거해 최대 수십 MB 모바일 응답을 막고 이니셜 아바타로 표시
- 수락·거절 POST는 전체 팀 명단 대신 `{workId, role, status}`만 반환하고, 열린 저장 작품만 성공 후 팀을 재조회
- 클라이언트는 역할·상태·동작·UUID·날짜와 최상위 계약을 다시 검증하고 완전 손상 응답을 빈 상태로 위장하지 않음
- `authScopeKey`와 작품 ID로 모든 응답을 범위화하고 계정 A→B 전환 시 이전 초대·활동·동의 토큰을 즉시 폐기
- 감사 API와 DOM에는 초대 UUID를 포함하지 않으며, 초대 카드도 UUID를 화면·React key에 렌더링하지 않음
- 카드 제거 후 다음 초대 또는 새로고침으로 포커스를 이동하고, 비동기 버튼 상태·펼침 화살표·멤버 제거 포커스를 보강

이 체크포인트 역시 **초대 동의와 팀 운영 감사** 범위다. 수락한 팀원이 원고를 찾고 여는 공유 작품 목록,
권한 기반 원본 문서 조회·공동 저장, 서버 검토 댓글, presence·원격 커서·soft lock은 후속 체크포인트에서
실제 서버 predicate와 연결하기 전까지 제공한다고 표시하지 않는다.

검증 범위:

- 초대함·감사 저장소/DTO/서비스/컨트롤러와 클라이언트/뷰 대상 81개 테스트 통과
- 초대함 본인 범위, 활동 권한, 정렬·limit, 토큰 비노출, 손상 레코드 fail-closed 검증
- 감사 이벤트 실패 시 멤버십 롤백, DB 삽입 순서, 탈퇴 익명화, 개인정보·초대 UUID 비저장 검증
- 계정/작품 요청 범위, 비관리자 활동 0회 결정, 첫 펼침 1회 결정, 최소 응답과 정확한 카드 제거 검증
- 1280×900 우측 패널, 375×812 하단 시트 캡처 확인
- 모바일 패널 하단 `700px`, 도구막대 상단 `700.40625px`, 겹침 `0px`, 간격 `0.40625px`
- 앱 루트 `inert`, body/document 스크롤 잠금, Escape 닫기와 팀 버튼 포커스 복원 확인
