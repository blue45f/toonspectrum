import { describe, expect, it } from "vitest";
import { buildProductionOperationsRuntimeAclSql, buildProductionOperationsRuntimeAclViolationSql } from "./production-operations-database-contract.mjs";
describe("production operations database contract", () => {
  it("protects singleton identity and keeps receipts and audit append-only", () => {
    const sql = buildProductionOperationsRuntimeAclSql("fixture_runtime");
    expect(sql).toContain('GRANT SELECT ON TABLE public.production_operation_policy');
    expect(sql).not.toContain('GRANT SELECT, INSERT ON TABLE public.production_operation_policy TO');
    expect(sql).toContain('GRANT UPDATE ("revision", "payload", "updated_at") ON TABLE public.production_operation_policy');
    for (const table of ['production_team_receipt','production_team_audit','production_operation_policy_receipt','production_operation_policy_audit']) {
      expect(sql).not.toMatch(new RegExp('GRANT (?:DELETE|UPDATE)[^;]*public\\.'+table+'(?: |;)','u'));
    }
  });
  it("requires column-specific grants and strips public or delegable privileges", () => {
    const sql = buildProductionOperationsRuntimeAclSql("fixture_runtime");
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.check_production_team_owner()');
    expect(sql).toContain('GRANT UPDATE ("role") ON TABLE public.production_team_member');
    expect(sql).toContain('GRANT DELETE ON TABLE public.production_team_project');
    const verification = buildProductionOperationsRuntimeAclViolationSql("fixture_runtime");
    expect(verification).toContain('WITH GRANT OPTION');
    expect(verification).toContain('p.prosecdef');
    expect(verification).toContain('acl.grantee=0');
  });
  it.each(['admin; DROP TABLE users;', 'with-space user', 'postgres"', '', 'A'.repeat(64)])("rejects an unsafe runtime identifier %s", (role) => {
    expect(() => buildProductionOperationsRuntimeAclSql(role)).toThrow();
  });
});
