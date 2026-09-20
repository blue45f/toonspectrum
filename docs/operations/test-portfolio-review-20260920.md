# Test portfolio review — 2026-09-20 continuation

Status: implementation and local verification; GitHub merge/run receipts must be checked separately.
Scope: repository-wide static census plus targeted semantic review of duplication candidates, failing
fixtures, execution ownership and expensive setup. This is not a claim of manual review of every
assertion, complete runtime coverage, mutation testing, or all-browser production acceptance.

## Reproduction

Run `node scripts/audit-test-portfolio.mjs` from the repository. The read-only census writes ignored
`artifacts/ci-test-audit/portfolio.json` and `.md`: file paths, line counts, static case declarations,
imports, source-contract flags, explicit/conditional skip declarations and duplicate-body locations.
It parses JS/TS with the installed TypeScript AST. It never changes tests or applies a deletion rule.
The snapshot includes the new audit/helper tests and uncommitted working-tree changes after merging
main into the existing CI branch (base snapshot HEAD `54d52bc037e8c64f2bfdfe69bc83763b28a80811`).

| Area | JS/TS test files | Lines | Static case declarations |
| --- | ---: | ---: | ---: |
| Studio | 3,608 | 884,497 | 33,207 |
| Web outside Studio | 438 | 47,843 | 2,441 |
| API | 314 | 75,607 | 2,455 |
| Packages | 136 | 37,642 | 1,345 |
| Scripts | 179 | 27,802 | 1,314 |
| Other apps, deploy, E2E, tests, tools | 126 | 29,320 | 701 |
| Total | 4,801 | 1,102,711 | 41,463 |

There are also 11 named non-JS/TS test files. Embedded Rust tests and other naming conventions are
outside this parser. Static declarations do not expand parameterized cases and are not the Vitest
runtime collection count. The parser excludes Playwright hooks from test-case counts.

## Findings and decisions

No byte-identical test files were found. After excluding a hook false-positive and consolidating one
proven duplicate case, nine cross-file callback-body groups remain. Identical callback text is not
sufficient evidence of redundant coverage: the PostgreSQL API and maintenance-script tests import
different implementations; dialogue/palette panels exercise different components; browser/worker
contracts and OPFS recovery probes read different targets. The provider-bridge/shadow overlap remains
a further consolidation candidate, not an automatic deletion. All nine groups are retained.

The removed vendor-family case in `validate-studio-competitor-domain-family.test.mjs` calls the same
module with the same three inputs/expected results as `validate-studio-competitor-registry.test.mjs`.
The canonical assertions remain, and the separate expanded-inventory test/file is preserved.
No file-count floor, safety threshold, security assertion, database suite or test isolation was lowered.

352 files are conservative source-contract candidates (272 in Studio). They are a review queue, not
352 useless tests. Static dependency, worker authority, security and lazy-import boundaries can be
valuable. Fragile whole-source text and exact-call-order assertions should migrate incrementally to
small behavioral contracts or AST checks while retaining architecture constraints.
The parser observed 12 explicit conditional declarations; a zero explicit `.skip` count does not
mean zero runtime skips. The previous GitHub root run had 17 skipped files. Conditions and aliases
require runtime reports before drawing coverage conclusions.

Large test files include the API live gateway (7,405 lines), socket transport (6,096), CRDT service
(4,732) and SVG export (4,016). These protect complex behavior and must not be deleted by size.
Prefer shared fixture factories and domain-focused suites; splitting files alone may increase setup.

## Execution costs, not just test counts

The original PR full run `35514246080` reported 4,721 root files and 33m33s root wall time. Its setup
counter of 2,728s is aggregated across workers, not 45 minutes added to wall time.
The shared setup eagerly reads/registers the Studio translation catalog (about 22 MiB on disk) for
every file. This remains a substantial optimization target; worker-global mutable caches or disabled
isolation were deliberately not introduced. React Testing Library now loads only for DOM environments,
while cleanup, translation registration and per-file isolation remain unchanged.
A single local before/after pair on 26 core-package files passed the same 447 tests in roughly
2.50s/2.39s measured report span. The small, uncontrolled difference is not evidence of a broad speedup.

The principal operational saving is removing the duplicated whole-PR suite and moving the 22+7-job
exhaustive main diagnostics to staggered nightly/manual runs. Every canonical full-suite phase remains.
Each diagnostic matrix is limited to two jobs; this is not a workflow-wide or account-wide cap.
CodeQL and complete brush sweeps remain enabled and are separate optimization projects.

## Failures repaired without suppressing checks

The old full-run failures were a stale public worker inventory (61 versus actual 62), an incomplete
R3F fixture that mocked useFrame but not the newly consumed useThree selectors, and source assertions
that did not reflect the shipped tiled/legacy capture and artifact-selection branches.
All existing guard-order, permission, cancellation and recovery assertions remain.
The inherited raw/gzip bundle ratchet was fixed by sharing equivalent bounded-number predicates,
not by increasing budgets or accepting a larger baseline.

## Local receipts

- Required native preflight and audit regressions: 72 passed.
- Cleanup, integration policy, brush policy and registry tests: 80 passed in five files.
- Shot/archive/recovery/worker, frame scheduling and public content: 151 passed in 21 files.
- Changed-code strict ESLint and four changed workflow Actionlint checks passed.
- Production bundle build and unchanged ratchet passed: 27 within baseline, 10 improved, zero regressed.
- Whole-repository Actionlint still reports inherited issues in untouched workflows; no full-clean claim.

Runtime deployment, database migration and secret changes are not performed by these audit commands.

## 2026-09-21 추가 검토 및 중복 실행 정리

추가 전수 스캔은 파일 해시뿐 아니라 테스트 진입점의 재수출 구조도 검토했다.
`apps/web/src/shared/lib/*.test.ts` 중 11개는 원본 테스트를 `export *`로 다시 불러오는
이전 경로의 연결 파일이었다. 원본은 `domains/creator/contracts`에서 별도로 수집되므로
바이트가 같은 파일이 없어도 동일한 검증이 두 번 실행되고 있었다.
삭제 전 22개 파일/156개 테스트를 실행한 후, 각 연결 파일과 원본의 전체 assertion 이름을
비교해 모두 일치함을 확인했다. 연결 파일만 제거한 뒤 원본 11개 파일/78개 테스트를
재실행하여 전부 통과했고, 원본의 assertion 이름/개수가 하나도 달라지지 않았음을 검증했다.
이는 78개의 고유 검증을 없앤 것이 아니라 78회의 중복 등록을 제거한 것이다.
감사 도구에도 순수 테스트 재수출 탐지와 일반 export/추가 동작의 오분류 방지 검증을 추가했다.

최종 작업 트리 정적 스냅샷은 JS/TS 테스트 4,790개, 1,102,714줄, 정적 선언 41,466개다.
정적 선언 수는 매개변수 확장/간접 등록을 포함하는 실행 테스트 수와 다르다.
선언 파일·명시적 fixtures/generated 경로를 제외한 비테스트 JS/TS는 6,603개/2,214,653줄이다.
이 비교에는 운영 애플리케이션뿐 아니라 도구·설정도 포함되므로 운영 소스 비율이나 커버리지로
해석하지 않는다. 절대 개수만으로 테스트가 과다하거나 충분하다고 결론 내리지 않는다.

3개 이하 정적 case를 가진 파일은 1,279개다. 공통 setup이 파일마다 반복되므로 같은 책임의
작은 테스트는 통합 후보지만, 파일 개수를 줄이기 위한 무차별 병합은 하지 않는다.
소스 문자열 검사 후보 352개/38,373줄은 추가 설계 검토 대상이다. 권한·네트워크 경계·지연 로딩
검사는 유지하고, 구현 문구/함수 호출 순서에 의존하는 검사는 작은 행동 계약/AST 검사로 전환한다.
기본 Node 환경 파일 3,999개와 jsdom 지정 파일 791개를 구분했다. 전역 번역 카탈로그 등록은
Node 테스트에도 비용이 발생하지만 순수 함수 여부를 검증하지 않은 채 번역이나 격리를 끄지 않았다.

로컬 검증 증거는 `/tmp/ci-test-forwarders-before-20260921.json`,
`/tmp/ci-test-forwarders-after-20260921.json` 및 기존 `artifacts/ci-test-audit/portfolio.json`이다.
전체 코드의 정적 구조와 중복 후보를 조사했으며 모든 assertion의 수동 의미 검토나 mutation 점수,
전체 E2E 성공을 주장하지 않는다. CI 반영/운영 배포 성공은 별도 실행 영수증으로 확인한다.
