const TYPES = [
  "feat",
  "fix",
  "refactor",
  "perf",
  "test",
  "docs",
  "style",
  "build",
  "ci",
  "chore",
  "revert",
];

module.exports = {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "type-enum": [2, "always", TYPES],
    "header-max-length": [2, "always", 100],
    // URLs and generated references can legitimately exceed the conventional preset's default.
    // Keep those as warnings while the semantic header contract remains blocking.
    "body-max-line-length": [1, "always", 100],
    "footer-max-line-length": [1, "always", 100],
  },
};
