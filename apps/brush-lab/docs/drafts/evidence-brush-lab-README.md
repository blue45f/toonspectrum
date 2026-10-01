# brush-lab 인증 리포트 증거 디렉터리

- 상태: **현재(규약)**. 배치 예정 경로 `docs/evidence/brush-lab/README.md`(currentDocuments 등록은 통합 담당). 이 초안의 상대 링크는
  `apps/brush-lab/docs/drafts/` 위치 기준이다. 상위 디렉터리 [`docs/evidence/`](../../../../docs/evidence/)는 특정 commit·실험의 증거를 두는 곳이며
  현재 구조 문서가 아니다.
- 관련: [승격 프로세스](./brush-lab-promotion-process.md), [Sumi 엔진 아키텍처](./brush-lab-sumi-engine-architecture-2026-10-01.md),
  스키마 소스 `apps/brush-lab/src/bench/report/report-schema.ts`.

## 1. 파일명 규약

`<presetId>-<laneId>-<YYYYMMDD>.json` — 예: `pencil-hb-webgpu-compute-20261001.json`. 날짜는 리포트 `createdAt`(UTC)에서 온다.
파일명에 쓸 수 없는 문자는 `_`로 바꾼다(`bench/report/serialize.ts`의 `reportFileName`이 생성). 같은 조합을 같은 날 다시 생성하면 덮어쓰지 않고
`-2`, `-3` 접미를 붙인다.

## 2. 스키마와 검증

- `labSchemaVersion: "1.0.0"`(`apps/brush-lab/src/engine/core/version.ts`의 `LAB_SCHEMA_VERSION`). 모든 지표 값은 `number | null`이며 null의 사유는
  `metricNotes["<group>.<key>"]`에 한글로 있다.
- 검증: 리포트는 `brushCertificationReportSchema.parse`(zod)를 통과해야 하며 랩 UI의 다운로드 버튼과 `serializeReport`가 만든 정규(canonical) JSON만 커밋한다.
  검증 명령(루트): `pnpm exec vitest run apps/brush-lab/src/bench/report` (리포트 골든·verdict 규칙 테스트). 디렉터리 파일 전수 검증 스크립트는
  확장 범위이며 통합 담당이 추가한다.
- 필수 환경 필드: `environment.userAgent`(브라우저), `environment.adapterInfo`(vendor·architecture·device·description), `environment.features`,
  `environment.limits`, `environment.softwareRenderer`(true/false/null), `environment.node`(브라우저면 null).
- 해시: `pixelHash`(fnv1a64, 크기 헤더 포함)와 `pixelSha256`(64자리)을 모두 기록한다. `brushConfigHash`는 프로그램 canonical JSON의 SHA-256이다.

## 3. 재현 명령

```sh
# 브라우저 게이트(확장 범위, 통합 담당이 package.json에 등록): Playwright Chromium --enable-unsafe-webgpu, Linux swiftshader
BRUSH_LAB_BROWSER_PROBE=1 pnpm --filter @toonstudio/brush-lab test:browser   # 종료 0 = 리포트 생성, 2 = WebGPU 미지원 구조적 skip, 1 = 실패
# Node(CPU 참조·기준선 레인) 리포트 재현
pnpm exec vitest run apps/brush-lab/src/bench/report apps/brush-lab/src/lanes
# 랩 UI에서 수동 생성: pnpm dev:brush-lab → A/B 비교 → 'JSON 다운로드'
```

리포트에는 fixture ID·시드·캔버스·프리셋 ID·`brushConfigHash`가 있으므로 같은 엔진 버전(`engineVersion`)에서 같은 입력으로 재현할 수 있다.

## 4. 사용 규칙

- **소프트웨어 렌더러 리포트는 성능 증거로 쓰지 않는다.** `softwareRenderer: true`(swiftshader·llvmpipe·lavapipe)는 WGSL 컴파일·패리티 증거로만 쓴다.
  승격(2단계)에는 `softwareRenderer: false` 리포트가 최소 1개 필요하다.
- **PNG는 커밋하지 않는다.** 픽셀은 `pixelHash`·`pixelSha256`으로만 기록하고, 필요하면 랩 UI의 'PNG 다운로드'로 로컬에서 재생성한다.
- 이 컨테이너(GPU 없음)에서 만든 리포트는 `environment.node`가 채워지고 `adapterInfo`가 null이다. 브라우저 검증을 대신하지 않는다.
- 리포트의 `verdict`가 `UNAVAILABLE`이면 "측정 불가"이지 "통과"가 아니다. `metricNotes`의 사유를 읽고 측정 가능한 fixture로 다시 실행한다.
- 파일을 수정하지 않는다. 엔진이 바뀌면 새 날짜로 새 파일을 만들고, 비교는 `pixelHash`·지표 diff로 한다.

## 5. 디렉터리 상태(2026-10-01)

아직 커밋된 리포트가 없다. 첫 리포트는 브라우저 프로브 게이트(확장 범위 1순위)가 생성하며, 이 컨테이너에서는 GPU가 없어 실기기 리포트를 만들 수 없다.
