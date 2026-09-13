# Free content creation room

Route: `/research/packs`. Entry points: the research menu and `/insights/resources`.

## Delivered workflow

Twelve original Korean editorial exercises cover costume, props, architecture, lighting, nature, material and gesture studies. Each has a premise, three observation questions, three bounded search terms and a distinct reversal. They combine into storyboard, world-building and comparison worksheets. These are deterministic browser-side templates, NOT AI-generated stories or image analysis. Users supply observations and choose which saved references belong in the exported brief.

Existing saved Met, Open Library, openBD, Kakao and Bizinfo records can join the selected citations. The two new museum providers use the same version-1 workspace format. Selection is capped at 24 references; the shared saved board remains capped at 200. The notes and selected IDs are transient, explicitly disclosed. Saving records uses the existing cross-tab transaction lock and does not overwrite corrupted storage. Markdown output preserves source URLs, credits, license labels and retrieval times, and does not download or redistribute images.

## Sources and permissions (verified 2026-09-13)

- Art Institute of Chicago: https://api.artic.edu/docs/ — no authentication, documented 60 requests/minute/IP. Only `is_public_domain === true` with no conflicting copyright notice and a safe image ID is shown. CC BY descriptions are not requested/copied. Image URLs use the documented cached 843-pixel IIIF rendition.
- Cleveland Museum of Art: https://openaccess-api.clevelandart.org/ — public API, no registration/key. Request `cc0`, `has_image`, explicit fields, 12 records and bounded offsets; require record-level `share_license_status === "CC0"`, no copyright restriction and the official image CDN. API dataset access alone does not clear every image.

Neither integration requires an application, account creation, a credit card, paid API plan or additional service. No applications were submitted on the user's behalf. Existing Kakao/Bizinfo keys are separate prerequisites; these adapters do not invent or expose credentials. Public-domain/copyright indications do not settle personality, trademark or other third-party rights.

## Operational boundaries

No cron, automatic collection, paid model, database migration, image upload, cloud storage or extra dependency was added. Search requests are explicit, single-provider and same-origin. Client abort cleanup prevents late responses replacing newer results. The existing engine applies a 6-second upstream timeout, 2 MiB response ceiling, five-minute in-memory cache, concurrent-request coalescing, Retry-After handling and client quotas. New museum adapters additionally share a per-host 30-request/minute ceiling **per process**, not across all serverless instances. Browser requests time out after 30 seconds. Totals retain provider semantics and can exceed the number of rights-cleared displayed results.

Free APIs do not guarantee free hosting: existing Vercel/function/bandwidth quotas still apply. No billing settings were changed and no paid fallback is activated. At high traffic, use a deployment-wide free-tier budget/kill switch or a prebuilt, manually reviewed metadata catalog before increasing collection volume. Existing five-provider and complete seven-provider status responses both parse during staggered deployment; absent providers are not fabricated.

## Checks

`node scripts/check-creator-resources.mjs` exercises 85 dependency-light storage/API cases. New Vitest files cover adapters, rights exclusions, escaping, complete legacy/new status contracts, per-host budgets and the UI. `scripts/check-open-art-live.mts` explicitly performs two live, read-only, keyless searches. `scripts/check-content-packs-browser.mts` checks the UI against a clearly identified synthetic response and downloads a real Markdown file; it is not a live-deployment check.
