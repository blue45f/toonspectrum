import { describe, expect, it } from "vitest";

import { escapeLikePattern, jsonStringLikePattern } from "./sql-like";

describe("literal PostgreSQL LIKE patterns", () => {
  it("escapes the escape character before SQL wildcards", () => {
    expect(escapeLikePattern("romance\\%_end")).toBe("romance\\\\\\%\\_end");
    expect(escapeLikePattern("한글")).toBe("한글");
  });

  it("quotes tags as JSON before escaping the SQL LIKE layer", () => {
    expect(jsonStringLikePattern('a"b\\c%_')).toBe('%"a\\\\"b\\\\\\\\c\\%\\_"%');
    expect(jsonStringLikePattern("romance")).toBe('%"romance"%');
  });
});
