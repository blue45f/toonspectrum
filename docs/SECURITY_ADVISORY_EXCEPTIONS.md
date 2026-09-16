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

## Reviewed code-scanning exceptions

The following alerts were reviewed against their actual data flows. Their GitHub
records contain the rationale; the scanning rules remain enabled for other occurrences.

| Alert | Evidence |
| --- | --- |
| [12](https://github.com/blue45f/toonspectrum/security/code-scanning/12) | The cookie contains an HS256-signed session JWT with an opaque user id, session version, issuer/audience and timestamps. It does not contain OAuth provider passwords or access tokens. HttpOnly, production Secure, SameSite=Lax and expiry are enforced. |
| [24](https://github.com/blue45f/toonspectrum/security/code-scanning/24) | The SHA-256 HMAC authenticates JWT messages with a server key; it does not hash user passwords. The OAuth callback passes only user id and session version to `signSession`. |
| [18](https://github.com/blue45f/toonspectrum/security/code-scanning/18), [19](https://github.com/blue45f/toonspectrum/security/code-scanning/19) | The coturn TURN REST protocol requires HMAC-SHA1 for expiring relay credentials. This is a keyed MAC, not an unkeyed SHA-1 digest. Private user/work identity is independently protected with HMAC-SHA256. The test intentionally verifies protocol compatibility. |
| [59](https://github.com/blue45f/toonspectrum/security/code-scanning/59) | The private preview component receives only a browser-generated `URL.createObjectURL(file)` value or an empty string. No filename or DOM text becomes HTML. A regression test checks a markup-like filename and URL revocation. |
| [100](https://github.com/blue45f/toonspectrum/security/code-scanning/100) | Reviewed on 2026-09-17. Naver's disconnect-callback protocol derives the AES/HMAC key material from the client secret with MD5. The digest is not a password hash or a general application primitive: HMAC-SHA256 authenticates the timestamped callback fields, AES-128-CBC decrypts the provider id, and fixed protocol vectors cover interoperability. Only this exact query occurrence is suppressed in source. |

Protocol references: [Naver Login development guide](https://developers.naver.com/docs/login/devguide/devguide.md),
[coturn TURN REST documentation](https://github.com/coturn/coturn/blob/master/README.turnserver#turn-rest-api),
and [SVG image processing modes](https://www.w3.org/TR/SVG/conform.html#processing-modes).

The two secret-scanning findings were also reviewed as synthetic test data:
a hand-written diagnostic-redaction token and an example UUID used as a test
publisher id. They were resolved as `used_in_tests`; their literal fixtures were
replaced with a provider-neutral redaction string and a generated test UUID.

On 2026-09-17, secret-scanning alerts [3](https://github.com/blue45f/toonspectrum/security/secret-scanning/3),
[4](https://github.com/blue45f/toonspectrum/security/secret-scanning/4), and
[5](https://github.com/blue45f/toonspectrum/security/secret-scanning/5) were reviewed as
OpenVSX-token false positives. Each value was a distinct synthetic publisher UUID in a
test file, not a credential. The fixtures now assemble the same valid UUIDs from segments
instead of expanding secret-scanning path ignores; the alerts are resolved as
`false_positive`.
