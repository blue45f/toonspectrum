# Contributing

## Commit messages

This repository follows Conventional Commits. Use:

~~~text
<type>(<scope>): <subject>
~~~

The scope is optional and should describe the affected product or technical area. Prefer stable scopes such as
studio, market, auth, api, infra, deps, a11y, and ci.

Allowed types:

- feat — user-visible capability
- fix — defect correction
- refactor — behavior-preserving code restructuring
- perf — performance improvement
- test — test-only changes
- docs — documentation
- style — formatting or non-semantic style changes
- build — build/toolchain/dependency packaging
- ci — CI/CD configuration
- chore — maintenance that does not fit another type
- revert — revert a prior commit

Examples:

~~~text
feat(studio): add layer grouping
fix(auth): handle expired refresh tokens
refactor(market): isolate checkout pricing policy
test(a11y): cover public route accessibility
chore(deps): update quality tooling
~~~

For a breaking change, use ! in the header or add a BREAKING CHANGE: footer:

~~~text
feat(api)!: replace legacy asset response contract
~~~

The commit-msg hook runs commitlint automatically. You can also validate every commit on the current branch with
pnpm run commitlint:branch.

## Local quality gates

Git hooks deliberately keep the fast path small:

- pre-commit: ESLint autofix on staged JavaScript/TypeScript files
- commit-msg: Conventional Commit validation
- pre-push: architecture validation, full typecheck, and changed-file lint

Use the repository-wide checks when changing shared infrastructure:

~~~bash
pnpm run lint:strict
pnpm run typecheck
pnpm run quality:imports
pnpm run quality:cycles
pnpm run quality:dead-code
pnpm run test:a11y
~~~

quality:imports is a blocking CI gate for unresolved imports and undeclared dependencies. quality:cycles and
quality:dead-code are intentionally separate audits so existing architectural debt can be reduced without hiding new
import/dependency failures.

The React ESLint preset already enables eslint-plugin-jsx-a11y, and the base preset enables eslint-plugin-import-x.
The repository adds strict source import resolution on top of those shared presets. Runtime accessibility is checked with
@axe-core/playwright against representative public pages.
