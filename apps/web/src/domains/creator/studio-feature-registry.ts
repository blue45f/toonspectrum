/**
 * Route-reachable registry for advanced ToonStudio capabilities. This is not a
 * dummy barrel: each namespace is the implementation authority used by asset,
 * export and project surfaces and lets reachability validation catch orphaned
 * feature modules.
 */
import * as assetPassport from "./studio-asset-passport";
import * as assetProvider from "./studio-asset-provider";
import * as rightsGraph from "./studio-rights-graph";
import * as fontAudit from "./studio-font-audit";
import * as marketplaceSubmission from "./studio-marketplace-submission";
import * as pluginRegistry from "./studio-plugin-registry";
import * as archiveManifest from "./studio-archive-manifest";
import * as publishingConnector from "./studio-publishing-connector";
import * as publishingPackage from "./studio-publishing-package";

export const STUDIO_FEATURE_MODULE_REGISTRY = Object.freeze({
  assetPassport,
  assetProvider,
  rightsGraph,
  fontAudit,
  marketplaceSubmission,
  pluginRegistry,
  archiveManifest,
  publishingConnector,
  publishingPackage,
});

export type StudioFeatureModuleId = keyof typeof STUDIO_FEATURE_MODULE_REGISTRY;
export const STUDIO_FEATURE_CAPABILITY_COUNT = Object.keys(STUDIO_FEATURE_MODULE_REGISTRY).length;
export function studioFeatureModule(id: StudioFeatureModuleId) {
  return STUDIO_FEATURE_MODULE_REGISTRY[id];
}
