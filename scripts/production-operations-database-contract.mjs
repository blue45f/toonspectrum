/** Least-privilege runtime contract for team organizations and operating-mode policy. */
export const PRODUCTION_OPERATION_TABLES = Object.freeze([
  ["production_team_workspace", ["name", "owner_user_id", "revision", "updated_at"], false],
  ["production_team_member", ["role"], true],
  ["production_team_invite", ["revoked_at", "accepted_at"], false],
  ["production_team_project", [], true],
  ["production_team_receipt", [], false],
  ["production_team_audit", [], false],
  ["production_operation_policy", ["revision", "payload", "updated_at"], false, false],
  ["production_operation_policy_audit", [], false],
  ["production_operation_policy_receipt", [], false],
]);
function roleName(role) {
  if (typeof role !== "string" || !/^[a-z_][a-z0-9_]{0,62}$/u.test(role)) throw new Error("Invalid runtime database role");
  if (role === "public") throw new Error("PUBLIC cannot be a runtime role");
  return role;
}
export function buildProductionOperationsRuntimeAclSql(runtimeDatabaseRole) {
  const role = roleName(runtimeDatabaseRole);
  return "BEGIN;\n" + PRODUCTION_OPERATION_TABLES.map(([name, mutable, canDelete, canInsert = true]) => `
DO $team_acl$
DECLARE columns text;
BEGIN
  SELECT string_agg(format('%I',attname),', ' ORDER BY attnum) INTO columns
    FROM pg_catalog.pg_attribute WHERE attrelid='public.${name}'::regclass AND attnum>0 AND NOT attisdropped;
  EXECUTE format('REVOKE ALL PRIVILEGES (%s) ON TABLE public.${name} FROM "${role}"', columns);
  EXECUTE format('REVOKE ALL PRIVILEGES (%s) ON TABLE public.${name} FROM PUBLIC', columns);
END $team_acl$;
REVOKE ALL ON TABLE public.${name} FROM PUBLIC, "${role}";
GRANT SELECT${canInsert ? ", INSERT" : ""} ON TABLE public.${name} TO "${role}";
${canDelete ? `GRANT DELETE ON TABLE public.${name} TO "${role}";` : ""}
${mutable.length ? `GRANT UPDATE (${mutable.map((column) => `"${column}"`).join(", ")}) ON TABLE public.${name} TO "${role}";` : ""}
`).join("\n") + `
REVOKE ALL ON SEQUENCE public.production_team_audit_id_seq FROM PUBLIC, "${role}";
GRANT USAGE, SELECT ON SEQUENCE public.production_team_audit_id_seq TO "${role}";
REVOKE ALL ON FUNCTION public.check_production_team_owner() FROM PUBLIC, "${role}";
GRANT EXECUTE ON FUNCTION public.check_production_team_owner() TO "${role}";
DO $team_acl_check$ BEGIN
  IF ${buildProductionOperationsRuntimeAclViolationSql(role)} THEN
    RAISE EXCEPTION 'team workspace runtime privileges do not match the contract';
  END IF;
END $team_acl_check$;
COMMIT;
`;
}
export function buildProductionOperationsRuntimeAclViolationSql(runtimeDatabaseRole) {
  const role = roleName(runtimeDatabaseRole);
  const values = PRODUCTION_OPERATION_TABLES.map(([name, mutable, canDelete, canInsert = true]) =>
    `('${name}'::text, ARRAY[${mutable.map((column) => `'${column}'`).join(",")}]::text[], ${canDelete}, ${canInsert})`).join(",\n");
  return `(
EXISTS (SELECT 1 FROM (VALUES ${values}) AS policy(name,mutable,can_delete,can_insert)
WHERE to_regclass('public.'||policy.name) IS NULL
 OR NOT pg_catalog.has_table_privilege('${role}','public.'||policy.name,'SELECT')
 OR pg_catalog.has_table_privilege('${role}','public.'||policy.name,'INSERT') <> policy.can_insert
 OR pg_catalog.has_table_privilege('${role}','public.'||policy.name,'UPDATE')
 OR pg_catalog.has_table_privilege('${role}','public.'||policy.name,'DELETE') <> policy.can_delete
 OR pg_catalog.has_table_privilege('${role}','public.'||policy.name,'TRUNCATE, REFERENCES, TRIGGER')
 OR pg_catalog.has_table_privilege('${role}','public.'||policy.name,'SELECT WITH GRANT OPTION, INSERT WITH GRANT OPTION, UPDATE WITH GRANT OPTION, DELETE WITH GRANT OPTION')
 OR EXISTS(SELECT 1 FROM pg_catalog.pg_attribute a
   WHERE a.attrelid=to_regclass('public.'||policy.name) AND a.attnum>0 AND NOT a.attisdropped
   AND (pg_catalog.has_column_privilege('${role}',a.attrelid,a.attname,'UPDATE') <> (a.attname=ANY(policy.mutable))
     OR pg_catalog.has_column_privilege('${role}',a.attrelid,a.attname,'SELECT WITH GRANT OPTION, INSERT WITH GRANT OPTION, UPDATE WITH GRANT OPTION, REFERENCES WITH GRANT OPTION')))
 OR EXISTS(SELECT 1 FROM pg_catalog.pg_class c CROSS JOIN LATERAL pg_catalog.aclexplode(c.relacl) acl
   WHERE c.oid=to_regclass('public.'||policy.name) AND acl.grantee=0)
 OR EXISTS(SELECT 1 FROM pg_catalog.pg_attribute a CROSS JOIN LATERAL pg_catalog.aclexplode(a.attacl) acl
   WHERE a.attrelid=to_regclass('public.'||policy.name) AND a.attnum>0 AND acl.grantee=0)
)
 OR NOT pg_catalog.has_sequence_privilege('${role}','public.production_team_audit_id_seq','USAGE')
 OR NOT pg_catalog.has_sequence_privilege('${role}','public.production_team_audit_id_seq','SELECT')
 OR pg_catalog.has_sequence_privilege('${role}','public.production_team_audit_id_seq','UPDATE')
 OR EXISTS(SELECT 1 FROM pg_catalog.pg_proc p WHERE p.oid='public.check_production_team_owner()'::regprocedure
   AND (p.prosecdef OR EXISTS(SELECT 1 FROM pg_catalog.aclexplode(p.proacl) acl WHERE acl.grantee=0)))
 OR NOT pg_catalog.has_function_privilege('${role}','public.check_production_team_owner()','EXECUTE')
 OR pg_catalog.has_function_privilege('${role}','public.check_production_team_owner()','EXECUTE WITH GRANT OPTION')
)`;
}
