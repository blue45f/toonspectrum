# Security advisory exceptions

ToonSpectrum fixes high and critical dependency advisories instead of broadly
silencing them. Any unavoidable exception must be exact, time-bounded and
machine-verifiable.

## GHSA-qwww-vcr4-c8h2 — React Router unstable RSC mode

- Reviewed: 2026-07-31
- Review deadline: 2026-10-31
- Pinned packages: `react-router-dom@7.18.2` and its
  `react-router@7.18.2` dependency
- Upstream scope: only applications using React Router's unstable React Server
  Components APIs
- ToonSpectrum scope: Vite SPA using the declarative `<BrowserRouter>` API

React Router 8.3.0 contains the original upstream fix, and React Router 7.18.2
contains the official v7 backport that hardens the same RSC CSRF code paths.
The GitHub Advisory Database range has not yet incorporated that backport:

- [React Router v7 changelog](https://raw.githubusercontent.com/remix-run/react-router/v7/CHANGELOG.md)
- [official v7 backport PR #15353](https://github.com/remix-run/react-router/pull/15353)
- [pending advisory-range correction #8868](https://github.com/github/advisory-database/pull/8868)

`react-router-dom` also has no 8.x release, so ToonSpectrum stays on the fixed,
latest reviewed 7.x DOM package instead of partially migrating 38 runtime/test
imports to React Router 8's new package entry points during release hardening.

`scripts/verify-security-advisory-exceptions.mjs` runs before `pnpm audit` and
fails closed if:

- the allowlist contains anything other than this advisory;
- the reviewed package pair or exact version changes;
- a React Router Framework/RSC package, config file, entry point or API enters
  runtime source;
- the application stops using the reviewed client `createRoot`,
  `BrowserRouter`, `Routes`/`Route`, and Vite React boundaries; or
- the review deadline passes.

At the deadline, prefer removing the exception by moving to a supported patched
DOM/declarative release. Renew it only after re-checking the upstream advisory
scope and the complete runtime source boundary.
