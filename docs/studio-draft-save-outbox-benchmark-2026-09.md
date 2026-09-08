# Studio 초안 저장 outbox 고도화 — 벤치마크·설계 기록

- 기준일: 2026-09-09
- 대상: `/studio` 컷툰 편집기
- 브랜치: `feat/studio-draft-save-outbox-20260909`
- 선행 변경: PR #968(저장 센터·오프라인 재시도), PR #1019(writer 경합·last-known-good)

## 1. 남아 있던 사용자 위험

기존 구현은 오프라인에서 누른 `연결 후 저장 예약`을 React 메모리에만 보관했다. 원고 본문은 OPFS/SQLite 체크포인트에 남아도, 사용자가 명시한 **재연결 후 서버 저장 의도**는 새로고침으로 사라질 수 있었다.

저장 시스템은 다음 세 권위를 분리해야 한다.

1. **작업 내용 내구성**: OPFS/SQLite 로컬 복구 체크포인트
2. **서버 전송 의도**: 네트워크 복구 후 실행할 content-free outbox
3. **복원 가능한 기록**: 서버 revision과 로컬 체크포인트

이번 변경은 1·3을 다시 만들지 않고 2의 유실 구간만 닫는다.

## 2. 유사 서비스 벤치마크

| 서비스 | 확인한 제품 원칙 | Studio 적용 |
| --- | --- | --- |
| Figma | 오프라인 편집 상태를 드러내고 재연결 시 동기화하며, 오프라인 전후 체크포인트와 버전 기록을 분리한다. | 로컬 복구와 서버 전송 대기를 다른 상태로 표시하고 revision 좌표로 중복을 억제한다. |
| Google Docs/Drive | 문서 상태에서 오프라인 준비 여부를 확인하고, 오프라인 편집 가능 파일과 동기화 문제를 명시한다. | 예약이 실제로 새로고침 복구 가능한지 여부를 사용자에게 정직하게 표시한다. |
| Canva | 자동 저장 성공 상태와 저장 실패 시 수동 저장 경로를 구분한다. | 예약 실패를 녹색 성공으로 숨기지 않고 현재 탭 메모리 전용 상태와 복구 행동을 제공한다. |
| Microsoft 365 | AutoSave, AutoRecover, Version History를 서로 다른 보호 계층으로 다룬다. | 기기 복구, 서버 저장 예약, 서버 revision을 하나의 `saved` 불리언으로 합치지 않는다. |
| Adobe Photoshop Cloud Documents | 클라우드 저장 상태와 버전 기록, 오프라인 사용 가능성을 별도 제어한다. | outbox는 서버 revision을 직접 생성하지 않고 기존 저장 파이프라인에만 위임한다. |
| Clip Studio Paint | 정기 저장·복구 정보·위험 경계 저장을 분리해 데이터 손실 구간을 줄인다. | 새로고침이라는 위험 경계에서 서버 저장 의도가 사라지지 않게 한다. |
| Krita | autosave, backup, incremental version의 목적과 수명을 분리한다. | outbox에는 본문·페이지·에셋을 넣지 않고 제한된 수명의 의도 메타데이터만 둔다. |
| Notion | 오프라인 작업과 백그라운드 동기화, 버전 복원을 구분한다. | 온라인 복귀 시 자동 재시도하되 실패·충돌은 기존 검토 흐름으로 돌린다. |

### 공식 참고 자료

- Figma — View a file's version history: https://help.figma.com/hc/en-us/articles/360038006754-View-a-file-s-version-history
- Figma — What can I do offline in Figma?: https://help.figma.com/hc/en-us/articles/360040328553-What-can-I-do-offline-in-Figma
- Google Docs — Work on Docs, Sheets & Slides offline: https://support.google.com/docs/answer/6388102
- Google Drive — Check activity & file versions: https://support.google.com/drive/answer/2409045
- Canva — Changes to my design didn't save: https://www.canva.com/help/article/changes-didnt-save/
- Microsoft 365 — What is AutoSave?: https://support.microsoft.com/office/what-is-autosave-6d6bd723-ebfd-4e40-b5f6-ae6e8088f7a5
- Adobe Photoshop — Manage cloud documents and version history: https://helpx.adobe.com/photoshop/using/manage-cloud-documents-photoshop.html
- Clip Studio Paint — Can you tell me about Auto Save?: https://support.clip-studio.com/en-us/faq/articles/20240009
- Krita — Autosaving and backup files: https://docs.krita.org/en/user_manual/autosave.html
- Notion — Version history and restore: https://www.notion.com/help/duplicate-delete-and-restore-content

## 3. 구현 계약

### 3.1 content-free, 문서별, 탭 범위

`sessionStorage`에는 다음 값만 기록한다.

- 스키마 버전
- 불투명한 `workId`
- 예약 시각과 만료 시각
- 예약 당시 확인한 서버 revision

페이지 JSON, 텍스트, 이미지, 에셋 URL, 사용자 입력 본문은 기록하지 않는다. 저장 키는 URL-safe 문서별 namespace를 사용해 원고 간 오염을 막는다.

### 3.2 새로고침 복구와 7일 상한

같은 탭의 새로고침 뒤 outbox를 다시 읽는다. 레코드는 정확한 스키마와 timestamp 관계를 통과해야 하며 7일 뒤 만료한다. 손상, 다른 문서 ID, 미래 시각 오염, 만료 레코드는 실행하지 않고 best-effort로 제거한다.

탭을 닫으면 브라우저의 세션 저장소 정책에 따라 예약은 사라진다. 원고 본문은 기존 OPFS/SQLite 복구 저장소가 계속 담당한다.

### 3.3 중복 revision 억제

예약 당시 revision보다 현재 서버 revision이 높으면 이미 다른 자동저장·수동저장·탭에서 의도가 충족된 것으로 보고 outbox만 제거한다. 첫 저장 예약 뒤 서버 revision이 새로 생긴 경우도 같은 원칙을 적용한다.

### 3.4 안전한 자동 재생

자동 재생은 다음 조건을 모두 통과할 때만 기존 `handleSave("draft")`에 위임한다.

- 온라인
- 원고 하이드레이션 완료 및 실패 없음
- 문서 잠금 없음
- 메타데이터 입력 대기 없음
- 공동 변경 동기화 대기 없음
- 현재 탭이 follower가 아님
- 서버 revision 조회가 완료됐고 조회 오류가 없음
- 기존 저장 오류 검토 중이 아님

outbox 영수증은 재생 직전에 지우지 않는다. 기존 저장 Promise가 성공을 반환하거나 관찰된 서버 revision 진전으로 이미 충족됐음이 확인될 때까지 유지한다. 이 방식은 재연결 직후 브라우저가 종료되거나 새로고침되는 짧은 구간에서도 저장 의도가 사라지지 않게 한다. 같은 탭의 중복 effect·연속 수동 클릭은 공용 in-flight guard로 막고, 저장 Promise가 실패하면 기존 영수증을 그대로 남겨 다음 안전한 재시도에 사용한다.

### 3.5 정직한 실패·취소 UX

세션 저장소 쓰기·검증이 실패하면 예약을 메모리에는 유지하되 “새로고침 복구 불가”를 표시한다. 사용자는 저장 센터에서 예약 시각과 내구 여부를 확인하고 `저장 예약 취소`를 명시적으로 실행할 수 있다.

취소는 저장소 삭제가 성공하거나 안전한 무효화가 확인된 경우에만 현재 탭의 큐를 중단한다. 브라우저·정책이 `removeItem`을 거부하지만 overwrite는 허용하는 경우에는 정상 레코드로 파싱될 수 없는 작은 취소 sentinel을 기록해 새로고침 뒤 재생을 차단한다. 삭제와 무효화가 모두 실패하면 성공처럼 숨기지 않고 예약을 화면에 유지한 채 경고한다.

## 4. 회귀 테스트

- content-free 레코드 round-trip
- URL 특수문자를 포함한 문서 키 격리
- 손상·문서 불일치·만료 레코드 fail-closed 제거
- storage quota/검증 실패 시 false success 금지
- newer revision 기반 중복 재생 억제
- 첫 서버 revision 생성으로 첫 저장 의도 충족 판정
- 오프라인 예약 기록, 재연결 in-flight 동안 영수증 유지, 저장 성공 후 1회 정리
- 서버 revision 조회 완료 전 자동 재생 금지
- 저장 Promise 진행 중 연속 수동 클릭 1회 병합
- 새로고침 복구 레코드의 follower 대기 및 leader 승격 후 재생
- 재연결 저장 실패 시 기존 outbox 유지
- 사용자 취소 후 검증된 영수증 제거 또는 sentinel 무효화
- 삭제·덮어쓰기 모두 실패한 경우 예약 유지와 명시적 경고

## 5. 의도적으로 하지 않은 것

- 새 서버 API 또는 DB 테이블 추가
- 원고 본문의 sessionStorage/localStorage 복제
- follower 탭의 저장 권위 탈취
- revision 충돌 자동 덮어쓰기
- 기존 OPFS/SQLite·CRDT·서버 save pipeline 우회

후속 확장 후보는 기기 재시작을 넘는 outbox ownership/heartbeat, 명명 체크포인트, revision 썸네일·diff 요약, 보관 용량·기간 정책 UI다. 기기 전체 outbox는 다중 탭·다중 계정·공용 브라우저의 소유권 문제를 먼저 해결한 뒤 도입해야 한다.
