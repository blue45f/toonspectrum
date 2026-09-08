# Security advisory coverage

`pnpm run audit:security` checks production and development dependencies at every
severity level. It is part of the required CI `core` gate through the lint job.
`scripts/verify-security-advisory-exceptions.mjs` rejects nonempty or malformed
advisory exclusion lists before running the registry audit. There are no active
dependency advisory exceptions.

## Retired React Router exception

The former `GHSA-qwww-vcr4-c8h2` exclusion was removed on 2026-09-08. The
[GitHub advisory](https://github.com/advisories/GHSA-qwww-vcr4-c8h2) now correctly
identifies React Router 7.18.2 as the first fixed v7 release. The installed
`react-router-dom@7.18.2` / `react-router@7.18.2` pair therefore passes the audit
without an exception. The old RSC-only configuration restrictions and review
deadline existed solely to justify that metadata exclusion and are retired with it.

## Reviewed code-scanning false positives

The following alerts were reviewed against their actual data flows on 2026-09-08.
Their GitHub dismissal records contain the rationale; the scanning rules remain
enabled for other occurrences.

| Alert | Evidence |
| --- | --- |
| [12](https://github.com/blue45f/toonspectrum/security/code-scanning/12) | The cookie contains an HS256-signed session JWT with an opaque user id, session version, issuer/audience and timestamps. It does not contain OAuth provider passwords or access tokens. HttpOnly, production Secure, SameSite=Lax and expiry are enforced. |
| [24](https://github.com/blue45f/toonspectrum/security/code-scanning/24) | The SHA-256 HMAC authenticates JWT messages with a server key; it does not hash user passwords. The OAuth callback passes only user id and session version to `signSession`. |
| [18](https://github.com/blue45f/toonspectrum/security/code-scanning/18), [19](https://github.com/blue45f/toonspectrum/security/code-scanning/19) | The coturn TURN REST protocol requires HMAC-SHA1 for expiring relay credentials. This is a keyed MAC, not an unkeyed SHA-1 digest. Private user/work identity is independently protected with HMAC-SHA256. The test intentionally verifies protocol compatibility. |
| [59](https://github.com/blue45f/toonspectrum/security/code-scanning/59) | The private preview component receives only a browser-generated `URL.createObjectURL(file)` value or an empty string. No filename or DOM text becomes HTML. A regression test checks a markup-like filename and URL revocation. |

Protocol references: [coturn TURN REST documentation](https://github.com/coturn/coturn/blob/master/README.turnserver#turn-rest-api),
[SVG image processing modes](https://www.w3.org/TR/SVG/conform.html#processing-modes).

The two secret-scanning findings were also reviewed as synthetic test data:
a hand-written diagnostic-redaction token and an example UUID used as a test
publisher id. They were resolved as `used_in_tests`; their literal fixtures were
replaced with a provider-neutral redaction string and a generated test UUID.
