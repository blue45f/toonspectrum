# Studio-first workspace merge closure — 2026-09-20

## Integration boundary

This continuation starts from the reviewed PR #1861 commit `45d676c6f5d2b7491175c4b52b105dc81882e06f` and integrates current main, including creator-platform PR #1860. Changes are assembled in the isolated `fix/studio-first-merge-closure-20260920` checkout. The original studio-first worktree, its pending files and every other active brush, scene and brand worktree remain unchanged.

Reviewed pending introduction-route changes were copied as a point-in-time patch, not committed out of the original live working directory. The incomplete copied route test was completed in the integration checkout. Keyboard coverage follows both actual workspaces and the preserved introduction destination. The old public verifier referenced an unmounted artwork-study/stage-switcher demo; that browser check now exercises the current introduction’s native Tab/Enter links and heading focus. The standalone artwork-study component’s unit tests remain intact.

## Completed source changes

- `/` and `/home` remain the project-backed workspace. `/about/studio` preserves the previous detailed product introduction, controls, media consent, workflow and recovery links.
- Registered historical introduction fragments keep their exact hash at `/about/studio` without forwarding unrelated query data. Unknown hashes and explicit workspace project context stay on the workspace.
- Introduction document titles retain the existing localized product identity; the public route banner uses a registered translation key rather than an empty home key.
- Workspace, team, explore and introduction routes are discoverable in the public directory. The product navigation model matches the four visible workspace destinations. Research and marketplace remain in the full menu with keyboard/focus/isolation coverage.
- The team surface links to the already-merged hiring teams/groups, filtered positions, private resumes and invitation-based waiting-room/text-meeting panel. Public career discovery remains separate from private artwork; no navigation grants manuscript access.
- Repeated fallback destinations now have stable distinct React keys.
- The focused session workflow includes the single actual spatial background required by its existing route-purpose regression. Test thresholds, production gates, protected branch rules and runner plans are unchanged.
- Browser tests wait for actual settled 44px controls and exercise the visible narrow-screen inspector. Introduction keyboard actions remain native link activation and native browser Back/Forward, not scripted URL substitution.

## Local evidence

- The scoped workspace/virtual-space/navigation/introduction portfolio passed 69 files and 661 tests. Later title, mobile-menu and fallback regressions passed 53 tests; overlapping selections are not summed as unique coverage.
- The original live-workspace browser runner passed 15 checks using a fresh isolated profile and a synthetic project created through the real local project/document APIs: exact document resume, missing-project protection, view persistence, native-dialog focus/Escape, 320/390px screens, team destinations and the actual playable-space shell.
- The updated production web bundle and provider-neutral CSP/license postbuild passed. Build output is local, not a release.
- The full public-browser matrix and six standalone production-candidate verifiers are reviewed separately before merge; their run records live only in the ignored integration QA directory. PR checks remain the merge authority.

## Explicit limits

No production deployment, operator database migration, environment/secret changes, external provider activation or permission broadening is part of this merge. Existing source art and branding are preserved. Waiting-room navigation does not represent a configured real video service. Original active worktrees are not deleted or force-updated.

## Final local browser and focus follow-up

The production-candidate public matrix passed all 252 browser cases, covering the studio-first home, preserved introduction, public routes, actual anonymous creation, corruption preservation and CORS thumbnail behavior. The existing live-workspace check independently passed its 15 checks. Four introduction verifiers passed navigation/history, continuity, purpose-first controls and deferred media. Both public verifiers then passed their complete 42-route/viewport and 16-interaction selections after replacing a hidden-lazy-image decode wait with bounded visible-image readiness and using the real first-visit dismissal control.

Remote verification revealed that the focused sparse checkout also needed the actual review hero, not only the spatial background. Both non-brand image dependencies are now included, and a source contract prevents future omissions. The remote navigation check exposed a deferred-focus race: a scheduled hash target could reclaim a newer keyboard focus. Two new regressions failed against the previous binder and pass after preserving the newer focused control; a third regression retains subsequent explicit navigation. Existing initial fragment, modal, cancellation and history checks remain. Keyboard browser checks also wait for actual link actionability before focusing, without executing a click or rewriting browser history.
