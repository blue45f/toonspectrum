import { describe, expect, it } from "vitest";
import { buildProductionOperationCapabilitySql, buildProductionOperationRuntimeAclSql, PRODUCTION_OPERATION_RELATIONS } from "./production-operation-database-contract.mjs";
describe("production operation runtime ACL contract", () => {
  it("covers all nine new tables and keeps immutable receipts/audits append-only", () => {
    expect(PRODUCTION_OPERATION_RELATIONS).toHaveLength(9);
    for (const table of PRODUCTION_OPERATION_RELATIONS.filter(({relation}) => /receipt|audit/u.test(relation))) {
      expect(table.updates).toEqual([]); expect(table.remove).toBe(false); expect(table.insert).toBe(true);
    }
  });
  it("grants only declared columns and does not grant whole-table updates", () => {
    const sql = buildProductionOperationRuntimeAclSql("test_runtime", "isolated_test");
    expect(sql).toContain('GRANT UPDATE ("revision", "payload", "updated_at") ON TABLE "isolated_test".production_operation_policy');
    expect(sql).toContain('GRANT SELECT ON TABLE "isolated_test".production_operation_policy');
    expect(sql).not.toMatch(/GRANT UPDATE ON TABLE/u);
    expect(sql).toContain('GRANT USAGE, SELECT ON SEQUENCE "isolated_test".production_team_audit_id_seq');
    expect(sql).toContain('REVOKE ALL ON FUNCTION "isolated_test".check_production_team_owner() FROM PUBLIC');
  });
  it("verifies both missing and excessive table/column/function permissions", () => {
    const sql = buildProductionOperationCapabilitySql("test_runtime", "isolated_test");
    expect(sql).toContain('has_column_privilege'); expect(sql).toContain('WITH GRANT OPTION');
    expect(sql).toContain('production operation runtime grants violate'); expect(sql).toContain('has_sequence_privilege');
  });
  it.each(['public','runtime;DROP TABLE x','"admin"','UPPERCASE',''])('rejects unsafe or implicit role %s', (role) => {
    expect(() => buildProductionOperationRuntimeAclSql(role)).toThrow();
    expect(() => buildProductionOperationCapabilitySql(role)).toThrow();
  });
});
