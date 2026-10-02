# brush-lab 승격 프로세스 — 랩 실험에서 본 서비스 레인까지

- 상태: **현재(절차)**. 배치 예정 경로 `docs/brush-lab-promotion-process.md`(currentDocuments 등록은 통합 담당). 이 초안의 상대 링크는
  `apps/brush-lab/docs/drafts/` 위치 기준이다.
- 적용 대상: `apps/brush-lab`에서 검증한 브러시 프리셋·엔진 레인을 `packages/*`와 `apps/web`에 적용하는 모든 변경.
- 관련: [ADR-0026](../../../../docs/adr/0026-labs-experimental-apps-engine-selection-and-promotion.md)(엔진 선택·승격 결정),
  [ADR-0018](../../../../docs/adr/0018-no-automatic-engine-fallback-vello-primary.md)(자동 폴백 금지), [ADR-0008](../../../../docs/adr/0008-license-isolation-policy.md)(라이선스 격리),
  [Sumi 엔진 아키텍처](./brush-lab-sumi-engine-architecture-2026-10-01.md), [증거 디렉터리 규약](./evidence-brush-lab-README.md).

## 1. 원칙

1. **랩에서 통과하지 않은 것은 승격하지 않는다.** 통과 기준은 인증 리포트(`labSchemaVersion 1.0.0`)의 판정이며 사람의 인상이 아니다.
2. **실 GPU 증거가 최소 1개 있어야 한다.** `environment.softwareRenderer: false`인 리포트 없이는 성능 주장을 하지 않는다. 이 컨테이너(GPU 없음)의
   리포트는 결정성·지표 구조 증거일 뿐 성능 증거가 아니다.
3. **무음 대체 금지.** 본 서비스 레인은 엔진 레지스트리 descriptor로 명시 선택되며 capability 미지원은 fail-visible이다.
4. **라이선스 게이트.** 상업 이용 가능 라이선스(MIT/Apache-2.0/BSD/ISC/Zlib/CC0)만. mixbox·GPL 코드·경쟁 제품 에셋이 섞인 산출물은 승격 불가.
5. **롤백 가능.** 승격은 descriptor 추가·활성화이며 이전 엔진은 유지된다. 문제가 생기면 descriptor 비활성으로 즉시 되돌린다.

## 2. 단계 표

| 단계 | 책임 | 입력 | 산출물 | 성공 기준 | 거부 조건 |
| --- | --- | --- | --- | --- | --- |
| 0. 랩 실험 | brush-lab-lead·작업자 | 프리셋·레인·fixture | A/B 비교 결과, 갤러리 해시 | `pnpm typecheck:brush-lab`·`test:brush-lab`·`build:brush-lab` 통과, 결정성 테스트 통과 | 결정성 실패(재실행 해시 상이), 경계 테스트 위반 |
| 1. 가족 지표 임계값 통과 | brush-lab-lead | 리포트 `verdicts` | 가족별 PASS 목록 | 해당 가족의 모든 임계값 PASS(`FAMILY_TARGETS`·`GLOBAL_THRESHOLDS`) | `FAIL` 1개 이상, 또는 핵심 지표가 `UNAVAILABLE`(측정 불가를 통과로 간주하지 않는다) |
| 2. 인증 리포트 커밋 | brush-lab-lead → 리뷰어 | 브라우저 실행 리포트 JSON | `docs/evidence/brush-lab/<presetId>-<laneId>-<YYYYMMDD>.json` | 스키마 검증 통과, `softwareRenderer:false` 리포트 ≥ 1, `pixelSha256` 기록, PNG는 커밋하지 않고 해시만 | 소프트웨어 렌더러 리포트만 존재, 환경 필드 누락, 브라우저 미검증 상태 |
| 3. 엔진 패키지 추출 | 통합 담당 + core 작업자 | `apps/brush-lab/src/engine` | `packages/studio-brush-engine-sumi`(디렉터리 이동 + package.json) | `boundary.test.ts` 통과(외부 import 0, 서비스 패키지 미의존), 패키지 단독 typecheck·test 통과, `pnpm validate:architecture` 통과 | `@toonstudio/*`·DOM 전역·`Math.random` 참조, zod 허용 파일 외 사용 |
| 4. 본 서비스 레인 연결 PR | 통합 담당 + 리뷰어 | 패키지, descriptor | `apps/web` 엔진 레지스트리 descriptor(`providerDescriptorSchema`), 라이선스 게이트 기록, ADR 갱신 | ADR-0018 단일 선택 유지(자동 폴백 없음), `pnpm audit:licenses` 통과, `pnpm harness:verify`·CI 통과 | 자동 폴백 코드, 라이선스 미확인 의존성, 사용자 데이터 경로 변경 미검토 |
| 5. 회귀 게이트 | 리뷰어·CI | 승격 후 빌드 | 픽셀 해시 스냅샷, δ48 ≤ 0.5 %, 성능 p95 기록 | 스냅샷 동일, δ48·ΔE p99 임계 안, p95 ≤ 16.7 ms(실 GPU) | 해시 변경 무설명, 성능 회귀 |

각 단계는 이전 단계의 산출물을 입력으로 받으며 건너뛰지 않는다. PR 병합은 배포 승인이 아니다(루트 `AGENTS.md` §8).

## 3. 거부 조건 상세

- **UNAVAILABLE 지표 포함**: 가족 핵심 지표(§표의 가족별 지표)나 결정성이 `UNAVAILABLE`이면 통과로 보지 않는다. 사유는 리포트 `metricNotes`에 있으며
  측정 가능한 fixture(예: 압력 단조성은 `slow-pressure-ramp`·`spiral`)로 다시 실행한다.
- **소프트웨어 렌더러만 존재**: `adapterInfo`에 swiftshader·llvmpipe·lavapipe가 있거나 `softwareRenderer:true`인 리포트만 있으면 2단계 불가.
- **결정성 실패**: 같은 입력 재실행의 `pixelHash`가 다르면 0단계로 돌아간다(엔진 안 `Math.random`·시간 의존 코드 의심).
- **라이선스 미확인**: 참고 문헌 원장에 판정이 없는 코드·에셋은 승격 전 판정을 먼저 기록한다.
- **브라우저 미검증**: 레지스트리 상태가 `browser-verification-required`인 레인은 브라우저 실행 리포트 없이 승격하지 않는다.

## 4. 롤백

| 상황 | 조치 |
| --- | --- |
| 승격 레인에서 품질·성능 회귀 | `apps/web` 엔진 레지스트리 descriptor 비활성(이전 엔진 유지), 회귀 리포트를 `docs/evidence/brush-lab/`에 기록 |
| 패키지 결함 | `packages/studio-brush-engine-sumi` 버전 고정(이전 버전), 랩에서 재현 fixture 추가 후 수정 |
| 라이선스 문제 발견 | 해당 코드 즉시 제거·재구현, ADR-0008 절차에 따라 기록 |

롤백도 PR로 기록하며 운영 배포는 별도 승인 정책(`DEPLOY.md`)을 따른다.

## 5. 리포트 스키마 버전 정책

- `labSchemaVersion`은 semver다. 필드 추가는 minor, 의미 변경·삭제는 major. 증거 디렉터리의 기존 파일은 다시 쓰지 않고 새 버전으로 재생성해 나란히 둔다.
- 스키마의 두 번째 소비자(`apps/web` 회귀 게이트 등)가 생기면 `packages/contracts` 후보로 승격한다(루트 `AGENTS.md` §7: 실제 두 번째 소비자가 생긴 범위만).
- 스키마 변경은 `bench/report/report-schema.ts`·골든 테스트·이 문서를 같은 PR에서 갱신한다.

## 6. 책임자

| 역할 | 책임 |
| --- | --- |
| brush-lab-lead | 랩 실험·지표 통과·리포트 생성·초안 문서 |
| 통합 담당 | 패키지 추출·루트 설정·문서 등록·descriptor 연결 PR |
| 리뷰어 | 거부 조건 점검(UNAVAILABLE·소프트웨어 렌더러·결정성·라이선스·브라우저 미검증), 회귀 게이트 승인 |
