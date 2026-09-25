import { describe, expect, it } from "vitest";

import {
  createFederatedDataPlaneDynamicModule,
  FEDERATED_DATA_PLANE_ROUTER,
  FederatedDataPlaneService,
} from "./federated-data-plane.module";
import { FEDERATED_DATA_PLANE_QUOTA_SNAPSHOT_VERSION } from "./federated-data-plane-routing";

const NOW = 1_800_000_000_000;

describe("FederatedDataPlaneModule", () => {
  it("keeps the runtime disabled by default", () => {
    const service = new FederatedDataPlaneService(null);
    expect(service.isEnabled()).toBe(false);
    expect(service.plan({ routeId: "notification-write" })).toBeNull();

    const module = createFederatedDataPlaneDynamicModule({}, () => NOW);
    const routerProvider = module.providers?.find(
      (provider) =>
        typeof provider === "object"
        && provider !== null
        && "provide" in provider
        && provider.provide === FEDERATED_DATA_PLANE_ROUTER,
    );
    expect(routerProvider).toMatchObject({ useValue: null });
  });

  it("creates an enabled router only from reviewed quota telemetry", async () => {
    const module = createFederatedDataPlaneDynamicModule(
      {
        FEDERATED_DATA_PLANE_ENABLED: "true",
        FEDERATED_DATA_PLANE_QUOTA_SNAPSHOTS_JSON: JSON.stringify({
          version: FEDERATED_DATA_PLANE_QUOTA_SNAPSHOT_VERSION,
          shards: {
            "firestore-notifications": {
              health: "healthy",
              usageRatio: 0.1,
              forecastRatio: 0.2,
              observedAtEpochMs: NOW - 1_000,
              staleAfterMs: 60_000,
            },
          },
        }),
      },
      () => NOW,
    );
    const routerProvider = module.providers?.find(
      (provider) =>
        typeof provider === "object"
        && provider !== null
        && "provide" in provider
        && provider.provide === FEDERATED_DATA_PLANE_ROUTER,
    );
    expect(routerProvider).toBeDefined();
    if (!routerProvider || typeof routerProvider !== "object"
      || !("useValue" in routerProvider)) {
      throw new Error("Router provider is missing");
    }
    const service = new FederatedDataPlaneService(routerProvider.useValue);
    expect(service.isEnabled()).toBe(true);
    await expect(
      service.plan({ routeId: "notification-write" }),
    ).resolves.toMatchObject({
      outcome: "selected",
      primary: { shardId: "firestore-notifications" },
    });
  });
});
