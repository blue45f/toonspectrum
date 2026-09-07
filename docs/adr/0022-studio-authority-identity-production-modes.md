# ADR-0022 — Studio 권위 지도, 의미 ID와 Production 모드 분리

- 상태: Accepted
- 결정일: 2026-09-07
- 범위: Studio 제작 원고의 논리적 권위, 버전 좌표, Writer Room·Comic·Page 연결, ProductionHub 로컬 데이터
- 관련: ADR-0012(SQLite/OPFS 로컬 권위), ADR-0020(EditorClient 명령 경계)

## 1. 맥락

Studio에는 이미 다음 기반이 있다.

- `PageState`·`El` 중심의 풍부한 Authoring 문서
- `ProjectStateIR`·`SceneIR`·`ComicGraphIR` 중심의 결정적 실행·검증 Projection
- SQLite WASM + OPFS Journal·CAS 로컬 내구성
- Writer Room, Character Bible, 댓글, 서버 CreatorWork 리비전
- Publish Preflight와 Package Planner
- ProductionHub의 로컬 작업·검수 목록

문제는 기능 부족보다 권위의 의미가 겹친다는 점이다. 동일 작품에 로컬 명령 시퀀스, OPFS 스냅샷,
ProductionHub 체크포인트, 서버 리비전, 검수 상태와 게시 패키지가 존재하지만 UI와 코드에서 모두
"저장" 또는 "버전"으로 보일 수 있다. Writer Room Panel, Comic Panel, Page Frame, Dialogue,
Balloon과 댓글도 각 도메인의 안정 ID는 갖지만 하나의 의미 단위로 묶이지 않는다.

기존 ProductionHub는 데이터가 없을 때 예시 작업·검수 항목을 실제 작품 범위에도 초기값으로 사용했고,
작품 범위에서 결정적으로 만든 로컬 문자열을 초대 링크에 포함했다. 또한 동일 브라우저 창 사이에
전체 Workspace 객체를 BroadcastChannel로 전달했기 때문에 오래된 탭이 새로운 필드를 덮어쓸 수 있었다.

## 2. 결정

### 2.1 실행 가능한 권위 지도

`studio-authority-map.ts`에 제품 도메인별 논리 소유자, Mutation 경계, 로컬·원격 권위, Archive Section과
버전 좌표를 선언한다.

| 도메인 | 논리 권위 | 로컬 | 서버 |
| --- | --- | --- | --- |
| Page·Element | StudioDocumentRuntime | SQLite·OPFS | CreatorWork Revision |
| Comic | StudioDocumentRuntime | SQLite·OPFS | CreatorWork Revision |
| Writer Room | StudioDocumentRuntime | SQLite·OPFS | CreatorWork Revision |
| Character Bible | StudioDocumentRuntime | SQLite·OPFS | CreatorWork Revision |
| Binary Asset | StudioAssetRepository | OPFS CAS | Object Storage |
| Mutation History | StudioDurabilityRuntime | SQLite·OPFS | 현재 없음 |
| Workspace UI | StudioViewportRuntime | SQLite·OPFS | 현재 없음 |
| Review | StudioWorkflowRuntime | 메모리 캐시 | Review Service |
| Approval | StudioWorkflowRuntime | 메모리 캐시 | Review Service |
| Publish | StudioExportRuntime | 메모리 캐시 | Publish Service |
| Presence | StudioCollaborationRuntime | 메모리 | Realtime Session |
| Renderer Projection | StudioRenderRuntime | 메모리 | 없음 |

검증 함수는 도메인 누락·중복, Workflow의 서버 권위 누락, 파생 Renderer 데이터의 영속화와 Presence의
문서 포함을 실패로 만든다. 이 지도는 새로운 저장소나 Runtime을 자동 생성하지 않으며, 기존 소유권이
어디로 수렴해야 하는지를 고정하는 경계 계약이다.

### 2.2 Authoring 문서와 실행 IR 분리

`PageState`·`El`의 풍부한 Authoring 데이터와 `ProjectStateIR`·`SceneIR`의 실행·검증 Projection을 같은
권위로 취급하지 않는다.

```text
Authoring Document
  -> lowering + receipt
Execution IR
  -> renderer
Pixels / GPU scene
```

Renderer 출력과 GPU 객체는 재생성 가능한 파생 데이터다. Project IR이 표현하지 못하는 Authoring 기능을
조용히 Rasterize하거나 삭제해서 문서 원본으로 승격하지 않는다.

### 2.3 의미 ID 계층

기존 Writer Room, ComicGraph와 PageState ID를 강제로 다시 발급하지 않는다. 그 위에
`StudioIdentityIndexV1`을 추가한다.

```text
semantic panel id
  -> writer-room panel id
  -> comic panel id
  -> page/frame element id
  -> review/motion/publish reference
```

한 Domain Reference는 최대 하나의 Semantic Link에 속한다. 신규 문서는 처음부터 Semantic ID를 발급하고,
기존 문서는 read-only shadow scanner로 연결 후보를 계산한다. Scanner는 누락된 Semantic ID를 임의로
만들지 않으며, 불확실한 연결은 저장하지 않고 Issue로 보고한다.

### 2.4 버전 좌표 분리

다음 값을 별도 좌표로 관리한다.

- Local Sequence
- Local Checkpoint
- Server Revision
- Review Snapshot
- Approval ID
- Publish Package ID

Review Snapshot은 Server Revision을 고정해야 하고, Approval은 동일 Review Snapshot·Revision·Digest를
가리켜야 한다. Publish Package는 Approval의 Source Revision을 그대로 사용해야 한다. 서버 Head가
승인 후 앞으로 이동해도 기존 Approval은 삭제하지 않고 `stale`로 표현한다.

### 2.5 ProductionHub 모드

ProductionHub는 다음 모드를 명시적으로 구분한다.

```text
local-draft
linked-local
server-work
read-only-cache
demo
```

- 실제 Draft·Work·Remix 범위는 내용이 없는 Workspace로 시작한다.
- 예시 작업·검수·슬라이드는 오직 `draft?demo=1`의 명시적 Demo에서만 생성한다.
- `linked-local`은 작품 ID에 연결된 로컬 플래너이며 서버 작업·승인·출판 권한이 아니다.
- `server-work`만 초대·승인·출판 Capability를 가질 수 있다.
- 서버 Adapter가 연결되지 않은 현재 제품 경로는 `server-work`로 가장하지 않는다.
- 저장 오류나 손상 데이터는 빈 Workspace로 덮지 않고 fail closed 상태로 표시한다.

### 2.6 로컬 Production Revision과 창 간 통신

Production Workspace schema를 v2로 올리고 증가하는 `revision`을 추가한다. v1은 명시적으로 읽어 v2 메모리
모델로 변환하되 기존 Token을 서버 권한으로 승격하지 않는다.

Mutation은 작품 범위 Web Lock 또는 동일 Realm 직렬화 Queue 안에서 최신 SQLite 값을 다시 읽고,
업데이트한 뒤 Revision을 증가시켜 저장한다. BroadcastChannel은 Workspace 전체를 전달하지 않고 다음
Invalidation Receipt만 보낸다.

```text
scopeKey
revision
sourceClientId
```

수신 창은 자신의 Revision보다 최신일 때 SQLite에서 다시 읽는다.

### 2.7 초대 링크 Fail Closed

작품 ID나 로컬 Scope에서 결정적으로 파생한 문자열은 인증 Token이 아니다. 서버가 난수 Token을 발급하고,
권한·만료·폐기를 검증하는 API가 연결되기 전에는 Share와 Join 화면이 권한 부여를 수행하지 않는다.
URL의 `invite` Parameter만으로 멤버를 추가하지 않는다.

## 3. 유지하는 경계

이번 결정은 다음을 교체하지 않는다.

- 기존 `/studio`와 `/studio/work/:id/...` Route
- 현재 Authoring 문서 모델
- `CommandBus`, Journal과 A/B Snapshot
- SQLite WASM + OPFS 권위
- `EditorClient`·`CommandRegistry`
- 기존 Renderer·3D 엔진 역할
- CreatorWork 서버 Revision API

## 4. 결과

### 긍정

- 저장·검수·승인·출판의 버전 의미를 코드에서 구분할 수 있다.
- 실제 작품에 샘플 작업이 실데이터처럼 나타나지 않는다.
- 손상된 로컬 Production 데이터를 조용히 덮어쓰지 않는다.
- 동일 브라우저 창의 오래된 전체 Workspace Broadcast로 필드가 유실되는 위험을 줄인다.
- Writer Room·Comic·Draw·Review를 기존 ID 파괴 없이 연결할 기반이 생긴다.
- 로컬 Token이 서버 권한으로 오인되지 않는다.

### 부정·제약

- Server Review·Approval·Publish Adapter는 이 결정만으로 구현되지 않는다.
- 저장된 Work도 서버 Production Repository가 배선되기 전까지 `linked-local`로 표시된다.
- Semantic Identity Scanner는 첫 단계에서 read-only이며 기존 문서를 자동 변경하지 않는다.
- 기존 Character Bible v1과 Archive v2는 그대로 유지한다.

## 5. 검증

- `studio-authority-map.test.ts`
- `studio-version-coordinates.test.ts`
- `studio-semantic-identity.test.ts`
- `studio-production-workspace.test.ts`
- `StudioProductionHubPage.scope.test.tsx`

검증 항목은 권위 누락·중복, Approval·Publish Source 불일치, Reference 중복 소유, 누락 ID 비발급,
Demo 격리, 손상 데이터 비덮어쓰기, Revision 직렬화와 초대 권한 Fail Closed를 포함한다.

## 6. 후속 작업

1. Semantic Identity read-only scanner를 Writer Room·ComicGraph·PageState에 실제 연결한다.
2. `EditorClient` 명령 Receipt에 Version Coordinates를 투영한다.
3. 서버 Review Snapshot·Thread·Approval 서비스를 추가한다.
4. Publish Package를 Approval Source Revision에 고정한다.
5. ProductionHub의 `server-work` Repository를 실제 권한 API에 배선한다.
6. Character Bible v2와 Archive v3를 Shadow 방식으로 도입한다.
