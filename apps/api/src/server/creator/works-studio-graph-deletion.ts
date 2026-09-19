import { sql } from "drizzle-orm";

import type { CreatorCommunityTransaction } from "./shared";

/** Called only inside an authorized, work-row-locked whole-work deletion transaction. */
export async function deleteOwnedStudioGraphForWork(
  transaction: CreatorCommunityTransaction,
  workId: string,
): Promise<void> {
  // Graph revision commits take artifact locks and then update the project. Keep
  // that order; a failed/deadlocked concurrent mutation rolls back the whole work deletion.
  await transaction.execute(sql`
    SELECT artifact.id FROM studio_artifact artifact
    JOIN studio_project_graph project ON project.id = artifact."projectId"
    WHERE project."workId" = ${workId}
    ORDER BY artifact.id FOR UPDATE OF artifact
  `);
  await transaction.execute(sql`
    SELECT id FROM studio_project_graph WHERE "workId" = ${workId} FOR UPDATE
  `);
  const artifacts = sql`SELECT artifact.id FROM studio_artifact artifact
    JOIN studio_project_graph project ON project.id = artifact."projectId"
    WHERE project."workId" = ${workId}`;
  // RESTRICT revision references must be removed explicitly before graph cascade.
  // These are deletions of the entire authorized work, never edits to its history.
  await transaction.execute(sql`DELETE FROM studio_review WHERE "artifactId" IN (${artifacts})`);
  await transaction.execute(sql`DELETE FROM studio_operation WHERE "artifactId" IN (${artifacts})`);
  await transaction.execute(sql`DELETE FROM studio_mutation_receipt WHERE "artifactId" IN (${artifacts})`);
  await transaction.execute(sql`DELETE FROM studio_revision_parent WHERE "revisionId" IN (
    SELECT id FROM studio_revision WHERE "artifactId" IN (${artifacts})
  )`);
  await transaction.execute(sql`DELETE FROM studio_project_graph WHERE "workId" = ${workId}`);
}
