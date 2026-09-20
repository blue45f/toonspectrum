import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import { studioHandoffReceiptQuery } from "./studio-handoff-receipt-query";

const dialect = new PgDialect();
describe("handoff invalidation array binding", () => {
  it.each([
    { roles: [], briefs: ["brief-a"] },
    { roles: ["role-a"], briefs: [] },
    { roles: [], briefs: [] },
    { roles: ["role-a", "role-b"], briefs: ["brief-a", "brief-b"] },
    { roles: ["role,with,commas", 'role"quote'], briefs: ["brief'quote", "[]"] },
  ])("preserves the parameterized array values %j", ({ roles, briefs }) => {
    const query = dialect.sqlToQuery(studioHandoffReceiptQuery("work", roles, briefs));
    expect(query.params).toEqual(["work", roles, briefs]);
    expect(query.sql).toContain('project."workId"=$1');
    expect(query.sql).toContain("receipt.response->>'contract'='studio-handoff-envelope-v1'");
    expect(query.sql).toContain("ANY($2::text[])");
    expect(query.sql).toContain("ANY($3::text[])");
    expect(query.sql).not.toContain("ANY(()");
    expect(query.sql).not.toContain("role-a");
    expect(query.sql).not.toContain("brief'quote");
  });
});
