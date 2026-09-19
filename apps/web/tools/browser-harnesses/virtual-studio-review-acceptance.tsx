import { createRoot } from "react-dom/client";

import { SessionContext } from "../../src/compat/auth-session-store";
import { StudioPinnedReviewPanel } from "../../src/domains/creator/virtual-space/StudioPinnedReviewPanel";
import "../../src/styles/globals.css";

// Development-only rendering fixture. The verifier intercepts every API/image request;
// this context is not a server login, production admission, or a real user's document.
const host = document.getElementById("test-root");
if (!host) throw new Error("Review fixture root is missing");
createRoot(host).render(<SessionContext.Provider value={{
  data: { user: { id: "reviewer", name: "Review fixture", email: null, image: null, role: "creator" }, token: null },
  ready: true, status: "authenticated", update: async () => null,
}}><main className="mx-auto min-h-screen max-w-3xl p-4 text-fg">
  <p className="mb-4 text-sm text-fg-3">브라우저 검수용 예시 · HTTP fixture</p>
  <StudioPinnedReviewPanel subject={{ schemaVersion: 1, projectId: "qa-graph", workId: "qa-work",
    artifactId: "qa-artifact", reviewId: "qa-review", revisionId: "qa-snapshot", rootGraphHash: "a".repeat(64) }} />
</main></SessionContext.Provider>);
