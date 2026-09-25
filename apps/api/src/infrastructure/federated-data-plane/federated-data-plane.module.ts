import {
  DynamicModule,
  Inject,
  Injectable,
  Module,
} from "@nestjs/common";

import type {
  FederatedDataPlaneRoutingPlan,
  FederatedDataPlaneRoutingRequest,
} from "./federated-data-plane.contract";
import {
  FederatedDataPlaneRouter,
  resolveFederatedDataPlaneRouter,
} from "./federated-data-plane-routing";

export const FEDERATED_DATA_PLANE_ROUTER = Symbol(
  "FEDERATED_DATA_PLANE_ROUTER",
);

@Injectable()
export class FederatedDataPlaneService {
  constructor(
    @Inject(FEDERATED_DATA_PLANE_ROUTER)
    private readonly router: FederatedDataPlaneRouter | null,
  ) {}

  isEnabled(): boolean {
    return this.router !== null;
  }

  plan(
    request: FederatedDataPlaneRoutingRequest,
  ): Promise<FederatedDataPlaneRoutingPlan> | null {
    return this.router?.plan(request) ?? null;
  }
}

@Module({})
export class FederatedDataPlaneModule {}

export function createFederatedDataPlaneDynamicModule(
  environment: Readonly<Record<string, string | undefined>>,
  now: () => number = Date.now,
): DynamicModule {
  const router = resolveFederatedDataPlaneRouter(environment, now);
  return {
    module: FederatedDataPlaneModule,
    providers: [
      {
        provide: FEDERATED_DATA_PLANE_ROUTER,
        useValue: router,
      },
      FederatedDataPlaneService,
    ],
    exports: [FederatedDataPlaneService],
  };
}
