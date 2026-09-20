# Recent Studio resume readiness follow-up — 2026-09-20

Status: focused test repair. No production resume implementation, retry policy, timeout setting, deployment or database configuration is changed by this follow-up.

## Remote failure and trace evidence

The b96cc5678 Non-studio experience quality run passed 282 tests and failed the recent-work viewport case. The separately seeded `studio-exact-resume` case passed in that same run. [CI run 35483328889](https://github.com/blue45f/toonspectrum/actions/runs/35483328889)

The failed case expected the displayed effective scale **176%** but its last poll observed **98%** while the restored document was still hydrating. The final failure snapshot already contained the product's exact-resume receipt for the saved page with relative zoom **180%**, and the actual canvas HUD **176%**. Those two percentages use different quantities: the receipt stores user zoom; the HUD multiplies that zoom by the measured fit-width scale. [Browser artifact 10597032332](https://github.com/blue45f/toonspectrum/actions/runs/35483328889/artifacts/10597032332)

The trace's monotonic timestamps make the race concrete:

| Event | Trace time |
| --- | --- |
| Reopen recent document | 117181 ms |
| Old zoom poll begins, after merely visible canvas chrome | 127358 ms |
| Last recovery-button visibility RPC starts | 137648 ms |
| Existing 15-second zoom assertion expires | 142358 ms |
| Visibility RPC finishes, button absent | 144092 ms |
| Snapshot contains completed restore receipt | 145772 ms |

The failed poll repeatedly read an absent manual-recovery button while background recovery had not completed. Visible canvas chrome did not establish authoritative document/page/view readiness. The evidence does not show loss of the stored zoom in this case; it does show that the verifier began its final comparison too early under the slower CI run.

## Narrow repair and retained assertions

The existing **60-second readiness budget** now waits for the exact saved-page/zoom restoration message, followed by the actual `STUDIO_EXACT_RESUME_RESTORED_EVENT` with matching canonical project ID, document ID, page ID and relative zoom. The temporary manual-recovery locator handler still clicks the genuine `이어서 그리기` button if that decision appears, then is removed. No source state or resume event is fabricated.

After readiness, the same displayed zoom and scroll-offset/ratio checks remain under the existing **15-second assertion budget**. The whole test remains **90 seconds**, with **zero retries**. The test still authors a real pen stroke, reads it back from the shipped durable store, captures the saved current resume metadata, verifies the sanitized canonical recent URL, and requires zero page errors. It now additionally verifies exactly one matching restore event and the reopened canonical pathname.

The recent-card locator follows the single retained `.cf-intent-recent > .cf-recent-card` after the separately committed home-card consolidation. The richer recent description and all URL assertions remain. No forced click, mocked restore, skipped test or weaker visual threshold is introduced.

## Validation

- macOS ARM64, production preview 5209: **3/3 consecutive passes**, 47.1s / 45.7s / 49.3s; total 148058.665 ms. Zero skipped, unexpected or flaky results.
- Linux ARM64 Chromium, identical production preview: **3/3 consecutive recent-work passes**, 59.440s / 56.554s / 60.241s; total 178599.975 ms. Zero skipped, unexpected or flaky results.
- The same Linux browser then passed **14/14 home/entry/event-gate tests** with the configured two workers (39.9s), including all four home widths, both entry widths, real event dismissal, search, navigation and setup.
- Scoped ESLint and `git diff --check`: PASS.

Linux-browser validation uses the existing isolated `codex-virtual-studio-qa-20260920` Colima profile and Microsoft's official `mcr.microsoft.com/playwright:v1.62.1-noble` image, digest `sha256:dcc5531e97840b9b5e794f2814476b21571c5124a3fca2267d73041f56e7580e`. Only the Playwright 1.62.1 JavaScript packages were copied into a temporary container. The browser runs from `/ms-playwright/chromium_headless_shell-1234/chrome-linux/headless_shell` on Linux aarch64. The test runner and unchanged production Vite preview remain on macOS and connect over Playwright's localhost-only network bridge; this is Linux browser/storage/renderer evidence, not a Linux application build or a subsequent GitHub result. The temporary config asserts the original 90-second test budget and preview origin before execution.

Evidence: `/tmp/virtual-studio-resume-ci-evidence/` (downloaded original trace and action timeline), `/tmp/virtual-studio-resume-ci-repeat-receipt.log`, `/tmp/virtual-studio-resume-linux.config.mts`, `/tmp/virtual-studio-resume-linux-repeat.log`, `/tmp/virtual-studio-resume-linux-processes.log`, `/tmp/virtual-studio-resume-linux-recent-results.json`, `/tmp/virtual-studio-resume-linux-home-gate-results.json`, `/tmp/virtual-studio-resume-tested-dist-sha256.txt`. The owned temporary Linux container was removed and its QA profile stopped after verification; the default Docker context and other running profiles were preserved.

Reproduction uses the repository's production bundle:

```sh
pnpm exec playwright test --config playwright.non-studio.config.ts e2e/creator-flagship.spec.ts --grep 'recent work reopens' --repeat-each=3 --workers=1
# The temporary Linux config preserves the same suite settings, adding only remote-browser
# connection, absolute input/output paths and the existing preview command's working directory.
pnpm exec playwright test --config /tmp/virtual-studio-resume-linux.config.mts e2e/creator-flagship.spec.ts --grep 'recent work reopens' --repeat-each=3 --workers=1
pnpm exec playwright test --config /tmp/virtual-studio-resume-linux.config.mts e2e/creator-flagship.spec.ts e2e/beta-open-event-gate.spec.ts --grep-invert 'recent work reopens'
```
