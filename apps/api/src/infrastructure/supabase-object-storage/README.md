# Supabase private object-storage boundary

This directory is the server-only, exact-fidelity boundary for distributing
creator asset storage by purpose:

- `source`: immutable original uploads; this port cannot delete them.
- `derived`: reproducible previews, thumbnails, and generated intermediates.
- `export`: immutable export artifacts.

The three bucket names are injected independently and must refer to distinct,
private Supabase Storage buckets. `verifyPrivatePurposeBuckets()` is the
readiness gate that verifies all three remote bucket contracts. No public URL,
local filesystem, in-memory store, image transformation, overwrite, update,
copy, or permissive fallback is provided.

## AppModule integration seam

The boundary is disabled unless explicitly enabled:

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

Required environment names when enabled:

- `SUPABASE_OBJECT_STORAGE_ENABLED=true`
- `SUPABASE_OBJECT_STORAGE_URL`
- `SUPABASE_OBJECT_STORAGE_SERVICE_ROLE_KEY`
- `SUPABASE_OBJECT_STORAGE_SOURCE_BUCKET`
- `SUPABASE_OBJECT_STORAGE_DERIVED_BUCKET`
- `SUPABASE_OBJECT_STORAGE_EXPORT_BUCKET`

Optional bounded runtime controls:

- `SUPABASE_OBJECT_STORAGE_TIMEOUT_MS`
- `SUPABASE_OBJECT_STORAGE_MAXIMUM_ASSET_BYTES`
- `SUPABASE_OBJECT_STORAGE_MAXIMUM_CONTROL_METADATA_BYTES`
- `SUPABASE_OBJECT_STORAGE_MAXIMUM_RESPONSE_BYTES`

Secrets and actual bucket names belong only in server-side secret/config
injection. They must not be prefixed with `VITE_`, serialized into a DTO,
included in logs, or committed to the repository.

## Integration points

The existing creator asset service can inject
`SUPABASE_OBJECT_STORAGE_PORT` and:

1. call `uploadImmutable()` before persisting an object reference;
2. persist only the returned purpose, digest, path, byte length, and content
   type;
3. issue short-lived reads with `createSignedReadUrl()`;
4. permit `deleteGeneratedObject()` only for derived/export lifecycle cleanup;
5. keep source retention/deletion in a separate, explicitly authorized
   archival workflow.

Standard upload is intentionally a single exact-byte request. Assets above the
configured bound require a separately reviewed resumable, content-verified
protocol; they are never silently compressed, resized, transcoded, truncated,
or redirected to local storage.
