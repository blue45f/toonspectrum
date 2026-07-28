# Studio 의미 기반 제작 그래프와 변경 영향 분석

작성일: 2026-07-28

## 결론

ToonSpectrum에는 제작 통계, 연속성 검사, 버전 간 의미 차이, 서버 버전 복원
안전장치가 각각 존재하지만, 한 제작 항목의 변경이 어떤 후속 산출물에
도달하는지 설명하고 승인·출고 상태를 원자적으로 무효화하는 계층은 없었다.

이번 변경은 `studio-production-semantic-graph.ts`에 UI·DOM·네트워크 의존성이
없는 방향성 제작 그래프 코어를 추가한다. 기존 모듈을 대체하거나 변경하지
않고, 각 모듈에서 얻은 안정 ID와 변경 설명을 입력으로 조합할 수 있게 했다.

## 기존 모듈 감사

| 기존 모듈 | 현재 책임 | 이번 코어와의 경계 |
|---|---|---|
| `studio-production-projection.ts` | 편집기 페이지·요소를 제작 통계 입력으로 축소 | 의존 관계와 영향 전파를 만들지 않음 |
| `studio-production-insights.ts` | 컷·대사·에셋·검토 상태 집계 | 집계 결과이며 개별 노드 경로가 없음 |
| `studio-continuity.ts` | 캐릭터·장면 값의 연속성 문제 탐지 | 변경 downstream과 승인/출고 무효화가 없음 |
| `studio-revision-diff.ts` | 페이지·요소 안정 ID 기반 의미 변경 descriptor | 무엇이 바뀌었는지는 설명하지만 무엇이 영향받는지는 계산하지 않음 |
| `studio-server-revision-comparison.ts` | 서버 복원 방향 비교와 출판 메타데이터 영향 | 제작 항목별 dependency path가 없음 |

따라서 신규 코어는 revision diff를 다시 구현하지 않는다. 호출부가
`StudioRevisionChange`를 안정적인 제작 노드 ID와 `content`, `structure`,
`metadata` 변경 이벤트로 투영하면, 신규 그래프가 그 이후의 영향 범위만
계산하는 조합 계층이다.

## 구현한 그래프 계약

지원 노드:

- 대본, 장면, 샷, 컷
- 캐릭터, 대사, 말풍선
- 3D 장면, 레이어, 에셋
- 번역, 승인, 출고

지원 관계:

- 파생본과 대본→장면→샷→컷의 이야기 흐름
- 캐릭터 참조
- 대사→말풍선 및 말풍선→컷 배치
- 3D 장면→레이어 및 레이어→컷 합성
- 에셋 사용
- 대사/말풍선→번역
- 제작물→승인
- 제작물/승인→출고

모든 edge는 `dependency → dependent` 방향이다. edge 종류별로 허용되는
from/to 노드 종류를 검증하므로, 예를 들어 대본을 3D 렌더 결과로 연결하는
잘못된 관계는 그래프에 들어오지 못한다.

## 변경 영향 결과

하나 이상의 변경 이벤트를 넣으면 다음 결과를 결정적으로 생성한다.

- 입력 순서와 무관하게 정규화된 노드·edge·위상 순서
- 같은 노드의 중복 변경 이벤트를 종류·필드별로 합친 semantic diff 요약
- 직접 변경 노드를 제외한 모든 downstream 노드
- 각 영향 노드까지의 최단 근거 node path와 edge path
- 영향을 받은 승인과 실제로 `approved`/`in-review` 상태가 무효화될 승인
- 영향을 받은 출고와 이미 `exported`되어 재출고가 필요한 대상
- 승인→`invalidated`, 출고→`stale`로 바꾸는 정방향 패치
- 한 번의 Undo로 복구할 수 있는 역방향 패치
- 적용 직전 `before` 상태를 전부 확인하는 stale snapshot 전체 거부

승인 상태 자체만 변경한 이벤트는 그 승인을 다시 무효화하지 않지만, 승인에
의존하는 기존 출고물에는 재출고 영향을 전달한다. 콘텐츠·구조·메타데이터
변경만 승인 무효화의 원인이 된다.

## 결정성과 fail-closed 경계

- 노드 ID, edge ID, 동일 관계 중복을 거부한다.
- 존재하지 않는 endpoint와 변경 노드를 거부한다.
- edge 종류와 node 종류의 의미 계약이 맞지 않으면 거부한다.
- DAG cycle을 위상 정렬 단계에서 감지하고 전체 그래프를 거부한다.
- 같은 노드 변경 이벤트에 서로 다른 before/after fingerprint가 섞이면
  추정하지 않고 거부한다.
- 노드, edge, 변경 이벤트, 변경 필드, 탐색 step, 근거 path 항목, patch마다
  독립 예산이 있다.
- 호출부는 기본 상한보다 낮은 예산만 설정할 수 있다.
- 탐색 또는 근거 path 예산이 중간에 소진돼도 부분 결과나 부분 patch를
  반환하지 않는다.
- Proxy/getter 예외도 외부로 전파하지 않고 `invalid-input`으로 닫는다.

## 의도적으로 남긴 통합 경계

- 실제 Studio 문서의 페이지·요소·writer room·production bible 데이터를
  제작 그래프 ID로 투영하는 adapter는 아직 연결하지 않았다.
- `StudioRevisionChange`를 제작 변경 이벤트로 바꾸는 정책은 제품의 안정 ID
  매핑이 확정된 뒤 호출부 adapter로 두어야 한다.
- 현재는 가장 짧고 결정적인 원인 path 하나를 제공한다. 여러 독립 원인을
  모두 표시하는 causal set은 별도 총량 예산과 UI가 필요하다.
- 승인/출고 상태만 patch한다. 콘텐츠 변경 자체는 이미 발생한 입력 사실이며
  이 분석기가 되돌리지 않는다.
- 승인 담당자, 역할, 마감 일정, 다단계 결재, 출고 채널별 package 재생성은
  후속 workflow adapter의 책임이다.
- UI와 `StudioPage`는 이번 범위에서 수정하지 않았다.

## 권장 연결 순서

1. 기존 revision diff와 writer room/production bible에서 안정 ID를 투영한다.
2. 저장 또는 승인 요청 직전에 제작 그래프를 정규화한다.
3. 변경 이벤트를 영향 분석기에 전달하고 근거 path를 검토 화면에 표시한다.
4. 사용자가 확정하면 반환된 patch를 하나의 history/CRDT transaction으로
   적용한다.
5. invalidated 승인과 stale 출고만 작업 큐에 다시 올린다.

이 구조를 사용하면 “대사 한 줄을 고치면 어느 말풍선·번역·승인·출고가
낡아지는가”를 추정이 아니라 안정 ID와 명시적 path로 설명할 수 있다.
