# ToonStudio 데스크톱 폴더 동기화

## 목적

`toonstudio-sync`는 ToonStudio 작업 폴더를 별도의 파일시스템 폴더 또는 Google Drive·Dropbox·OneDrive와 양방향으로 맞추는 충돌 안전 CLI다. 파일시스템 원격은 다른 디스크, NAS, 또는 사용자가 직접 마운트한 동기화 폴더일 수 있다.

클라우드 모드는 공급자 API에 직접 연결한다. 현재 CLI는 사용자가 환경 변수로 전달한 OAuth access token을 사용하며 토큰 자체를 로그·journal·sidecar index에 기록하지 않는다. OAuth 로그인·refresh token·OS Keychain 관리는 별도 설치 앱 범위다.

## 먼저 확인할 것

- 파일시스템 모드에서는 로컬 폴더와 원격 폴더가 서로 다른 실제 디렉터리여야 한다.
- 클라우드 모드에서는 첫 실행 전에 access token의 최소 파일 읽기·쓰기 범위를 확인한다.
- 첫 실행은 반드시 `--dry-run`으로 계획을 확인한다.
- 두 위치에서 같은 파일이 따로 변경되면 자동으로 승자를 선택하지 않는다.
- `.toonstudio`, `.git`, `node_modules`와 심볼릭 링크 경로는 동기화 대상에서 제외된다.
- 로컬 삭제 전파는 `.toonstudio/trash`로 이동되어 복구 가능하다.
- 원격 삭제는 compare-and-swap 버전 검사를 통과한 파일에만 적용된다.

## 빌드

```bash
pnpm --filter @toonspectrum/desktop-sync-agent build
```

빌드 결과의 실행 파일은 다음과 같다.

```text
apps/desktop-sync/dist/cli.js
```

## 클라우드 자격 증명

기본 환경 변수는 다음과 같다.

| 공급자 | 기본 환경 변수 |
|---|---|
| Google Drive | `TOONSTUDIO_GOOGLE_DRIVE_ACCESS_TOKEN` |
| Dropbox | `TOONSTUDIO_DROPBOX_ACCESS_TOKEN` |
| OneDrive | `TOONSTUDIO_ONEDRIVE_ACCESS_TOKEN` |

토큰은 명령행 인자로 전달하지 않는다. 셸 history와 프로세스 목록에 노출되지 않도록 환경 변수만 사용한다.

```bash
export TOONSTUDIO_DROPBOX_ACCESS_TOKEN='...'
```

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

## 동작 원리

1. 로컬 파일을 SHA-256, 크기, 수정 시각으로 스캔한다.
2. 파일시스템 원격은 직접 SHA-256을 계산하고, 클라우드 원격은 `.toonstudio-sync-index.json`의 SHA-256과 공급자 object version을 대조한다.
3. index가 없거나 공급자 version이 달라지면 원격 파일을 내려받아 digest를 복구한 뒤 index를 compare-and-swap으로 갱신한다.
4. 로컬 `.toonstudio/sync-journal.json`의 마지막 성공 상태와 비교한다.
5. `upload`, `download`, `delete-local`, `delete-remote`, `record`, `conflict` 계획을 만든다.
6. 충돌이 하나라도 있으면 해당 주기 전체의 변경을 막는다.
7. 다운로드와 업로드는 digest 검증과 임시 파일·atomic rename 경계를 사용한다.
8. Google Drive는 version+ETag, Dropbox는 revision, OneDrive는 eTag를 수정·삭제 조건으로 사용한다.
9. 성공한 작업만 journal과 cloud index에 반영한다.

## 종료 코드

| 코드 | 의미 |
|---:|---|
| `0` | 계획 확인 또는 동기화 성공 |
| `1` | 인자, 파일시스템, 무결성 또는 런타임 오류 |
| `2` | 사용자가 해결해야 하는 양방향 충돌 |

## 운영 제한

현재 CLI가 완료한 클라우드 범위는 access token을 사용한 Google Drive·Dropbox·OneDrive 직접 파일 API, 청크 업로드, version 충돌 차단과 SHA-256 sidecar index다.

다음 항목은 서명된 데스크톱 설치 앱과 운영 검증 단계에 남아 있다.

- 브라우저 OAuth 로그인, refresh token 회전과 OS Keychain 저장
- 프로세스 재시작 뒤에도 이어지는 네트워크 upload session 영속화
- OS 로그인 시 자동 시작하는 서명·공증 설치 패키지
- 충돌 내용을 시각적으로 비교·병합하는 GUI
- Dropbox 삭제 API의 metadata 확인과 delete 사이 경쟁을 제거할 서버 중계 또는 보존 정책
- 팀 소유권과 서버 권한에 따른 파일 잠금

따라서 이 도구의 완료 범위는 **파일시스템·Google Drive·Dropbox·OneDrive를 직접 사용하는 충돌 안전 CLI transport**다. OAuth 수명주기, OS 배포와 실제 대규모 계정 검증은 별도 release gate를 따른다.
