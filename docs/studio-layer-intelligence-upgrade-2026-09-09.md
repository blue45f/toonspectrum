# Studio Layer Intelligence 고도화

- 기준일: 2026-09-09
- 대상: `apps/web/src/domains/creator/layer`
- 목표: 대형 웹툰 원고에서 레이어를 **찾고, 검수하고, 반복 작업 조건을 재사용하는 시간**을 줄인다.

## 1. 벤치마크 요약

| 제품 | 확인한 강점 | ToonStudio 적용 결정 |
| --- | --- | --- |
| Clip Studio Paint | Search Layer 팔레트에서 종류·이름·속성의 포함/제외 조건을 조합 | 한 검색창에서 필드 조건, 제외, OR, 따옴표 구문을 함께 처리 |
| Adobe Photoshop | 레이어 종류뿐 아니라 Smart Object 상태처럼 작업 이상 상태를 필터링 | 기본 이름, 비활성 마스크, 0% 불투명도, 손상 그룹을 `확인 필요` 스마트 보기로 집약 |
| Krita | 레이어/그룹 색 라벨과 이름을 기준으로 빠르게 필터링 | 기존 역할·색 라벨 필터를 구조 검색과 결합하고 프리셋으로 저장 |
| Procreate | 터치 중심의 다중 선택과 일괄 그룹·병합·공유·복제·삭제 흐름 | 기존 터치 타깃과 일괄 작업을 유지하면서 필터 진입을 1탭 스마트 보기로 단축 |
| Affinity Photo | Finding, Tagging, Layer States, 비파괴 Live Filter를 독립된 레이어 작업 흐름으로 제공 | 문서 상태를 변경하지 않는 로컬 스마트 보기/저장된 조건을 도입 |
| MediBang Paletta | 터치 선택, 폴더 생성, 잠금, 알파 락, 복제/삭제를 간결하게 노출 | 기존 레이어 행 제어는 유지하고 복잡한 탐색 기능을 오버레이 안에 단계적으로 공개 |
| ibisPaint | 이름 지정, 폴더, 클리핑, 알파 락, 선택 레이어 등 모바일 제작 흐름을 튜토리얼화 | 고급 검색 문법을 패널 안에서 바로 확인할 수 있는 예제 중심 도움말 제공 |

### 검토한 공식 문서

- Clip Studio Paint: <https://help.clip-studio.com/en-us/manual_en/180_layers/Search_Layer_palette.htm>
- Adobe Photoshop: <https://helpx.adobe.com/ca/photoshop/desktop/create-manage-layers/smart-objects/filter-the-layers-panel-by-smart-objects.html>
- Krita: <https://docs.krita.org/en/user_manual/layers_and_masks.html>
- Procreate: <https://help.procreate.com/procreate/handbook/layers/layers-interface>
- Affinity Photo 2: <https://affinity.help/photo2/English.lproj/>
- MediBang Paletta: <https://medibangpaint.com/en/medibang-pro/manual/layer/organizing/>
- ibisPaint: <https://ibispaint.com/lecture/>

## 2. 구현 범위

### 2.1 구조화 레이어 검색

기존의 공백 AND 텍스트 검색을 그대로 유지하면서 다음 문법을 추가했다.

| 문법 | 의미 | 예시 |
| --- | --- | --- |
| 공백 | 모든 조건을 만족(AND) | `주인공 선화` |
| `,` 또는 `|` | 한 필드 안에서 하나 이상 만족(OR) | `kind:image,bubble` |
| `-` 또는 `!` | 조건 제외 | `-is:hidden` |
| 따옴표 | 공백이 있는 한 값 | `group:"주인공 선화"` |
| 비교 연산자 | 불투명도 수치 비교 | `opacity:>=50%` |

지원 필드:

- `kind`, `type`, `종류`: image, text, bubble, draw, frame, sticker, effect, other
- `role`, `역할`: storyboard, rough, lineart, color, tone, lettering, effect, reference, none
- `color`, `label`, `색`, `라벨`: red, orange, yellow, green, blue, violet, none
- `group`, `folder`, `그룹`, `폴더`
- `name`, `이름`
- `text`, `content`, `대사`, `내용`
- `id`
- `is`, `has`, `state`, `상태`, `속성`
- `opacity`, `alpha`, `불투명도`
- `view`, `smart`, `보기`, `스마트`

대표 질의:

```text
kind:draw role:lineart -is:hidden
kind:image,bubble view:attention
group:"주인공 선화" opacity:<50%
is:mask-disabled
is:default-name,orphan-group
색:파랑,빨강 -상태:잠금
```

설계 원칙:

- 기존 일반 텍스트 검색과 NFKC 정규화를 보존한다.
- 알 수 없는 필드명은 일반 텍스트로 취급해 `scene:01` 같은 기존 레이어 이름을 깨뜨리지 않는다.
- 알려진 필드의 잘못된 값은 결과를 넓히지 않고 실패 폐쇄(fail-closed)한다.
- 질의 길이와 검색 대상 문자열 길이를 제한하고 레이어 객체별 검색 문자열을 `WeakMap`으로 캐시한다.

### 2.2 스마트 보기

| 보기 | 판정 기준 |
| --- | --- |
| 바로 편집 가능 | 유효 표시 상태이며 유효 잠금 상태가 아님 |
| 확인 필요 | 기본 이름, 알 수 없는 종류, 비활성 마스크, 표시 중 0% 불투명도, 존재하지 않는 그룹 참조 중 하나 이상 |
| 출력 후보 | 표시 중이며 콘티·밑그림·참고 역할이 아님 |
| 분류 미완료 | 역할 또는 색 라벨이 없음 |
| 합성·모션 | 마스크, 클리핑, 애니메이션, AI, 알파 락, 채우기 참조, 불투명도 조정 중 하나 이상 |

스마트 보기는 문서 메타데이터를 바꾸지 않는 탐색 조건이다. 따라서 undo/redo, 협업 CRDT, 저장 포맷에 새 명령을 추가하지 않는다.

### 2.3 레이어 품질 진단

`inspectStudioLayerQuality`은 UI뿐 아니라 향후 내보내기 사전 점검이나 자동화에서도 재사용할 수 있도록 순수 함수로 제공한다.

- `default-name`: `Layer 12`, `레이어 3`, `Untitled` 같은 기본 이름
- `unknown-kind`: 현재 내비게이터가 분류하지 못하는 레이어 종류
- `disabled-mask`: 마스크가 있으나 비활성화됨
- `zero-opacity`: 숨김은 아니지만 불투명도가 사실상 0%
- `orphan-group`: 레이어가 존재하지 않는 그룹 ID를 참조

개별 이슈는 `is:default-name`, `is:unknown-kind`, `is:zero-opacity`, `is:orphan-group`처럼 직접 검색할 수 있다.

### 2.4 사용자 조건 프리셋

- 현재 구조 필터와 스마트 보기를 최대 8개 저장한다.
- 같은 이름으로 저장하면 ID와 생성 시각을 유지한 채 갱신한다.
- 검색 문구는 문서/인물명 노출을 줄이기 위해 저장하지 않는다.
- 버전이 있는 JSON 포맷, 64KB 상한, ID/이름 중복 제거, 필드별 정규화를 적용한다.
- 브라우저 `storage` 이벤트로 같은 출처의 다른 탭과 동기화한다.
- 사생활 보호 모드나 저장 용량 오류에서도 현재 세션 기능은 계속 동작한다.

## 3. 호환성 및 위험 제어

- 기존 `StudioLayerNavigatorFilters`의 필수 필드는 변경하지 않았고 `smart`는 선택 필드다.
- 기본 필터 객체에는 `smart`를 넣지 않아 기존 직렬화 결과와 정확 비교 테스트를 유지한다.
- `smart: "all"`은 정규화 시 생략해 이전 저장값과 동일한 형태로 돌아간다.
- 레이어/그룹 문서 스키마, 렌더러, undo/redo, 병합·평탄화 실행 경로는 변경하지 않는다.
- 프리셋은 로컬 UI 상태이며 원고 파일이나 협업 세션으로 전파되지 않는다.

## 4. 접근성 및 모바일

- 스마트 보기 버튼은 `aria-pressed`로 선택 상태를 알린다.
- 프리셋 저장·적용·삭제 결과는 `aria-live` 상태 영역으로 알린다.
- 기존 44px 터치 타깃, 포커스 링, 키보드 닫기/포커스 복귀 계약을 유지한다.
- 문법 설명은 기본 화면을 복잡하게 만들지 않도록 접을 수 있는 `details`로 제공한다.

## 5. 검증

추가 테스트:

- 필드 AND, 필드 내부 OR, 제외, 따옴표, 한국어 별칭, 불투명도 비교
- 비활성 마스크·텍스트 유무·그룹 없음 등 제작 상태 검색
- 기존 일반 텍스트 검색/NFKC 동작과 콜론 포함 이름 호환
- 잘못된 알려진 필드 값의 실패 폐쇄와 진단 코드
- 5개 스마트 보기와 품질 이슈 코드
- 프리셋 생성/갱신/정규화/중복 제거/상한/삭제/직렬화 왕복
- `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` 타입 검증

## 6. 변경 파일

- `studio-layer-navigator.ts`: 기존 필터 파이프라인과 스마트 보기/질의 엔진 결합
- `studio-layer-intelligence.ts`: 구조화 질의, 스마트 보기, 품질 진단
- `studio-layer-filter-presets.ts`: 안전한 프리셋 저장 모델
- `StudioLayerFilterPresetShelf.tsx`: 프리셋 UI와 브라우저 동기화
- `StudioLayerNavigatorFilterPanel.tsx`: 스마트 보기, 문법 가이드, 프리셋 결합
- `studio-layer-query.test.ts`: 질의/스마트 보기/품질 테스트
- `studio-layer-filter-presets.test.ts`: 프리셋 테스트
