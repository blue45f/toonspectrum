# Admin Web application

Status: **migration**.

`apps/admin-web` is a separate pnpm workspace package and independently type-checkable, testable
and buildable administrator browser surface. It owns its Vite, TypeScript and Playwright
configuration and emits `apps/admin-web/dist/`. Production deployment remains separately approved.

```text
src/app       bootstrap, shell, routes and app-wide styles
src/domains   administrator capabilities
src/platform  technical adapters
src/shared    domain-independent Admin-only primitives
```

Existing production administrator capability under `apps/web/src/domains/admin` is migration
debt. Move it capability by capability with route, API client, translations and tests together.
Admin Web never imports Web or API source. Narrow shared DTOs and schemas belong in focused
contracts packages only after a real second consumer exists.
