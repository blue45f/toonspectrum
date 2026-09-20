import { sql } from "drizzle-orm";

/** Bind each array as one PostgreSQL parameter, including empty arrays. Plain
 * SQL-template array interpolation expands tuples and makes ANY(()::text[]) invalid. */
export function studioHandoffReceiptQuery(workId: string, changedRoles: readonly string[], changedBriefs: readonly string[]) {
  return sql`
    SELECT receipt.response FROM studio_mutation_receipt receipt
    JOIN studio_artifact artifact ON artifact.id=receipt."artifactId"
    JOIN studio_project_graph project ON project.id=artifact."projectId"
    WHERE project."workId"=${workId} AND receipt.response->>'contract'='studio-handoff-envelope-v1'
      AND (receipt.response->'envelope'->'recipient'->>'roleAssignmentId'=ANY(${sql.param(changedRoles)}::text[])
        OR receipt.response->'envelope'->'brief'->>'id'=ANY(${sql.param(changedBriefs)}::text[]))`;
}
