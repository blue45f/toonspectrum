# Studio 초안저장 벤치마크 및 내구성 고도화

- 기준일: 2026-09-09
- 대상: `/studio` 자동저장, 임시저장 복구, 저장 상태 고지
- 구현 브랜치: `feat/studio-draft-autosave-resilience-20260909`

## 1. 벤치마크에서 확인한 제품 원칙

### Figma

- 자동저장 체크포인트와 사용자가 이름을 붙이는 버전을 함께 제공한다.
- 오프라인 변경을 다시 반영할 때 적용 전·후 체크포인트를 남긴다.
- 충돌 가능성이 있으면 사용자를 버전 기록으로 안내해 검토·복구하게 한다.
- 복구는 현재 상태를 지우는 파괴적 롤백이 아니라, 현재 상태도 체크포인트로 남기는 비파괴 흐름이다.

참고:

- https://help.figma.com/hc/en-us/articles/360040328553-What-can-I-do-offline-in-Figma
- https://help.figma.com/hc/en-us/articles/360038006754-View-a-file-s-version-history

### Microsoft 365

- 편집 중 수 초 단위 자동저장과, 더 긴 간격의 버전 기록을 분리한다.
- 자동저장 때문에 원치 않는 변경이 반영됐을 때 버전 기록에서 이전 상태를 복원한다.
- "자주 저장"과 "의미 있는 복구 지점"을 같은 개념으로 취급하지 않는다.

참고:

- https://support.microsoft.com/en-us/office/collab-files/what-is-autosave

### Adobe Creative Cloud 문서

- 작업 중 자동저장과 버전 타임라인을 기본으로 제공한다.
- 중요한 버전은 이름을 붙이거나 표시해 장기 보존할 수 있다.
- 이전 버전 복원 결과를 다시 최신 버전으로 남겨 복원 자체도 되돌릴 수 있게 한다.

참고:

- https://helpx.adobe.com/illustrator/using/cloud-documents.html
- https://helpx.adobe.com/photoshop/web/get-set-up/learn-the-basics/view-and-restore-document-versions.html

### Google Forms

- 저장 성공 여부를 `Draft saved` 상태로 즉시 노출한다.
- 저장 불가 상태와 보존 기간을 사용자에게 명확히 알려준다.
- 초안 삭제는 명시적인 사용자 동작으로 구분한다.

참고:

- https://support.google.com/docs/answer/10952360

### Notion

- 오프라인 편집본을 기기에 유지하고, 연결 회복 뒤 백그라운드 동기화한다.
- 자동 충돌 해소가 가능한 변경과 데이터 손실 가능성이 있는 변경을 구분해 안내한다.

참고:

- https://www.notion.com/help/use-pages-offline

## 2. Toon Studio 현재 기반

기존 구현은 일반적인 `localStorage` 자동저장보다 이미 높은 내구성 기반을 갖고 있다.

- OPFS/SQLite 저장 권위
- 문서 단위 leader 선출과 follower 읽기 전용 처리
- 저장 중 writer 충돌 감지
- 저장 실패·쿼터 압박을 상태 레일로 전달하는 reliability store
- revision 불일치 및 출처 불명 복구본 차단
- JSON 안전 백업, 복구, 명시적 비우기
- pending stroke와 lifecycle sidecar를 포함한 탭 종료 복구

이번 변경은 이 기반을 교체하지 않고, 실제 데이터 손실 가능성이 남은 두 실패 경로를 강화한다.

## 3. 이번 PR 구현

### 3.1 잠금 경합 적응형 재시도

기존 writer 충돌 재시도는 매번 1초 고정이었다. 잠금이 오래 유지되면 React effect를 매초 다시 생성하고, 여러 저장 경로가 동시에 회복을 시도할 수 있었다.

변경 후:

- 자동 경합: `1초 → 2초 → 4초 → 8초` 지수 백오프
- 최대 대기: 8초
- 30초 동안 추가 경합이 없으면 다시 1초로 초기화
- 새 편집이 기존 대기 타이머를 교체하면 즉시 1초 경로로 초기화
- leader 상실·문서 교체·unmount 시 타이머와 상태를 정리
- 같은 effect에서 중복 충돌이 와도 타이머 하나로 합침
- 대기 중에는 reliability rail에 다음 재시도 시각과 내용 보존 상태를 표시
- 더 심각한 최신 저장 실패 신호가 생기면 이전 대기 컨트롤러가 그 신호를 지우지 않음

### 3.2 SQLite 마지막 정상 세대

기존 SQLite 저장소는 프로젝트별 최신 envelope 한 개만 유지했다. 최신 행이 손상되거나 새 payload 파서와 맞지 않으면 해당 행을 보존한 채 실패했지만, 자동으로 돌아갈 정상 세대가 없었다.

변경 후:

- 새 snapshot 기록 전에 현재 정상 envelope를 `last-known-good` 키로 회전
- primary가 손상되거나 사라지면 마지막 정상 세대를 읽어 자동 복구
- 복구 결과에 `recoveredFrom: "last-known-good"` provenance를 남김
- 손상된 primary는 recovery 세대를 덮어쓰지 않음
- primary와 recovery가 모두 손상되면 두 원인을 묶어 fail-closed
- 프로젝트별 primary/recovery 키를 함께 격리
- 사용자가 초안을 비우면 recovery 세대도 tombstone 처리해 과거 초안 부활 방지
- defensive recovery 복사 실패가 최신 정상 snapshot 저장 자체를 막지 않음

## 4. 실패 시나리오 수용 기준

| 시나리오 | 기대 결과 |
| --- | --- |
| 다른 writer가 짧게 잠금을 보유 | 1초 뒤 최신 snapshot으로 재시도 |
| 잠금이 장시간 유지 | 8초 상한 백오프로 저장 폭주 억제 |
| 대기 중 사용자가 다시 편집 | 기존 타이머 취소, 1초 빠른 경로 재시작 |
| leader 상실 또는 editor unmount | 늦은 저장 재시도 금지, 소유한 상태 신호 제거 |
| 최신 SQLite envelope 손상 | 마지막 정상 세대로 자동 복구 |
| primary와 recovery 모두 손상 | 손상 원인을 보존하고 저장본을 빈 문서로 덮어쓰지 않음 |
| 사용자가 초안 비우기 실행 | primary/recovery 모두 tombstone, 과거 초안 재등장 금지 |
| 다른 프로젝트의 row 손상 | 해당 프로젝트 recovery만 사용 |

## 5. 검증

추가·확장된 단위 테스트:

- writer 만료 후 새 편집 없이 최신 snapshot 재수집
- 1/2/4/8초 백오프 및 최대 지연
- 새 편집에 의한 빠른 경로 초기화
- quiet window 초기화
- reliability rail 상태 및 최신 실패 신호 소유권
- effect 교체, leader 상실, unmount, 중복 schedule
- SQLite 정상 세대 회전·복구
- 손상된 primary 교체 시 recovery 보존
- clear tombstone의 recovery 전파
- 프로젝트 격리
- primary/recovery 동시 손상 fail-closed
- 빈 payload 및 timestamp 불일치 거부

## 6. 후속 고도화 후보

이번 PR은 데이터 손실 방지와 숨은 실패 제거를 우선한다. 다음 단계는 현재 저장 권위 위에서 별도 제품 기능으로 확장한다.

1. 저장 상태 허브: `저장 중 / 이 기기에 저장됨 / 서버 동기화됨 / 충돌 검토 필요`를 구분한다.
2. 복구 카드: 저장 시각, 페이지 수, 요소 수, 출처 work/revision, 예상 복구 범위를 미리 보여준다.
3. 버전 타임라인: 자동 체크포인트와 사용자가 이름 붙인 milestone을 분리한다.
4. 비파괴 복원: 현재 버전을 먼저 체크포인트로 남긴 뒤 선택 버전을 새 최신 버전으로 복원한다.
5. 충돌 검토: 페이지·레이어 단위 차이를 보여주고 현재/복구본/복제본 중 선택하게 한다.
6. 서버 초안 큐: 로컬 내구 저장과 클라우드 동기화를 분리하고, 재연결 뒤 idempotency key로 재전송한다.
7. 저장 건강도 진단: 용량, 최근 성공 시각, 대기 중 작업 수, 복구 세대 존재 여부를 한 화면에서 확인한다.
