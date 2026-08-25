import * as studioLiveGatewayCleanup from "./studio-live-gateway-cleanup";
import * as studioLiveGatewayJoin from "./studio-live-gateway-join";
import * as studioLiveGatewayRelay from "./studio-live-gateway-relay";
import * as studioLiveGatewaySession from "./studio-live-gateway-session";

export const studioLiveGatewayRuntime = {
  ...studioLiveGatewayJoin,
  ...studioLiveGatewayRelay,
  ...studioLiveGatewaySession,
  ...studioLiveGatewayCleanup,
};

export type StudioLiveGatewayRuntime = {
  [K in keyof typeof studioLiveGatewayRuntime]: (
    ...args: Parameters<(typeof studioLiveGatewayRuntime)[K]>
  ) => ReturnType<(typeof studioLiveGatewayRuntime)[K]>;
};

export function attachStudioLiveGatewayRuntime(ctor: { prototype: object }): void {
  Object.assign(ctor.prototype, studioLiveGatewayRuntime);
}
