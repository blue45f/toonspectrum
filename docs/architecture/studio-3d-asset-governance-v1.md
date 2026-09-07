# ToonStudio 3D 에셋 품질·공급·공개 거버넌스 v1

## 목적

이 문서는 ToonStudio의 3D 캐릭터·헤어·의상·소품·배경 에셋을 공개 카탈로그에 넣기 전에 적용하는 실행 계약을 설명한다. 기존 Blender 캐릭터 제작 파이프라인, CC0 에셋 전달 목록, 작품 권리 명세를 대체하지 않고 그 결과를 하나의 실패 폐쇄형 공개 게이트로 결합한다.

v1의 핵심 목표는 다음과 같다.

- 시각 품질과 런타임 성능을 같은 점수로 뭉개지 않고 각각 기록한다.
- 얼굴·리깅·헤어·의상·재질·편집성·성능·권리 출처를 8개 품질 축으로 고정한다.
- 폴리곤 수만 통과한 에셋이 관절 붕괴, 관통, 렌더 실패 또는 권리 누락 상태로 공개되는 것을 막는다.
- 자체 제작, 외주, CC0, 크리에이터, 상용 마켓, AI, 스캔, 모션 캡처의 공개 조건을 코드로 분리한다.
- 수신부터 공개까지의 모든 단계와 산출물 해시를 불변 Refinery 영수증에 남긴다.
- 품질 Passport, 공급 증빙, Refinery 승인, 기존 권리 명세의 에셋 ID와 버전이 모두 일치할 때만 공개한다.

## 구현 위치

- `apps/web/src/domains/creator/studio-3d-asset-quality.ts`
  - 8축 품질 점수, 등급, 런타임 프로필, 하드 실패, 품질 Passport
- `apps/web/src/domains/creator/studio-3d-asset-supply.ts`
  - 공급 경로별 권리·격리·재배포 정책
- `apps/web/src/domains/creator/studio-3d-asset-refinery.ts`
  - Refinery 상태 전이, 불변 이력, 최종 공개 게이트
- `apps/web/src/domains/creator/studio-3d-asset-governance.ts`
  - 위 계약의 공개 진입점
- `apps/web/src/domains/creator/studio-3d-asset-governance.test.ts`
  - 정상 공개와 실패 폐쇄 회귀 테스트

## 품질 Passport

### 평가 축과 가중치

| 축 | 가중치 | 판정 대상 |
|---|---:|---|
| `silhouetteAnatomy` | 15 | 실루엣, 비율, 해부학, 주요 형상 |
| `faceExpression` | 15 | 눈꺼풀, 입술, 턱, 치아, 감정 표현 |
| `rigDeformation` | 20 | 관절, Skin Weight, Corrective 변형 |
| `hairClothing` | 15 | 헤어 볼륨, 의상 Fit, 관통, 물리 안정성 |
| `materialsRendering` | 10 | Toon/PBR 재질, 라인, 텍스처, 렌더 일관성 |
| `editabilityCompatibility` | 10 | 체형·의상·표정·포즈·내보내기 호환성 |
| `runtimePerformance` | 10 | 삼각형, 드로콜, 메모리, Morph, 본 예산 |
| `rightsProvenance` | 5 | 출처, 라이선스, 검수, 불변 버전 추적 |

각 축은 0~100점이며 가중 합계로 최종 점수를 계산한다. 등급 경계는 다음과 같다.

| 등급 | 최소 점수 | 사용 의도 |
|---|---:|---|
| `s_hero` | 92 | 얼굴 클로즈업과 주인공 Hero 모델 |
| `a_production` | 85 | 일반 제작용 주요 캐릭터·의상·에셋 |
| `b_background` | 75 | 배경 인물·군중·일반 소품 |
| `quarantine` | 0 | 수정·재검수 전 격리 |

점수가 높아도 하드 실패가 하나라도 있으면 공개할 수 없다. 하드 실패에는 얼굴 부품 노출, 심각한 메시 붕괴, 관통, 잘못된 Bind Pose, 필수 재질 누락, 권리 출처 누락, 위험 콘텐츠, 런타임 예산 초과, 스트레스 포즈 실패, 렌더 QA 미완료, 제작 원본 직접 공개가 포함된다.

### 런타임 프로필

| 프로필 | 삼각형 | 드로콜 | 재질 슬롯 | 텍스처 메모리 | 최대 텍스처 | Morph | 본 | 최소 포즈 | 최소 렌더 뷰 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| `r3_hero` | 140,000 | 20 | 16 | 192 MiB | 4096 | 250 | 256 | 40 | 24 |
| `r2_standard` | 80,000 | 14 | 12 | 96 MiB | 2048 | 120 | 160 | 32 | 24 |
| `r1_mobile` | 40,000 | 10 | 8 | 48 MiB | 1024 | 60 | 128 | 24 | 12 |
| `r0_crowd` | 15,000 | 5 | 4 | 24 MiB | 1024 | 16 | 96 | 8 | 8 |
| `source_master` | 제한 없음 | 제한 없음 | 제한 없음 | 제한 없음 | 제한 없음 | 제한 없음 | 제한 없음 | 0 | 0 |

`source_master`는 편집·베이크 원본이며 공개 런타임 파일이 아니다. 따라서 수치가 낮더라도 `source_master_not_publishable` 하드 실패로 공개가 차단된다.

프로필별 최소 품질 등급은 `r3_hero = S`, `r2_standard = A`, `r1_mobile/r0_crowd = B`다. 모든 공개 프로필은 최대 4개의 Vertex Influence를 사용한다.

## 공급 정책

공급 정책은 권리 상태가 `unknown`인 값을 허용으로 승격하지 않는다. `commercialUse`, `redistribution`, `derivatives`, `publicCatalog`가 모두 명시적으로 `allowed`여야 한다. 공개 과정에서 원본을 변환하고 사용자가 결과를 이용하므로 파생물·서비스 배포 권한이 필수다.

### 공통 조건

- 에셋 ID와 불변 버전
- 원본 출처 또는 계약 증빙 참조
- 담당자와 검토 시각을 포함한 사람의 승인
- 상업적 이용, 재배포, 파생물, 공개 카탈로그 권한
- `private_import`가 아닌 공개 호환 모드

### 공급원별 추가 조건

| 공급원 | 추가 조건 |
|---|---|
| `first_party` | ToonStudio의 원저작권 또는 충분한 소유권 확인 |
| `commissioned_partner` | 서비스 배포 계약, 최종 사용자 이용을 위한 Sublicense |
| `cc0` | `CC0-1.0` 원문과 공개 도메인 헌정·원출처 확인 |
| `creator_marketplace` | 배포·변환·존속 권리를 포함한 계약과 Sublicense |
| `commercial_marketplace` | 일반 구매 EULA가 아닌 별도 배포 계약과 Sublicense |
| `ai_assisted` | 모델 ID·버전·생성 영수증, 입력 권리, 격리·유사성 검수 통과 |
| `photogrammetry` | 재산권, 개인정보, 상표 노출 검토 통과 |
| `motion_capture` | 실연자 동의와 모션 재배포 권한 |
| `private_user` | 공개 불가. 사용자 전용 프로젝트에서만 사용 |

공급 판단은 법률 자문이나 권리 인증을 대신하지 않는다. 코드가 수행하는 역할은 증빙 누락과 정책 불일치를 자동 차단하는 것이다.

## Asset Refinery 상태 기계

정상 경로는 다음과 같다.

```text
received
  -> quarantined
  -> rights_checked
  -> analyzed
  -> normalized
  -> repaired (필요한 경우)
  -> optimized
  -> technical_qa
  -> render_qa
  -> art_review
  -> approved
  -> published
```

- `normalized -> optimized` 전이는 수리가 불필요한 에셋을 위한 정상 단축 경로다.
- 공개 전 각 단계에서는 `rejected`로 전환할 수 있다.
- `published` 에셋은 권리 철회나 중대 결함이 확인되면 `withdrawn`으로만 전환한다.
- `rejected`와 `withdrawn`은 종결 상태다. 재처리는 기존 이력을 덮어쓰지 않고 새 버전·새 영수증으로 시작한다.
- 단계를 건너뛰는 전이는 런타임에서 예외로 차단된다.
- 이벤트 시각은 역행할 수 없다.
- 각 이벤트는 담당자, 사유, 진단, 출력 파일 종류·참조·SHA-256을 기록한다.

## 최종 공개 게이트

`evaluateStudio3dAssetRelease`는 다음 조건을 모두 확인한다.

1. Refinery 영수증, 품질 Passport, 공급 증빙의 에셋 ID가 같다.
2. 세 문서의 불변 에셋 버전이 같다.
3. Refinery 단계가 `approved`이며 해결되지 않은 `error`가 없다.
4. 품질 Passport가 점수·하드 실패·런타임 예산·포즈·렌더 기준을 통과했다.
5. 공급 정책이 공개 카탈로그를 허용한다.
6. 기존 `studio-asset-rights-manifest` 게시 사전 점검이 통과 상태다.
7. 권리 명세에 동일한 에셋 ID와 정확한 버전이 존재한다.

하나라도 실패하면 진단 코드 목록을 반환하고 공개 전이를 수행하지 않는다. `publishStudio3dAsset`은 게이트가 통과된 경우에만 `approved -> published` 이벤트를 추가한다.

## 사용 예시

```ts
import {
  buildStudio3dAssetQualityPassport,
  createStudio3dAssetRefineryReceipt,
  evaluateStudio3dAssetRelease,
  evaluateStudio3dAssetSupply,
  publishStudio3dAsset,
  transitionStudio3dAssetRefinery,
} from "./studio-3d-asset-governance";
```

1. Blender·GLB 분석 결과와 아트 검수 점수로 품질 Passport를 만든다.
2. Rights Ledger의 권한과 공급원별 증빙으로 공급 판단을 만든다.
3. 실제 처리 단계마다 `transitionStudio3dAssetRefinery`를 호출해 영수증을 갱신한다.
4. 기존 작품 권리 명세 결과를 포함해 공개 게이트를 평가한다.
5. 게이트 통과 후에만 `publishStudio3dAsset`으로 카탈로그 상태를 변경한다.

## 기존 파이프라인 연결 지점

### Blender 캐릭터 파이프라인

`tools/blender/toonstudio_blender_kit`의 `quality-report.json`은 메시, 토폴로지, Skin, 텍스처, 휴머노이드 본, 얼굴 Shape Key, 헤어 LOD 결과를 제공한다. 후속 어댑터는 이 보고서를 `runtimeMetrics`, 스트레스 포즈, 렌더 QA 입력으로 변환해야 한다. 시각·해부학·표정 미학 점수는 자동 기술 점수로 위조하지 않고 Art Review 입력으로 유지한다.

### CC0 전달 카탈로그

`studio-cc0-asset-delivery.ts`는 현재 해시, 크기, 렌더 검증, 공급 도메인, CC0 조건을 검사한다. 신규 3D 카탈로그 버전부터 각 모델에 품질 Passport와 Refinery 영수증 참조를 추가하고, 공개 목록 생성 전에 본 거버넌스 게이트를 실행한다. 기존 전달본은 소급해 승인한 것으로 간주하지 않고 재검수 큐에서 Passport를 생성한다.

### 권리 명세

기존 `studio-asset-rights-manifest.ts`는 작품에 배치된 에셋의 사용 범위·라이선스·만료·출처·담당자 확인을 관리한다. 최종 공개 게이트는 이 결과를 그대로 사용하며 `unknown` 또는 버전 누락을 허용하지 않는다.

## 운영 원칙

- 점수만 높이는 수정으로 하드 실패를 우회하지 않는다.
- 원본 파일을 덮어쓰지 않고 에셋 버전을 고정한다.
- 수동 검수 결과도 담당자와 시각을 포함한 영수증 이벤트로 기록한다.
- 권리나 품질이 변경되면 기존 Passport를 수정하지 않고 새 에셋 버전을 발행한다.
- 웹 런타임 배포본과 Blender·USD 제작 원본을 같은 프로필로 취급하지 않는다.
- 상용 마켓 구매 파일과 사용자 개인 업로드는 별도 계약 없이 공개 카탈로그로 승격하지 않는다.
- AI 결과는 격리 해제 전 공개 경로에 들어갈 수 없다.

## v1 이후 확장 순서

1. Blender `quality-report.json` → 품질 Passport 자동 어댑터
2. GLB/VRM 업로드 분석 Worker와 Refinery 이벤트 저장소
3. 스트레스 포즈 자동 렌더 행렬과 시각 회귀 결과 연결
4. CC0 기존 모델의 소급 Passport 생성 및 카탈로그 v2 전환
5. 관리자 검수 화면에 점수 축·하드 실패·예산 초과·이력 표시
6. Creator Marketplace 제출 Preflight와 Rights Ledger 영구 저장
7. 장면 단위 총 GPU 예산과 동적 LOD 선택기 연결

v1은 에셋을 자동으로 아름답게 만드는 모델러가 아니라, 품질과 권리 증빙 없이 공개되는 경로를 구조적으로 차단하는 기반이다. 실제 메시 수정, Retopology, Hair/Clothing 생성, Corrective Shape 제작은 기존 Blender 파이프라인과 이후 Worker가 수행한다.
