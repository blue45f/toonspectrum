import { readFileSync } from "node:fs";

import ts from "typescript";
import { describe, expect, it } from "vitest";

import {
  DrizzleCreatorCollaborationPersistence,
  buildCreatorCrdtServerSequenceQuery as directCrdtServerSequenceQuery,
  buildCreatorSharedDocumentMetaQuery as directSharedDocumentMetaQuery,
  buildCreatorSharedDocumentUpdateQuery as directSharedDocumentUpdateQuery,
  buildCreatorSharedWorksListQuery as directSharedWorksListQuery,
  createDefaultCreatorCollaborationPersistence,
} from "./creator-collaboration.drizzle-persistence";
import {
  CreatorCollaborationRepository,
  buildCreatorCrdtServerSequenceQuery as compatibilityCrdtServerSequenceQuery,
  buildCreatorSharedDocumentMetaQuery as compatibilitySharedDocumentMetaQuery,
  buildCreatorSharedDocumentUpdateQuery as compatibilitySharedDocumentUpdateQuery,
  buildCreatorSharedWorksListQuery as compatibilitySharedWorksListQuery,
  creatorCollaborationRepositoryProvider,
} from "./creator-collaboration.repository";

interface ModuleFacts {
  allImports: string[];
  dynamicImports: string[];
  source: string;
  valueImports: string[];
}

function moduleFacts(fileName: string): ModuleFacts {
  const fileUrl = new URL(fileName, import.meta.url);
  const source = readFileSync(fileUrl, "utf8");
  const file = ts.createSourceFile(
    fileUrl.pathname,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  );
  const allImports: string[] = [];
  const dynamicImports: string[] = [];
  const valueImports: string[] = [];

  function visit(node: ts.Node): void {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      allImports.push(node.moduleSpecifier.text);
      if (!node.importClause?.isTypeOnly) {
        valueImports.push(node.moduleSpecifier.text);
      }
    }
    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments.length === 1 &&
      ts.isStringLiteral(node.arguments[0])
    ) {
      dynamicImports.push(node.arguments[0].text);
    }
    ts.forEachChild(node, visit);
  }

  visit(file);
  return { allImports, dynamicImports, source, valueImports };
}

describe("creator collaboration persistence boundary", () => {
  it("keeps the persistence contract type-only and free of NestJS or ORM runtime dependencies", () => {
    const contract = moduleFacts("./creator-collaboration.persistence-contract.ts");

    expect(contract.valueImports).toEqual([]);
    expect(contract.dynamicImports).toEqual([]);
    expect(contract.allImports).toContain("./creator-collaboration.policy");
    expect(contract.allImports).not.toContain("./creator-collaboration.repository");
    expect(contract.source).not.toMatch(/(?:@nestjs|drizzle-orm|lib\/db|@Injectable|@Inject\()/u);
  });

  it("keeps Drizzle ownership in the adapter without an adapter-to-domain dependency", () => {
    const adapter = moduleFacts("./creator-collaboration.drizzle-persistence.ts");
    const repository = moduleFacts("./creator-collaboration.repository.ts");

    expect(adapter.allImports).toContain("./creator-collaboration.persistence-contract");
    expect(adapter.allImports).not.toContain("./creator-collaboration.repository");
    expect(adapter.dynamicImports).toEqual([]);
    expect(adapter.source).not.toContain("CreatorCollaborationRepository");
    expect(adapter.source).toContain("class DrizzleCreatorCollaborationUnitOfWork");
    expect(adapter.source).toContain("class DrizzleCreatorCollaborationPersistence");
    expect(adapter.source).toContain("const creatorSharedDocumentSelection");
    expect(adapter.source).toContain("const validCollaborationEventPredicate");

    expect(repository.allImports).toContain("./creator-collaboration.persistence-contract");
    expect(repository.source).not.toContain("class DrizzleCreatorCollaborationUnitOfWork");
    expect(repository.source).not.toContain("const creatorSharedDocumentSelection");
    expect(repository.source).not.toContain("const validCollaborationEventPredicate");
    expect(repository.source).not.toMatch(/from\s+["'](?:drizzle-orm|\.\.\/\.\.\/\.\.\/\.\.\/\.\.\/lib\/db)["']/u);
  });

  it("preserves query-builder exports and default repository/provider construction", () => {
    expect(compatibilityCrdtServerSequenceQuery).toBe(directCrdtServerSequenceQuery);
    expect(compatibilitySharedDocumentMetaQuery).toBe(directSharedDocumentMetaQuery);
    expect(compatibilitySharedDocumentUpdateQuery).toBe(directSharedDocumentUpdateQuery);
    expect(compatibilitySharedWorksListQuery).toBe(directSharedWorksListQuery);

    expect(createDefaultCreatorCollaborationPersistence()).toBeInstanceOf(
      DrizzleCreatorCollaborationPersistence
    );
    expect(new CreatorCollaborationRepository()).toBeInstanceOf(CreatorCollaborationRepository);
    expect(creatorCollaborationRepositoryProvider.useFactory()).toBeInstanceOf(
      CreatorCollaborationRepository
    );
  });
});
