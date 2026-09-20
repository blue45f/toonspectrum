# Production social-login availability incident — 2026-09-20

Status: source hotfix; production recovery and source deployment are separate facts.

## Observed production state

The initial public `/api/auth/providers` and `/api/health/ready` requests
returned HTTP 503 with the hosting page `Service Suspended`. This prevented
provider discovery before a social provider could authenticate the visitor.
A later probe returned HTTP 200 from both endpoints. The separately running
approved database migration (GitHub Actions run 35512068226) was successful.
This patch task did not suspend/resume the API or change the database.

Configured discovery: Google GIS, Kakao, Naver and GitHub. Apple explicitly
reported disabled / missing-credentials; no credentials were created or changed.
Kakao, Naver and GitHub start endpoints returned HTTP 302 to their expected
provider authorization hosts with callbacks under `https://www.toonstudio.cloud`.
These are entry-point probes, not completed real-account OAuth transactions.

## Defects addressed

- Provider discovery incorrectly promised that email login remained available
  even when the same API authority was unavailable.
- HTML 5xx responses to email login became `auth-failed`, which the UI translated
  into an incorrect-email-or-password diagnosis. Google also lacked a dedicated
  infrastructure-error fallback. Safe structured backend errors remain intact.
- Provider discovery had no deadline for either response headers or JSON body.
- Recovery required a manual click, and late aborted responses could outlive a
  previous modal instance or a newer request.

## Patch behavior

Use no-store / same-origin discovery, enforce a 15-second deadline, ignore stale
continuations and clean up request/timer/event resources on unmount. Retry once
per visible focus/online/visibility event burst after a failure, with no polling
or automatic replay of login POST requests. Preserve existing user sessions.

## Validation

- 73 tests passed across 10 auth/session/callback suites, including 8 new modal
  availability cases and 5 new store cases (4 HTML upstream statuses + 401).
- Changed-file ESLint, i18n built-in checks and app-boundary validation passed.
- The first full web typecheck exhausted a deliberately limited 6 GiB heap;
  the standard 12 GiB pre-push gate remains required. It was not bypassed.
- No provider-console settings, production secrets, DB migrations, domain routing
  or deployment configuration changes are part of this patch.

A source merge is not evidence that this UI bundle is deployed. Keep the source
SHA, any eventual Cloudflare release and real-account sign-in validation distinct.
