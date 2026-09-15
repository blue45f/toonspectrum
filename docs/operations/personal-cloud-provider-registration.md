# ToonStudio 개인 저장소 공급자 등록

ToonStudio의 개인 저장소 연결은 프로젝트 원본을 서비스 서버에 보관하지 않고 사용자의 Google Drive, Dropbox 또는 OneDrive 계정으로 직접 업로드한다.

## 공통 운영 경계

- OAuth 방식: Authorization Code + PKCE
- 운영 콜백 기준: `https://www.toonstudio.cloud`
- 로컬 콜백 기준: `http://localhost:4001`
- access token은 업로드 세션 동안만 브라우저 메모리에 둔다.
- refresh token은 API 데이터베이스에 애플리케이션 암호화 후 저장한다.
- 공급자 연결과 최초 업로드가 완료되기 전에는 백업 완료로 표시하지 않는다.
- 클라이언트 ID와 시크릿은 Git에 커밋하지 않고 배포 환경 Secret으로만 주입한다.

## Google Drive

등록 유형은 웹 애플리케이션이며 Drive API를 활성화한다.

승인된 JavaScript 원본:

- `https://www.toonstudio.cloud`
- `http://localhost:5173`

승인된 리디렉션 URI:

- `https://www.toonstudio.cloud/api/personal-cloud/oauth/google-drive/callback`
- `http://localhost:4001/api/personal-cloud/oauth/google-drive/callback`

요청 범위는 `openid`, `email`, `profile`, `https://www.googleapis.com/auth/drive.file`로 제한한다. 홈페이지, 개인정보처리방침, 이용약관, 승인 도메인과 앱 로고를 Google Auth Platform 브랜딩에 등록한다.

## Dropbox

Scoped App의 App Folder 유형을 사용한다. 공개 클라이언트는 허용하지 않고 서버 시크릿과 PKCE를 함께 사용한다.

리디렉션 URI:

- `https://www.toonstudio.cloud/api/personal-cloud/oauth/dropbox/callback`
- `http://localhost:4001/api/personal-cloud/oauth/dropbox/callback`

필수 scope:

- `account_info.read` — 연결 계정 표시
- `files.metadata.read` — 원격 revision 확인과 충돌 감지
- `files.content.read` — 원격 파일 검증과 복구
- `files.content.write` — 폴더 생성과 프로젝트 업로드

`files.metadata.write`, 공유, 연락처 scope는 요청하지 않는다. 프로덕션 신청 전 앱 아이콘, 게시자, 설명, 홈페이지와 개인정보처리방침을 등록한다.

## OneDrive

Microsoft Entra 웹 애플리케이션으로 등록하고 지원 계정 유형은 개인 Microsoft 계정을 포함하도록 설정한다.

리디렉션 URI:

- `https://www.toonstudio.cloud/api/personal-cloud/oauth/onedrive/callback`
- `http://localhost:4001/api/personal-cloud/oauth/onedrive/callback`

위임 권한은 `openid`, `profile`, `email`, `offline_access`, `User.Read`, `Files.ReadWrite.AppFolder`로 제한한다. `Files.ReadWrite.All`은 사용하지 않는다. 개인 계정 전용 배포는 `ONEDRIVE_OAUTH_TENANT=consumers`를 사용한다.

## 배포 환경 변수

공통: `PERSONAL_CLOUD_OAUTH_REDIRECT_BASE_URL`, `PERSONAL_CLOUD_OAUTH_STATE_SECRET`, `PERSONAL_CLOUD_TOKEN_ENCRYPTION_KEY`.

공급자별: `GOOGLE_DRIVE_OAUTH_CLIENT_ID`, `GOOGLE_DRIVE_OAUTH_CLIENT_SECRET`, `DROPBOX_OAUTH_CLIENT_ID`, `DROPBOX_OAUTH_CLIENT_SECRET`, `ONEDRIVE_OAUTH_CLIENT_ID`, `ONEDRIVE_OAUTH_CLIENT_SECRET`, `ONEDRIVE_OAUTH_TENANT`.
