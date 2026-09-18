# Admin shared

This directory is for reusable Admin-only UI and helpers that are independent of a business domain. It must not import from `src/domains`.

If code becomes truly shared by Web and Admin, evaluate a focused package such as `packages/ui` or `packages/contracts` rather than importing from `apps/web`.
