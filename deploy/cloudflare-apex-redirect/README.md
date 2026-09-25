# ToonStudio apex canonical redirect

이 Worker는 Cloudflare zone route `toonstudio.cloud/*`만 소유하고 같은 path와 query를
`https://www.toonstudio.cloud`로 HTTP 308 redirect한다. main `toonspectrum-web` Static Assets Worker는
`www.toonstudio.cloud/*`를 계속 제공하므로 모든 정적 요청이 Worker code를 통과하지 않는다.

## 검증

```sh
pnpm run verify:cloudflare-apex-redirect
```

최소 권한 token은 Worker Version을 upload·deploy하지만 zone route를 변경하지 않는다.

```sh
pnpm exec wrangler versions upload \
  --config deploy/cloudflare-apex-redirect/wrangler.jsonc \
  --message "toonstudio apex canonical redirect"

pnpm exec wrangler versions deploy <version-id>@100 \
  --config deploy/cloudflare-apex-redirect/wrangler.jsonc \
  --yes
```

Cloudflare Dashboard에서 다음 production route를 유지한다.

- pattern: `toonstudio.cloud/*`
- zone: `toonstudio.cloud`
- failure mode: fail-open

`workers.dev` URL은 canary로 유지하며 canonical public URL이 아니다. 항상 `www` origin으로 redirect한다.
