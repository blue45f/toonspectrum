module.exports = {
  extends: ["@commitlint/config-conventional"],
  rules: {
    // 본문·푸터 줄 길이는 conventional 프리셋이 딸려 보낸 기본값이지 이 저장소가 고른
    // 규칙이 아니다. 코드에 대해 아무것도 증명하지 못하면서 긴 URL 하나로 커밋을 거부해
    // 왔으므로(푸터는 줄바꿈 회피 수단도 없다), 오류가 아니라 경고로 남긴다.
    // type/scope/subject 형태 강제는 그대로 둔다 — 그건 실제로 지켜온 규약이다.
    "body-max-line-length": [1, "always", 100],
    "footer-max-line-length": [1, "always", 100],
  },
};
