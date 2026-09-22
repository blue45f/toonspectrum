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

새로고침이나 링크 공유 후에도 같은 범위를 복원한다.

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
- `ProductionHubPage.test.tsx`
  - 샘플 프로젝트에서 전체 기능군 노출.
- `production.routes.test.ts`
  - canonical manuscript route 소유권.
- 전체 TypeScript typecheck, 관련 Vitest, production build를 병합 게이트로 사용한다.
