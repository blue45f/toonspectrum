/** Compatibility facade for schema-scoped validation; one canonical privilege contract. */
import { PRODUCTION_OPERATION_TABLES, buildProductionOperationsRuntimeAclSql, buildProductionOperationsRuntimeAclViolationSql } from "./production-operations-database-contract.mjs";
export const PRODUCTION_OPERATION_RELATIONS = Object.freeze(PRODUCTION_OPERATION_TABLES.map(
  ([relation, updates, remove, insert = true]) => ({ relation, updates, remove, insert }),
));
function schemaSql(sql, schema) {
  if (typeof schema !== "string" || !/^[a-z_][a-z0-9_]{0,62}$/u.test(schema)) throw new Error("Explicit safe schema required");
  return schema === "public" ? sql : sql.replaceAll("public.", `"${schema}".`);
}
export function buildProductionOperationRuntimeAclSql(role, schema = "public") {
  return schemaSql(buildProductionOperationsRuntimeAclSql(role), schema);
}
export function buildProductionOperationCapabilitySql(role, schema = "public") {
  const violation = schemaSql(buildProductionOperationsRuntimeAclViolationSql(role), schema);
  return `DO $production_operation_verify$ BEGIN
  IF ${violation} THEN RAISE EXCEPTION 'production operation runtime grants violate the declared contract'; END IF;
END $production_operation_verify$;`;
}
