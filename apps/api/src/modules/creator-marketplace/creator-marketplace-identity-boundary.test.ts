import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const controllerSource = readFileSync(
  new URL("./creator-marketplace.controller.ts", import.meta.url),
  "utf8",
);
const repositorySource = readFileSync(
  new URL("./creator-marketplace.repository.ts", import.meta.url),
  "utf8",
);
const serviceSource = readFileSync(
  new URL("./creator-marketplace.service.ts", import.meta.url),
  "utf8",
);

describe("Creator Marketplace exact identity boundary", () => {
  it("keeps the static route public, no-store, and ahead of the generic UUID detail route", () => {
    const identityRoute = controllerSource.indexOf('@Get("/identity/:id")');
    const detailRoute = controllerSource.indexOf('@Get("/:id")');
    const identitySource = controllerSource.slice(
      identityRoute,
      controllerSource.indexOf('@Get("/history/:id")', identityRoute),
    );

    expect(identityRoute).toBeGreaterThanOrEqual(0);
    expect(identityRoute).toBeLessThan(detailRoute);
    expect(identitySource).toContain('@Header("Cache-Control", "no-store, max-age=0")');
    expect(identitySource).toContain("marketplaceService.getIdentity(params.id)");
    expect(identitySource).not.toContain("requireUserId(");
  });

  it("selects one exact row without manifest, rights, release, or account payload", () => {
    const start = repositorySource.indexOf("async findIdentityById(");
    const end = repositorySource.indexOf("async publish(", start);
    const identitySource = repositorySource.slice(start, end);

    expect(start).toBeGreaterThanOrEqual(0);
    expect(identitySource).toContain("eq(creatorMarketplaceResources.id, id)");
    expect(identitySource).toContain("packageState: creatorMarketplacePackageModeration.state");
    expect(identitySource).toContain("currentHeadDelistedAt: sql<Date | null>");
    expect(identitySource).toContain("releaseDelistedAt: creatorMarketplaceResources.delistedAt");
    expect(identitySource).toContain("absoluteCreatorMarketplaceHead.releaseOrdinal");
    expect(identitySource).not.toContain("manifest:");
    expect(identitySource).not.toContain("manifestHash:");
    expect(identitySource).not.toContain("resourceVersion:");
    expect(identitySource).toContain("publisherStatus: users.status");
    expect(identitySource).not.toContain("publisherName:");
    expect(identitySource).not.toContain("publisherAvatar:");
    expect(identitySource).not.toContain('state, "active"');
    expect(identitySource).not.toContain("isNull(");
  });

  it("renders correlated absolute-head reads from the physical resource table alias", () => {
    const physicalAliasSource =
      'from ${creatorMarketplaceResources} as ${sql.identifier("absolute_creator_marketplace_head")}';

    expect(repositorySource.match(new RegExp(physicalAliasSource.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "gu")))
      .toHaveLength(2);
    expect(repositorySource).not.toContain("from ${absoluteCreatorMarketplaceHead}");
  });

  it("maps every existing visibility state into one strict response and only 404s missing UUIDs", () => {
    const start = serviceSource.indexOf("async getIdentity(");
    const end = serviceSource.indexOf("async listOwnedHistory(", start);
    const identitySource = serviceSource.slice(start, end);

    expect(identitySource).toContain("CreatorMarketplaceResourceIdentitySchema.parse");
    expect(identitySource).toContain('"moderator-hidden"');
    expect(identitySource).toContain('"owner-delisted"');
    expect(identitySource).toContain('"publisher-unavailable"');
    expect(identitySource).toContain('"listed"');
    expect(identitySource).toContain("creator_marketplace_identity_not_found");
    expect(identitySource).not.toContain("projectRecord(");
  });
});
