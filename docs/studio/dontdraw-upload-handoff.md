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

## Bounded authenticated transport — 2026-09-06

The existing uploader now uses one request path for demo login, work lookup/creation,
existing-asset lookup and multipart upload. Each request has a **120,000 ms total deadline**,
including upload transmission and complete response-body consumption. The CLI flag
`--request-timeout-ms` or `STUDIO_REQUEST_TIMEOUT_MS` can set 100–600,000 ms; an explicit
CLI value overrides the environment. This is a per-request deadline, not a whole-batch deadline.
No POST or PUT is automatically retried: after a timeout/disconnect the server may already
have committed a write. Inspect the existing work/asset before deciding to retry.

Responses are fully drained into a bounded snapshot before their result is used. The limit is
**1 MiB of decoded response bytes**, also enforced when Content-Length is absent or the body
is compressed. This is the API reply limit, **not** an uploaded-image/model size limit. A server
that sends headers but stalls its body no longer holds a worker indefinitely or produces an
early successful skip. Timeout, caller cancellation and over-limit paths cancel the reader.

All HTTP redirects are refused, including same-origin redirects. A synthetic local regression
reproduced the former behavior forwarding the custom `x-user-id` authentication header to a
different origin after a redirect. Use the final canonical API URL rather than a redirecting URL.
Only HTTPS bases and HTTP loopback bases are accepted; optional reverse-proxy path prefixes
remain supported. Credentials, query strings, fragments, control characters and ambiguous
paths are rejected. This does not restrict the operator to a particular trusted HTTPS host:
select the correct authorized endpoint. Hostnames merely starting with `127.` are not loopback.

HTTP error diagnostics now show the status code without copying arbitrary server response text
into logs. Malformed JSON diagnostics also omit the response body. Demo login accepts exactly
one nonempty `toonsession` cookie and does not forward unrelated cookies. CLI help no longer
prints a potentially credential-bearing base URL from the environment. This is **not** a blanket
redaction guarantee for operator-supplied local filenames, work titles or IDs.

A successful PUT must return a JSON object whose assetId matches the requested asset. This is
an identity sanity check, not full server-manifest validation, read-back verification or proof
of byte-identical server storage. Receipt errors report failure; they do not imply rollback.
The existing server may have committed the upload even when its reply is invalid or lost.

Concurrency is restricted to integers 1–8 (default 2); unsafe/fractional/infinite values fail
before network I/O. A non-dry-run empty manifest, empty filter result or resume index beyond
all entries exits **2** without login, work creation or PUT. Dry-run remains a read-only plan
inspection and does not require the source files to exist.

### Verification

```sh
node --experimental-strip-types --test scripts/dontdraw/*.test.mjs
```

The added `upload-network.test.mjs` contracts run with Node's test runner and the existing root
Vitest registration. Real ephemeral **loopback-only** servers cover redirect credential isolation,
headers/body deadlines, continuously streaming replies, caller cancellation, compressed/streamed
body limits, error-body non-disclosure, CLI option precedence, empty worklists, invalid receipts,
no automatic write retries, and exact session-cookie selection. Existing multipart hash and
resume-ID contracts remain in place. No production account, asset or endpoint is used by tests.

External implementation references: Node's AbortController/AbortSignal documentation
(https://nodejs.org/api/globals.html#class-abortcontroller), and Fetch's redirect modes
(https://fetch.spec.whatwg.org/#concept-request-redirect-mode).
