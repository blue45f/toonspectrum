# Studio 경쟁 기능 갭 재감사 — 2026-07-27

## 목적

2026-07-26~27에 작성된 경쟁 제품 비교 Markdown 6개와
`ToonSpectrum_41개경쟁제품_997개전수기능갭_구현체크리스트_2026-07-26.xlsx`를 현재 코드와 다시
대조했다. 이 문서는 경쟁 제품의 화면·브러시·에셋을 복제하기 위한 목록이 아니다. 문제와 작업 흐름을
참고하되 구현과 명칭, 자산은 ToonSpectrum 고유 모델로 만든다.

가장 중요한 감사 원칙은 다음과 같다.

- 비교표의 `미확인`은 `미구현`과 같지 않다. 비교표 대부분은 2026-07-25 당시 README 문구를 기준으로
  판정됐으므로, 실제 도메인 모듈·테스트·Studio 연결 지점을 함께 확인한다.
- UI만 있거나 도메인 코어만 있는 상태를 `완료`로 합치지 않는다. 도메인, 명령/undo, 저장, 협업,
  내보내기, 모바일, 접근성, 성능 예산을 구분한다.
- 기능 수보다 먼저 무손실 입력, 결정론적 저장, 복구, 협업 수렴과 메인 스레드 프레임 예산을 지킨다.

## 원본 체크리스트 구조

워크북에는 서로 목적이 다른 세 집합이 있다.

| 시트 | 행 수 | 의미 |
| --- | ---: | --- |
| `전수 기능 갭` | 997 | 41개 제품을 가로지른 전체 기능 행렬 |
| `기능 백로그` | 658 | 실행 단위로 정리한 개발 백로그 |
| `P0 구현 큐` | 457 | 워크북 내부 필터를 통과한 P0 실행 큐 |

전체 997개 행의 당시 판정은 `공개 문서 미확인 865`, `부분 지원 98`, `문서상 지원 25`,
`신규 차별화 9`였다. 우선순위는 P0 461, P1 357, P2 152, P3 27이고 난이도는 XL 545, L 432,
M 20이다. 즉 이 숫자를 그대로 “997개 미구현”으로 읽으면 이미 존재하는 기능을 중복 개발하게 된다.

## 실제 코드 기반 상태

| 주제 | 2026-07-27 실제 상태 | 확인된 구현 | 남은 경계 |
| --- | --- | --- | --- |
| G펜·브러시 관리 | 지원, 이번 배치 보강 | G펜 고유 perfect-outline 경로, 기본 브러시 탭, 검색·분류·미리보기·최근·즐겨찾기·기본값 복원 | 계정/팀 범위 브러시 컬렉션 동기화 |
| 브러시 즐겨찾기 | 지원, 이번 배치 결함 수정 | 로컬 영속화, 다중 Studio 탭 동기화, 전체 현재 카탈로그를 허용하는 동적 안전 상한, 저장 실패 시 현재 탭 보존 | 서버 계정 동기화와 충돌 정책 |
| 색상 범위 선택 | 지원, 이번 배치 Worker화 | 다중 샘플, fuzziness, selection combine, 취소·epoch·late-result 방어 | 초대형 타일 문서의 분산 마스크 |
| 채우기 | 지원 | gap close, reference layer, expand/shrink, leak guard, selection 경계 | tiled document 전환 뒤의 부분 업데이트 |
| Quick Comic | 부분 지원 | 레이아웃→장면→대사→검토 4단계와 즉시 캔버스 조립 | 캐릭터·표정·포즈 선택과 5분 완성 계측 |
| Scene Snapshot | 개인 로컬 핵심 지원 | bounded IndexedDB, 전체 PageState와 3D payload, 적용·history | 팀/작품 라이브러리, 변경 요소 선택 적용, branch 의미론 |
| Webtoon Design Tokens | 이번 배치 도메인 코어 추가, UI 통합 부분 | 7종 typed token, theme/language/platform mode, 상속·cascade, BrandKit·SceneSeed adapter | token manager, 프로젝트 저장·history, 모든 객체 전파와 사용 위치 영향 미리보기 |
| Components / Prefabs | 부분 지원 | scene template, bubble preset, brand kit, master element | 원본↔instance, override/variant/detach, 버전 고정, 선택 업데이트 |
| Scene Recipe | 부분 지원 | 대규모 2D scene template과 BG3D template | 세트·인물 슬롯·카메라·조명·포즈·효과·컷 배열을 묶는 편집 모델 |
| Dependency / Impact Graph | 이번 배치 도메인 코어 추가 | 결정론적 transitive impact, cycle/dangling 진단, 전체/선택 적용 계획 | 프로젝트 adapter, lazy dialog, 문서 영속화 |
| CRDT 동시 편집 | 지원, 이번 배치 전송 계층 보강 | Base64 호환 경로와 CRC 검증 `binary-v1`, wire 선택 epoch, authoritative sync 이후 outbox drain | 운영 단계 점진 배포·관측과 50인 부하 측정 |
| 대형 계산 Worker화 | 지원 범위 확대 | 색상 범위, archive CRC32, 스티커 외곽선 EDT를 persistent module Worker로 실행 | tiled raster core와 장기 WebGPU compute |
| SharedArrayBuffer 준비 | Studio 경로 지원 | `/studio` 전용 COOP/COEP, 일반 페이지와 대칭 진입/이탈, 외부 자산 감사 | 실제 SAB ring buffer를 쓰는 타일 엔진 |

## 이번 배치에서 닫은 결함

### G펜 기본 노출과 즐겨찾기 내구성

- G펜을 `기본` 브러시 탭의 두 번째 항목으로 이동했다. 빠른 브러시 선반에도 초기 8개 안에 들어간다.
- 즐겨찾기가 12개에서 조용히 더 이상 저장되지 않던 상한을 제거하고, 코어·프로시저럴 카탈로그의 실제
  길이에서 안전 상한을 계산한다. 현재 선택 가능한 214종 모두 즐겨찾기에 넣을 수 있으며, 화면의 작은
  선반은 계속 필요한 수만 투영하고 전체 즐겨찾기는 라이브러리에서 관리한다.
- 브러시 선택, 크기/불투명도 잠금 같은 무관한 변경이 오래된 React 상태를 통째로 저장해 다른 탭에서
  추가한 즐겨찾기를 지우던 경로를 제거했다. 쓰기 직전에 최신 저장값을 읽고 한 가지 사용자 의도만
  적용한다.
- 다른 Studio 탭의 `storage` 변경을 현재 UI에도 반영한다.
- 저장소가 막혔을 때 영구 저장 성공처럼 안내하지 않고, 현재 탭에만 유지됐다는 상태를 구분한다.
- 단위·컴포넌트 103개 테스트와 실제 브라우저에서 기본 탭 노출, 선택, 별표 토글, 새로고침 유지,
  390px/320px 가로 넘침 0을 확인했다.

### 협업 전송과 수렴 안전성

- 기존 Base64 wire와 공존하는 `binary-v1`을 추가했다.
- join 광고와 연결별 selection epoch를 검증한 뒤에만 바이너리 방에 들어가며, select ACK 전에는
  transport를 ready로 노출하지 않는다.
- 상태 벡터, update, sync diff에 고정 envelope와 길이·CRC 검사를 적용했다.
- rolling deploy의 legacy+binary 이중 fan-out은 공통 `updateId`로 한 번만 반영한다.
- 손상 fragment, stale epoch, select ACK 유실은 조용한 downgrade 대신 연결 세대를 폐기하고 새
  authoritative sync로 복구한다.
- IndexedDB outbox 포맷은 Base64로 유지하고 authoritative sync 적용 전에는 절대 전송하지 않는다.

### 메인 스레드 예산

- 색상 범위 선택은 샘플·선택 snapshot을 Worker 한 작업으로 보내며 도중 취소와 늦은 응답을 폐기한다.
- ZIP package CRC32는 archive별 persistent Worker 세션에서 계산하고 transferred buffer를 돌려받아
  payload 조립에 재사용한다. 대형 입력은 Worker 실패 시 동기 fallback하지 않는다.
- 외곽선 EDT는 작은 캐시만 bounded 동기 처리하고 큰 Konva padded cache는 Worker로 보낸다. 결과가
  여전히 같은 이미지·마스크·필터 revision일 때만 동일 offset cache에 반영한다.
- `/studio`와 deep link에만 COOP/COEP를 적용해 SharedArrayBuffer 기반 후속 타일 엔진의 전제 조건을
  마련하면서 로그인·공개 페이지에는 격리를 전파하지 않는다.

### Webtoon Design Tokens와 변경 영향

- palette, typography, spacing, stroke, bubble, effect, output 7종을 타입으로 분리하고, 같은 종류 토큰의
  상속과 theme/language/platform mode override, runtime override cascade를 결정론적으로 해석한다.
- 중복, 끊어진 참조, 종류 불일치, 순환, 과도한 깊이, 알 수 없는 축·값·필드와 안전 상한 초과를
  fail-closed 진단으로 반환한다.
- canonical serialization과 안정적인 문서 hash를 제공하고 기존 BrandKit·SceneSeed를 비변이
  projection으로 연결할 수 있게 했다.
- 별도 Dependency/Impact Graph 코어는 원본 변경에서 컷·대사·번역·에셋·컴포넌트·출고 프리셋까지의
  결정론적 전이 경로, 승인 재검토 위험, 담당 작업과 전체/선택 적용 계획을 계산한다.
- 다음 배치에서 token manager와 프로젝트 extension schema, history command를 연결한 뒤 두 코어를
  합쳐 “이 토큰 변경이 어느 컷과 출고물에 영향을 주는지” 적용 전에 보여 준다.

## 다음 구현 순서

1. 현재 배치의 binary CRDT 운영 플래그·관측 지표·다중 프로세스 부하 검증
2. tiled raster document와 dirty tile command journal
3. Webtoon Design Token을 실제 PageState 객체와 영향도 그래프에 연결
4. prefab 원본/instance/override/variant와 사용 위치 업데이트
5. Scene Recipe와 Quick Comic의 캐릭터·표정·포즈 슬롯 통합
6. 팀 범위 Scene Snapshot, 브러시, 팔레트, 필터 프리셋 라이브러리
7. 장기 WebGPU raster core 및 SAB command ring

이 순서는 “행 수를 채우는 기능 추가”보다 작가가 매일 체감하는 입력 지연, 상태 유실, 협업 충돌,
반복 설정과 출고 오류를 먼저 줄이는 순서다.
