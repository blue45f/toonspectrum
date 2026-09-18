# 소셜 로그인 공급자 신청·운영 설정

이 문서는 ToonSpectrum의 사용자 로그인용 OAuth 애플리케이션을 카카오·네이버·GitHub에 등록하고,
Core API 환경변수와 운영 콜백을 연결하는 정본 절차다. 로그인 자격 증명은 모두 서버 전용이며
저장소, 브라우저 번들, `VITE_` 환경변수에 넣지 않는다.

## 공통 운영값

| 항목 | 값 |
| --- | --- |
| 서비스 이름 | `ToonSpectrum` |
| 홈페이지 | `https://www.toonstudio.cloud` |
| OAuth/API 기준 URL | `https://www.toonstudio.cloud` |
| 로그인 완료 복귀 URL | `https://www.toonstudio.cloud/auth/callback` |

Core API:

```dotenv
OAUTH_REDIRECT_BASE_URL=https://www.toonstudio.cloud
WEB_APP_BASE_URL=https://www.toonstudio.cloud
AUTH_STATE_SECRET=<앞뒤 공백 없는 32바이트 이상 무작위 값>
AUTH_SESSION_SECRET=<앞뒤 공백 없는 32바이트 이상 무작위 값>
```

`AUTH_STATE_SECRET`은 인가 코드 탈취·CSRF 방어용 서명 권한이고, 발급된 `state`는 공급자별
HttpOnly·SameSite=Lax 임시 쿠키와도 일치해야 한다. 따라서 다른 브라우저에서 시작한 로그인
콜백을 주입할 수 없다. `AUTH_SESSION_SECRET`은 ToonSpectrum HttpOnly 세션의 서명 권한이다.
기존 운영 값을 자동으로 덮어쓰거나 회전하지 않는다.

운영 앱과 로컬 개발 앱은 분리한다. 특히 GitHub OAuth App은 운영 callback을 고정하고,
`http://localhost` 검증은 별도의 개발용 OAuth App과 별도 자격 증명을 사용한다.
운영에서는 자격 증명이 없는 공급자를 숨기며, `AUTH_SOCIAL_DEMO_ENABLED` 값이 잘못 들어가도
production에서는 데모 계정을 발급하지 않는다.

## 공급자 벤치마크와 선정 결과

| 공급자 | 이번 범위 | 판단 |
| --- | --- | --- |
| Google | 유지·보강 | 범용 계정, GIS ID 토큰 검증, 기존 운영 클라이언트 재사용 |
| 카카오 | 실연동 | 국내 사용자 전환에 가장 중요하며 최소 프로필 scope로 연결 |
| 네이버 | 실연동 | 국내 계정 보급률과 웹툰 사용자 친화성이 높음 |
| GitHub | 신규 실연동 | 창작 도구·개발자·오픈소스 사용자에게 적합, PKCE와 검증 이메일 적용 |
| LINE | 후속 후보 | 일본·대만 확장 시 우선 검토하되 현재 국내 중심 가입 화면에는 과도함 |
| Microsoft | 후속 후보 | 기업·학교 계정 수요가 확인될 때 도입 |
| Discord | 후속 후보 | 커뮤니티 서버 연동 요구가 생길 때 도입 |
| Apple | 제외 | 현재 무료 인프라 원칙과 맞지 않는 유료 개발자 프로그램 가입이 필요함 |
| Facebook/Instagram | 제외 | 현재 핵심 사용자 적합도가 낮고 앱 검수·데이터 사용 고지가 추가됨 |

공급자 수를 늘리는 것보다 로그인 화면의 선택 피로, 개인정보 동의 범위, 비밀 회전과 탈퇴 웹훅을
안정적으로 운영하는 편이 중요하므로 이번 PR은 위 네 공급자에 집중한다.

## 카카오 로그인

### 콘솔 신청

1. Kakao Developers의 **앱**에서 `ToonSpectrum` 앱을 만든다.
2. 앱 대표 도메인을 `https://www.toonstudio.cloud`로 설정한다.
3. **제품 설정 → 카카오 로그인 → 일반**에서 카카오 로그인을 활성화한다.
4. **앱 설정 → 플랫폼 키 → REST API 키 수정**의 카카오 로그인 Redirect URI에 아래 값을
   정확히 등록한다.

```text
https://www.toonstudio.cloud/api/auth/oauth/kakao/callback
```

5. **카카오 로그인 → 동의항목**에서 닉네임과 프로필 이미지를 최소 권한으로 설정한다.
   두 항목 모두 사용자가 거부해도 로그인할 수 있으므로 선택 동의가 권장된다.
6. 카카오계정(이메일)은 앱 화면에 `권한 없음`이 표시되면 요청하지 않는다. 비즈니스/추가 기능
   승인이 끝난 뒤에만 이메일 scope를 opt-in한다.
7. **플랫폼 키**의 REST API 키와 활성화된 **카카오 로그인 Client Secret**을 Core API secret
   store에 저장한다.

```dotenv
KAKAO_REST_API_KEY=<REST API 키>
KAKAO_CLIENT_SECRET=<Client Secret>
KAKAO_ACCOUNT_EMAIL_SCOPE_ENABLED=false
KAKAO_APP_ID=<앱 ID>
KAKAO_ADMIN_KEY=<대표 어드민 키>
```

8. 연결 해제 웹훅 수신 코드를 포함한 릴리스가 운영 배포된 뒤 **앱 → 웹훅 → 연결 해제 웹훅**에
   아래 HTTPS URL과 `POST` 메서드를 등록한다. 배포 전에 등록하면 실패율 누적으로 웹훅이 중지될 수 있다.

```text
https://www.toonstudio.cloud/api/webhooks/kakao/unlink
```

수신 서버는 `Authorization: KakaoAK ...` 헤더와 `app_id`를 모두 검증한다. 다른 로그인 수단이
남아 있으면 카카오 연동만 제거하고 모든 기존 세션을 폐기한다. 카카오만 로그인 수단이었던 계정은
기존 탈퇴 경계를 사용해 개인정보를 익명화하고 세션·공급자 연동을 제거한다. 알 수 없는 사용자에
대한 반복 전달은 `200 OK`로 멱등 처리한다. 내부 정리 작업이 실패하더라도 카카오 규격에 맞춰
`200 OK`를 반환하고, 식별자나 자격 증명을 포함하지 않은 오류 로그로 운영 대응한다.

기본 요청 범위는 `profile_nickname,profile_image`다. 이메일 권한 승인을 받은 뒤
`KAKAO_ACCOUNT_EMAIL_SCOPE_ENABLED=true`로 바꾸면 `account_email`을 추가한다. 카카오가 이메일을
유효·검증 완료로 표시한 경우에만 기존 ToonSpectrum 계정과 이메일로 연결하고, 그렇지 않으면
카카오 사용자 ID 기반 별도 계정을 만든다.

## 네이버 로그인

### 콘솔 신청

1. Naver Developers의 **Application → 애플리케이션 등록**에서 새 앱을 만든다.
2. 사용 API로 **네이버 로그인**을 선택한다.
3. 서비스 환경은 **PC 웹**으로 등록하고 서비스 URL을 아래와 같이 설정한다.

```text
https://toonstudio.cloud
```

4. 네이버 로그인 Callback URL에 아래 값을 정확히 등록한다.

```text
https://www.toonstudio.cloud/api/auth/oauth/naver/callback
```

5. 제공 정보는 추가 동의인 **별명**과 **프로필 이미지**만 선택한다. 이용자 식별자는 기본 제공되며,
   이름·이메일·생일·성별·전화번호는 로그인 기능에 필요하지 않으므로 요청하지 않는다.
6. 발급된 Client ID/Client Secret을 Core API secret store에 저장한다.
7. 연결 해제 수신 코드가 배포된 뒤 **API 설정 → 연결 끊기 → Callback URL**에 아래 주소를 등록한다.

```text
https://www.toonstudio.cloud/api/webhooks/naver/unlink
```

8. 개발 계정으로 실제 로그인·동의 화면과 콜백을 검증한 뒤 **API 설정 → 네이버 로그인 검수**를
   요청한다. 검수 승인 전에는 등록된 개발 계정만 로그인할 수 있으므로 일반 사용자 공개 전에
   승인을 완료한다.

```dotenv
NAVER_OAUTH_CLIENT_ID=<Client ID>
NAVER_OAUTH_CLIENT_SECRET=<Client Secret>
```

ToonSpectrum은 콜백에서 검증한 `state`를 네이버 토큰 발급 요청에도 그대로 전달한다.
네이버 프로필 응답은 애플리케이션별 사용자 ID를 정본으로 사용한다. 이메일은 요청하지 않으며,
기존 ToonSpectrum 계정과 자동 병합하지 않는다. 기존 계정 연결은 로그인된 사용자에게 두 계정의
재인증을 요구하는 명시적 계정 연결 흐름에서만 허용한다.

연결 해제 콜백은 `application/x-www-form-urlencoded` 요청의 앱 ID와 10분 이내 timestamp를 확인하고,
네이버 규격의 HMAC-SHA256 서명을 상수 시간 비교한 뒤 AES-128-CBC로 앱별 사용자 ID를 복호화한다.
다른 로그인 수단이 남아 있으면 네이버 연동과 기존 세션만 제거하고, 네이버가 유일한 로그인 수단이면
기존 탈퇴 경계를 통해 계정을 익명화한다. 정상·이미 처리된 알림은 본문 없는 `204 No Content`로 응답한다.

## GitHub 로그인

### OAuth App 신청

1. GitHub **Settings → Developer settings → OAuth Apps → New OAuth App**을 연다.
2. 다음 값을 입력한다.

| 필드 | 값 |
| --- | --- |
| Application name | `ToonSpectrum` |
| Homepage URL | `https://www.toonstudio.cloud` |
| Application description | `웹툰 탐색·리뷰·창작 스튜디오 로그인` |
| Authorization callback URL | `https://www.toonstudio.cloud/api/auth/oauth/github/callback` |

3. 앱 생성 후 Client ID를 복사한다.
4. Client Secret을 생성하고 즉시 Core API secret store에 저장한다. 평문 문서나 셸 기록에 남기지 않는다.

```dotenv
GITHUB_OAUTH_CLIENT_ID=<Client ID>
GITHUB_OAUTH_CLIENT_SECRET=<Client Secret>
```

ToonSpectrum은 비공개 이메일 조회에 필요한 `user:email`만 요청하고, 인가 코드 흐름에는 S256 PKCE를 적용한다. 공개 프로필 이메일이 비어 있을 수 있으므로
`/user/emails`에서 `verified=true`인 주소만 사용하고, 그중 `primary=true`를 우선한다.
검증 이메일이 없으면 GitHub 사용자 ID 기반 별도 계정을 만든다. 로그인 완료 후 access/refresh token은 저장하지 않는다.

## Google 기존 연동

Google은 현재 GIS ID 토큰 흐름을 사용한다. 운영 웹 클라이언트의 승인된 JavaScript origin은
`https://www.toonstudio.cloud`이며, 서버는 `GOOGLE_OAUTH_CLIENT_ID`를 audience로 검증한다.
레거시 redirect 폴백을 사용할 때만 `GOOGLE_OAUTH_CLIENT_SECRET`과 아래 callback이 필요하다.

```text
https://www.toonstudio.cloud/api/auth/oauth/google/callback
```

## 환경변수 반영 원칙

- 기존 값은 보존하고 누락된 변수만 추가한다.
- Client Secret, `AUTH_STATE_SECRET`, `AUTH_SESSION_SECRET`은 Core API의 encrypted secret store에만 둔다.
- Client ID도 서버 설정으로 관리하며, Google GIS에 필요한 Client ID만 `/api/auth/providers` 응답에 공개한다.
- 카카오·네이버·GitHub의 access token과 refresh token은 로그인 후 DB에 저장하지 않는다.
- 공급자 토큰으로 신원을 확인한 뒤 ToonSpectrum이 자체 HttpOnly, Secure, SameSite=Lax 세션을 발급한다.
- 설정 변경은 운영 배포가 아니다. 검토된 SHA의 별도 수동 배포와 canary 승인이 필요하다.

## 로컬 자격증명 정본과 재발급 정책

운영 Client ID와 Client Secret은 공급자 콘솔과 Core API secret store가 권위 원본이며,
운영 담당자의 Mac에는 **재발급 방지용 복구 정본**을 한 벌만 둔다. 저장소나 프로젝트 내부
`.env`에는 보관하지 않는다. 기존 자격증명이 정상이라면 새 키를 만들지 않고 그대로 재사용한다.
키가 실제로 노출·폐기됐거나 공급자가 회전을 요구할 때만 새로 발급한다.

로컬 정본 기본 경로와 권한은 다음과 같다.

```bash
mkdir -p ~/.config/toonstudio/secrets
chmod 700 ~/.config/toonstudio ~/.config/toonstudio/secrets
chmod 600 ~/.config/toonstudio/secrets/oauth-production.env
```

파일에는 아래 여섯 항목만 두며 실제 값은 문서, 이슈, PR, 셸 기록에 붙여넣지 않는다.

```dotenv
KAKAO_REST_API_KEY=<existing value>
KAKAO_CLIENT_SECRET=<existing value>
NAVER_OAUTH_CLIENT_ID=<existing value>
NAVER_OAUTH_CLIENT_SECRET=<existing value>
GITHUB_OAUTH_CLIENT_ID=<existing value>
GITHUB_OAUTH_CLIENT_SECRET=<existing value>
```

macOS에서는 저장 후 Keychain으로 동기화한다. 스크립트는 값 자체를 출력하지 않고
`toonstudio:<환경변수명>` 서비스 항목으로 저장한다.

```bash
pnpm run auth:social-login:keychain
pnpm run auth:social-login:keychain --status
```

운영 값을 회전해야 할 때는 공급자 콘솔 → 로컬 정본 → Keychain → Render secret store 순서로
같은 변경 창에서 반영하고, 검증된 배포가 완료된 뒤에만 이전 자격증명을 폐기한다. 다운로드 폴더나
임시 파일에 남은 사본은 즉시 삭제하고 시스템 클립보드도 비운다.

## 배포·운영 검증

환경변수 저장만으로 실행 중인 인스턴스는 갱신되지 않는다. Render의 검토된 `main` SHA를
수동 배포한 뒤 다음 검증기를 실행한다.

```bash
pnpm run verify:social-login-production
# 다른 정본 origin을 확인할 때만 명시적으로 지정
pnpm run verify:social-login-production -- --origin=https://www.toonstudio.cloud
```

검증기는 `/api/auth/providers`뿐 아니라 카카오·네이버·GitHub 로그인 시작 경로도 직접 확인한다.
공식 공급자 HTTPS 호스트, 정본 callback, browser-bound state 쿠키, GitHub S256 PKCE,
카카오 최소 프로필 scope와 이메일 scope 비활성화까지 모두 통과해야 성공한다.

기대 상태:

- `google.mode`, `kakao.mode`, `naver.mode`, `github.mode`: 모두 `oauth`
- `kakao.redirectAvailable`, `naver.redirectAvailable`, `github.redirectAvailable`: 모두 `true`
- `google.clientId`: 올바른 GIS Web Client ID이며 Secret 필드는 공개 응답에 없음
- 네이버 검수 승인 전에는 등록된 개발 계정만 실제 로그인을 완료할 수 있음

공급자별 실제 계정으로 다음 canary를 수행한다.

1. 로그인 모달에서 공급자 버튼을 누른다.
2. 공급자 동의 화면의 앱 이름·요청 범위·정본 도메인을 확인한다.
3. `https://www.toonstudio.cloud/auth/callback#session=1`로 복귀하는지 확인한다.
4. `/api/auth/session`이 공개 사용자 정보만 반환하는지 확인한다.
5. 새 계정과 재로그인이 같은 `account(provider, providerAccountId)`에 연결되는지 확인한다.
6. 로그아웃 후 세션 쿠키가 폐기되고 보호 경로 접근이 차단되는지 확인한다.
7. 취소, 만료 코드, 변조된 `state`, 이메일 미동의 계정을 각각 확인한다.

운영 로그에는 인가 코드, access token, provider payload, 이메일 주소, Client Secret을 기록하지 않는다.
