# 운영 환경변수와 자격 증명

툰스튜디오 운영 자격 증명은 Git 저장소에 평문으로 저장하지 않는다. 실제 값은 Vercel Production Environment 또는 GitHub `production` Environment Secrets에 보관하고, 저장소에는 변수명·검증 규칙·자동화 코드만 둔다.

## 운영 원칙

- 기존 Vercel 환경변수는 자동으로 덮어쓰거나 회전하지 않는다.
- 누락된 값만 추가한다.
- `DATABASE_URL`처럼 외부 시스템의 실제 연결 정보가 필요한 값은 임의 생성하지 않는다.
- `AUTH_SECRET` 또는 `BETTER_AUTH_SECRET`이 코드에서 사용되고 Vercel에 모두 없을 때만 충분히 긴 난수를 생성한다.
- 비밀값은 로그, GitHub Step Summary, PR 코멘트, 빌드 산출물에 출력하지 않는다.
- `VITE_` 접두사에는 공개 가능한 URL만 넣고, 토큰·비밀번호·데이터베이스 URL을 넣지 않는다.
- 환경변수 변경 후에는 반드시 새 프로덕션 배포를 생성한다.

## GitHub production environment secrets

운영 자동화가 사용할 수 있는 비밀값은 GitHub 저장소의 `production` Environment에 등록한다.

필수 배포 권한:

- `VERCEL_TOKEN`
- `VERCEL_ORG_ID` — 팀 프로젝트일 때 권장
- `VERCEL_PROJECT_ID` — 프로젝트 이름 대신 ID 사용 권장

애플리케이션 필수값:

- `DATABASE_URL`
- 코드가 참조하는 경우 `AUTH_SECRET` 또는 `BETTER_AUTH_SECRET`

선택적 공급자 값:

- `OPENAI_API_KEY`
- `OPENROUTER_API_KEY`
- `BLOB_READ_WRITE_TOKEN`
- `R2_*`
- `S3_*`
- `CREATOR_ASSET_OBJECT_STORAGE_*`

선택적 공급자 값이 없으면 해당 기능은 명시적으로 비활성 또는 구성되지 않음 상태를 표시해야 하며, 공개 페이지와 기본 Studio 기능을 중단해서는 안 된다.

## 실행

GitHub Actions에서 **Production readiness** 워크플로를 실행한다.

워크플로는 다음 순서로 동작한다.

1. Vercel 배포 권한 존재 확인
2. 저장소가 실제 참조하는 환경변수 이름 수집
3. Vercel Production 환경의 기존 키 목록 조회
4. 기존 값은 보존하고 누락된 전달 가능 값만 추가
5. 필수 `DATABASE_URL` 누락 시 배포 중단
6. 새 프로덕션 배포 생성
7. 배포 URL과 `www.toonstudio.cloud`의 루트·마켓·공개 마켓 API 검사

## 로컬 감사

```bash
VERCEL_TOKEN=... \
VERCEL_PROJECT_ID=... \
node scripts/configure-vercel-production.mjs --audit-only
```

감사 결과에는 변수 이름과 상태만 출력되며 값은 출력하지 않는다.

## 키 노출 대응

실제 키가 Git 이력, 빌드 로그, 이슈 또는 채팅에 노출된 경우 파일 삭제만으로 끝내지 않는다.

1. 해당 공급자에서 키를 즉시 폐기한다.
2. 새 키를 발급한다.
3. Vercel 또는 GitHub Environment Secret을 갱신한다.
4. 새 배포를 생성한다.
5. 노출 기간의 접근 로그와 비용 사용량을 확인한다.
