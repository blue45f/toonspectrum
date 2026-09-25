# Capability Worker 배포

정확한 thumbnail 작업만 수행하는 목적별 container 경계다. authoritative DB, auth/session,
marketplace, CRDT, Socket.IO, QStash, coordination module graph를 import하지 않는다. 공개 surface는 process
liveness, signed readiness, 고정 v1 gateway endpoint뿐이다.

## provider template

- Render: `deploy/capability-worker/render.yaml` Blueprint
- Fly: `fly launch --copy-config --config deploy/capability-worker/fly.toml` 뒤 secret 등록
- Railway: `deploy/capability-worker/railway.json`을 config-as-code 경로로 선택

한 origin에는 provider ID 하나만 활성화한다. 유료 Supabase service-role key를 gateway token으로 재사용하지
않는다. 대응하는 `BACKEND_<PROVIDER>_BASE_URL`, 고유한 32자 이상 `AUTH_TOKEN`, template의 budget 변수를
설정한다. token 앞뒤 whitespace를 금지한다.

Worker는 JSON parse 전에 token과 선언 transport byte를 검사하고 parser buffer에도 provider별 raw-byte
상한을 다시 적용한다. 공개 health route에는 JSON/form parser를 설치하지 않는다.

필수 private storage secret:

```text
SUPABASE_OBJECT_STORAGE_ENABLED=true
SUPABASE_OBJECT_STORAGE_URL=https://<project>.supabase.co
SUPABASE_OBJECT_STORAGE_SERVICE_ROLE_KEY=<server-only secret>
SUPABASE_OBJECT_STORAGE_SOURCE_BUCKET=studio-source-assets-v1
SUPABASE_OBJECT_STORAGE_DERIVED_BUCKET=studio-derived-assets-v1
SUPABASE_OBJECT_STORAGE_EXPORT_BUCKET=studio-exports-v1
```

`DATABASE_URL`이나 auth/session secret은 capability worker에 두지 않는다.

내장 renderer는 immutable PNG/JPEG source reference를 받고 decode 전에 exact length와 SHA-256을
검사한다. source/output pixel·byte budget과 aspect ratio를 지키고 content-addressed PNG/JPEG derived
object를 upload한다. deterministic server encoder가 설치되기 전까지 WebP는 fail-closed다. Long AI는
명시적 command/queue port지만 thumbnail worker capability로 광고하지 않는다.

## signed canary

health request는 HMAC signature, provider, 13자리 timestamp를 보내고 gateway token은 전송하지 않는다.
full thumbnail canary는 기존 immutable source object 하나를 추가로 사용한다.

```sh
BACKEND_CAPABILITY_CANARY_BASE_URL=https://<worker-origin> \
BACKEND_CAPABILITY_CANARY_PROVIDER=render \
BACKEND_CAPABILITY_CANARY_AUTH_TOKEN='<matching gateway token>' \
pnpm verify:backend-capability-worker
```

`BACKEND_CAPABILITY_CANARY_SOURCE_OBJECT_JSON`과 선택적으로
`BACKEND_CAPABILITY_CANARY_SOURCE_ASSET_ID`를 추가하면 실제 read/resize/write를 검증한다. canary는 URL,
token, signed object URL, object body를 출력하지 않는다.
