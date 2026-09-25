# 보안 advisory 예외 정책

- 상태: **현재 보안 정책**
- 최종 갱신: **2026-09-26**

`pnpm run audit:security`는 production·development dependency를 모든 severity에서 검사하며 필수 CI core
lint gate에 포함된다. `scripts/verify-security-advisory-exceptions.mjs`는 registry audit 전에 비어 있지
않거나 잘못된 advisory exclusion list를 거부한다.

**현재 dependency advisory 예외는 없다.**

## 종료된 React Router 예외

과거 `GHSA-qwww-vcr4-c8h2` metadata 예외는 2026-09-08 제거했다. GitHub advisory가
React Router 7.18.2를 v7 최초 수정 release로 반영했으므로 설치된
`react-router-dom@7.18.2`/`react-router@7.18.2`는 예외 없이 audit을 통과한다. 예외를 정당화하던 RSC-only
제약과 review deadline도 종료됐다.

## 검토된 code-scanning 예외

다음 alert는 실제 data flow를 검토했고 GitHub alert record에 근거를 남겼다. scanning rule은 다른
발생 위치에서 계속 활성화된다.

| alert | 검토 근거 |
| --- | --- |
| code scanning #12 | cookie는 opaque user ID, session version, issuer/audience, timestamp를 가진 HS256-signed session JWT다. provider password/access token은 없고 HttpOnly, production Secure, SameSite=Lax, expiry를 적용한다. |
| #24 | SHA-256 HMAC은 server key로 JWT message를 인증하며 user password hash가 아니다. OAuth callback은 user ID와 session version만 `signSession`에 전달한다. |
| #18, #19 | coturn REST protocol이 expiring relay credential에 HMAC-SHA1을 요구한다. unkeyed SHA-1 digest가 아니며 private identity는 별도 HMAC-SHA256으로 보호한다. |
| #59 | private preview는 `URL.createObjectURL(file)` 또는 빈 문자열만 받는다. filename/DOM text를 HTML로 만들지 않으며 markup-like filename과 URL revoke 회귀 검사가 있다. |
| #100 | Naver disconnect callback protocol이 client secret에서 AES/HMAC key material을 MD5로 파생한다. password hash/general primitive가 아니며 HMAC-SHA256, AES-128-CBC와 protocol vector로 범위를 제한한다. |

Naver Login, coturn TURN REST, SVG processing mode의 공식 protocol 문서를 상호운용 근거로 사용한다.

## secret-scanning 검토

hand-written diagnostic token과 test publisher UUID는 synthetic fixture로 확인해 `used_in_tests`로
종료했고 provider-neutral redaction string과 generated UUID로 교체했다.

2026-09-17 OpenVSX token alert #3, #4, #5는 서로 다른 synthetic publisher UUID를 credential로 오인한
false positive였다. path ignore를 넓히지 않고 fixture가 같은 UUID를 segment에서 조립하도록 바꾸고
`false_positive`로 종료했다.

새 예외를 추가하기보다 dependency 또는 code를 수정한다. 불가피한 protocol 예외는 정확한 발생 위치,
data flow, 공식 protocol 근거, review date와 회귀 검사를 함께 기록한다.
