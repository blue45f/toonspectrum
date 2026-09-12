# Homepage release and production availability

## Incident observed 2026-09-12

The public homepage returned HTTP 402 with `x-vercel-error: DEPLOYMENT_DISABLED`.
The current production build was READY on main commit
`84d130943865a4e3d7e569e5317193990ca9c053`.
Build success and an alias are therefore not evidence of public availability.
The connected owner received a Vercel usage suspension notification. Account
usage/billing must be resolved by the owner; this change does not purchase a plan,
modify billing, bypass a quota, move the domain, or claim to resume the account.

## Source scope

- One root homepage instead of two competing hero sections.
- Responsive creator workflow, preserved project and discovery destinations.
- Explicit simple-mode launch using the existing editor preference authority.
- Shared bounded Korean reference vocabulary in the Met request and UI.
- Observable browser storage and shell-cache readiness, never a project-save guarantee.
- Real scoped regression workflow: pure contracts, React, types, production bundle, browser.

The previous generated concept illustrations are NOT included in this release.
Existing first-party artwork and its illustrative disclaimer remain. No mock UI
is presented as an actual screenshot, completed AI conversion or user artwork.
No database schema, secrets, branch protections or unrelated brush work changes.

## Release acceptance

1. The exact PR head passes the flagship build/browser workflow and applicable required checks.
2. Merge by the standard pull-request path; do not force main or fabricate a check.
3. Verify the production deployment commit equals the merge commit and its build is READY.
4. GET the canonical public hostname. Non-2xx, `DEPLOYMENT_DISABLED`, login redirects,
   empty shell, failed assets or browser exceptions are not a successful release.
5. On an available production route verify one H1, Korean search handoff, project
   navigation, image decode, no horizontal overflow and no unsolicited video load.

Rollback is a revert of this PR after review, not an overwrite of unrelated main commits.
