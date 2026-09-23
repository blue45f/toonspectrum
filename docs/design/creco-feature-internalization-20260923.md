# Creco 공개 기능 분석 및 ToonStudio 내재화

- 기준일: 2026-09-23
- 대상: `https://app.creco.so/ko/`, Creco 공개 제품 페이지 및 공개 사용 매뉴얼
- 구현 화면: `/production/projects/:projectId/manuscripts`
- 원칙: 외부 서비스의 UI·문구·브랜드를 복제하지 않고, 공개된 제작 문제와 사용자 흐름을 ToonStudio의 기존 권한·버전·검수 모델로 해결한다.

## 1. 단일 진실원

| 영역 | ToonStudio 진실원 | 내재화 방식 |
| --- | --- | --- |
| 워크스페이스·멤버·좌석 | Production Team Workspace | 소유자·관리자·멤버·게스트 및 Free/Team 운영 모드 재사용 |
| 프로젝트·회차·표준 공정 | Production aggregate | 작품/시즌/회차, 일정, 표준 공정, 담당자와 작업 상태 재사용 |
| 원고 파일·문서 | Studio ProjectGraph artifact | 원고를 Production에 재업로드하거나 복제하지 않음 |
| 버전 | Studio immutable revision | autosave/checkpoint/submission/review-snapshot/approved/release 사용 |
| 최종본 | artifact approved revision 및 승인 검수 | 최신 파일과 승인 최종본을 구분 |
| 비교·복원 | ProjectGraph version stack | 비교는 고정 revision, 복원은 과거 덮어쓰기 대신 새 checkpoint 생성 |
| 피드백 | Studio review/comment 및 pinned review | 페이지·컷·텍스트 anchor, severity, 해결 상태와 승인 게이트 재사용 |
| 공유 | pinned review share | 편집 head 대신 고정 snapshot을 공유하고 만료·폐기·권한 재검증 |
| 공식 전달 | review delivery | 승인 원본·checksum·manifest 기반 ZIP, 수신/발행/취소 기록 재사용 |
| 내보내기 | Studio export preflight | 플랫폼·SNS·인쇄·PDF·편집본·전자책·영상·보관 profile 재사용 |
| AI 보조 | Studio AI handoff | 대사·구도·배경·캐릭터·팔레트 요청을 편집기로 안전하게 전달 |

## 2. 공개 기능 매핑

### 계정·알림

- 로그인/프로필/비밀번호/언어: 공통 인증 및 프로필 설정을 사용한다.
- 개인 알림: Production inbox 및 Studio 프로젝트 알림을 사용한다.
- 초대 수락은 워크스페이스/프로젝트 권한과 분리해 처리한다.

### 워크스페이스

- 생성, 이름·설명·이미지 설정: Team Workspace.
- 멤버 초대·삭제·역할: owner/admin/member/guest와 세부 capability.
- 활동 내역: 워크스페이스 활동과 ProjectGraph revision/review 활동을 각각 보존한다.
- 좌석·플랜·사용량: `/production/workspaces/:workspaceId/usage`의 Free/Team 운영 모드와 사용량을 사용한다.
- 결제 사업자나 과금 사실을 UI에서 임의로 추정하지 않는다.

### 프로젝트

- 생성/기본 정보/메뉴: Production project와 Studio project shell.
- 멤버/프로젝트 권한: Production access와 ProjectGraph access를 모두 만족해야 한다.
- 공정 생성·관리: Production 표준 공정과 Studio 문서/asset 종류를 연결한다.
- 이미지 공정과 텍스트 공정은 artifact kind로 구분하며, 생성 후 종류를 임의 변환하지 않는다.

### 회차·원고

- 회차 목록·상태·게시 마감: Production Episode Operations.
- 회차 상세에서 `원고·버전`으로 이동하면 `episode` query를 보존한다.
- 대본/콘티/작화/배경·3D/식자·현지화/음성·BGM/납품/게시를 동일 프로젝트의 artifact로 표시한다.
- 프로젝트 전체 보기와 회차별 필터를 모두 제공한다.

### 버전

- 공정별 revision 수, 현재 head, 승인 최종본, 최근 활동을 표시한다.
- revision의 제목/메시지/작성 시각/종류를 표시한다.
- 기존 버전은 불변이며 복원은 새 checkpoint다.
- 최종본과 최신 작업본은 별도 상태다.
- 검수 snapshot은 이후 편집으로 바뀌지 않는다.

### 비교·보기 모드

- version stack과 pinned review 비교를 사용한다.
- 세로 원고, 페이지별 원고, 나란히 비교, overlay, 확대/이동은 기존 검수 viewer를 사용한다.
- 가로 개요/모바일 검수는 기존 반응형 검수 화면을 사용한다.
- Production 화면은 비교 이미지를 재렌더링하거나 임의 diff로 대체하지 않는다.

### 피드백

- 고정 revision에만 피드백을 작성한다.
- 페이지/컷/텍스트 범위 anchor를 지원한다.
- required/recommended/note를 지원하며 required가 열려 있으면 승인을 막는다.
- open/resolved/reopened/dismissed 상태와 resolution revision을 기록한다.
- 댓글, 답글, 초안 shelf, 선택 발행, 비교 이력은 pinned review workflow를 사용한다.
- Production의 창작 결정 lane과 Studio 원고 피드백은 서로를 자동 승인하지 않는다.

### 공유

- 공유는 편집 권한을 부여하지 않는다.
- 고정된 review snapshot만 공유한다.
- 만료·폐기·현재 접근 권한을 열 때마다 서버에서 다시 확인한다.
- 링크를 가진 사람의 신원을 창작자·권리자로 추정하지 않는다.
- 외부 피드백은 immutable receipt로 저장하고 내부 원고를 직접 수정하지 않는다.

### 내보내기·전달

- 플랫폼, SNS, 인쇄, 이미지/PDF, 편집 가능한 구조, 전자책, 영상, 보관 대상 profile을 제공한다.
- 권리·현지화·미해결 검수·규격을 사전 검사한다.
- 승인 검수본의 원본 이미지와 페이지 checksum을 ZIP으로 저장할 수 있다.
- 공식 전달은 수신자 binding과 상태 전이를 기록한다.
- 다운로드/전달은 게시, DRM, 법적 권리 인증을 의미하지 않는다.

### AI 보조

- 대사, 컷 구성, 배경 참고, 캐릭터 일관성, 팔레트 보조를 제공한다.
- Production은 prompt handoff만 만들고 실제 실행은 Studio 편집기에서 재확인한다.
- 공급자, 외부 전송, 비용을 실행 전에 확인한다.
- 결과는 원본을 덮지 않고 새 작업/사본으로 적용한다.
- AI 결과가 검수 승인, 계약 선정, 게시, 지급을 대신하지 않는다.

### 단축키·접근성·반응형

- Studio shortcut boundary를 유지해 일반 입력 중 단축키가 가로채지 않게 한다.
- 44px 이상의 주요 action, keyboard focus, aria label, status/alert를 유지한다.
- 모바일/태블릿에서 메뉴와 카드가 수평 overflow 또는 단일 column으로 축소된다.
- 테마 토큰(`bg-card`, `border-line`, `text-fg`)만 사용해 고대비 테마를 보존한다.

## 3. 새 화면 구성

`ProductionManuscriptWorkspace`는 다음 탭을 제공한다.

1. **공정·원고**: 회차 필터, artifact 종류, head/final, revision·review·필수 수정 수.
2. **버전·비교**: 기존 `StudioProjectVersionStackPanel`을 동일 work/artifact 좌표로 재사용.
3. **피드백**: 고정 검수본 목록, 상태, reviewer, 필수 수정 수, 검수 viewer 진입.
4. **공유·내보내기**: 고정 공유 안전 경계와 기존 `StudioExportPanel`.
5. **AI 도우미**: 기존 `StudioProjectAssistantPanel`; 텍스트 공정은 story, 그 외는 review context.
6. **활동**: revision과 review 이벤트를 한 타임라인으로 정렬.

URL query:

- `episode`: 회차 필터.
- `artifact`: 선택 공정.
- `manuscriptView`: 현재 탭.
- `manuscriptFilter`: 필수 수정·검수 중·최종본 필요·최종본 확정 필터.
- `manuscriptSort`: 확인 필요순·최근 활동순·공정순.
- `manuscriptLayout`: 카드 보기 또는 한눈 보기.
- `manuscriptQuery`: 원고명·공정·회차 검색어.

새로고침이나 링크 공유 후에도 같은 범위를 복원한다.

### 3.1 UI/UX·편의성 고도화

- 첫 화면의 기능 소개 카드를 제거하고 실제 제작 판단을 먼저 보여준다.
- 필수 수정 → 진행 검수 → 최종본 미지정 → 최종본 확정 순으로 기본 정렬한다.
- 헤더는 공정·버전·검수 숫자를 모두 나열하지 않고 최종본 준비, 버전, 진행 검수, 필수 수정 네 지표로 축약한다.
- `지금 확인할 항목`은 현재 회차에서 가장 급한 공정과 다음 행동을 한 번에 제시한다.
- 검색과 상태 필터, 정렬은 같은 툴바에 두고 결과 수와 초기화 행동을 즉시 노출한다.
- 검색은 원고명뿐 아니라 revision ID·변경 설명·검수 제목과 상태까지 포함한다.
- 카드 보기는 원고별 세부 맥락에, 한눈 보기는 공정별 head/final/review 비교에 최적화한다.
- 이전·다음 회차와 이전·다음 공정 이동을 제공하며 탭을 바꾸지 않고 현재 맥락을 유지한다.
- 현재 화면 링크 복사는 URL 상태만 공유하며 pinned review 공유 권한과 혼동하지 않는다.
- 링크 복사 결과는 보조기기에 live status로 알리고 잠시 뒤 기본 상태로 되돌린다.
- 잘못된 회차·원고 query는 서버 데이터 확인 후 제거해 깨진 북마크가 지속되지 않게 한다.
- 탭은 WAI-ARIA tab 패턴과 Arrow/Home/End 키를 지원한다.
- 전역 편의 키는 입력 요소 밖에서만 동작한다: `1–6` 탭, `/` 검색, `J/K` 공정 이동, `G` 보기 전환, `?` 도움말, `Esc` 닫기.
- IME 조합, modal, `data-studio-shortcut-boundary` 내부에서는 단축키를 가로채지 않는다.
- 필터로 기존 선택이 사라졌을 때 J/K는 첫 항목 또는 마지막 항목부터 자연스럽게 이어간다.
- 모바일 카드 보기를 기본으로 유지하고 한눈 보기 표에는 가로 스크롤 안내를 제공한다.
- 한눈 보기 표는 첫 공정 열을 고정하고 caption·column scope·원고별 action 이름을 제공한다.
- 선택 원고는 URL 복원과 J/K 이동 후 자동으로 시야 안에 맞추며 reduced-motion 설정을 존중한다.
- 필터 결과 없음, 회차 원고 없음, ProjectGraph 연결 없음, 네트워크 오류를 서로 다른 복구 행동으로 안내한다.

## 4. 의도적 차이

- Creco 내부 DB/API를 추측하거나 복제하지 않는다.
- 외부 서비스의 브랜드, 화면 배치, 문구, 아이콘을 복제하지 않는다.
- “파일 업로드”를 새 원고 저장소로 만들지 않고 Studio 저장 흐름을 사용한다.
- 두 개의 리뷰 시스템을 합쳐 승인 의미를 흐리지 않는다. Production lane 결정과 Studio 원고 검수는 각자의 권한과 evidence를 유지한다.
- 비공개 계정으로만 보이는 기능은 공개 문서에서 확인 가능한 사용자 문제와 계약까지만 구현 대상으로 삼는다.

## 5. 회귀 검증

- `production-manuscript-model.test.ts`
  - 공정 유형 분류.
  - 회차 범위 필터.
  - head/final/필수 피드백 projection.
  - revision/review 활동 시간순 정렬.
- `production-manuscript-ux.test.ts`
  - 필수 수정·검수·최종본 우선순위.
  - 검색·필터·정렬과 중첩 상태 집계.
- `ProductionManuscriptWorkspace.test.tsx`
  - 실제 revision/final/required-feedback projection.
  - 고정 검수본의 정확한 artifact/review/revision 링크.
  - 검색 결과와 카드·한눈 보기 전환.
  - 단축키 도움말, 검색 focus, 숫자 탭 전환.
- `ProductionHubPage.test.tsx`
  - 샘플 프로젝트에서 전체 기능군 노출.
- `production.routes.test.ts`
  - canonical manuscript route 소유권.
- 전체 TypeScript typecheck, 관련 Vitest, production build를 병합 게이트로 사용한다.

## 6. 2026-09-24 사용성 고도화 구현

이번 증분은 새 협업 제품이나 원고 저장소를 만들지 않고 기존 Production·ProjectGraph·pinned review·review delivery·export 권위를 한 화면에서 연결한다.

### 제작 수명주기

원고 공정은 다음 creator-facing 단계로 projection한다.

```text
empty → editing → submitted → in-review → changes-requested
                                  ↓
                               approved → ready-to-deliver → released
```

이 단계는 서버의 revision/review 상태를 설명하기 위한 읽기 모델이다. 별도 승인 권위나 변경 가능한 상태 열을 만들지 않는다.

- `HEAD`: 가장 최근 작업 revision.
- `FINAL`: `artifact.approvedRevisionId`가 가리키는 승인 기준.
- `RELEASE`: 실제 전달·게시 revision.
- FINAL 이후 HEAD가 변경되면 기존 FINAL은 유지하고 `hasUnapprovedChanges`를 표시한다.
- 열린 review 또는 changes-requested가 있으면 과거 FINAL/RELEASE가 있어도 현재 다음 행동은 검수로 설명한다.
- 필수 피드백·열린 review·미승인 변경이 없고 FINAL이 있으면 전달 준비 상태다.

### 공정 Cockpit

- 공정 카드와 한눈 보기 표에 단계, HEAD, FINAL, RELEASE를 동시에 표시한다.
- 필수 수정 → 열린 검수 → FINAL 이후 변경 → FINAL 미지정 → 전달 준비 → 전달 완료 순으로 다음 행동을 제시한다.
- 카드의 작업 열기와 검수·버전·전달 행동은 서로 다른 목적지다.
- 행렬 표는 공정 열을 고정하고 lifecycle·HEAD·FINAL·RELEASE·검수·필수 수정·다음 행동 열을 제공한다.

### 고정 검수 Workspace

피드백 탭은 summary 링크 목록에 머물지 않고 선택한 pinned review workflow를 같은 맥락에서 연다.

- 왼쪽에서 동일 artifact의 검수 이력을 선택한다.
- `manuscriptReview` query로 선택한 검수본을 복원한다.
- 선택 대상은 `review-snapshot` revision과 정확한 `rootGraphHash`가 일치할 때만 열린다.
- 검수본을 찾지 못해도 현재 HEAD나 다른 review로 자동 대체하지 않는다.
- 본문에서는 페이지·컷·텍스트 anchor, severity, 댓글, 담당자, 기한, 해결·재열기, 수정 revision, 비교, 승인 결정을 기존 pinned review 권위로 처리한다.
- 개인 검수 메모는 기존 private draft shelf에 보관하고 선택 또는 묶음 발행한다.
- inline 검수 화면에서는 공유·내보내기 action을 숨기고 아래 전달 Hub에서 의미를 분리한다.

### 공유·전달·내보내기

한 개의 모호한 공유 버튼 대신 네 경계를 나눈다.

1. **현재 화면 URL**: 회차·공정·필터·선택 위치만 복원한다. 권한을 부여하지 않는다.
2. **외부 검토 링크**: immutable review snapshot, 만료, 폐기, watermark, 현재 접근 권한을 사용한다.
3. **공식 전달**: 승인 원본, 페이지 checksum, manifest, 수신자 binding, 발행·다운로드·수신·취소 기록을 사용한다.
4. **목적별 내보내기**: 플랫폼·SNS·인쇄·PDF·보관 profile로 변환하며 공식 전달과 별개다.

전달 준비 점검은 snapshot 선택, 열린 필수 수정, FINAL, FINAL 이후 변경, 선택 review 승인, RELEASE 기록을 따로 보여준다. 모든 민감 action은 서버 권한을 다시 확인한다.

### 접근성·반응형

- 주요 action은 기존 `buttonClass`와 최소 터치 크기를 사용한다.
- lifecycle은 색만으로 전달하지 않고 아이콘·단계명·현재 단계 semantics를 함께 제공한다.
- review 목록은 button의 `aria-pressed`, pinned panel은 기존 status/alert/live region을 유지한다.
- 행렬 표는 가로 scroll region, caption, column scope, sticky 공정 열을 유지한다.
- 좁은 화면은 lifecycle 카드, review 목록, 전달 도구를 단일 column으로 쌓는다.
- 현재 URL 복사와 실제 외부 공유는 문구와 action을 분리하고 결과를 live status로 알린다.

## 7. 구현 파일

- `ProductionManuscriptWorkspace.tsx`: URL 상태, lifecycle, inline review, delivery hub 통합.
- `ProductionManuscriptLifecyclePanel.tsx`: 제작 단계와 HEAD/FINAL/RELEASE 설명.
- `ProductionManuscriptProcessBrowser.tsx`: 카드·행렬의 공정 판단 정보.
- `ProductionManuscriptDeliveryHub.tsx`: 내부 URL·외부 검토·공식 전달·변환 출력 분리.
- `production-manuscript-model.ts`: ProjectGraph 상태의 immutable projection.
- `production-manuscript-ux.ts`: 주의 우선순위, 검색, 필터, 다음 행동.
- `StudioPinnedReviewPanel.tsx`: 기존 검수 권위를 inline 또는 독립 화면에서 재사용할 수 있는 presentation 옵션.

## 8. 의도적으로 새로 만들지 않은 것

- Creco 화면, 문구, 아이콘, 과금 모델의 복제.
- 두 번째 원고 blob 저장소나 두 번째 review/approval 시스템.
- 브라우저가 임의로 판정하는 승인·게시·수신 완료 상태.
- 과거 revision을 덮어쓰는 복원.
- 공유 URL만으로 얻는 편집 권한.
- review snapshot이 유효하지 않을 때 현재 HEAD로의 자동 fallback.
- 이번 UI 증분을 위한 DB migration, 운영 secret, 유료 서비스 또는 배포 변경.

## 9. 검증 및 남은 경계

추가 회귀 검증은 다음을 포함한다.

- lifecycle이 열린 필수 수정과 active review를 FINAL보다 우선 설명하는지.
- HEAD·FINAL·RELEASE identity가 서로 섞이지 않는지.
- FINAL 이후 변경이 기존 승인본을 지우지 않는지.
- 검수 탭이 exact review/artifact/revision/hash 좌표를 보존하는지.
- 내부 URL, immutable share, official delivery, transformed export가 별도 action인지.
- invalid pinned subject가 다른 review나 현재 HEAD로 대체되지 않는지.
- 검색·필터·행렬·키보드 경계가 기존 동작을 유지하는지.

이번 증분은 기존 ProjectGraph revision blob과 review preview manifest를 사용한다. 페이지별 중복 저장 감소량이나 외부 전송 성능을 새로 측정하지 않았으며, 새로운 서버 dedup 알고리즘을 추가한 것으로 해석하지 않는다.

운영 배포, 실제 외부 수신자 기기, WAN 장애, 대형 원고 장시간 세션, 다중 계정 동시 충돌은 별도의 release acceptance 대상이다. 구현 완료와 운영 환경 검증 완료를 같은 상태로 표시하지 않는다.
