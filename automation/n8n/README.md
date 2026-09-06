# ToonStudio video automation

Import `toonstudio-brand-film.json` into an authorized n8n instance. It is intentionally inactive with a manual trigger and **contains no credentials**. The export and its code contracts are versioned; importing/executing it against a live n8n account is a separate operational step and is not implied by its presence in Git.

## Configure

1. Merge the `creator-brand-film.yml` renderer workflow and isolated media lockfile first.
2. Attach an n8n GitHub credential to **Dispatch approved GitHub renderer**. Use a fine-grained token limited to this repository, with Actions: write and required metadata access. Keep it in n8n credentials, never in workflow JSON, frontend code, webhook URL or Git.
3. Select exactly `all`, `landscape`, `portrait` or `square` in **Select approved format**.
4. Run manually. GitHub 204 means only that the request was accepted. Inspect the linked workflow run, confirm success, and review/download the resulting artifacts.
5. Review the video, captions and manifest before any release. Publish through the normal reviewed repository/deployment process. This workflow never posts to social media or bypasses branch protection.

There is no inbound webhook, user-supplied URL, shell node or arbitrary Git ref. No HTTP retries are enabled, because workflow dispatch is not idempotent and an ambiguous network failure must be checked against existing runs before retrying. GitHub concurrency queues requests; it does not deduplicate them. Restrict n8n execution permissions to authorized operators. Retain n8n/GitHub audit logs according to your deployment policy.

An n8n server, credential, import and authorized test execution are required before claiming live automation. None are fabricated or auto-provisioned by this export.

## Local contract tests

`node --test scripts/creator-film-automation.test.mjs`

The tests execute both Code node bodies with valid and invalid input, inspect edges, fixed dispatch destination, credential requirements, no webhooks/shell node/no automatic publishing and accepted-versus-completed semantics. They do not substitute for an n8n-runtime import/credential integration test.
