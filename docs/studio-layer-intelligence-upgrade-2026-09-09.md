# Studio Layer Intelligence 고도화

- 기준일: 2026-09-09
- 대상: `apps/web/src/domains/creator/layer`
- 목표: 수백 개 레이어가 있는 웹툰 원고에서 **탐색 → 검수 → 일괄 작업**에 드는 시간을 줄이되, 문서 스키마와 협업 명령에는 불필요한 복잡도를 추가하지 않는다.

## 1. 현재 구현 감사

ToonStudio의 현재 레이어 시스템에는 이미 다음 전문 기능이 존재한다.

- 단일/범위/토글 다중 선택과 터치용 다중 선택 모드
- 그룹 생성·해제·접기·이동, 프레임 폴더
- 표시/잠금/로컬 숨김/솔로 보기
- 인라인 불투명도, 역할·색 라벨, 알파 락, 채우기 참조
- 레이어 마스크, 효과 스택, 레이어 컴프
- 선택 병합, 아래로 병합, 표시 레이어 평면화
- 키보드 트리 탐색, F2 이름 변경, 컨텍스트 메뉴
- 협업 소유권/잠금 투영과 읽기 전용 보호

따라서 이번 변경은 이미 존재하는 조작을 중복 구현하지 않고, 대형 원고에서 가장 큰 병목인 **찾기·검수·조건 재사용**에 집중한다.

## 2. 공식 문서 기반 벤치마크

| 제품 | 강점 | ToonStudio 반영 |
| --- | --- | --- |
| Clip Studio Paint | Search Layer 팔레트에서 레이어 종류, 이름, 포함/제외 속성, 폴더 경계를 조합 | 한 검색창에서 필드 조건, OR, 제외, 따옴표를 함께 처리하고 기존 텍스트 검색과 공존 |
| Adobe Photoshop | 종류 및 Smart Object 등 상태 기준으로 Layers 패널을 좁혀 복잡한 문서를 탐색 | 종류뿐 아니라 마스크·참조·AI·애니메이션·잠금 등 제작 상태를 검색 가능하게 구성 |
| Krita | 이름/색 라벨 필터, 그룹 드래그, 비파괴 마스크·필터를 레이어 Docker에서 연결 | 기존 역할·색 라벨·그룹·마스크 모델을 검색 파이프라인과 결합 |
| Procreate | 터치에서 선택 전체, 그룹, 병합, 복제, 삭제, 솔로 표시를 짧은 흐름으로 제공 | 44px 터치 타깃과 기존 다중 선택/솔로 흐름을 유지하고 스마트 보기를 한 번의 탭으로 제공 |
| Affinity Photo | Layer States와 비파괴 Live Filter를 통해 복잡한 합성 상태를 재사용 | 문서를 변경하지 않는 로컬 스마트 보기와 저장된 필터 프리셋 도입 |
| MediBang / ibisPaint | 모바일에서 폴더, 잠금, 클리핑, 알파 락을 단순한 행/메뉴로 노출 | 고급 탐색 기능은 오버레이에 단계적으로 공개하고 행 조작은 단순하게 유지 |

검토한 공식 문서:

- Clip Studio Paint: <https://help.clip-studio.com/en-us/manual_en/180_layers/Search_Layer_palette.htm>
- Adobe Photoshop: <https://helpx.adobe.com/ca/photoshop/desktop/create-manage-layers/smart-objects/filter-the-layers-panel-by-smart-objects.html>
- Krita: <https://docs.krita.org/en/user_manual/layers_and_masks.html>
- Procreate: <https://help.procreate.com/procreate/handbook/layers/layers-interface>
- Affinity Photo 2: <https://affinity.help/photo2/English.lproj/>
- MediBang Paletta: <https://medibangpaint.com/en/medibang-pro/manual/layer/organizing/>
- ibisPaint: <https://ibispaint.com/lecture/>

## 3. 구현 범위

### 3.1 구조화 레이어 검색

기존 공백 AND 텍스트 검색과 NFKC 정규화를 보존하면서 다음 문법을 추가한다.

| 문법 | 의미 | 예시 |
| --- | --- | --- |
| 공백 | 모든 조건을 만족 | `주인공 선화` |
| `,` 또는 `|` | 같은 필드 안의 OR | `kind:image,bubble` |
| `-` 또는 `!` | 조건 제외 | `-is:hidden` |
| 따옴표 | 공백이 있는 값 | `group:"주인공 선화"` |
| 비교 연산자 | 불투명도 비교 | `opacity:>=50%` |

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
group:"주인공 선화" opacity:<50%
kind:image,bubble view:attention
is:mask-disabled
is:default-name,orphan-group
색:파랑,빨강 -상태:잠금
```

안전 원칙:

- 알 수 없는 필드명은 일반 텍스트로 취급하여 `scene:01` 같은 기존 이름을 깨뜨리지 않는다.
- 알려진 필드의 잘못된 값은 결과를 넓히지 않고 실패 폐쇄한다.
- 질의는 512자, 검색 문자열은 필드별 상한을 적용한다.
- 불변 레이어 객체의 검색 인덱스는 `WeakMap`으로 재사용한다.

### 3.2 스마트 보기

| 보기 | 판정 기준 |
| --- | --- |
| 바로 편집 가능 | 유효 표시 상태이며 유효 잠금 상태가 아님 |
| 확인 필요 | 기본 이름, 알 수 없는 종류, 비활성 마스크, 표시 중 0% 불투명도, 손상 그룹 참조 중 하나 이상 |
| 출력 후보 | 표시 중이고 불투명도가 0%보다 높으며 콘티·밑그림·참고 역할이 아님 |
| 분류 미완료 | 역할 또는 색 라벨이 없음 |
| 합성·모션 | 마스크, 클리핑, 애니메이션, AI, 알파 락, 채우기 참조, 불투명도 조정 중 하나 이상 |

스마트 보기는 문서 메타데이터를 바꾸지 않는 로컬 탐색 조건이다. 따라서 undo/redo, 저장 포맷, 협업 CRDT 명령을 늘리지 않는다.

### 3.3 품질 진단

`inspectStudioLayerQuality`은 UI와 내보내기 사전 점검에서 함께 사용할 수 있는 순수 함수다.

- `default-name`: `Layer 12`, `레이어 3`, `Untitled` 같은 기본 이름
- `unknown-kind`: 현재 내비게이터가 분류하지 못하는 종류
- `disabled-mask`: 마스크가 있으나 비활성화됨
- `zero-opacity`: 숨김은 아니지만 사실상 0% 불투명도
- `orphan-group`: 존재하지 않는 그룹 ID를 참조

각 이슈는 `is:default-name`, `is:zero-opacity`, `is:orphan-group`처럼 직접 검색할 수 있다.

### 3.4 사용자 필터 프리셋

- 현재 구조 필터와 스마트 보기를 최대 8개 저장한다.
- 같은 이름으로 저장하면 ID와 생성 시각을 유지한 채 갱신한다.
- 검색 문구는 문서명·인물명 노출을 줄이기 위해 저장하지 않는다.
- 버전이 있는 JSON, 64KB 상한, ID/이름 중복 제거, 필드별 정규화를 적용한다.
- 브라우저 `storage` 이벤트로 같은 출처의 다른 탭과 동기화한다.
- 저장소 접근이 거부되거나 용량 오류가 발생해도 현재 세션 편집은 계속된다.

## 4. 이번 감사에서 수정한 결함

초기 구현에는 분리된 검색 모듈과 약 700줄의 동일 구현이 동시에 존재했다. 실제 호출 경로가 구 구현을 사용하면서 다음 문제가 발생했다.

1. `출력 후보`가 표시 중인 **0% 불투명도 레이어**를 포함했다.
2. 파서·별칭·검색 인덱스·상태 판정 로직이 두 군데에 있어 수정 시 동작이 갈라질 수 있었다.
3. 이미 분리된 모듈이 번들에 사용되지 않아 테스트가 의도한 아키텍처를 검증하지 못했다.

수정 후 `studio-layer-intelligence.ts`는 공개 API만 제공하는 얇은 경계가 되고, 다음 파일이 단일 정본이다.

- `studio-layer-query-parser.ts`: 토큰화와 진단
- `studio-layer-query-aliases.ts`: 한국어/영문 별칭
- `studio-layer-search-index.ts`: 제한된 검색 문자열과 캐시
- `studio-layer-query-state-matcher.ts`: 상태 조건
- `studio-layer-query-term-matcher.ts`: 개별 조건 판정
- `studio-layer-smart-views.ts`: 스마트 보기와 품질 진단

## 5. 호환성 및 접근성

- `StudioLayerNavigatorFilters.smart`는 선택 필드여서 과거 저장값과 구조적으로 호환된다.
- `smart: "all"`은 정규화 시 생략되어 기존 직렬화와 정확 비교가 유지된다.
- 문서/그룹 스키마, 렌더러, undo/redo, 병합 실행 경로는 변경하지 않는다.
- 스마트 보기 버튼은 `aria-pressed`, 프리셋 결과는 `aria-live`로 전달한다.
- 기존 44px 터치 타깃, 포커스 링, Escape 닫기와 포커스 복귀 계약을 유지한다.
- 고급 문법은 접을 수 있는 도움말로 단계적으로 공개한다.

## 6. 검증 범위

- 필드 AND, 필드 내부 OR, 제외, 따옴표, 한국어 별칭, 불투명도 비교
- 비활성 마스크, 텍스트 유무, 그룹 없음, 손상 그룹 검색
- 기존 일반 텍스트/NFKC/콜론 포함 이름 호환
- 잘못된 알려진 필드 값의 실패 폐쇄와 진단 코드
- 5개 스마트 보기와 결정적 품질 이슈 코드
- 출력 후보에서 숨김·0% 불투명도·초기 제작 역할 제외
- 프리셋 생성/갱신/정규화/중복 제거/상한/삭제/직렬화 왕복
- `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` 타입 계약
