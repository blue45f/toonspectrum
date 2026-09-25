# Dependency direction

Status: **migration**.

The safe dependency direction is from deployable applications toward focused shared packages. Application source is never a library for another application.

```text
apps/web       ─┐
apps/admin-web ─┼──> packages/* (only focused, justified packages)
apps/api       ─┘
```

Forbidden direct source edges:

- Web -> Admin Web or API source
- Admin Web -> Web or API source
- API -> Web or Admin Web source
- packages -> application source
- app `shared` -> app `domains`
- application/package tests outside `tests/integration` -> another application's source

Cross-domain deep imports inside an app are tracked as migration debt. New Admin debt starts at zero; existing Web debt is measured before a numeric baseline is frozen and then ratcheted downward.

See `scripts/validate-app-boundaries.mjs`, `scripts/validate-source-layout.mjs`, and their ratchet configs for the machine-enforced view.
