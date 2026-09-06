# Dontdraw upload hand-off verification

## Upload hand-off corrections — 2026-09-06

The existing `studio:upload-assets` CLI now preserves the exact supplied byte view when creating
multipart form data. Previously `Buffer.from(fileBytes).buffer` could expose the entire pooled
allocation (a reproduced 3-byte input became an 8,192-byte upload). The Blob now snapshots only
a copy of the input view, including when that view has a nonzero byte offset.

The GLB/VRM probe now reads the JSON chunk type at byte 16 and its contents at byte 20, validates
container/chunk lengths with unsigned reads, rejects malformed UTF-8/JSON and bounds JSON to
16 MiB. It is a classifier, not a full glTF/VRM validator. Optional unknown trailing chunk types
are ignored as required by the GLB extension mechanism; misplaced BIN/duplicate JSON chunks
are rejected. Native source conversion requirements in the intake tool are unchanged.

Explicit `--type` takes precedence over generated manifest metadata. In `auto` mode, a real VRM
marker inside `.glb` is detected even when the generated manifest says `background3d`;
`--no-probe-vrm` disables that probe but does not relabel explicit `.vrm` files.

IDs are allocated in original manifest order before filtering, resuming or concurrent file reads.
Repeated collisions in truncated long names gain a progressing suffix instead of looping forever.
Resuming the **same unchanged manifest** therefore preserves IDs. This does not promise stable IDs
across edits/reordering of a manifest whose entries lack persistent seeds/identifiers.

`--skip-existing` treats only HTTP 404 as absence. Authentication failures, throttling and server
errors fail the item instead of proceeding with an upload on a failed existence check.

Verification commands for the declared Node 24 repository runtime:

```sh
node --test scripts/dontdraw/*.test.mjs
pnpm exec vitest run scripts/dontdraw/
```

For Node 22.16, add `--experimental-strip-types` to the Node test command because the hand-off
contracts import the actual TypeScript uploader. Tests include real child-process CLI invocations
and multipart parsing on temporary **loopback-only** HTTP fixtures. No production endpoint,
account or licensed original is used. These fixtures are not evidence of production publication.

References: Node Buffer `buf.buffer`/`buf.byteOffset` documentation at
https://nodejs.org/api/buffer.html#bufbuffer and the GLB structure specification at
https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html#glb-file-format-specification .

**Still not implemented here:** persisting provenance/permissions on the server, completing review
approvals in Studio UI, converting native sources, obtaining originals or publishing a catalogue.
The intake report and queue remain operator records; fixing upload bytes does not grant any rights.
