import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";

import { persistSession } from "../../src/compat/auth-session-state";
import { SessionContext } from "../../src/compat/auth-session-store";
import { createProductionDemoProject } from "../../src/domains/creator/production-hub/production-demo";
import { ProductionManuscriptWorkspace } from "../../src/domains/creator/production-hub/ProductionManuscriptWorkspace";
import "../../src/styles/globals.css";

if (!import.meta.env.DEV) throw new Error("Production manuscript fixture is development-only");

const actor = {
  id: "manuscript-owner",
  name: "Synthetic manuscript owner",
  email: null,
  image: null,
  role: "creator" as const,
};
const entry = "/production/projects/sample-project/manuscripts"
  + "?episode=episode-12&artifact=missing-artifact"
  + "&manuscriptView=feedback&manuscriptReview=missing-review";
const host = document.getElementById("test-root");
if (!host) throw new Error("Missing fixture root");

persistSession({ user: actor, token: null });
createRoot(host).render(
  <MemoryRouter initialEntries={[entry]}>
    <SessionContext.Provider value={{
      data: { user: actor, token: null },
      ready: true,
      status: "authenticated",
      update: async () => null,
    }}>
      <ProductionManuscriptWorkspace
        aggregate={createProductionDemoProject()}
        canEdit
        isDemo={false}
      />
    </SessionContext.Provider>
  </MemoryRouter>,
);
