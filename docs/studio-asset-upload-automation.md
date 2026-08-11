# 스튜디오 에셋 배치 자동 업로드 가이드 (3D 자산/VRM/배경)

이 가이드는 `scripts/upload-toonstudio-3d-assets.mts`를 이용해 ToonStudio 작품에
캐릭터·배경·프롭 등의 3D 에셋을 한 번에 업로드하는 흐름을 정리합니다.

현재 버전에서 지원하는 항목:

- `image` (`.png`, `.jpg`, `.jpeg`, `.webp`)
- `vrm` (`.vrm` 또는 `.glb` 내부 `extensionsUsed`에 `VRM`/`VRMC_vrm` 탐지 시)
- `background3d` (그 외 `glb/gltf` 등 3D 바이너리)
- `--filter-category`로 manifest 항목 분기 업로드
- `--dry-run`으로 업로드 예정 목록만 미리보기

## 0) Blender/VRM/기타 DCC 생성 지원 범위

짧게 정리하면 이 자동화 레이어는 **업로드 엔진**입니다.  
즉, 배경·캐릭터 3D 자산 자체의 모델링/리토폴로지/리깅/애니메이션은 Blender(또는 MMD/VRM/SketchUp 같은 외부 DCC)에서 생성하고, 업로드 단계에서 규격화된 파일만 넘깁니다.

업로드 기준은 다음 형식/규약입니다.

- `.vrm` 또는 `extensionsUsed`에 `VRM`/`VRMC_vrm`가 들어간 GLB/GLTF
- `batch_source` 폴더에 캐릭터/배경/소품을 파일로 분리해 넣은 폴더 구조
- 파일 경로 기반 카테고리 힌트(예: `batch_source/character`, `batch_source/background`, `batch_source/prop`)

`studio` 레포는 **모델 생성은 직접 하지 않고**, 자산의 업로드·검증·분배를 자동화합니다.  
다만 툴체인(Blender, VRM Add-on, MCP 브릿지)의 준비는 아래 스크립트로 최대한 자동화할 수 있습니다.

1. 외부 DCC에서 `.glb/.gltf/.vrm`로 내보내기
2. 자산 정형화(`character`, `background`, `prop`) 및 manifest 생성
3. 업로드 파이프라인 실행

### 운영용 3D 툴체인 준비(최대 자동화)

요청한 “최대한 자동화” 관점에서 현재 레포가 다루는 범위는 아래와 같습니다.

- 가능(스크립트/문서로 처리): 자산 수집 폴더 정형화, manifest 생성, 업로드 워크플로, 툴체인 체크
- 반자동(일회성 수행): 툴체인 설치(Blender/VRM Add-on/MCP 브릿지)
- 수동(매 에셋마다): 모델링·리깅·포즈 편집·텍스처링

툴체인 체크:

```bash
pnpm run studio:toolchain:setup -- --check
```

툴체인 자동 설치(권장):

```bash
pnpm run studio:toolchain:setup -- \
  --install \
  --install-blender \
  --install-vrm-addon \
  --vrm-addon-source ./addons/vrm-exporter.zip \
  --install-mcp-bridge \
  --mcp-package blender-mcp \
  --write-env .env.local
```

원하면 `--write-env`로 설치/탐지된 경로를 환경 설정 파일에 반영할 수 있습니다.

## 1) 릴리스 원클릭(운영 추천): 생성 → 검증 → 업로드 → 배포 dispatch

`studio:asset:release`는 운영에서 자주 쓰는 전체 파이프라인을 한 번에 실행합니다.

- 툴체인 사전 점검
- manifest 생성
- `--dry-run` 점검(기본 20개)
- 실 업로드
- 옵션이면 GitHub 배포 워크플로우까지 dispatch

```bash
pnpm run studio:asset:release -- \
  --source-dir ./batch_source \
  --manifest batch_generated/manifest.json \
  --default-category background \
  --recursive \
  --dry-run-items 20 \
  -- \
  --auto-demo-login \
  --type auto \
  --max-items 20 \
  --work-title "toonbatch-release"
```

dry-run만 돌리고 실업로드는 나중에 하려면:

```bash
pnpm run studio:asset:release -- \
  --source-dir ./batch_source \
  --skip-upload
```

manifest 생성은 수동으로 갖고 있고, 업로드만 반복하려면:

```bash
pnpm run studio:asset:release -- \
  --manifest batch_generated/manifest.json \
  --skip-generate \
  --skip-dry-run \
  -- \
  --manifest batch_generated/manifest.json \
  --auto-demo-login \
  --type auto \
  --max-items 50
```

실행 후 배포까지 자동화하려면:

```bash
pnpm run studio:asset:release -- \
  --source-dir ./batch_source \
  --auto-deploy \
  --deploy-workflow deploy-vercel.yml \
  --deploy-ref main \
  -- \
  --auto-demo-login \
  --type auto \
  --max-items 20
```

### 운영용 3D 툴체인 사전 점검

현재 환경이 업로드 실행 준비 상태인지 한 번에 확인합니다.

```bash
pnpm run studio:toolchain:setup -- --check
```

출력 예시:

- PASS: 실행 조건 충족
- WARN: 필수 실패는 아니나 권장 항목 미설정
- FAIL: 업로드 실행 차단 이슈

`studio:toolchain:setup -- --check`는 아래 선택 환경변수도 확인합니다.

- `BLENDER_PATH` 또는 `BLENDER_BIN`
- `STUDIO_MCP_BRIDGE_PATH`
- `STUDIO_VRM_ADDON_HINT` / `VRM_ADDON_PATH`

## 2) 1회 실행 예시 (권장)

```bash
pnpm run studio:batch -- \
  --source-dir ./batch_source \
  --output batch_generated/manifest.json \
  --default-category background \
  --recursive \
  -- --auto-demo-login --type auto --max-items 20 --work-title "toon batch"
```

중단/분기 모드:

- `--generate-only`: manifest 생성만 수행
- `--upload-only`: 기존 manifest 업로드만 수행 (`--manifest`를 upload 쪽에 별도 전달)
- `--` 이전: manifest 생성 옵션, `--` 이후: 업로드 옵션

## 3) 사전 준비

- API가 동작하는 base URL 확인 (로컬: `http://127.0.0.1:4001`, 운영: `https://www.toonstudio.cloud` 등)
- manifest 파일 존재 여부 확인
  - 기본값: `batch_generated/manifest.json`
- 인증 수단 1개 준비 (업로드 실행 기준)
  - `--session-token` (`x-user-id` 헤더에 주입되는 값)
  - `--session-cookie` (예: `toonsession=...`)
  - `--auto-demo-login` (`/api/auth/oauth/<provider>/demo` 호출)

`--dry-run`은 업로드를 실제로 호출하지 않으므로 인증이 없어도 예비 목록 점검이 가능합니다.

운영 자동 실행(워크플로우) 사용 시 다음 GitHub Secret이 필요합니다.

- `TOONSTUDIO_SESSION_TOKEN` (우선권 1)
- `TOONSTUDIO_SESSION_COOKIE` (토큰이 없을 때 대체값)

## 4) 실행 등록된 스크립트

```bash
pnpm run studio:upload-assets -- --help
pnpm run studio:upload-assets:dry-run -- --max-items 20
pnpm run studio:upload-assets -- --auto-demo-login --type auto --max-items 20 --work-title "toon batch"
pnpm run studio:upload-assets -- --session-token <token> --work-title "toon batch" --filter-category character,background
pnpm run studio:upload-assets -- --base-url https://www.toonstudio.cloud --session-cookie "toonsession=..." --type auto --start-index 0 --max-items 40
```

> `pnpm`의 `--` 사용은 스크립트 인자를 넘길 때의 표준 관습입니다.

## 5) 운영 배포와의 연결

이 스크립트는 **배포 스크립트가 아니라 운영 API에 자산을 업로드하는 운영 워크플로 보조 수단**입니다.
운영 배포 자체는 기존 배포 가이드를 따라 진행해야 합니다.

- 배포 준비/절차: [`DEPLOY.md`](./../DEPLOY.md)
- 업로드 후 점검
  - API 생성자 작품 목록에서 업로드 작품 확인
  - `작품 → 라이브러리` 화면에서 에셋 썸네일/재생성 실패 여부 확인
  - 필요 시 `--dry-run`으로 동일 조건을 다시 실행해 누락 항목 비교

### GitHub Actions 워크플로우로 운영 실행

`Actions > Studio 3D Asset Batch Upload`에서 다음 입력값으로 실행할 수 있습니다.

- `environment`: `production` 또는 `staging` (로그 메시지 표기 전용)
- `base_url`: API URL
- `manifest`: manifest JSON 경로 (Runner에서 접근 가능한 경로). `generate_manifest`가 `true`면 생성 출력 경로로 사용
- `source_dir`: `generate_manifest`가 `true`일 때 스캔할 폴더 경로
- `generate_manifest`: `true`면 Runner에서 `studio:manifest:generate`를 먼저 실행 후 업로드
- `auto_setup`: `true`면 부족한 툴체인 자동 설치 시도
- `setup_blender`: `auto_setup`이 활성화된 경우 Blender 설치 시도
- `setup_vrm_addon`: `auto_setup`이 활성화된 경우 VRM 애드온 설치 시도
- `setup_mcp_bridge`: `auto_setup`이 활성화된 경우 MCP 브릿지 설치 시도
- `setup_vrm_addon_source`: VRM 애드온 zip/폴더/py 경로 또는 URL
- `setup_mcp_package`: MCP 브릿지 패키지명 (예: `blender-mcp`)
- `setup_mcp_command`: MCP 실행 명령 (예: `blender-mcp`)
- `filter_category`: 카테고리 필터(예: `character,background,prop`)
- `start_index`, `max_items`, `concurrency`
- `asset_type`: `auto|image|vrm|background3d`
- `dry_run`, `skip_existing`, `no_probe_vrm`, `auto_demo_login`
- `work_id` 또는 `work_title`

위 입력값은 스크립트의 해당 옵션(`--filter-category`, `--skip-existing` 등)으로 전달됩니다.

운영에서는 세션 토큰/쿠키를 외부에 남기지 않도록 환경 변수 또는 비밀관리 저장소에만 보관하세요.

운영에서 `generate_manifest`를 켜는 패턴은 CI에서 배치 원천 파일만 넣으면 됩니다.

```bash
# GitHub Actions 입력 예시(요약)
environment=production
base_url=https://www.toonstudio.cloud
source_dir=./batch_source
generate_manifest=true
manifest=batch_generated/manifest.json
auto_setup=true
setup_blender=true
setup_vrm_addon=true
setup_vrm_addon_source=./addons/vrm-exporter.zip
setup_mcp_bridge=true
setup_mcp_package=blender-mcp
setup_mcp_command=blender-mcp
filter_category=character,background,prop
max_items=40
auto_demo_login=false
skip_existing=true
```

로컬에서 `source_dir`에 있는 파일을 업로드할 땐 `generate_manifest=true`를 권장합니다.

### 운영 배포 마무리 체크리스트

1. `manifest` 경로를 Runner에서 읽을 수 있게 준비합니다.
2. `generate_manifest`를 켰으면 `source_dir`를 Runner가 접근 가능한 경로에 두고, 끄면 사전에 `manifest`를 준비합니다.
3. GitHub Secret(`TOONSTUDIO_SESSION_TOKEN` 또는 `TOONSTUDIO_SESSION_COOKIE`)을 등록합니다.
4. 먼저 `dry_run: true`로 파일 수량과 필터 조건을 점검합니다.
5. 문제가 없으면 운영 실행으로 전환하고, `max_items`로 배치량을 조절합니다.
6. 업로드 완료 후 작품 목록에서 누락/실패 항목을 확인해 재실행합니다.

### 3D 에셋 생성 + manifest까지 한 번에 연결하기

지금 스크립트는 업로드만 처리합니다. Blender/VRM 생성 단계는 별도 DCC에서 수행하고, 업로드는 manifest를 통해 처리합니다.

Blender 기준 권장 운영 가이드:

- `character`, `background`, `prop` 폴더를 분리해 저장하면 manifest에서 카테고리 자동 추론이 쉬워집니다.
- 캐릭터 아바타: `.vrm` 우선.
- 배경/소품: `.glb/.gltf/.obj/.fbx/.dae/.stl/.ply/.3ds` 중심.
- 텍스처: PNG/WEBP 혼합 가능, 알파/채도 튐이 적은 PNG 권장.
- 내보내기 시 좌표 스케일을 팀 기준으로 고정하고, 노말 방향을 점검한 뒤 업로드합니다.

### manifest 자동 생성 (운영용으로 바로 사용)

에셋 폴더를 스캔해 `batch_generated/manifest.json`을 생성할 수 있습니다.

```bash
pnpm run studio:manifest:generate -- \
  --source-dir ./batch_source \
  --output batch_generated/manifest.json \
  --default-category background \
  --recursive true \
  --max-depth 4
```

```bash
pnpm run studio:batch -- \
  --source-dir ./batch_source \
  --output batch_generated/manifest.json \
  --recursive \
  -- --dry-run --max-items 20
```

```bash
pnpm run studio:batch -- \
  --source-dir ./batch_source \
  --output batch_generated/manifest.json \
  --recursive \
  -- --auto-demo-login --type auto --max-items 20
```

생성된 manifest를 바로 확인 후 업로드:

```bash
pnpm run studio:upload-assets -- --manifest batch_generated/manifest.json --type auto --max-items 50 --dry-run
pnpm run studio:upload-assets -- --manifest batch_generated/manifest.json --type auto --max-items 50 --auto-demo-login
```

## 6) 운영 배포 체크리스트 (Go-Live)

1. 워크플로우 실행 전 `workflow_dispatch`에서 manifest 경로를 맞춤
2. Secret 입력(`TOONSTUDIO_SESSION_TOKEN` 또는 `TOONSTUDIO_SESSION_COOKIE`)이 존재하는지 확인
3. 먼저 `dry_run: true`로 수량/카테고리/작업량 조건을 점검
4. 운영 1차 업로드에서는 `max_items`를 20~40개로 제한해 점검
5. 업로드 후 작품 목록에서 누락/실패 항목을 확인하고, 실패만 리트라이

### 어디서나 동일하게 실행하는 체크 포인트

- 팀 내 공통 저장소에서 동일한 `batch_source` 구조/manifest 출력 경로를 사용합니다.
- `batch_source`와 `batch_generated/manifest.json`은 실행 위치가 바뀌어도 manifest 기준 상대경로로 맞춰둡니다.
- 토큰/쿠키는 `--session-token` 또는 `--session-cookie`를 CI Secret으로만 주입하고 로그 출력하지 않습니다.

### 어디서나 동일하게 실행하는 전역 템플릿 (요약)

```bash
export TOONSTUDIO_HOME="/path/to/toonspectrum"
pnpm --dir "$TOONSTUDIO_HOME" run studio:manifest:generate -- \
  --source-dir "$TOONSTUDIO_HOME/batch_source" \
  --output "$TOONSTUDIO_HOME/batch_generated/manifest.json" \
  --recursive
pnpm --dir "$TOONSTUDIO_HOME" run studio:upload-assets -- \
  --manifest "$TOONSTUDIO_HOME/batch_generated/manifest.json" \
  --auto-demo-login --dry-run --max-items 20
pnpm --dir "$TOONSTUDIO_HOME" run studio:upload-assets -- \
  --manifest "$TOONSTUDIO_HOME/batch_generated/manifest.json" \
  --auto-demo-login --type auto --max-items 20 --work-title "global-run"
```

### 어디서나 동일하게 실행하는 전역 가이드

```bash
cd /path/to/toonspectrum
pnpm install
pnpm run studio:upload-assets -- --auto-demo-login --dry-run --max-items 20
pnpm run studio:upload-assets -- --manifest batch_generated/manifest.json --type auto --max-items 20 --work-title "toonbatch-$(date +%Y%m%d)"
# 다른 경로에서 실행할 땐 manifest를 절대경로로 넣으면 됩니다.
pnpm run studio:upload-assets -- --manifest /path/to/toonspectrum/batch_generated/manifest.json --type auto --work-title "global-run"
```

리포지토리 경로만 동일하면 macOS/Windows/Linux에서 같은 방식으로 재현할 수 있습니다.  
민감정보는 로컬 셸 프로필에 직접 박지 말고 CI Secret 또는 런타임 환경변수로만 보관하세요.
