/**
 * Canonical registry for advanced ToonStudio project capabilities.
 *
 * Route and document surfaces consume this single registry instead of importing feature modules
 * by ad-hoc string paths. Keeping the module values here also makes a missing integration file a
 * compile-time failure rather than a production-only lazy-route failure.
 */

import * as archiveManifest from "./studio-archive-manifest";
import * as assetPassport from "./studio-asset-passport";
import * as assetProvider from "./studio-asset-provider";
import * as fontAudit from "./studio-font-audit";
import * as marketplaceSubmission from "./studio-marketplace-submission";
import * as pluginRegistry from "./studio-plugin-registry";
import * as publishingConnector from "./studio-publishing-connector";
import * as publishingPackage from "./studio-publishing-package";
import * as rightsGraph from "./studio-rights-graph";

export const STUDIO_FEATURE_MODULE_REGISTRY = Object.freeze({
  archiveManifest,
  assetPassport,
  assetProvider,
  fontAudit,
  marketplaceSubmission,
  pluginRegistry,
  publishingConnector,
  publishingPackage,
  rightsGraph,
});

export type StudioFeatureModuleId = keyof typeof STUDIO_FEATURE_MODULE_REGISTRY;

export const STUDIO_FEATURE_CAPABILITY_COUNT = Object.keys(
  STUDIO_FEATURE_MODULE_REGISTRY,
).length;

export function studioFeatureModule(id: StudioFeatureModuleId) {
  return STUDIO_FEATURE_MODULE_REGISTRY[id];
}
