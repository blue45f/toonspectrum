# Superseded: cloud-only AI inference and resilient local drawing

This document previously described a self-hosted GPU inference path. That AI architecture was superseded on 2026-09-16 by the cloud-only routing contract in:

- `docs/operations/free-ai-runtime.md`
- `docs/operations/cloud-ai-routing-benchmark-2026-09-16.md`

The offline drawing rescue and IndexedDB document recovery remain client-side resilience features. They are not AI inference engines and do not download or execute AI models.

## Current media inference configuration

The API accepts only a public managed-cloud HTTPS origin:

```text
STUDIO_MEDIA_CLOUD_API_URL=https://managed-runtime.example.com
STUDIO_MEDIA_CLOUD_API_TOKEN=server-side-secret
DATABASE_URL=postgres://...
```

The following are rejected:

- HTTP endpoints;
- localhost and loopback endpoints;
- RFC1918/private, link-local, and private IPv6 hosts;
- URL credentials, paths, query strings, and fragments.

The former `STUDIO_COMFYUI_URL` and `STUDIO_COMFYUI_TOKEN` variables are not read. A managed provider may expose a ComfyUI-compatible protocol, but ToonSpectrum does not depend on a local ComfyUI process or local GPU.

## Contract verification

Run:

```bash
node scripts/verify-local-first-contracts.mjs
```

The legacy script name is retained for compatibility because it also verifies offline drawing and spatial-reader contracts. Its AI assertions now require a public managed-cloud HTTPS runtime and explicitly reject loopback/private origins.

The script uses deterministic transport/database/IndexedDB doubles. It does not claim a real provider, database, browser GPU, or XR device was exercised.

## Release boundary

A passing contract suite proves validation and state-machine behavior only. It does not prove deployment, managed-provider model availability, production database migration, provider billing configuration, or generated-media quality. Those require environment-specific smoke tests and explicit release approval.
