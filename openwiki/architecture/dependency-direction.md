# Dependency direction

Status: **migration**.

The safe dependency direction is from deployable applications toward focused shared packages. Application source is never a library for another application.

```text
apps/web   ─┐
apps/admin-web ─┼──> packages/* (only focused, justified packages)
apps/api   ─┘
```

Forbidden direct source edges:

- Web -> Admin
- Admin -> Web
- API -> Web
- API -> Admin
- app `shared` -> app `domains`

Cross-domain deep imports inside an app are tracked as migration debt. New Admin debt starts at zero; existing Web debt is measured before a numeric baseline is frozen and then ratcheted downward.

See `scripts/validate-app-boundaries.mjs` and `config/architecture-boundary-ratchet.json` for the machine-enforced view.
