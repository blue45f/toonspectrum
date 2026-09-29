import { describe, expect, it } from "vitest";

import { accountRoutes } from "./account.routes";
import { adminRoutes } from "./admin.routes";
import { catalogRoutes } from "./catalog.routes";
import { communityRoutes } from "./community.routes";
import { creatorResourcesRoutes } from "./creator-resources.routes";
import { creatorRoutes } from "./creator.routes";
import { engagementRoutes } from "./engagement.routes";
import { experienceRoutes } from "./experience.routes";
import { integrationRoutes } from "./integrations.routes";
import { legalRoutes } from "./legal.routes";
import { legacyRedirectRoutes } from "./legacy.routes";
import { marketRoutes } from "./market.routes";
import { marketingRoutes } from "./marketing.routes";
import { notFoundRoutes } from "./not-found.route";
import { productionRoutes } from "./production.routes";
import { referenceRoutes } from "./reference.routes";

import type { AppRouteDefinition } from "../app-route-definition";

interface GroupConvention {
  readonly group: string;
  readonly routes: readonly AppRouteDefinition[];
  /** id는 `<도메인>-<페이지>` 형태. 도메인은 그룹 파일명에서 온다. */
  readonly prefix: string;
  /**
   * campus 바인딩(`shared/lib/spatial-campus/campus-bindings.ts`)이 참조하는
   * 안정 식별자라서 당장 고칠 수 없는 예외. 리네임하려면 바인딩 동반 수정이
   * 필요하므로 목록에서 조용히 빼지 말고 테스트와 함께 갱신한다.
   */
  readonly legacyExceptions?: readonly string[];
}

const CONVENTIONS: readonly GroupConvention[] = [
  { group: "account", routes: accountRoutes, prefix: "account-" },
  { group: "admin", routes: adminRoutes, prefix: "admin" },
  { group: "catalog", routes: catalogRoutes, prefix: "catalog-" },
  {
    group: "community",
    routes: communityRoutes,
    prefix: "community-",
    legacyExceptions: [
      "collaboration-board",
      "collaboration-post",
      "collaboration-edit",
      "collaboration-career-gallery",
      "collaboration-moderation",
      "collaboration-new",
      "collaboration-positions",
      "collaboration-workspace",
      "team-recruiting",
    ],
  },
  {
    group: "creator-resources",
    routes: creatorResourcesRoutes,
    prefix: "resources-",
    legacyExceptions: [
      "ecosystem-home",
      "ecosystem-collaboration",
      "ecosystem-education",
      "ecosystem-education-legacy",
      "ecosystem-fandom",
      "ecosystem-library",
      "research-home",
      "research-assets",
      "research-books",
      "research-catalog",
      "research-catalog-notebook",
      "research-google-fonts",
      "research-gbif",
      "research-musicbrainz",
      "research-internet-archive",
      "research-met-weather",
      "research-open-creation",
      "research-open-data",
      "research-open-data-ambientcg",
      "research-open-data-dpla",
      "research-open-data-europeana",
      "research-open-data-gbif",
      "research-open-data-heritage",
      "research-open-data-internet-archive",
      "research-open-data-korean",
      "research-open-data-musicbrainz",
      "research-open-data-nasa",
      "research-open-data-schools",
      "research-open-data-smithsonian",
      "research-open-data-tour",
      "research-open-data-vam",
      "research-open-data-wikimedia",
      "research-polyhaven",
      "research-ambientcg",
      "research-nasa-images",
      "research-vam",
      "research-rijksmuseum",
      "research-content-packs",
    ],
  },
  { group: "creator", routes: creatorRoutes, prefix: "creator-" },
  { group: "engagement", routes: engagementRoutes, prefix: "engagement-" },
  { group: "experience", routes: experienceRoutes, prefix: "experience-" },
  {
    group: "integrations",
    routes: integrationRoutes,
    prefix: "integration-",
    legacyExceptions: ["automation-hub", "publish-center", "developer-platform"],
  },
  { group: "legal", routes: legalRoutes, prefix: "legal-" },
  { group: "legacy", routes: legacyRedirectRoutes, prefix: "legacy-" },
  { group: "market", routes: marketRoutes, prefix: "market-" },
  {
    group: "marketing",
    routes: marketingRoutes,
    prefix: "marketing-",
    legacyExceptions: ["workspace-home", "workspace-team", "workspace-hub"],
  },
  { group: "not-found", routes: notFoundRoutes, prefix: "not-found" },
  {
    group: "production",
    routes: productionRoutes,
    prefix: "production-",
    legacyExceptions: ["team-people", "team-people-detail", "team-people-usage", "team-people-join"],
  },
  {
    group: "reference",
    routes: referenceRoutes,
    prefix: "reference-",
    legacyExceptions: ["catalog-references"],
  },
];

describe("route id naming convention", () => {
  it("names every route id as <domain>-<page> after its group file", () => {
    for (const { group, routes, prefix, legacyExceptions = [] } of CONVENTIONS) {
      const exceptions = new Set(legacyExceptions);
      const nonConforming = routes
        .map((route) => route.id)
        .filter((id) => id !== prefix && !id.startsWith(prefix) && !exceptions.has(id));
      expect(nonConforming, group).toEqual([]);
    }
  });

  it("keeps the legacy exception list exact so fixed ids get removed", () => {
    for (const { group, routes, prefix, legacyExceptions = [] } of CONVENTIONS) {
      const actual = routes
        .map((route) => route.id)
        .filter((id) => id !== prefix && !id.startsWith(prefix))
        .sort();
      expect(actual, group).toEqual([...legacyExceptions].sort());
    }
  });
});
