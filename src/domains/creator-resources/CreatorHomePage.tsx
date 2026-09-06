import { HomePage } from "../catalog/HomePage";

import { CreatorHubEntry } from "./CreatorHubEntry";

/** Load the hub entry with the home route, never with the shared Studio shell. */
export function CreatorHomePage() {
  return <><HomePage /><CreatorHubEntry /></>;
}
