# Contributing

## Commit convention

ToonSpectrum uses Conventional Commits and validates commit messages with `commitlint`.
The tracked `.husky/commit-msg` hook runs the validator for every local commit.

Format:

```text
<type>(<scope>): <subject>
```

Common types:

| Type | Use |
| --- | --- |
| `feat` | User-visible capability |
| `fix` | Bug fix |
| `refactor` | Behavior-preserving code restructuring |
| `perf` | Performance improvement |
| `test` | Test-only change |
| `docs` | Documentation |
| `style` | Formatting or style-only change |
| `build` | Build or dependency tooling |
| `ci` | CI/CD configuration |
| `chore` | Maintenance that does not fit the types above |
| `revert` | Revert an earlier commit |

Scopes are short product or platform areas such as `studio`, `market`, `auth`,
`api`, `i18n`, `deps`, or `quality`. They are intentionally not a closed enum.

Examples:

```text
feat(studio): add layer grouping
fix(auth): recover expired social session
refactor(market): isolate asset preview state
chore(quality): add dependency hygiene checks
```

For a breaking change, use `!` in the header or a `BREAKING CHANGE:` footer.

## Local Git quality gates

- `pre-commit`: runs staged ESLint plus Secretlint credential checks.
- `commit-msg`: runs `commitlint`.
- `pre-push`: validates architecture, typechecks, and lints changed files, including Secretlint.

Do not replace these tracked hooks with editor-only checks. The repository configures
`core.hooksPath=.husky` so fresh worktrees use the same gates.

## Code-quality commands

| Command | Purpose |
| --- | --- |
| `pnpm lint:strict` | ESLint, including import hygiene and JSX accessibility rules |
| `pnpm typecheck` | TypeScript module, symbol, and type resolution |
| `pnpm quality:imports` | Knip unresolved imports and undeclared dependencies |
| `pnpm quality:secrets` | Secretlint credential scan over tracked/unignored text files |
| `pnpm quality:secrets:changed` | Secretlint scan over current changed text files |
| `pnpm quality:deadcode` | Full Knip dead-code/dependency inventory |
| `pnpm quality:cycles` | Knip circular dependency inventory |
| `pnpm test:a11y` | axe-core browser smoke checks for critical public routes |

The ESLint preset already provides `eslint-plugin-import-x` and
`eslint-plugin-jsx-a11y`. TypeScript catches missing symbols and many missing modules;
Knip adds repository-level checks for imports or packages that are unresolved or used
without being declared.

`quality:imports` is intended for CI. The broader dead-code and cycle inventories stay
explicit so existing architectural debt can be reduced deliberately.

Secretlint uses `@secretlint/secretlint-rule-preset-recommend`. It complements GitHub
secret scanning by failing local staged changes, pre-push branch changes, and CI when a
recognized credential is committed. Keep exceptions narrow and rule-specific rather than
ignoring broad source directories.

## Accessibility

Static JSX accessibility checks run through ESLint. Runtime accessibility uses
`@axe-core/playwright` against the rendered DOM on the home, learning, and marketplace
entry routes.

The initial browser gate blocks `serious` and `critical` axe violations. Automated
checks do not replace keyboard, screen-reader, zoom, contrast, or human usability review.

## Dependency hygiene

If code directly imports a package, declare that package in the owning workspace instead
of relying on a transitive dependency. Runtime-provided virtual modules and browser-served
absolute imports must be documented as narrow Knip exceptions in `knip.json`.

When changing dependency manifests, commit the updated `pnpm-lock.yaml` and run:

```bash
pnpm quality:imports
pnpm typecheck
pnpm lint:strict
```
