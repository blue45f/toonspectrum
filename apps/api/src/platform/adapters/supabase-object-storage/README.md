# Supabase private object storage 경계

creator asset를 목적별 private bucket으로 분리하는 server-only exact-fidelity 경계다.

- `source`: immutable 원본 upload. 이 port는 삭제하지 않는다.
- `derived`: 재현 가능한 preview, thumbnail, 중간 산출물
- `export`: immutable export artifact

세 bucket은 서로 다른 private Supabase Storage bucket이어야 한다. `verifyPrivatePurposeBuckets()`가
readiness에서 세 remote 계약을 확인한다. public URL, local filesystem, in-memory store, image transform,
overwrite/update/copy와 permissive fallback은 제공하지 않는다.

## AppModule 연결

명시적으로 활성화한 경우에만 module을 추가한다.

```ts
const supabaseObjectStorage =
  SupabaseObjectStorageModule.fromEnvironment(process.env);

@Module({
  imports: [
    ...(supabaseObjectStorage ? [supabaseObjectStorage] : []),
  ],
})
export class AppModule {}
```

필수 환경변수:

- `SUPABASE_OBJECT_STORAGE_ENABLED=true`
- `SUPABASE_OBJECT_STORAGE_URL`
- `SUPABASE_OBJECT_STORAGE_SERVICE_ROLE_KEY`
- `SUPABASE_OBJECT_STORAGE_SOURCE_BUCKET`
- `SUPABASE_OBJECT_STORAGE_DERIVED_BUCKET`
- `SUPABASE_OBJECT_STORAGE_EXPORT_BUCKET`

선택 한도:

- `SUPABASE_OBJECT_STORAGE_TIMEOUT_MS`
- `SUPABASE_OBJECT_STORAGE_MAXIMUM_ASSET_BYTES`
- `SUPABASE_OBJECT_STORAGE_MAXIMUM_CONTROL_METADATA_BYTES`
- `SUPABASE_OBJECT_STORAGE_MAXIMUM_RESPONSE_BYTES`

secret과 실제 bucket 이름은 server-side secret/config injection에만 둔다. `VITE_` prefix, DTO, log,
repository에 넣지 않는다.

## 연결 순서

1. object reference를 DB에 저장하기 전에 `uploadImmutable()` 호출
2. 반환된 purpose, digest, path, byte length, content type만 저장
3. `createSignedReadUrl()`로 짧은 읽기 URL 발급
4. derived/export lifecycle cleanup에서만 `deleteGeneratedObject()` 허용
5. source retention/deletion은 별도 승인된 archival workflow가 소유

표준 upload는 exact-byte 단일 요청이다. 설정 한도를 넘는 asset은 별도 검토한 resumable·content-verified
protocol이 필요하며 조용한 압축·resize·transcode·truncate·local fallback을 금지한다.
