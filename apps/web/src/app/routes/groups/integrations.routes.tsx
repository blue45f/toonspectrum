import { createElement, type ComponentType } from "react";

import { defineAppRoutes, type AppRouteDefinition } from "../app-route-definition";

import { lazyRetry } from "@/shared/lib/lazy-retry";

type LazyPageModule = Record<string, ComponentType>;

function lazyPage(load: () => Promise<unknown>, name: string) {
  return lazyRetry(
    () => load().then((module) => ({
      default: (module as LazyPageModule)[name]!,
    })),
    name,
  );
}

function route(id: string, path: string, Page: ComponentType): AppRouteDefinition {
  return { id, path, element: createElement(Page) };
}

const IntegrationCenterPage = lazyPage(
  () => import("@/domains/integrations/IntegrationCenterPage"),
  "IntegrationCenterPage",
);
const AutomationHubPage = lazyPage(
  () => import("@/domains/integrations/AutomationHubPage"),
  "AutomationHubPage",
);
const PublishCenterPage = lazyPage(
  () => import("@/domains/integrations/PublishCenterPage"),
  "PublishCenterPage",
);
const DeveloperPlatformPage = lazyPage(
  () => import("@/domains/integrations/DeveloperPlatformPage"),
  "DeveloperPlatformPage",
);
const ApiKeyHubPage = lazyPage(
  () => import("@/domains/integrations/api-key-hub/ApiKeyHubPage"),
  "ApiKeyHubPage",
);

export const integrationRoutes = defineAppRoutes([
  route("integration-center", "/settings/integrations", IntegrationCenterPage),
  route("integration-api-key-hub", "/settings/api-keys", ApiKeyHubPage),
  route("automation-hub", "/automation", AutomationHubPage),
  route("publish-center", "/publish", PublishCenterPage),
  route("developer-platform", "/developers", DeveloperPlatformPage),
]);
