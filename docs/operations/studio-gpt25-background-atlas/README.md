# GPT Image 2.5 background atlas transfer

Preserved from `feat/studio-gpt25-2d-background-atlas-20260916` so the remote
branch can be deleted without losing the payload.

- `overlay.tar.gz` is a truncated gzip (invalid distance / incomplete stream).
- `parts/part00`–`part09` are the staged transfer chunks. They do not stitch
  into a valid gzip with suffix/prefix overlap ≥ 8 bytes.
- Reconstructing the studio background atlas still needs the original kit or
  a successful gunzip of a repaired overlay.

Run diagnostics with workflow `Diagnose studio GPT Image 2.5 background atlas transfer`
(`workflow_dispatch`).
