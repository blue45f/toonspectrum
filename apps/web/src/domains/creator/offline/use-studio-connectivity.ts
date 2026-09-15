import { useSyncExternalStore } from "react";

import {
  getStudioConnectivityServerSnapshot,
  getStudioConnectivitySnapshot,
  subscribeStudioConnectivity,
  type StudioConnectivitySnapshot,
} from "./studio-connectivity";

export function useStudioConnectivity(): StudioConnectivitySnapshot {
  return useSyncExternalStore(
    subscribeStudioConnectivity,
    getStudioConnectivitySnapshot,
    getStudioConnectivityServerSnapshot,
  );
}
