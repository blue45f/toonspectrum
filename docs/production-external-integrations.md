# Production external integrations

웹툰 제작 협업 기능의 외부 연동은 **무료 우선·명시적 활성화·실패 시 닫힘**을 기본 정책으로 사용합니다.
키가 하나도 없어도 로컬 내보내기와 수동 작업 흐름은 유지되며, 유료 공급자로 자동 전환하지 않습니다.

## 기본 제공 기능

별도 계정이나 API 키 없이 다음 기능을 사용할 수 있습니다.

- 제작 마감 일정 ICS 다운로드
- Google Calendar의 사용자 확인형 `TEMPLATE` 링크
- 로컬 메일 앱용 `mailto:` 초안
- 프로젝트 정본 전체 백업 JSON
- 계약 수동 서명 보조 패키지 JSON
- 청구·세금계산서 준비 CSV
- SHA-256 출처·기여·권리 manifest와 C2PA 구조 초안

CSV 생성은 전자세금계산서 발행이 아니며, hash manifest는 인증서가 붙은 공개 C2PA 서명이 아닙니다.

## 안전 정책

`PRODUCTION_INTEGRATION_COST_POLICY`의 기본값은 `zero-cost-only`입니다.
이 상태에서는 호스팅형 Documenso와 Toss 운영 결제가 설정값만으로 열리지 않습니다.
각 외부 쓰기는 UUID mutation id, request digest, 결과 영수증, 일일 상한을 사용합니다.
무료 상한에 도달하면 HTTP 429로 실패하고 유료 fallback은 실행하지 않습니다.

## Web Push 활성화

브라우저 Web Push는 별도 메시징 사업자 없이 표준 Push API와 VAPID를 사용합니다.

```bash
pnpm integration:generate-secrets
```

명령이 출력한 다음 값을 배포 secret store에 저장합니다.

```dotenv
PRODUCTION_INTEGRATION_ENCRYPTION_KEY=...
PRODUCTION_WEB_PUSH_VAPID_SUBJECT=mailto:operator@example.com
PRODUCTION_WEB_PUSH_VAPID_PUBLIC_KEY=...
PRODUCTION_WEB_PUSH_VAPID_PRIVATE_KEY=...
```

private key는 저장소, `VITE_` 변수, 브라우저 로그에 넣지 않습니다.
한 브라우저 endpoint는 여러 프로젝트에 등록할 수 있으며, 프로젝트별 해제는 다른 프로젝트 구독을 끊지 않습니다.
만료된 endpoint가 404 또는 410을 반환하면 서버가 모든 매핑을 정리합니다.

## Google Workspace

Google OAuth 앱을 만든 뒤 다음 네 값을 모두 설정해야 연결 버튼이 나타납니다.

```dotenv
PRODUCTION_GOOGLE_OAUTH_CLIENT_ID=...
PRODUCTION_GOOGLE_OAUTH_CLIENT_SECRET=...
PRODUCTION_GOOGLE_OAUTH_REDIRECT_URI=https://www.toonstudio.cloud/api/production/integrations/google/callback
PRODUCTION_INTEGRATION_ENCRYPTION_KEY=...
```

요청 scope는 다음으로 제한합니다.

- OpenID와 이메일: 연결 계정 식별
- `calendar.events`: 사용자의 기본 캘린더에 제작 일정 쓰기
- `gmail.compose`: 메일 전송이 아닌 초안 생성
- `drive.file`: ToonSpectrum이 만든 파일만 조회·갱신

일반 JSON·ICS·CSV는 app properties로 찾은 기존 앱 생성 파일을 갱신합니다.
Google Sheet 변환은 기존 문서를 덮어쓰지 않으며, 같은 content digest의 문서가 있을 때만 재사용합니다.
다른 digest는 새 Sheet로 만들어 이전 자료를 보존합니다.

Google Cloud Console의 승인된 redirect URI는 서버 환경변수와 정확히 일치해야 합니다.
OAuth refresh token과 access token은 AES-256-GCM으로 암호화해 DB에 저장합니다.

## 무료 알림 채널

아래 채널은 각각 독립적으로 설정하며, 미설정 채널은 UI에 나타나지 않습니다.

```dotenv
PRODUCTION_GENERIC_WEBHOOK_URL=https://automation.example.com/toonspectrum
PRODUCTION_GENERIC_WEBHOOK_SECRET=...
PRODUCTION_DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...
PRODUCTION_NTFY_BASE_URL=https://ntfy.example.com
PRODUCTION_NTFY_TOPIC=production-alerts
PRODUCTION_NTFY_TOKEN=...
```

- Generic webhook는 canonical JSON에 HMAC-SHA256 서명을 붙입니다.
- Discord는 mention parsing을 끄고 2,000자 이하 메시지만 보냅니다.
- ntfy는 자체 호스팅 또는 운영자가 검토한 endpoint만 사용합니다.
- 알림 링크는 같은 origin의 `/production` 경로만 허용합니다.

## Documenso

무료 우선 정책에서는 자체 호스팅 HTTPS API만 자동 활성화할 수 있습니다.

```dotenv
DOCUMENSO_BASE_URL=https://sign.example.com/api/v2
DOCUMENSO_API_TOKEN=...
PRODUCTION_DOCUMENSO_ALLOW_HOSTED=false
```

호스팅형 `app.documenso.com` API는 `explicit-cost-enabled`와 명시적 hosted 허용이 모두 있어야 열립니다.
연결하지 않은 배포에서는 PDF와 signing package를 내려받아 수동 서명·증빙 보관을 사용합니다.
PDF는 MIME, 실제 `%PDF-` signature, 크기 상한을 검사한 후 전달합니다.

## Toss Payments

무료 우선 배포에서는 Toss Payments의 테스트 키만 허용합니다.

```dotenv
TOSS_PAYMENTS_SECRET_KEY=test_sk_...
PRODUCTION_TOSS_ALLOW_LIVE=false
PRODUCTION_INTEGRATION_COST_POLICY=zero-cost-only
```

live key는 `explicit-cost-enabled`와 `PRODUCTION_TOSS_ALLOW_LIVE=true`가 모두 없으면 서버에서 거부합니다.
승인 결과의 금액·통화·청구서 상태를 다시 검증한 후에만 지급 원장에 기록합니다.

## 배포 전 체크리스트

1. `0054_production_external_integrations.sql`을 적용합니다.
2. `PRODUCTION_INTEGRATION_COST_POLICY=zero-cost-only`를 유지합니다.
3. `pnpm integration:generate-secrets`로 암호화/VAPID 키를 생성해 secret store에만 저장합니다.
4. 필요한 공급자만 환경변수로 활성화합니다.
5. `/production/projects/:projectId/settings?view=integrations`에서 capabilities와 남은 일일 상한을 확인합니다.
6. Calendar, Gmail, Drive, 알림은 테스트 프로젝트로 한 번씩 검증합니다.
7. Documenso와 Toss live 경로는 비용·약관·환불 정책 검토 전 활성화하지 않습니다.
8. 운영 로그에 OAuth code, token, webhook secret, PDF 본문이 기록되지 않는지 점검합니다.

설정 전체 예시는 `.env.example`과 `.env.production.example`에 있습니다.
