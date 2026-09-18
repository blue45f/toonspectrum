# Repository map

Status: **migration**.

```text
apps/
  web/                  user-facing browser source
  admin/                administrator surface boundary
  api/                  backend application
  desktop-sync*/        specialized Studio companion runtimes
packages/
  core/                  existing focused shared/core code
  studio-*/              Studio runtime/engine packages
config/                  machine-readable policy and ratchets
docs/architecture/       human-authored current/target design
openwiki/                generated/maintained navigation layer
scripts/                 verification and migration tooling
```

The repository is moving toward clearer application boundaries without introducing `packages/domains/*`. Domain and capability locality should improve inside each app before shared package extraction is considered.
