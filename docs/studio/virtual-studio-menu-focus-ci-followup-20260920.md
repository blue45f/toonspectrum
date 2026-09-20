# Public menu focus CI follow-up — 2026-09-20

Status: current, narrow browser-test sequencing repair. This does not claim all CI is green.

## Baseline and observed failure

PR #1856 was squash merged as `5d1cd7ace7f166e932077b5d4733836012b633b3`.
The failing PR head, `6b3a6de16ac2d201e6c499caf08d1e24a25c1537`, has the same Git tree.
The follow-up uses a separate checkout and the original CI production preview artifact;
no product rebuild is needed for a test-only change.

[Non-studio experience quality, run 35485825361](https://github.com/blue45f/toonspectrum/actions/runs/35485825361/job/106011891557)
reported **282 passed, 1 failed**. The only failure was the mobile menu's final
`toBeFocused()` assertion in `e2e/non-studio-controls.spec.ts`.

The retained Playwright trace establishes the interleaving, in trace-relative milliseconds:

| Action | Start | End |
| --- | ---: | ---: |
| Press Escape to close the mobile menu | 156423.005 | 156662.300 |
| Assert the menu trigger is collapsed | 156833.796 | 157286 |
| Automatic locator handler clicks the newly visible beta gate's close button | 157020.560 | 157217.615 |
| Assert focus is restored to the menu trigger | 157300.811 | 172312.560 |

The real first-visit beta dialog appeared after the menu interaction began. The journey
fixture's locator handler performed a second dialog interaction between Escape and the
focus assertion. The failing screenshot shows both dialogs closed. The failure therefore
does not isolate the menu's focus restoration: a later modal close has already changed
focus. The beta gate records and restores its own previous focus, and that element may
belong to the menu that has just unmounted.

## Repair

Only this menu-focus describe group opts out of the opportunistic beta locator handler.
It uses the existing `dismissBetaEvent(page)` helper to wait for and click the **real**
visible close control before opening the menu. The beta gate is neither pre-dismissed in
storage nor removed from the application.

The menu checks still require expanded state, visibility, Escape, collapsed state and
focus restored to its trigger. The dialog locator now names the actual menu, and an
explicit hidden assertion confirms that this menu closes. Other public journeys retain
their handler, and the dedicated first-visit, persistence and keyboard beta-gate tests
remain unchanged. Test deadlines, retry policy, CI configuration and product source are
unchanged.

## Validation

The original Linux CI artifact `non-studio-web-preview` (artifact ID `10597394328`)
was extracted into this follow-up checkout's ignored `dist/` directory. Browser checks
below run that identical production JavaScript in local macOS Chromium; these are not a
replacement for a fresh Linux Actions result.

```sh
pnpm exec eslint e2e/non-studio-controls.spec.ts --max-warnings 0
pnpm exec playwright test --config playwright.non-studio.config.ts \
  e2e/non-studio-controls.spec.ts --grep 'mobile menu opens' \
  --repeat-each 5 --workers 1
pnpm exec playwright test --config playwright.non-studio.config.ts \
  e2e/non-studio-controls.spec.ts e2e/beta-open-event-gate.spec.ts --trace on
```

- ESLint: passed with zero warnings.
- Five independent menu-focus repetitions: **5 passed**, 39.4 seconds.
- Controls plus dedicated beta-gate regression: **10 passed**, 3.6 minutes, using
  the unchanged two-worker CI configuration.
- The passing trace orders the real beta close click (16432.661 ms), beta hidden
  assertion (17340.831 ms), menu open (17528.023 ms), Escape (18407.118 ms), and
  restored-focus assertion (20200.663 ms), with no beta handler interleaved.

Local evidence logs: `/tmp/virtual-studio-ci-followup-menu-repeat.log` and
`/tmp/virtual-studio-ci-followup-controls-and-gate.log`. Source failure evidence is the
run's `non-studio-quality` artifact (ID `10597940839`), including `trace.zip`,
`test-failed-1.png` and `error-context.md`. Generated browser artifacts are not committed.

No deployment, branch-protection change, CI bypass or paid infrastructure action was performed.
