# ToonStudio apex canonical redirect

This Worker owns only the Cloudflare zone route `toonstudio.cloud/*` and returns
an HTTP `308` to the same path and query on `https://www.toonstudio.cloud`.
Keeping this redirect separate lets the main `toonspectrum-web` Static Assets
Worker continue to serve `www.toonstudio.cloud/*` without forcing every static
request through Worker code.

## Verify

```bash
pnpm run verify:cloudflare-apex-redirect
```

The least-privilege deployment token uploads and deploys Worker Versions but
does not mutate zone routes. Upload and promote a reviewed version with:

```bash
pnpm exec wrangler versions upload \
  --config deploy/cloudflare-apex-redirect/wrangler.jsonc \
  --message "toonstudio apex canonical redirect"

pnpm exec wrangler versions deploy <version-id>@100 \
  --config deploy/cloudflare-apex-redirect/wrangler.jsonc \
  --yes
```

The Cloudflare Dashboard must retain this production route:

- pattern: `toonstudio.cloud/*`
- zone: `toonstudio.cloud`
- failure mode: fail-open

The `workers.dev` URL remains enabled as a canary. It is not a canonical public
URL and always redirects to the `www` origin.
