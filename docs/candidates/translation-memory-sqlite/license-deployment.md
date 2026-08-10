# Translation-memory SQLite license and deployment

## Components and rights

| Component | Pinned role | License / notice treatment |
| --- | --- | --- |
| SQLite core | SQL engine inside the official WASM distribution | Public domain; retain upstream provenance and exact build identity |
| `@sqlite.org/sqlite-wasm` | Version `3.53.0-build1`; dynamic browser module, Worker and OPFS SAH-pool VFS | Installed package declares Apache-2.0; include exact version, license and bundled notices in SBOM/NOTICE |
| OPFS, File System Access, Dedicated Worker, Web Crypto | Browser-provided storage, execution and digest APIs | Web platform APIs; Chromium binary is not shipped by ToonSpectrum |
| ToonSpectrum TM model/persistence/harness | Validation, canonical JSON, search, ordering and evidence gate | First-party source under repository product terms |

No package or lockfile change was required. IndexedDB wrappers and additional SQLite engines were not
added. The probe's Playwright/Chromium installation is development evidence tooling and is not a
Studio runtime artifact.

## Runtime deployment

The product keeps sqlite-wasm behind dynamic loading. The browser deployment must allow the reviewed
WASM and same-origin module Worker assets while maintaining:

```text
Content-Security-Policy: script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
Cross-Origin-Resource-Policy: same-origin
```

The measured production probe emitted these runtime assets, excluding source maps:

| Asset | Bytes | Interpretation |
| --- | ---: | --- |
| Translation-memory probe Worker JS | 252,458 | Includes corpus and evidence code; not the product adapter's incremental size |
| SQLite WASM | 864,752 | Shared V12 SQLite runtime |
| SQLite Worker JS | 210,936 | Shared sqlite-wasm runtime |
| OPFS async proxy JS | 32,289 | Shared SAH-pool support |
| Main probe launcher JS | 1,959 | Development evidence page |

Release bundling must not duplicate the shared SQLite runtime per feature. A version change requires
license/SBOM review and rerunning the real Worker OPFS gate.

## Data and privacy boundary

Translation memory can contain unpublished dialogue, names and revisions. The selected default stores
it only in the same-origin local OPFS database. It is not automatically uploaded, synchronized with
team members or transferred to a translation provider by this persistence layer.

OPFS is not a backup. Browser data clearing, quota eviction, device loss and profile deletion can
remove it. JSON export remains the explicit portable interchange path; future cloud backup requires a
separate user-visible consent, rights and encryption design.

## V12 discard and fallback policy

- Product file: `toonspectrum-studio-sqlite/studio-local-v12.db`.
- Namespace/key: `studio-translation-memory-v12` / `library-v1`.
- Previous localStorage key is never auto-read.
- Previous `studio-local.db` is never opened.
- A user-selected JSON file is explicit external interchange, not implicit legacy migration.
- OPFS/WASM failure is surfaced as unavailable; memory-only mode must be explicit and visibly
  non-durable.
- Corrupt internal JSON is fail-closed and is not partially returned or silently overwritten.

The existing destructive Studio cutover inventory owns removal of the shared V12 OPFS root. This
candidate does not add another database, cache or hidden fallback namespace.
