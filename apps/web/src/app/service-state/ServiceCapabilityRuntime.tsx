import { useEffect } from "react";

import { startServiceCapabilityRuntime } from "@/platform/service-capability-state";

export function ServiceCapabilityRuntime() {
  useEffect(() => startServiceCapabilityRuntime(), []);
  return null;
}

export default ServiceCapabilityRuntime;
