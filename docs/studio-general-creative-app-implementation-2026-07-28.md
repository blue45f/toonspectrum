# ToonSpectrum 범용 창작 앱 기능 이식 — 구현 판정

기준 문서: `ToonSpectrum_범용창작앱_기능이식_상세제안서_2026-07-28.md`

이 문서는 제안서의 기능명을 그대로 늘어놓는 대신, ToonSpectrum의 현재 문서 모델과
Studio 작업 흐름에 맞춰 실제 구현 경계와 다음 수직 슬라이스를 고정한다. 독점 파일 형식이나
제품 고유 동작을 복제하지 않고 공개 명세와 일반적인 편집기 상호작용을 기준으로 구현한다.

## 이번 구현 파동

| 제안 기능 | ToonSpectrum 구현 | 판정 |
| --- | --- | --- |
| Contextual Task Bar | 선택 문맥 레일을 한 줄 스크롤 구조로 재배치하고 그룹/해제, 잠금, 앞뒤 순서, 정렬, 분배, 복제, 삭제를 한곳에 제공 | 사용자 경로 연결 |
| PPT/Figma식 Group | 그룹을 선택 상태로 유지하고 그룹 단위 이동·잠금·복제·z-order를 보존하며 레이어 행에서 펼침과 선택을 분리 | 사용자 경로 연결 |
| Named States | 가시성, 토큰 모드, 변형, 효과·샷 파라미터, 텍스트 데이터, 출력 레시피를 sparse override로 저장·상속·비교·적용 계획화 | 결정론적 코어 완료 |
| Component / Instance | Definition + Instance + override 해석, make-unique 계획과 순환·dangling·예산 오류를 fail-closed 처리 | 결정론적 코어 |
| Data-driven output | 대사 일괄 편집과 FDX 입출력 손실 미리보기, 출력 전 capability 판정을 연결 | 사용자 경로 연결 |
| Preflight / Package | 기존 게시 사전검사, 권리 manifest, package archive와 새 상태·컴포넌트 참조 검사를 연결할 경계 확정 | 기존 기반 재사용 |
| Reader flow | 스크롤 리듬 분석과 컷 간격 자동 제안을 프리뷰 패널에 연결 | 사용자 경로 연결 |

## 이미 재사용 가능한 기반

- `studio-webtoon-design-tokens.ts`: 토큰·모드·별칭과 웹툰 의미 토큰
- `studio-master-*`: 마스터/페이지 지역 오버라이드
- `studio-production-semantic-graph.ts`: 산출물 의존 관계와 영향 범위
- `studio-publish-preflight.ts`, `studio-export-package-preflight.ts`: 게시·패키지 검사
- `studio-project-archive.ts`, `studio-package-archive.ts`: 이식 가능한 프로젝트 패키지
- `studio-crdt-document.ts`: 협업 문서 트랜잭션 경계

## 다음 수직 슬라이스

1. Named State 패널을 문서 상태 저장소와 연결하고 적용 전 변경·누락 참조를 미리 보여준다.
2. Component/Instance를 레이어 패널과 캔버스 복제 명령에 연결하고 `원본으로 이동`,
   `오버라이드 초기화`, `고유 객체로 만들기`를 제공한다.
3. responsive constraints를 모바일/세로 스크롤 컷 템플릿에 먼저 한정해 도입한다.
4. appearance stack은 기존 비파괴 필터 스택과 벡터 스타일을 하나의 순서 모델로 합친다.
5. Named State × 데이터 세트 × 출력 레시피 조합을 배치 렌더 큐와 preflight에 연결한다.

## 완료 게이트

- 모든 직렬화는 canonical round-trip 또는 명시적 fail-closed 결과를 가져야 한다.
- 순환·dangling 참조, 중복 ID, 문서 크기와 해석 깊이 예산을 테스트한다.
- 편집 명령은 한 번의 undo 단위이며 협업에서는 안정 ID 기반 operation plan으로 표현한다.
- 데스크톱 키보드와 390px 터치 화면에서 같은 기능을 찾고 실행할 수 있어야 한다.
- 사용자에게 보이는 비활성 명령은 이유와 다음 행동을 함께 제공한다.
