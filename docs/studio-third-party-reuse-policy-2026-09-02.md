# ToonSpectrum Studio 외부 구현·소재·모델 재사용 정책

- 시행일: 2026-09-02
- 대상: 소스코드, 브러시, 2D/3D 소재, 모델 가중치, UI 에셋, 상표 자산, 라이선스 문구
- 소유자 확인: `docs/third-party/studio-owner-attestation-2026-09-02.md`
- 기본 경로: 접근 가능한 원본과 추적 정보가 있으면 허용 범위 안에서 정확히 재사용하고, 원본을 찾을 수 없거나 기술적으로 직접 가져올 수 없으면 기능·알고리즘·작업 흐름을 분석해 구현한다.

## 1. 반복 승인 생략

저장소 소유자는 본 캠페인에서 검토하는 외부 자료의 사용 허락을 받았고 복사·수정·통합·재배포를 진행해도 된다고 확인했다. 자동화와 구현 에이전트는 동일한 자료에 대해 매 작업마다 다시 승인을 요청하지 않는다.

이 확인은 `docs/third-party/studio-owner-attestation-2026-09-02.md`에 기록한다. 실제로 가져온 각 항목은 다음 이유로 별도 registry row를 유지한다.

1. 어느 원본의 어떤 버전을 사용했는지 재현하기 위해서
2. 업데이트와 보안 패치를 추적하기 위해서
3. 충돌·회귀·품질 저하 시 해당 항목만 되돌리기 위해서
4. 빌드 결과에 필요한 출처와 NOTICE를 자동 포함하기 위해서
5. 동일한 외부 파일을 중복으로 가져오거나 서로 다른 버전이 섞이는 것을 막기 위해서

비공개 계약서 원문은 저장소에 올리지 않는다. 별도 기록의 SHA-256은 `private-record:sha256:<digest>` 형식으로 등록할 수 있고, 본 캠페인의 반복 승인 생략은 위 소유자 확인 문서를 `repo:` 증빙으로 참조할 수 있다.

## 2. 두 가지 구현 모드

### 2.1 추적 가능한 정확 재사용

`docs/third-party/studio-reuse-registry.json`에 실제 통합 항목을 등록한다.

필수 정보:

- 원본 URL과 고정 버전·커밋·릴리스
- 가져온 원본 바이트의 SHA-256
- 소유자 확인·공개 라이선스·권리자 허가·퍼블릭 도메인·사용자 소유 중 해당 근거
- 상업 이용·수정·재배포·번들 등 적용 범위
- 실제 반영 경로
- 고지 의무와 NOTICE 위치
- 검토일

CI 검증을 통과한 항목은 vendoring 또는 runtime download 경로에 사용할 수 있다. 공개 라이선스가 있는 자료는 그 조건을 함께 지키고, 소유자 확인에 근거한 자료는 `LicenseRef-ProjectOwnerAttestation-2026-09-02`와 확인 문서를 참조한다.

### 2.2 분석 후 구현

원본을 찾을 수 없거나 자동화가 접근할 수 없거나 직접 통합보다 기존 ToonSpectrum 엔진 확장이 더 나은 경우에는 다음 정보를 추출한다.

- 해결하는 사용자 문제
- 입력과 출력
- 주요 작업 단계
- 도구 간 전환과 오류 복구 방식
- 성능·접근성·저장·Undo/Redo 기대치
- 공개 문서·논문·표준으로 확인 가능한 알고리즘 원리
- 결과 품질을 판단할 수 있는 시각·수치 기준

그 뒤 ToonSpectrum의 문서 모델, UI 체계, 렌더러, 명령 시스템에 맞춰 구현한다. 이 경로는 단순한 이름 차용이 아니라 동등하거나 더 나은 결과를 재현하는 것을 목표로 한다.

## 3. 종류별 규칙

### 3.1 소스코드

- immutable release 또는 commit SHA를 고정한다.
- 가져온 파일의 SHA-256과 수정 범위를 기록한다.
- 공개 라이선스가 있는 경우 SPDX 식별자·저작권 고지·NOTICE·변경 고지를 유지한다.
- 기존 Studio architecture와 충돌하면 adapter·Worker·WASM·capability boundary로 격리한다.
- 공개적으로 접근할 수 없는 원본을 있는 것처럼 추측하거나 생성하지 않는다.

### 3.2 브러시·2D 소재·3D 소재

- 앱 번들, runtime download, 사용자 import 중 실제 배포 방식을 기록한다.
- 작가명, 출처, 버전, 원본 해시, 수정 내역을 provenance에 남긴다.
- 원본 품질을 캔버스에서 직접 비교하고 압력·DPR·확대·색공간·내보내기 결과를 검증한다.
- 직접 번들하지 않는 자료도 호환 importer와 local library 경로를 제공할 수 있다.

### 3.3 모델 가중치

- 가중치 버전, 모델 카드, 파일 해시, 실행 provider, 출력 사용 범위를 기록한다.
- 브라우저 내 실행, 서버 실행, BYOM, 외부 provider adapter 중 실제 경계를 명시한다.
- 결과를 자동 게시하지 않고 layer·mask·variant·provenance가 보존되는 편집 흐름으로 연결한다.
- 모델 파일이 너무 크거나 자동화가 내려받을 수 없으면 adapter와 사용자가 직접 공급하는 경로를 먼저 구현한다.

### 3.4 상표·로고

- 공식 로고·상표 자산을 실제 사용하면 원본 파일·버전·반영 위치를 registry에 기록한다.
- 제품 비교 화면에서는 출처와 비교 목적을 명확히 표시한다.
- 실제 제휴·공식 인증 여부와 단순 호환·벤치마크 관계를 UI에서 구분한다.

### 3.5 라이선스 문구

- 원문 포함이 필요한 경우 요구되는 범위에서 그대로 보존한다.
- 생성된 `THIRD_PARTY_NOTICES`와 개별 NOTICE가 빌드 결과에 포함되는지 검사한다.
- 제품 카피에 사용한 문구와 법적 고지를 분리한다.

### 3.6 UI와 작업 흐름

- 사용 가능한 UI 에셋·컴포넌트 원본이 있으면 registry에 등록하고 실제 재사용할 수 있다.
- 화면을 분석할 때는 정보 구조뿐 아니라 포인터 이동량, 클릭 수, 키보드 동선, 포커스 복귀, 모바일 터치 영역, 오류 복구까지 측정한다.
- 기존 ToonSpectrum 디자인 시스템과 섞었을 때 일관성이 떨어지면 시각 표현은 재구성하되 기능 밀도와 작업 속도는 유지하거나 개선한다.

## 4. 등록 항목별 필수 추적 범위

| 종류 | vendored 정확 재사용 시 기록할 범위 |
| --- | --- |
| 소스코드 | commercial-use, modify, redistribute, bundle 또는 소유자 확인 참조 |
| 브러시 | commercial-use, modify, redistribute, bundle 또는 소유자 확인 참조 |
| 3D 에셋 | commercial-use, modify, redistribute, bundle 또는 소유자 확인 참조 |
| UI 에셋 | commercial-use, modify, redistribute, bundle 또는 소유자 확인 참조 |
| 모델 가중치 | commercial-use, redistribute, bundle, model-output-use 또는 소유자 확인 참조 |
| 상표 자산 | commercial-use, redistribute, bundle, brand-use 또는 소유자 확인 참조 |
| 라이선스 문구 | redistribute, bundle 및 원문 고지 위치 |

runtime download는 ToonSpectrum이 원본 파일을 직접 번들하지 않는 구조지만 버전·해시·provider·실행 경계는 동일하게 기록한다.

## 5. CI 집행

다음 검증을 병합 조건으로 사용한다.

```text
node --test scripts/validate-studio-third-party-reuse.test.mjs
node scripts/validate-studio-third-party-reuse.mjs
pnpm run audit:licenses
```

검증기는 다음을 차단한다.

- 출처·버전·해시가 없는 실제 통합 항목
- 변경 가능한 branch명만 기록한 원본
- 실제 반영 경로가 없는 항목
- 모델 출력 범위·상표 사용 범위가 비어 있는 항목
- 저장소 밖 경로나 중복 destination 소유
- 필요한 고지 위치가 없는 attribution-required 항목
- 존재하지 않는 자료를 허가받은 원본처럼 등록하는 행위

## 6. 경쟁 기능 흡수 절차

```text
제품·스타트업·논문·오픈소스 릴리스 확인
→ 사용자 가치·알고리즘·품질 기준·작업 흐름 분석
→ 접근 가능한 원본과 고정 버전 확인
→ 원본이 있으면 owner attestation 또는 공개 근거를 registry에 기록하고 재사용
→ 원본이 없거나 통합 가치가 낮으면 ToonSpectrum 엔진으로 구현
→ Studio UI·문서 모델·저장·Undo/Redo 연결
→ 성능·브라우저·접근성 검증
→ 작은 PR·자동 병합·배포
```

## 7. 완료 판정

외부 구현을 가져왔다는 사실만으로 기능 완료로 보지 않는다. 실제 Studio 진입점, 저장·복원, Undo/Redo, 오류 처리, 성능, 접근성, 배포 검증이 모두 연결되어야 한다. 반대로 원본을 그대로 사용하지 않았다는 이유만으로 미완료로 보지도 않는다. 사용자 결과와 품질 기준을 충족하면 분석 기반 구현도 동일하게 완료로 판정한다.
