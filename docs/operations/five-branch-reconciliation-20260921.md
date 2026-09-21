# Five-branch reconciliation — 2026-09-21

Scope: finish and merge the five branches explicitly named by the user. This is not deployment approval.
Initial remote main: `09aff47d91be4be8b1b3192d8898ad64e4883edf`.

## Source inventory

| Branch | Observed head | Reconciliation |
| --- | --- | --- |
| `fix/studio-world-publication-contract-import-20260921` | `2006e8ef464a38aa84c125564e94eee2a6ab4f48` | PR #1899 was closed, not merged. Its patch already exists in main; the merge produces no code delta. Preserve its ancestry. |
| `ci/throughput-validation-20260920` | `31196230c44639fba7f80919ba1582ac8312d4f9` | No PR. Replace the obsolete historical repair experiment with manual, read-only validation of the selected main SHA. |
| `feat/studio-final-qa-release-20260921` | `3ccaf5362c43ea8d618ed8a942dcb0d332e8dbcf` | No PR. Resolve nine conflicts against the newer UI and recovery verifier while retaining missing receipt and readiness diagnostics. |
| `fix/drawing-ux-v2-integration-20260921` | `91752b091cfe7fdcf04915334d2fa756b7a40b25` | PR #1922 was closed, not merged. Its intended changes already exist in main; the merge produces no code delta. Preserve its ancestry. |
| `fix/studio-session-close-consent-20260921` | `8c20fcfefc9dfd951e5cb1c5c51e51c851cdb2c8` | No PR. Include scope/host/participant changes and summary-edit invalidation of previously confirmed closing forms. |

## Integration decisions

- Use real merges rather than cherry-picking away the source branches' history. Verify all five observed tips are ancestors of final main.
- Preserve the current `aria-label` public property, newer workspace library routes and exact-resume selectors. Retain the older branch's hidden-text accessibility and additional browser-Back assertions without restoring obsolete UI.
- Report observed automatic recovery separately from an actual explicit restore click. Busy, absent and unconfirmed notices must not become successful receipts; preserve legacy confirmed manual receipts.
- Preserve current storage/PNG/geometry assertions and collect exact local static-preview readiness failures separately from successful API verification.
- The throughput workflow must not fetch/execute historical remote scripts, publish Git objects, move branches or depend on PR #1883 remaining open. Preserve affected tests, typecheck, architecture, production build, bundle and artwork gates.
- Manual validation is limited to main, one existing runner and a 25-minute ceiling, with read-only contents permission and always-preserved outcome artifacts. Required CI, nightly coverage, bundle baselines and protections are unchanged.
