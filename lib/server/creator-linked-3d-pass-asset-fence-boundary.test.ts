import { readFileSync } from "node:fs";

import ts from "typescript";
import { describe, expect, it } from "vitest";

const creatorFileUrl = new URL("./creator.ts", import.meta.url);
const creatorSource = readFileSync(creatorFileUrl, "utf8");
const workAssetRepositorySource = readFileSync(
  new URL(
    "../../apps/api/src/modules/creator/studio-work-asset.repository.ts",
    import.meta.url,
  ),
  "utf8",
);
const creatorFile = ts.createSourceFile(
  creatorFileUrl.pathname,
  creatorSource,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TS,
);

function functionSource(name: string): string {
  let match: ts.FunctionDeclaration | null = null;
  const visit = (node: ts.Node): void => {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) {
      match = node;
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(creatorFile);
  if (!match) throw new Error(`missing creator server function: ${name}`);
  return (match as ts.FunctionDeclaration).getText(creatorFile);
}

describe("creator server linked-pass asset transaction boundary", () => {
  it("direct create fails before allocating a random work ID", () => {
    const create = functionSource("createWork");
    const extract = create.indexOf("extractStudioLinked3dPassAssetRequirements({");
    const missingRowAssertion = create.indexOf("assertStudioLinked3dPassAssetRows({");
    const allocateId = create.indexOf("crypto.randomUUID()");

    expect(extract).toBeGreaterThanOrEqual(0);
    expect(missingRowAssertion).toBeGreaterThan(extract);
    expect(allocateId).toBeGreaterThan(missingRowAssertion);
  });

  it("direct update locks creator_work before querying assets and mutating the document", () => {
    const update = functionSource("updateWork");
    const transaction = update.indexOf("db.transaction(async (tx) =>");
    const workLock = update.indexOf('.for("update")', transaction);
    const assetFence = update.indexOf(
      "assertCreatorWorkLinked3dPassAssetsInTransaction(tx, id",
      workLock,
    );
    const workUpdate = update.indexOf(".update(creatorWorks)", assetFence);

    expect(transaction).toBeGreaterThanOrEqual(0);
    expect(workLock).toBeGreaterThan(transaction);
    expect(assetFence).toBeGreaterThan(workLock);
    expect(workUpdate).toBeGreaterThan(assetFence);
  });

  it("revision restore locks creator_work and fences the target snapshot before applying it", () => {
    const restore = functionSource("restoreWorkRevision");
    const transaction = restore.indexOf("db.transaction(async (tx) =>");
    const workLock = restore.indexOf('.for("update")', transaction);
    const targetSnapshot = restore.indexOf("createCreatorWorkRevisionSnapshot(", workLock);
    const assetFence = restore.indexOf(
      "assertCreatorWorkLinked3dPassAssetsInTransaction(tx, workId",
      targetSnapshot,
    );
    const workUpdate = restore.indexOf(".update(creatorWorks)", assetFence);

    expect(workLock).toBeGreaterThan(transaction);
    expect(targetSnapshot).toBeGreaterThan(workLock);
    expect(assetFence).toBeGreaterThan(targetSnapshot);
    expect(workUpdate).toBeGreaterThan(assetFence);
  });

  it("the metadata assertion is transaction-injected and never performs an out-of-lock db read", () => {
    const assertion = functionSource("assertCreatorWorkLinked3dPassAssetsInTransaction");

    expect(assertion).toContain("transaction");
    expect(assertion).toContain(".from(creatorWorkAssets)");
    expect(assertion).toContain("assertStudioLinked3dPassAssetRows({ workId, requirements, rows })");
    expect(assertion).not.toContain("await db.");
  });

  it("generic upload compensation and trusted GC retain deterministic linked-pass rows", () => {
    expect(
      workAssetRepositorySource.match(
        /if \(isStudioLinked3dPassServerAssetId\(assetId\)\) return false;/gu,
      ),
    ).toHaveLength(2);
  });
});
