# Dontdraw authorized-original intake

## Delivery boundary — 2026-09-06

This change adds an **offline original-file intake tool**, not a copy of the Dontdraw catalogue.
No Dontdraw original, product thumbnail, texture, model, or description is included in this change.
No product has been downloaded, converted, visually reviewed, uploaded, or published by this change.
The public catalogue inventory is **not complete**. Synthetic test fixtures are not acquired assets.

The requesting operator stated that permission had been obtained. The intake records that
permission as `operator-attested`, with an operator-supplied reference and scope; it does not
claim to have independently verified a contract and never converts the licence to CC0.
Public-library scope requires a redistribution authorization declaration. Private-workspace
scope is supported separately. Neither option automatically publishes files or changes access controls.

## Source observations

Observed public pages:

- https://dontdraw.com/ — modern/fantasy backgrounds, props, clothing/accessories, food/kitchen,
  2D images and panoramas are distinct source categories.
- https://dontdraw.com/itemDetail.html?pdIdx=1444 — the product page distinguishes preview images
  from `.skp` / `.cs3o` original files.
- https://dontdraw.com/itemDetail.html?pdIdx=1624 — another native `.skp` product.

These pages are **provenance references**, not an authorized bulk-download endpoint. The tool
never logs into Dontdraw, scrapes thumbnails, enumerates guessed product IDs, bypasses payment,
extracts archives, runs installers, or uses network requests. Supply the originals exported or
provided through the authorized delivery channel. Do not put account cookies or contracts in Git.

## Source bundle

Keep source files in a private directory outside the repository. Put `source.json` inside it:

```json
{
  "schema": "toonstudio.dontdraw-source.v1",
  "authorization": {
    "reference": "your-internal-permission-reference",
    "scope": "private-workspace",
    "redistributionAllowed": false
  },
  "products": [
    {
      "id": "1444",
      "title": "Your licensed asset name",
      "sourceUrl": "https://dontdraw.com/itemDetail.html?pdIdx=1444",
      "category": "prop",
      "files": [
        { "path": "1444/original.skp", "role": "source" },
        { "path": "1444/export.glb", "role": "asset" },
        { "path": "1444/preview.png", "role": "preview" }
      ]
    }
  ]
}
```

This is a format example, **not a statement that product 1444 has been delivered or converted**.
Use the actual product IDs, actual files and actual permission scope. Product IDs are strings.
`category` accepts `background`, `prop`, `character`, `effect`; the existing uploader receives
`effect` as `prop`. Optional `sha256` must be the lower-case, 64-character hash supplied for that file.
The manifest only covers its explicit products; it is never treated as the entire website.

### Inspect without writing

```sh
node scripts/dontdraw/import-authorized-assets.mjs \
  --source-dir /private/dontdraw-originals \
  --manifest source.json
```

The default is read-only. Missing files, checksums, source paths and format headers are checked.
Every declared file receives a status. Preview/unsupported entries are not read or staged.
Inspection reports do not equate `ready-for-review` with visual or legal approval.

### Stage a new, offline bundle

```sh
node scripts/dontdraw/import-authorized-assets.mjs \
  --source-dir /private/dontdraw-originals \
  --manifest source.json \
  --output /private/dontdraw-intake-batch-001 \
  --write
```

The output directory must not exist and must not overlap the source. After all staged bytes
match the inspected SHA-256 hashes, a complete `ready/` directory appears containing:

- `manifest.json`: the existing `studio:upload-assets` array format, with stable content-based
  filenames/seeds and per-entry provenance.
- `intake-report.json`: complete provided-file accounting, duplicate links, conversions,
  exclusions, invalid-file reasons and authorization attestation.
- `review-queue.json`: deterministic per-source tasks for visual review, conversion, repairs and
  unsupported exports, bound to the exact staged manifest bytes by SHA-256. All tasks start pending.
- `files/`: only compatible, unique original/export bytes. Native sources and previews stay private.

Any invalid supported file prevents staging the batch. Zero compatible files cannot produce an
empty "successful asset pack". Existing output is never replaced. A failed write/hash check removes
only this operation's staging directory, then removes the new output only if it is empty.
Independently added files are preserved. If the output directory identity changes, automatic
cleanup stops instead of traversing the replacement. This is not a source-directory mutation.

### Existing upload pipeline hand-off

```sh
pnpm run studio:upload-assets -- \
  --manifest /private/dontdraw-intake-batch-001/ready/manifest.json \
  --type auto \
  --dry-run
```

The paths resolve relative to `manifest.json`, as expected by
`scripts/upload-toonstudio-3d-assets.mts`. Dry-run uses the existing upload planner without API calls.
No uploader authentication or production mutation is performed by this intake command.

**Public catalogue installation is a separate step.** The current uploader consumes name, path,
category, subtype and seed; its upload plan does not persist the additional provenance object.
Keep the intake report and manifest as the source-of-truth records, and wire provenance/access
controls into any public catalogue publication before exposing licensed originals. This PR does
not claim a new Studio UI, public catalogue registration, production deployment or completed upload.

## Format and quality gates

`PNG`, `JPEG`, `WebP` and self-contained `GLB 2.0` are staging candidates. The tool checks binary
signatures, selected container structure, PNG dimensions and GLB JSON/chunk structure. GLB must
have meshes and cannot contain URI references, including those inside extension objects.
These checks **are not full image decoding, glTF conformance validation or visual inspection**.
The Studio import/render path still needs to be exercised on the actual files.

`SKP`, `CS3O`, `CS3C`, `CLIP`, `SUT`, `BLEND`, `FBX`, `OBJ`, `GLTF`, `MAX`, `SNTP`,
`TIFF` and `PSD` are reported as conversion-required, not silently relabelled as PNG/GLB.
Export them with the appropriate licensed authoring software and validate materials, textures,
units, normals, pivots and cameras. A `role: source` file is always held for conversion/review.
Archives, executables, SVG and unrecognized formats are not staged. No archive extraction occurs.

Limits: 8 MiB source manifest, 20,000 products, 1,000 files per product, 50,000 file entries,
256 MiB per inspected file and 2 GiB inspected bytes per batch. Split large authorized deliveries
into multiple manifests. Duplicate inspection bytes still count toward the resource limit.
PNG images are bounded to 32,768 pixels per axis and 100 million pixels total. File signatures
are not a substitute for a decoder's own memory and pixel limits for other image formats.

The report always states `websiteInventoryComplete: false`, `visualReview: not-performed`, and
`counts.published: 0`. Only a separate, actually executed publication process can claim publication.
Permission references and filenames may be private: do not commit generated reports or bundles.

## Verification

```sh
node --test scripts/dontdraw/*.test.mjs
pnpm exec vitest run scripts/dontdraw/
```

The same contracts register with Node's runner locally and Vitest in the existing root CI test
collection. Coverage includes dry-run, hand-off paths, hashing, deduplication, preview/source
exclusion, conversion status, missing/empty/corrupt files, symlinks, traversal, existing-output
preservation, source/output overlap, authorization validation and embedded/external-resource GLB.
The I/O hardening contracts additionally cover real named-pipe rejection in isolated child
processes, failing CLI exit status with intact JSON, command-option validation, partial reads,
growing/truncated files, inode/timestamp changes, size limits, invalid UTF-8, private permissions
and rollback that preserves independent data.
No synthetic fixture is represented as a Dontdraw acquisition.

## Reliability hardening — 2026-09-06

The CLI exits with `1` when an inspection report contains invalid files, while keeping the
complete machine-readable report on stdout. Command/manifest errors also exit with `1` and
write their error to stderr. Exit `0` never means publication or visual approval; the exit-code
table in the next section defines every status. Duplicate options, blank path values, and
`--write` without `--output` are rejected before I/O. Help is accepted as a standalone `--help`,
not as a way to mask invalid write arguments.

Both manifests and original files use the same bounded reader. It rejects devices, directories,
symlinks and named pipes before opening; where the OS supports them, no-follow and nonblocking
flags additionally guard the open operation. Reads are positional and limited to the initial
file size in chunks of at most 64 KiB, plus one byte to detect growth. Descriptor/path identity,
size, modification time and change time are compared to detect concurrent mutations. Invalid
UTF-8 manifests are rejected rather than silently altered. The remaining batch budget is
checked before reading an additional payload, not after an oversized allocation.

Staging re-reads and hashes bounded source bytes before writing, rather than copying a path
that can change beneath an unbounded copy operation. On POSIX, newly created bundle directories
use mode `0700` and original files/reports/manifests use `0600`, including under a permissive
umask. Windows ACLs are not configured by this command.

The new contracts cover real named-pipe rejection in isolated child processes, failing CLI exit
status with intact JSON, partial reads, growing/truncated files, inode/timestamp changes, size
limits, private permissions and rollback that preserves independent data. Existing contracts
remain unchanged. Node's built-in runner and the root Vitest collector use the same test files.
The focused CI workflow is additional evidence only; it does not replace the required `core`
check or alter branch protection.

These checks are not a filesystem sandbox against an actively hostile local user or a timeout
for a stalled network filesystem. Keep source/output parent directories operator-controlled and
unchanged during intake. Container validation is still not full decoding or visual approval;
no source asset, catalogue entry, licence verification or public publication is added here.

## Automation and review workflow hardening

The inspection CLI now returns meaningful process exit codes. This fixes the earlier case in
which a malformed PNG was reported as invalid in JSON but the command still exited with 0.

| Exit | Meaning |
| --- | --- |
| `0` | At least one unique file is structurally ready; no invalid, unsupported or conversion-required files remain. This is **not visual approval**. |
| `1` | Invalid source file, malformed manifest or command, or a staging/filesystem failure. |
| `2` | Manual action remains: a native source needs conversion, a format is unsupported, or no unique ready file exists. |

Excluded previews and duplicate file content do not make a ready batch incomplete. Invalid files
have precedence over pending conversions. `--write` can stage compatible files and still exit 2
when other files require conversion; exit 2 does not mean that no output was written. JSON stdout
includes `reviewQueue` so even read-only inspection exposes pending tasks. CLI errors go to stderr.

Command options are validated before any I/O: duplicate options, unknown or prototype-named
positional arguments, blank path values and `--write` without `--output` exit 1. Help is accepted
only as a standalone `--help`, never as a way to mask an invalid write command. The pnpm/npm `--`
argument separator is ignored, so `pnpm ... -- --source-dir "/path with spaces"` works.

The review queue has schema `toonstudio.dontdraw-review-queue.v1`. Each task has a deterministic
`reviewId` derived from product ID, source path and declared role. Fixing a damaged file does not
lose its review identity. Exact duplicate path/role declarations within a product are rejected;
content duplicates across different paths continue to be reported without inflating ready counts.

Task actions are `visual-review`, `convert-source`, `repair-source`, and
`choose-supported-export`. Tasks contain source provenance, a content hash when inspected, and a
staged relative path when available. The queue starts with zero approvals and zero publication.
It is an **offline work list**, not a Studio panel, converter, review approval database or public
catalogue permission system. Editing task status does not grant access or publish anything.
`manifestSha256` detects a changed manifest; it is not a digital signature or proof of permission.
The existing uploader still does not persist provenance on the server; the integration boundary
above remains in force.

Both manifests and original files use the same bounded descriptor reader
(`scripts/dontdraw/authorized-intake-io.mjs`). It rejects devices, directories, symlinks and named
pipes before opening; where the OS supports them, no-follow and nonblocking flags additionally
guard the open operation so a replacement FIFO cannot hang the command. Reads allocate no more than
the inspected file size and are positional, in chunks of at most 64 KiB, plus a one-byte end probe
to detect growth. Descriptor and path identity, size, modification time and change time are
compared before, during and after the read to detect concurrent mutations. Manifests are limited
to 8 MiB by the reader itself (the error names the 8388608-byte limit), and invalid UTF-8 is
rejected rather than silently altered. The remaining batch budget is checked before reading an
additional payload, not after an oversized allocation. Before staging, source bytes are re-read,
re-hashed, and those exact checked bytes are written; each staged file is then read back and its
hash compared again, rather than reopening a path for an unchecked copy.

New output directories are owner-only (`0700`) and original files/reports/manifests use `0600` on
POSIX systems, including under a permissive umask (a stricter umask only removes further bits).
Windows permissions must be managed with filesystem ACLs. The output directory is an exclusive
reservation and an existing `ready/` is never replaced. Error cleanup removes only the operation's
temporary directory and then the reserved output directory if empty, rather than recursively
deleting unrelated files that appeared in the output directory; if the output directory identity
changes mid-operation, cleanup stops and the error reports that it needs review. These checks are
not an OS sandbox or a timeout for a stalled network filesystem: use a private, trusted
source/output parent, not a directory concurrently controlled by an untrusted process with the
same account permissions.

The additional contracts execute through the same Node/Vitest registration as the original tests.
The focused `Dontdraw intake regression` workflow executes them under Node 24, in addition to—not
instead of—the repository's required `core` workflow. No existing CI gate or branch protection is
removed, renamed, skipped or supplied with fabricated success statuses.
