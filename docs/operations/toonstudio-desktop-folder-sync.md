# ToonStudio 데스크톱 폴더 동기화

## 목적

`toonstudio-sync`는 ToonStudio 작업 폴더와 별도의 파일시스템 폴더를 양방향으로 맞추는 충돌 안전 CLI다. 원격 폴더는 다른 디스크, NAS, 또는 사용자가 직접 마운트한 동기화 폴더일 수 있다.

이 도구는 Google Drive·Dropbox·OneDrive API 계정 연결을 대신하지 않는다. 운영 클라우드 transport와 OS 백그라운드 설치 프로그램은 별도 출시 범위다.

## 먼저 확인할 것

- 로컬 폴더와 원격 폴더는 서로 다른 실제 디렉터리여야 한다.
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

1. 로컬과 원격 파일을 SHA-256, 크기, 수정 시각으로 스캔한다.
2. 로컬 `.toonstudio/sync-journal.json`의 마지막 성공 상태와 비교한다.
3. `upload`, `download`, `delete-local`, `delete-remote`, `record`, `conflict` 계획을 만든다.
4. 충돌이 하나라도 있으면 해당 주기 전체의 변경을 막는다.
5. 다운로드와 업로드는 임시 파일에 기록한 뒤 digest 검증과 atomic rename을 수행한다.
6. 원격 수정·삭제는 마지막으로 본 version과 현재 version이 같을 때만 허용한다.
7. 성공한 작업만 journal에 반영한다.

## 종료 코드

| 코드 | 의미 |
|---:|---|
| `0` | 계획 확인 또는 동기화 성공 |
| `1` | 인자, 파일시스템, 무결성 또는 런타임 오류 |
| `2` | 사용자가 해결해야 하는 양방향 충돌 |

## 운영 제한

다음 항목은 이 CLI만으로 완료되지 않는다.

- Google Drive·Dropbox·OneDrive의 직접 OAuth transport
- 중단 재개 가능한 네트워크 multipart upload
- OS 로그인 시 자동 시작하는 서명된 설치 패키지
- 충돌 내용을 시각적으로 병합하는 GUI
- 팀 소유권과 서버 권한에 따른 파일 잠금

따라서 이 도구의 완료 범위는 **파일시스템 기반 로컬·마운트 폴더 동기화 엔진과 실행 가능한 CLI**다. 클라우드 계정과 대규모 운영 검증은 별도 release gate를 따른다.
