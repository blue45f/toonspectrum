# Repository map

Status: **migration**.

```text
apps/
  web/                  user-facing browser source
  admin-web/            administrator browser application
  api/                  backend application
  desktop-sync/         full local/cloud sync CLI and local-agent capability
packages/
  contracts/             focused cross-application runtime-neutral contracts
  core/                  existing focused shared/core code
  studio-*/              Studio runtime/engine packages
config/                  machine-readable policy and dependency/source ratchets
data/asset-releases/      durable reviewed asset-release evidence
docs/architecture/       human-authored current/target design
openwiki/                generated/maintained navigation layer
scripts/                 verification and migration tooling
```

The repository is moving toward clearer application boundaries without introducing `packages/domains/*`. Domain and capability locality should improve inside each app before shared package extraction is considered.