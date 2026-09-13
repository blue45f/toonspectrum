# 최소 비용·수동 전용 배포 정책

결정일: 2026-09-14 · 결정자: 저장소 소유자 · 범위: ToonSpectrum 및 Vercel `blue45fs-projects` 팀.
이 문서는 과거의 main 자동 배포, `[deploy]` 예외, Vercel 원격 빌드 권장 지침을 대체한다.

## 변하지 않는 기본 원칙

PR 생성·병합·브랜치 정리는 배포 승인이 아니다. 사용자가 별도로 배포를 명시적으로 승인해야 한다.
자동 Git 빌드·운영 배포·Preview·Deploy Hooks·push/cron/workflow_run 배포를 활성화하지 않는다.
작업 중 여러 변경을 검증·병합하고, 필요한 시점에 정확한 40자리 main SHA 하나를 한 번 배포한다.
PR의 테스트·lint·typecheck·보안·필수 core/verify·브랜치 보호는 유지한다. CI 검증은 호스팅 배포와 구분한다.

## 허용되는 기본 패턴

1. 사용자 승인과 배포 범위, 정확한 SHA를 기록한다. origin/main 포함 여부와 필수 CI 성공을 확인한다.
2. 이미 운영 중인 SHA와 비교한다. 같은 SHA·환경·산출물을 중복 배포하지 않는다.
3. Linux 호환 로컬 환경 또는 무료 사용 자격/남은 할당을 확인한 표준 GitHub 러너를 선택한다.
4. 고정한 Node·pnpm·Vercel CLI와 lockfile, 의존성 캐시로 생산용 산출물을 한 번 만든다.
5. `.vercel/output/config.json`, static, functions 및 Lambda의 Linux/native 의존성 호환성을 검증한다.
6. `vercel deploy --prebuilt --prod`로 같은 산출물을 한 번 업로드한다. Vercel source build는 금지한다.
7. 배포 ID/URL과 상태, 주요 화면·API, 기존 도메인 연결을 확인하고 릴리스 기록을 남긴다.

일반 개발에서는 Vite 로컬 서버와 PR CI를 사용하며 Vercel Preview를 만들지 않는다.
Mac/ARM에서 만든 서버 native 모듈을 검증 없이 Linux 함수에 업로드하지 않는다.
무료 러너가 불가능하면 유료·대형 러너나 Vercel 원격 빌드로 자동 전환하지 않고 중단·보고한다.

## 기본 수동 실행 경로

`.github/workflows/deploy-vercel.yml`을 main에서 수동 실행한다. 호환성을 위해 기존 워크플로 파일명과
fallback 이름은 유지하지만, 이제 예외 경로가 아니라 승인된 기본 Vercel 배포 경로다.
`ref`에는 승인된 40자리 SHA, `confirm`에는 `DEPLOY-TOONSPECTRUM-PREBUILT`를 넣는다.
확인 문구 자체는 사용자 승인을 대신하지 않는다. 실행자는 승인과 필수 CI 결과를 먼저 확인한다.

```bash
# 별도의 사용자 배포 승인 이후에만 실행하는 예시. 이 정책 적용 작업에서는 실행하지 않는다.
gh workflow run deploy-vercel.yml --repo blue45f/toonspectrum --ref main \
  -f ref="$APPROVED_MAIN_SHA" -f confirm=DEPLOY-TOONSPECTRUM-PREBUILT
```

워크플로는 production Environment, main ancestry, 고정 CLI, 직렬 배포, prebuilt 검증을 유지한다.
배포용 GitHub-hosted Linux 러너에서도 사용 자격·과금 조건을 먼저 확인하며 무료라고 무조건 가정하지 않는다.
검증된 로컬 Linux 경로를 쓸 때도 동일한 승인·SHA·환경·검증·단일 업로드 규칙을 적용한다.

```bash
# 승인·검증된 격리된 Linux 작업 디렉터리에서만 실행하는 명령 순서
pnpm exec vercel pull --yes --environment=production
pnpm exec vercel build --prod --yes
# 위 출력의 static/functions 및 필요한 runtime·보안 검증을 완료한 뒤
pnpm exec vercel deploy --prebuilt --prod --yes --archive=tgz
```

로컬 `.vercel/project.json`의 프로젝트 연결은 Vercel의 Git 저장소 자동 배포 연결과 다르다.
`vercel link`가 Git 연결을 제안하면 거절하고, 로컬 프로젝트 식별자만 사용한다. 자격증명은 출력·커밋하지 않는다.

## 차단 상태와 예외

- Vercel 팀 5개 프로젝트 모두 Git 연결 해제, Preview 비활성화, Ignored Build Step `exit 0`을 유지한다.
- Basic 고정·유료 동시 빌드 해제·팀 동시 빌드 1개를 유지한다. Git 재연결이나 `[deploy]` 예외를 만들지 않는다.
- `production-readiness.yml`의 과거 원격 배포 경로는 폐기하며, 워크플로는 읽기 전용 audit 용도로만 둔다.
- `pnpm vercel:deploy`와 `pnpm vercel:preview`의 과거 별칭은 종료 코드 1로 중단하며 정책 문서를 안내한다.
- Deploy Hooks, source upload 기반 `vercel --prod`, dashboard Redeploy 재빌드, 자동 재시도와 중복 배포를 금지한다.
- 유료 옵션·상위 빌드 머신·플랜 변경·자동 배포 재활성화는 비용과 영향을 설명한 별도 승인이 필요하다.

실패하면 배포를 반복하지 말고 원인을 먼저 조사한다. 재업로드가 필요하면 추가 승인을 기록하고 동일한
검증된 산출물을 재사용한다. 운영 장애는 기존 정상 배포로의 롤백/승격을 먼저 검토하고 새 빌드를 만들지 않는다.
DB migration, 환경변수 변경, 데이터 삭제, 도메인 이전, 프로젝트 정지는 이 배포 승인에 포함되지 않는다.

## 릴리스 기록

승인 시각/내용, 실행자, 정확한 SHA, main ancestry, 필수 CI, 빌드 환경/CLI 버전, 산출물 검증,
배포 ID/URL, 배포 후 검사, 롤백 대상, 재시도 여부를 남긴다. 비밀 값은 기록하지 않는다.
원격 빌드를 없애도 Pro 기본료·Functions·트래픽·저장소·외부 서비스 사용료는 남을 수 있다.
이 정책은 자동 빌드 비용 억제이며 총 청구액 0원을 보장하는 지출 상한 설정은 아니다.

## 근거 문서 (2026-09-14 확인)

- Vercel Git 연결 해제: https://vercel.com/docs/cli/git
- 자동 Git 배포 차단: https://vercel.com/docs/project-configuration/git-configuration
- 로컬/CI 빌드와 prebuilt: https://vercel.com/docs/cli/build
- GitHub Actions와 중복 배포 방지: https://vercel.com/kb/guide/how-can-i-use-github-actions-with-vercel
