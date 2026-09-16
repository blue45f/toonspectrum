import { readFileSync } from "node:fs";

import ts from "typescript";
import { describe, expect, it } from "vitest";

import {
  CommunityGovernanceError,
  validateCommunityCafeCreateInput,
  validateCommunityCafeUpdateInput,
} from "./community-governance";

const GENRES = ["로맨스", "판타지"] as const;

const governanceFileUrl = new URL("./community-governance.ts", import.meta.url);
const governanceSource = readFileSync(governanceFileUrl, "utf8");
const governanceFile = ts.createSourceFile(
  governanceFileUrl.pathname,
  governanceSource,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TS,
);

function exportedFunctionSource(name: string): string {
  let match: ts.FunctionDeclaration | null = null;
  const visit = (node: ts.Node): void => {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) {
      match = node;
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(governanceFile);
  if (!match) throw new Error(`missing governance function: ${name}`);
  return (match as ts.FunctionDeclaration).getText(governanceFile);
}

describe("community governance input contract", () => {
  it("applies safe defaults and normalizes tags and rules", () => {
    const value = validateCommunityCafeCreateInput(
      {
        name: "  판타지 작가 모임  ",
        description: "함께 창작하고 리뷰합니다.",
        genre: "판타지",
        tags: ["창작", " 창작 ", "리뷰"],
        rules: [
          { title: " 존중하기 ", description: "비방을 금지합니다." },
          { title: "" },
        ],
      },
      GENRES,
    );

    expect(value.kind).toBe("genre");
    expect(value.visibility).toBe("public");
    expect(value.joinPolicy).toBe("open");
    expect(value.postingPolicy).toBe("members");
    expect(value.tags).toEqual(["창작", "리뷰"]);
    expect(value.rules).toEqual([
      {
        id: "rule-1",
        title: "존중하기",
        description: "비방을 금지합니다.",
      },
    ]);
  });

  it("rejects invalid slugs, genres and enum updates", () => {
    expect(() =>
      validateCommunityCafeCreateInput(
        {
          name: "테스트 모임",
          slug: "unsafe/path",
          description: "설명입니다.",
        },
        GENRES,
      ),
    ).toThrow(CommunityGovernanceError);

    expect(() =>
      validateCommunityCafeCreateInput(
        {
          name: "테스트 모임",
          description: "설명입니다.",
          genre: "없는장르",
        },
        GENRES,
      ),
    ).toThrow("지원하지 않는 장르");

    expect(() =>
      validateCommunityCafeCreateInput(
        {
          name: "테스트 모임",
          description: "설명입니다.",
          joinPolicy: "automatic",
        },
        GENRES,
      ),
    ).toThrow("가입 정책");

    expect(() =>
      validateCommunityCafeUpdateInput({ visibility: "secret" }, GENRES),
    ).toThrow("공개 범위");
  });

  it("rejects empty updates", () => {
    expect(() => validateCommunityCafeUpdateInput({}, GENRES)).toThrow(
      "변경할 설정이 없어요",
    );
  });
});


describe("community moderation transaction boundary", () => {
  it.each([
    ["deleteGovernedCommunityPost", ".delete(fanPosts)", 'action: "post-removed"'],
    [
      "deleteGovernedCommunityReply",
      ".delete(fanPostReplies)",
      'action: "reply-removed"',
    ],
  ])("keeps %s deletion and audit insertion in one transaction", (name, mutation, audit) => {
    const source = exportedFunctionSource(name);
    const transaction = source.indexOf("db.transaction(async (tx) =>");
    const deleteMutation = source.indexOf(mutation, transaction);
    const auditInsert = source.indexOf("tx.insert(communityCafeModerationLogs)", deleteMutation);
    const action = source.indexOf(audit, auditInsert);

    expect(transaction).toBeGreaterThanOrEqual(0);
    expect(deleteMutation).toBeGreaterThan(transaction);
    expect(auditInsert).toBeGreaterThan(deleteMutation);
    expect(action).toBeGreaterThan(auditInsert);
    expect(source).not.toContain("await db.delete");
    expect(source).not.toContain("await db.insert(communityCafeModerationLogs)");
  });
});
