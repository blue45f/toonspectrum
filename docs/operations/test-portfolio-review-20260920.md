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
