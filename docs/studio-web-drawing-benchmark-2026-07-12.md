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

## 2026-07-14 상용급 선 보정·입력 정확성 체크포인트

Clip Studio Paint의 [Correction 설정](https://help.clip-studio.com/en-us/manual_en/810_subtools/C.htm),
Krita의 [Freehand Brush Tool](https://docs.krita.org/en/reference_manual/tools/freehand_brush.html),
Procreate의 [Brush Studio 안정화 설정](https://help.procreate.com/procreate/handbook/5.4/brushes/brush-studio-settings),
Photoshop의 [Stroke smoothing](https://helpx.adobe.com/sg/photoshop/desktop/repair-retouch/clean-restore-images/create-smoother-more-polished-brush-strokes-with-stroke-smoothing.html)을
공식 동작 근거로 대조했다. 경쟁사의 명칭·화면·알고리즘을 복제하지 않고, 브라우저의 coalesced/predicted
PointerEvent 경계와 ToonSpectrum의 결정적 문서 모델에 맞게 다음 기능으로 번역했다.

- **세 가지 라이브 보정 방식**: 기존 고정 응답인 `표준`, 느린 디테일에서는 보정을 강화하고 빠른 플릭에서는
  지연을 줄이는 `속도 적응`, 원형 데드존을 가진 가상 가이드 끈 방식의 `정밀 추적`을 제공한다. 표준/적응
  응답은 샘플 사이 선형 이동을 연속시간 EMA로 적분하고, 속도와 정밀 반경은 CSS 화면 좌표로 환산해
  60/120/240Hz 포인터 샘플 주기와 캔버스 줌 배율이 달라도 조작감을 유지한다.
- **입력 보정과 후보정 분리**: 펜을 움직이는 동안의 안정화와 펜을 놓은 뒤의 좌표 정리를 별도 0~10 값으로
  저장한다. 후보정은 넓은 이웃의 진행 방향을 검사해 의도적인 각점을 그대로 둘 수 있다.
- **실제 시간 기반 마우스·터치 필압**: 캔버스 좌표의 샘플 간 거리가 아니라 PointerEvent의 CSS 화면 좌표와
  `timeStamp`로 px/ms를 계산한다. 확대 배율과 60/120/240Hz 샘플 밀도 차이가 굵기를 바꾸는 문제를 줄였다.
- **필압 곡선 의미 수정**: 엔진의 `pressure^exponent`와 UI를 일치시켜 `민감하게=0.65`, `기본=1`,
  `단단하게=1.8`로 제공한다. 약한 힘에 빠르게 반응하는 설정과 더 눌러야 굵어지는 설정이 이름대로 동작한다.
- **모바일 동등 조작**: 데스크톱 검사기와 모바일 드로잉 시트가 같은 공용 선 보정·필압 입력 컴포넌트를
  사용한다. 모바일은 44px 이상 행과 큰 슬라이더를 유지하면서 표준/적응/정밀 모드를 모두 바꿀 수 있다.
- **브러시 프리셋 v3**: 안정화 방식, 후보정 강도, 각점 보존을 사용자 브러시에 저장하고 JSON으로 왕복한다.
  v2 이하 데이터는 `속도 적응 / 후보정 4 / 각점 보존` 기본값으로 안전하게 마이그레이션한다.
- **한 점 탭 보존**: 점묘·짧은 스타일러스 탭·지우개 탭을 유효한 한 획/한 undo로 커밋하고, 캔버스와 SVG에서
  같은 압력 굵기의 원으로 렌더한다.
- **수채 SVG 보존**: 수채 획을 일반 펜 path로 내보내지 않고, 기존 결정적 수채 플래너의 core/diffuse dab과
  방사 그라데이션을 SVG primitive로 직렬화한다.

다음 브러시 엔진 우선순위는 압력·기울기·속도·진행률 센서를 크기/불투명도/유량/간격/각도에 독립 연결하는
다이내믹 매트릭스, 공통 시작·끝 테이퍼, PNG 알파 팁·간격·산포·질감 스탬프 엔진 순이다. ABR은 비공개
포맷 호환으로 분리하고, 먼저 ToonSpectrum 자체 브러시 문서 모델과 PNG 팁 저작을 완성한다.

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

## 2026-07-12 공유 작품·원본 문서 ACL 체크포인트

Clip Studio Teamwork의 **참여 작품을 별도 목록에서 찾아 여는 흐름**과 Magma Artspace의
**프로젝트 단위 역할 접근**을 ToonSpectrum의 서버 revision 모델에 연결했다. 경쟁 제품의 배타 페이지
편집이나 공유 캔버스를 곧바로 CRDT 실시간 편집으로 과장하지 않고, 먼저 모든 원본 읽기·저장 경로가
같은 ACL과 충돌 규칙을 강제하도록 만들었다.

- `GET /creator/team/works`에서 내가 소유한 작품과 수락한 팀 작품을 최근 수정순으로 함께 조회
- 목록에는 작품 ID·제목·작품 형식(`cuttoon / upload`)·소유자 표시명·역할·capability·수정 시각만 포함하고 cover/pages/doc/revision,
  사용자 ID, 초대 토큰은 제외해 모바일 응답과 개인정보 노출을 최소화
- `updatedAt`이 없는 레거시 작품은 `createdAt`, 최종적으로 결정적 epoch로 폴백하고, PostgreSQL의
  microsecond와 JavaScript millisecond 정밀도 차이를 `date_trunc('milliseconds', ...)`로 통일
- 수정 시각 내림차순 뒤 작품 ID 내림차순을 tie-breaker로 쓰는 opaque cursor keyset 페이지네이션으로
  50개를 넘는 팀 원고도 중복·누락·무한 경계 반복 없이 계속 조회
- owner/admin/editor는 원본 읽기·저장, commenter/viewer는 원본 읽기만 허용하며 pending/declined는 차단
- non-owner는 작품 소유자 계정도 `active`일 때만 목록·원본 읽기·저장이 가능
- `GET /creator/works/:id/team/document`는 공개용으로 축약된 doc가 아니라 재편집 원본과 현재 revision을
  private/no-store 응답으로 제공
- `GET /creator/works/:id/team/document/meta`는 포커스 복귀·권한 변경 확인 때 제목·표지·페이지·doc·소유자
  정보를 다시 내려받지 않고 역할·capability·revision·수정 시각만 확인
- `PATCH /creator/works/:id/team/document`는 `baseRevision`과 최소 1개 변경 필드를 요구하고,
  시리즈·챌린지·리믹스 관계, hidden, revision 등 소유 관계/관리 필드는 strict 거부
- 생성 후 작품 형식은 데이터 구조 계약으로 보고 공동 PATCH에서 `format`을 DTO·클라이언트 allow-list와
  repository/SQL primitive 양쪽에서 거부해 editor가 업로드↔컷툰을 우회 전환하지 못하게 함
- 같은 endpoint를 쓰더라도 `status`와 `titleId`는 owner에게만 허용해 admin/editor가 작품을
  게시·비공개 전환하거나 카탈로그 연결을 바꾸지 못하며, 팀 편집자는 원고 콘텐츠만 저장
- 작품 행 → non-owner의 경우 소유자 행 순으로 잠근 같은 transaction에서 ACL 재검증, revision 비교,
  조건부 UPDATE, 새 전체 snapshot 삽입, 최근 20개 retention을 처리
- UPDATE SQL에도 active owner와 active admin/editor membership을 correlated `EXISTS`로 다시 넣어 내부 호출
  실수와 역할 회수 경쟁에서도 fail-closed
- Drizzle alias를 raw SQL에 잘못 보간해 원본 테이블 없는 `FROM alias`가 생기지 않도록 query-builder
  subquery를 사용하고 생성 SQL의 실제 테이블+alias를 자동 검사
- stale 저장은 문서 내용 없이 `409 creator_work_revision_conflict`와 현재 revision만 반환
- snapshot 삽입 실패는 문서 본문·revision·updatedAt까지 롤백하고, 충돌·권한 거부는 UPDATE/INSERT 0회
- 팀 패널의 **팀 작품** 목록에서 역할, 저장 가능 여부, 최근 수정 시각을 확인하고 컷툰은
  `/studio?id=...`, 업로드형은 `/studio?mode=upload&id=...`로 형식 보존 전환
- 목록 높이는 `min(18rem, 42dvh)` 안에서 독립 스크롤하고 50개 단위 **작품 더 불러오기**를 제공해
  팀 메뉴 전체가 하단 도크·푸터 뒤로 길어지지 않게 유지
- 로그인 계정 scope를 목록·문서·저장 응답에 함께 묶고 A→B 계정/작품 전환 뒤 도착한 응답은 UI·이동·
  자동저장 정리에 적용하지 않음
- 기존 작품 편집은 owner도 같은 공유 문서 GET/PATCH를 사용하며, owner-only 연출/버전 상세는 revision이
  정확히 일치할 때만 보조 기능에 연결
- viewer/commenter는 캔버스 포인터·Transformer·undo/redo·페이지/마스터/레이어/가져오기·로컬 댓글·
  게시 메타·서버 저장을 잠그고, 스크롤·미니맵·내보내기와 팀 패널은 유지
- 권한 로딩 중에는 빈 초기 캔버스 저장과 autosave를 차단하고, 실패하면 무한 로딩으로 위장하지 않고
  잠금 이유와 44px 재시도 경로를 표시
- 계정·작품·권한·문서 generation ticket을 비동기 AI/파일 가져오기/클립보드/복원/저장에 적용해,
  계정 전환이나 권한 회수 뒤 늦게 끝난 작업이 새 계정 원고에 반영되지 않도록 차단
- 공동 원고 로컬 자동저장에는 출처 작품 ID와 서버 revision을 함께 기록하고 둘이 현재 원본과 정확히
  일치할 때만 자동 복구하며, 불일치·레거시는 원본에 적용하지 않고 JSON 백업으로 수동 병합 가능
- 업로드형 원고도 같은 shared document ACL을 사용해 owner/admin/editor는 revision 기반 공동 저장,
  commenter/viewer는 이미지·메타·저장 모두 읽기 전용으로 제공하고 owner만 공개 상태를 변경
- 업로드 저장 직전 UTF-8 JSON 실제 직렬화 크기를 측정해 서버 16MB 한계보다 낮은 15MB에서 선제 차단하고,
  원본 파일 1장/선택 묶음 크기와 PNG·JPEG·WebP 헤더의 실제 해상도를 디코딩 전에 검사해 모바일 OOM 완화
- 최대 40장 업로드 목록은 `52dvh / 36rem` 독립 스크롤과 content visibility를 사용하고, 320px에서는
  이동·삭제 44px 조작을 별도 행으로 재배치하며 저장 액션은 정상 흐름에서 입력 뒤에 배치한 뒤 도달
  시에만 상단 safe-area에 고정해 작품 정보·하단 푸터를 덮지 않게 유지

공식 근거:

- [Clip Studio Teamwork](https://tips.clip-studio.com/en-us/articles/4777)
- [Magma Artspaces](https://help.magma.com/en/articles/13346727-introduction-to-artspaces)
- [Magma 역할·참가자 권한](https://help.magma.com/en/articles/13713941-managing-your-canvas-permissions-roles-and-participants)
- [Magma 레이어 제어](https://help.magma.com/en/articles/6413262-creating-a-layer-and-layer-controls)

현재 `commenter`는 **검토 전용 원본 열람 역할**이며 서버 앵커 댓글을 제공한다고 표시하지 않는다. 인증
Socket.IO frontend adapter는 아래 체크포인트에서 Studio 팀 패널까지 연결됐지만, live room을 패널 밖으로
올리고 캔버스 overlay/mutation guard를 연결하기 전에는 완성된 온라인 공동 편집으로 표시하지 않는다. 서버
리뷰 스레드와 operation stream도 각각의 권한 predicate·만료·복구 테스트를 연결한 뒤에만 제공 기능으로 표시한다.

검증 범위:

- 신규/회귀 API·클라이언트·팀 UI·업로드·저장 용량 경계 대상 16개 파일, 287개 테스트 통과
- owner/admin/editor/commenter/viewer·pending/declined, 비활성 소유자, stale revision, snapshot rollback 검증
- 생성된 PostgreSQL UPDATE의 correlated 원본 테이블 alias와 revision 조건을 `toSQL()`로 검사
- 개발 PostgreSQL에 기존 forward-only 협업 멤버십·감사 migration을 적용하고, 실제 HTTP에서 소유자 초대 →
  편집자 수락 → 형식별 keyset 목록 → 원본/meta 조회 → revision 저장 → stale 409 → owner 필드 403 →
  viewer 읽기 200/쓰기 403 → 삭제 cascade까지 확인
- `tsx` 개발 서버에서도 explicit Zod pipe로 `limit=1` cursor 페이지가 1건씩 중복 없이 이어지고,
  범위 밖/unknown query와 shared `format` 변경 body가 500이 아닌 strict 400으로 종료됨을 확인
- 1280×900 팀 우측 패널과 375×812 팀 하단 시트·업로드 화면을 실캡처하고, 모바일 팀 패널 하단
  `700px`, 도구막대 상단 `700.40625px`, 겹침 `0px` 확인
- 모바일 업로드 저장 도크를 작품 정보와 겹치지 않는 상단 sticky 방식으로 재배치하고 입력/도크 겹침
  `0px`, 브라우저 콘솔 오류 `0건` 확인

## 2026-07-12 로컬 같이 보기·Socket.IO 서버 코어 체크포인트

Magma/Figma식 인터넷 공동 편집 전체를 한 번에 주장하지 않고, 개인정보 범위가 작은 로컬 탭 화면 공유와
권한을 강제하는 서버 실시간 코어를 분리해 구축했다.

- 팀 패널의 **같이 보기**는 기본적으로 같은 출처 `BroadcastChannel` 탭만 연결하며 `로컬 탭 미리보기`,
  `같은 출처 탭 연결`로 표시한다. 인증된 서버 transport가 주입되지 않은 상태를 인터넷 팀 세션으로 표시하지 않는다.
- 로컬 protocol은 작품 범위, exact key, 64KiB envelope, 과거/미래 시각, sequence replay, target session,
  정규화 cursor, SDP/ICE 크기와 제어 문자를 검증한다. DB user ID·인증 토큰·API 키·캡처 영상은 envelope에 넣지 않는다.
- `navigator.mediaDevices.getDisplayMedia()`는 사용자가 **화면 공유**를 직접 누를 때만 호출하고, audio는 요청하지
  않으며 브라우저가 예외적으로 반환한 audio track도 즉시 중지한다.
- 다른 탭의 시청 요청은 호스트의 승인 대기 목록에만 들어간다. 호스트가 개별 승인하기 전에는
  `RTCPeerConnection`, 영상 track 추가, offer 생성이 발생하지 않는다.
- 승인 대기 8건, 동시 시청자 4명 상한과 승인/거절/강제 종료 UI를 두고, 중복 capture Promise·늦게 반환된
  track·offer 전 ICE·늦은 참가자·presence 만료를 모두 cleanup한다.
- `/studio-live` Socket.IO gateway는 namespace middleware에서 세션 인증을 끝낸 뒤 연결을 허용하고,
  세션 expiry/sessionVersion, active work ACL, 작품 전환 generation을 재검증한다.
- 서버는 presence, 정규화 cursor, editor lease soft-lock, 화면 공유 상태, 대상 지정 WebRTC signaling만
  메모리에 중계하며 영상·문서·SDP/ICE를 DB에 저장하지 않는다.
- 권한 확인과 mutation/relay 사이의 microtask 경합을 공통 동기 실행 경계와 양 peer generation snapshot으로
  차단한다. 첫 ICE는 sender/target ACL을 엄격히 재확인하고 같은 work·share·peer pair에만 고정 2초 grant를
  사용해 trickle ICE의 DB 폭증을 줄이며, candidate hit로 TTL을 연장하지 않는다.
- SDP·ICE는 code unit뿐 아니라 원문 UTF-8과 JSON escape 본문의 byte 상한을 모두 지키고, join·화면 상태·
  signaling rate limit은 세션/ACL I/O보다 먼저 적용한다. speculative join 중 세션 만료는 adapter leave를
  기다리지 않고 즉시 disconnect한다.
- WebSocket upgrade는 일반 CORS header에 기대지 않고 `allowRequest`에서 Origin allow-list를 강제하며,
  Vite 개발 서버는 `/socket.io`를 `ws: true`로 Nest에 프록시한다.
- 실제 두 클라이언트 E2E에서 즉시 인증 참가, 2명 presence, cursor relay, 경쟁 잠금 거부, 화면 상태,
  대상 signaling, 잠금 해제, DB user ID 비노출과 악성 Origin 거부를 확인했다.

후속 체크포인트에서 `StudioLiveEnvelope`와 서버의 `studio:*` event contract를 번역하는 인증 Socket.IO
frontend adapter를 팀 패널에 연결했다. join ACK 전 fail-closed, reconnect 재참가, 권한 회수 terminal 상태,
서버 connection ID 변환, authoritative lease ID, 화면 공유 승인 이벤트와 종단 간 `shareId`, 명시적인 로컬
fallback을 제공한다. 다만 패널을 닫아도 유지되는 live room, remote cursor overlay, 실제 mutation guard, 서버
anchor comment, operation stream/CRDT, TURN, 다중 인스턴스 Redis lease는 후속 범위다. 현재 lease는 HTTP 문서
저장을 강제하는 배타 잠금이 아니라 충돌을 줄이는 soft-lock이다.

실제 Studio 브라우저 탭 두 개에서 서버 participant가 양쪽 모두 2명으로 수렴했고, 서버 중단·복구 후 자동
재접속과 작품 ACL 재참가도 확인했다. 375×812 팀 패널은 하단 `700px`, 모바일 도크는 `700.40625px`에서
시작해 겹침이 `0px`이었고, 화면 공유 조작은 44px을 유지했다. 별도 두 소켓 runtime signaling 검사는
announce→request→approved→offer→ICE의 명시적 `shareId` 보존과 누락 payload의 strict 거절을 확인했고,
검사용 임시 작품 잔여가 0건임을 확인했다.
