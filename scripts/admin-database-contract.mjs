import { readFileSync } from "node:fs";

const adminRelations = Object.freeze([
  "admin_announcements",
  "admin_audit_logs",
  "admin_banned_words",
  "admin_content_reports",
  "admin_promos",
  "admin_security_policies",
]);

function roleName(role) {
  if (typeof role !== "string" || role === "public" || !/^[a-z_][a-z0-9_]{0,62}$/u.test(role)) {
    throw new Error("An explicit safe administrator runtime role is required");
  }
  return role;
}

export function buildAdminRuntimeAclSql(role) {
  const quotedRole = `"${roleName(role)}"`;
  const tables = adminRelations.map((name) => `public.${name}`).join(", ");
  return `
REVOKE ALL ON TABLE ${tables} FROM PUBLIC;
REVOKE ALL ON TABLE ${tables} FROM ${quotedRole};
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE ${tables} TO ${quotedRole};
`;
}

export function buildAdminCapabilitySql(role) {
  const safeRole = roleName(role);
  const source = readFileSync(new URL("../apps/api/src/db/admin-schema-contract.ts", import.meta.url), "utf8");
  const columns = /export const ADMIN_SCHEMA_COLUMNS_SQL = `([^`]+)`;/u.exec(source)?.[1];
  const indexes = /export const ADMIN_SCHEMA_INDEXES_SQL = `([^`]+)`;/u.exec(source)?.[1];
  if (!columns || !indexes) throw new Error("Managed administrator schema contract is unreadable");
  const tables = adminRelations.map((name) => `('${name}')`).join(", ");
  return `
DO $admin_capability$
BEGIN
  IF NOT (${columns}) OR NOT (${indexes}) THEN
    RAISE EXCEPTION 'managed administrator schema is incomplete or incompatible';
  END IF;
  IF EXISTS (
    SELECT 1 FROM (VALUES ${tables}) AS required(table_name)
    CROSS JOIN unnest(ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE']) AS permission(privilege_name)
    WHERE NOT pg_catalog.has_table_privilege('${safeRole}', 'public.' || table_name, privilege_name)
  ) THEN
    RAISE EXCEPTION 'administrator runtime DML privileges are incomplete';
  END IF;
END
$admin_capability$;
`;
}
