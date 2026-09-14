import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = readFileSync(
  new URL("./community-publishing.ts", import.meta.url),
  "utf8",
);

function segment(start: string, end: string): string {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  expect(startIndex).toBeGreaterThanOrEqual(0);
  expect(endIndex).toBeGreaterThan(startIndex);
  return source.slice(startIndex, endIndex);
}

describe("creator community publishing public boundary", () => {
  it("keeps release history and collaborator decisions owner-only", () => {
    const releaseHistory = segment(
      "export async function listCreatorWorkReleases(",
      "export async function decideCreatorWorkRelease(",
    );

    expect(releaseHistory).toContain("source.userId !== viewerId");
    expect(releaseHistory).not.toContain("workIsDirectlyReadable(source)");
  });

  it("shows readers only externally published or updated links", () => {
    const externalHistory = segment(
      "export async function listCreatorExternalPublications(",
      "export async function saveCreatorExternalPublication(",
    );

    expect(externalHistory).toContain(
      'inArray(creatorExternalPublications.status, ["published", "updated"])',
    );
  });

  it("returns portfolio entries only while their release is publicly active", () => {
    const portfolio = segment(
      "export async function listCreatorPortfolio(",
      "export async function reportCreatorWork(",
    );

    expect(portfolio).toContain("creatorWorkPublications.releaseId");
    expect(portfolio).toContain('eq(creatorWorkPublications.state, "published")');
    expect(portfolio).toContain('eq(creatorWorkPublications.visibility, "public")');
  });
});
