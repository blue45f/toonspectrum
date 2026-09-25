const COMMIT_TYPES = [
  "build",
  "chore",
  "ci",
  "docs",
  "feat",
  "fix",
  "perf",
  "refactor",
  "revert",
  "style",
  "test",
];

const HANGUL_PATTERN = /[ㄱ-ㅎㅏ-ㅣ가-힣]/u;
const AUTOMATION_SCOPE_PATTERN = /^(?:automation|deps(?:-dev)?|generated|openwiki|release)$/u;

function subjectKorean(parsed) {
  const subject = parsed.subject?.trim();
  if (!subject) return [true];
  if (parsed.type === "revert" || AUTOMATION_SCOPE_PATTERN.test(parsed.scope ?? "")) {
    return [true];
  }
  return [
    HANGUL_PATTERN.test(subject),
    "커밋 제목은 한글을 기본으로 작성하세요. type/scope와 코드 식별자는 영문을 유지할 수 있습니다.",
  ];
}

module.exports = {
  extends: ["@commitlint/config-conventional"],
  plugins: [
    {
      rules: {
        "subject-korean": subjectKorean,
      },
    },
  ],
  rules: {
    "header-max-length": [2, "always", 100],
    "type-enum": [2, "always", COMMIT_TYPES],
    "subject-korean": [2, "always"],
    "body-max-line-length": [1, "always", 100],
    "footer-max-line-length": [1, "always", 100],
  },
};
