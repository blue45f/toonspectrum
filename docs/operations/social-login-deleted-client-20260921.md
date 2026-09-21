# Google deleted-client incident — 2026-09-21

Status: replacement credentials saved without deployment; source hardening prepared separately.

## Confirmed cause

Production `/api/auth/providers` advertised a Google GIS client belonging to
project number `464016453534`. An unauthenticated authorization entry probe
returned Google's encoded `deleted_client` error. `gcloud projects describe`
confirmed `resume-platform-prod` was `DELETE_REQUESTED`.
Provider configuration presence and an HTTP 302 from our API did not prove that
the external client still existed. No evidence was found that this was a browser
cookie or account-password problem.

## Credential repair

Created a dedicated **ToonStudio Sign-in Web 20260921** web client in the active
`toonstudio-cloud-20260915` project (number `337601017241`). The existing project's
audience is external / production. Registered only:

- JavaScript origin: `https://www.toonstudio.cloud`
- Redirect: `https://www.toonstudio.cloud/api/auth/oauth/google/callback`

The replacement passed the cookie-free Google authorization preflight and
returned `login_required` to the expected callback. The probe deliberately did
not follow that callback and did not create an application session.
The deleted project was not restored; existing personal-cloud/Drive clients,
scopes, users and database records were not changed.

The ID and secret were saved to **toonspectrum-core-api** on Render using
**Save only**. This does not update running instances. No build, deployment,
restart, migration, plan upgrade or auto-deploy change was requested by this task.
A private recovery copy is outside the repository in the owner's ToonStudio
secrets directory, with mode 0600. Never commit or paste its contents into logs.

## Other production providers

Kakao, Naver and GitHub each returned an authorization redirect to the expected
provider. Each used the canonical www callback and Secure / HttpOnly /
SameSite=Lax state cookies. The destination was a normal provider login page,
not a completed authorization-code exchange or application-session test.
Apple explicitly reported `disabled` / `missing-credentials`; it remains disabled.
No fabricated Apple configuration or paid developer enrollment was introduced.

## Source hardening

- Recover from rejected default/custom Google credential adapters without an
  unhandled rejection, permanent submitting state, raw-error disclosure or
  automatic replay of an old credential. Ignore late failures after unmount.
- Require explicit redirect capability for Kakao/Naver OAuth buttons, matching
  GitHub/Apple. Preserve deliberately configured non-production demos.
- Add an opt-in cookie-free Google client preflight to the existing production
  verifier. Decode only known error classifications; never log opaque state,
  authorization codes or raw provider responses. Bound redirects and requests,
  reject unexpected hosts and never follow an application callback.
- Keep the existing strict five-provider gate as the default. Allow an operator
  to explicitly report an intentionally unconfigured provider with
  `--allow-disabled=apple`, without silently accepting demo or malformed states.
- Report entry-point verification, not successful real-account sign-in.

## Validation and release boundary

The focused auth regression run passed 108 tests across eight suites. Changed
JavaScript/TypeScript files passed ESLint and `git diff --check`. Independent
workspace installation and normal commit/push gates are required before the PR.

Reproduce the current runtime failure / verify the eventual repair:

```sh
pnpm run verify:social-login-production -- --allow-disabled=apple --probe-google-client
```

After explicit production approval, apply the saved credentials using Render's
**Save and deploy** option for the existing approved build, not **Save, rebuild,
and deploy** or an unreviewed latest-main release. Confirm the current live SHA
again before release; it was `9ad8290` when inspected during this task. Retain
branch protections and normal release checks. Deploy the separate UI hardening
only from its subsequently approved and verified source SHA.

After release, verify that provider discovery exposes the replacement project
prefix, the Google preflight no longer reports `deleted_client`, Google redirect
fallback becomes available, and a consenting real-account login establishes an
application session. Recheck Kakao/Naver/GitHub with real accounts when available.
Source tests, saved configuration and actual production authentication are
separate claims and must not be conflated.

References:
- https://developers.google.com/identity/protocols/oauth2/web-server
- https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid
- https://render.com/docs/configure-environment-variables
