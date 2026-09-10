# CI performance optimization

- Required check preserved: `CI / core`.
- Root Vitest uses four shards; PR runs skip V8 coverage.
- Coverage and SonarQube run on main with four LCOV artifacts.
- Non-required browser jobs start after `core`.
- 21 product workflows run on PR opened/reopened/ready-for-review and on changed-area branch pushes.
- Product installs use pnpm `--prefer-offline`.
