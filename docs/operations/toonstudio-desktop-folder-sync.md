# ToonStudio 데스크톱 폴더 동기화

## 목적

`toonstudio-sync`는 ToonStudio 작업 폴더를 별도의 파일시스템 폴더 또는 Google Drive·Dropbox·OneDrive와 양방향으로 맞추는 충돌 안전 CLI다. 파일시스템 원격은 다른 디스크, NAS, 또는 사용자가 직접 마운트한 동기화 폴더일 수 있다.

클라우드 모드는 공급자 API에 직접 연결한다. 기본 경로는 PKCE와 loopback callback을 사용하는 브라우저 OAuth 로그인이다. access token·refresh token·계정 식별자는 macOS Keychain, Windows Credential Manager, Linux Secret Service에 저장되며 로그·journal·sidecar index에는 기록하지 않는다. 기존 자동화와 응급 복구를 위해 환경 변수 access token도 명시적으로 선택할 수 있다.

## 먼저 확인할 것

- 파일시스템 모드에서는 로컬 폴더와 원격 폴더가 서로 다른 실제 디렉터리여야 한다.
- 클라우드 모드에서는 공급자별 public OAuth client ID와 최소 파일 읽기·쓰기 범위를 준비한다.
- 첫 실행은 반드시 `--dry-run`으로 계획을 확인한다.
- 두 위치에서 같은 파일이 따로 변경되면 자동으로 승자를 선택하지 않는다.
- `.toonstudio`, `.git`, `node_modules`와 심볼릭 링크 경로는 동기화 대상에서 제외된다.
- 로컬 삭제 전파는 `.toonstudio/trash`로 이동되어 복구 가능하다.
- Google Drive·OneDrive 삭제는 공급자 version·ETag 조건을 통과해야 하고, Dropbox 삭제는 revision 확인 후 숨김 보존 폴더로 이동한다.

## 빌드

```bash
pnpm --filter @toonspectrum/desktop-sync build
```

빌드 결과의 실행 파일은 다음과 같다.

```text
apps/desktop-sync/dist/cli.js
```

## 클라우드 자격 증명

공급자 콘솔에서 데스크톱·native app용 public OAuth client를 만들고 client ID만 환경 변수에 둔다. client secret은 사용하지 않는다.

| 공급자 | OAuth client ID 환경 변수 | 주요 범위 |
|---|---|---|
| Google Drive | `TOONSTUDIO_GOOGLE_DRIVE_OAUTH_CLIENT_ID` | `drive.file`, OpenID 프로필 |
| Dropbox | `TOONSTUDIO_DROPBOX_OAUTH_CLIENT_ID` | 파일 콘텐츠·메타데이터 읽기/쓰기 |
| OneDrive | `TOONSTUDIO_ONEDRIVE_OAUTH_CLIENT_ID` | `Files.ReadWrite.AppFolder`, `offline_access` |

로그인·상태 확인·로그아웃은 다음처럼 실행한다.

```bash
pnpm desktop:sync -- login --cloud-provider dropbox
pnpm desktop:sync -- auth-status --cloud-provider dropbox
pnpm desktop:sync -- logout --cloud-provider dropbox
```

로그인은 기본 브라우저와 임시 loopback callback을 사용하며 state와 PKCE를 검증한다. 공급자가 갱신한 refresh token은 이전 값과 원자적으로 교체한다. 여러 계정을 구분하려면 `--credential-profile`을 사용하고, OneDrive tenant는 `--onedrive-tenant`로 제한할 수 있다.

기존 CI 또는 응급 복구에서는 access token 환경 변수를 사용할 수 있다. 토큰은 명령행 인자로 받지 않는다.

| 공급자 | legacy access token 환경 변수 |
|---|---|
| Google Drive | `TOONSTUDIO_GOOGLE_DRIVE_ACCESS_TOKEN` |
| Dropbox | `TOONSTUDIO_DROPBOX_ACCESS_TOKEN` |
| OneDrive | `TOONSTUDIO_ONEDRIVE_ACCESS_TOKEN` |

다른 환경 변수 이름을 사용하려면 `--access-token-env`를 지정한다.

## 클라우드 계획 확인

Dropbox 예시:

```bash
pnpm desktop:sync -- \
  --local /path/to/toonstudio-projects \
  --cloud-provider dropbox \
  --cloud-root ToonStudio/Projects/MySeries \
  --dry-run
```

Google Drive와 OneDrive도 `--cloud-provider google-drive`, `--cloud-provider onedrive`로 동일하게 실행한다. 첫 conflict-free 동기화가 완료되면 클라우드 루트에 SHA-256과 공급자 version을 연결하는 `.toonstudio-sync-index.json`이 생성된다. `--dry-run`과 충돌 cycle은 루트나 index를 만들지 않는다.

## 계획 확인

```bash
pnpm desktop:sync -- \
  --local /path/to/toonstudio-projects \
  --remote-folder /path/to/backup-mirror \
  --dry-run
```

JSON 자동화 출력:

```bash
pnpm desktop:sync -- \
  --local /path/to/toonstudio-projects \
  --remote-folder /path/to/backup-mirror \
  --dry-run \
  --json
```

충돌이 있으면 종료 코드 `2`를 반환하며 어느 쪽도 변경하지 않는다.

## 한 번 동기화

```bash
pnpm desktop:sync -- \
  --local /path/to/toonstudio-projects \
  --remote-folder /path/to/backup-mirror \
  --once
```

기본 지원 확장자는 ToonStudio 프로젝트·2D·3D·브러시·PSD·CLIP·이미지·모델 파일이다. 다른 확장자도 포함하려면 명시적으로 허용한다.

```bash
pnpm desktop:sync -- \
  --local /path/to/toonstudio-projects \
  --remote-folder /path/to/backup-mirror \
  --once \
  --include-unknown
```

파일 크기 제한 예시:

```bash
pnpm desktop:sync -- \
  --local /path/to/toonstudio-projects \
  --remote-folder /path/to/backup-mirror \
  --once \
  --max-file-mb 4096
```

## 감시 모드

```bash
pnpm desktop:sync -- \
  --local /path/to/toonstudio-projects \
  --remote-folder /path/to/backup-mirror \
  --watch \
  --interval 5000
```

`SIGINT` 또는 `SIGTERM`을 받으면 새 주기를 예약하지 않고 현재 실행 경계를 마친 뒤 종료한다. 감시 중 충돌이 발견되면 자동 적용을 중단하고 종료 시 코드 `2`를 반환한다.

## 충돌 검토

충돌은 loopback 전용 검토 화면에서 양쪽 메타데이터와 지원 형식의 미리보기를 비교한 뒤 파일별로 로컬 유지, 원격 유지, 둘 다 보존 중 하나를 선택한다.

```bash
pnpm desktop:sync -- resolve \
  --local /path/to/toonstudio-projects \
  --cloud-provider dropbox \
  --cloud-root ToonStudio/Projects/MySeries
```

검토 URL은 무작위 capability token을 포함하며 localhost에서만 수신한다. 모든 결정과 확인을 제출하기 전에는 원격·로컬 파일을 변경하지 않고, 적용 후에는 결정·digest·session ID가 포함된 영수증을 남긴다.

## 동작 원리

1. 로컬 파일을 SHA-256, 크기, 수정 시각으로 스캔한다.
2. 파일시스템 원격은 직접 SHA-256을 계산하고, 클라우드 원격은 `.toonstudio-sync-index.json`의 SHA-256과 공급자 object version을 대조한다.
3. index가 없거나 공급자 version이 달라지면 원격 파일을 내려받아 digest를 복구한 뒤 index를 compare-and-swap으로 갱신한다.
4. 로컬 `.toonstudio/sync-journal.json`의 마지막 성공 상태와 비교한다.
5. `upload`, `download`, `delete-local`, `delete-remote`, `record`, `conflict` 계획을 만든다.
6. 충돌이 하나라도 있으면 해당 주기 전체의 변경을 막는다.
7. 다운로드는 digest 검증과 임시 파일·atomic rename을 사용하고, 대용량 업로드 session은 OS credential vault에 저장해 프로세스 재시작 뒤 이어서 전송한다.
8. Google Drive는 version+ETag, Dropbox는 revision, OneDrive는 eTag를 수정 조건으로 사용한다. Dropbox 삭제는 영구 삭제 대신 `.toonstudio-trash`로 이동하며 동시 변경이 감지되면 복원하거나 보존 위치를 포함한 충돌로 중단한다.
9. 성공한 작업만 journal과 cloud index에 반영하며, OAuth 갱신·업로드 session·충돌 영수증은 서로 분리된 저장 권위를 사용한다.

## 종료 코드

| 코드 | 의미 |
|---:|---|
| `0` | 계획 확인 또는 동기화 성공 |
| `1` | 인자, 파일시스템, 무결성 또는 런타임 오류 |
| `2` | 사용자가 해결해야 하는 양방향 충돌 |

## 배포 패키지와 서명

`desktop:sync:release:package`는 현재 OS용 Node runtime, production dependency, 라이선스, CycloneDX SBOM, SHA-256 manifest와 영수증을 포함한 재현 가능한 `tar.gz`를 만든다.

```bash
pnpm desktop:sync:release:package -- --version 1.0.0
pnpm desktop:sync:release:verify -- --allow-unsigned
```

태그 `desktop-sync-v*`의 릴리스 워크플로는 Linux·macOS·Windows에서 각각 패키징한다. 운영 릴리스는 플랫폼 인증서 또는 GPG 키가 없으면 실패하며, `codesign`, Authenticode, GPG 검증을 통과한 뒤에만 산출물을 업로드한다. 서명 증거는 대상 파일과 서명 파일의 SHA-256을 포함하고 패키지 finalization에서 다시 대조한다.

## 운영 제한

코드 경로가 완료된 범위는 브라우저 OAuth·토큰 갱신·OS 자격 증명 보관, 재시작 가능한 대용량 업로드, 시각적 충돌 해결, Dropbox 보존 삭제, 결정론적 패키징·SBOM·플랫폼 서명 검증이다.

저장소 내부 자동화가 대신할 수 없어 운영 증거로 남는 항목은 다음과 같다.

- 실제 배포 인증서로 생성한 macOS 서명·공증, Windows Authenticode, Linux GPG 산출물과 설치 검증
- 실제 Google Drive·Dropbox·OneDrive 계정의 장시간 중단·재개·권한 회수·용량 제한 시험
- 조직 소유 외부 폴더의 서버 권한·잠금 정책 검증
- 현 릴리스 커밋의 실기기 장시간 soak와 전문 창작자 서명 검증

따라서 기능 코드는 **파일시스템·Google Drive·Dropbox·OneDrive의 OAuth 수명주기, 충돌 안전 transport, 복구 가능한 삭제와 검증 가능한 배포물 생성**까지 완료한다. 실제 인증서와 외부 계정으로 남기는 운영 영수증은 별도 release gate다.
