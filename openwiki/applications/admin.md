# Admin application

Status: **migration**.

`apps/admin` establishes a separate administrator browser surface without moving existing production capability in one risky change. It is independently type-checkable and buildable with the repository root frontend toolchain and emits `dist-admin/`.

Admin feature placement should follow:

```text
src/domains/<domain>/<capability>/...
```

Use `src/shared` only for Admin-wide code that is domain-independent and `src/platform` for infrastructure adapters. Never import `apps/web` source. When Web and Admin genuinely need the same DTO/schema, promote that narrow contract to a focused shared contracts package rather than sharing UI or application internals.
