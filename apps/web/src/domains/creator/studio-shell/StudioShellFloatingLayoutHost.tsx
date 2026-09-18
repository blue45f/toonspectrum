import { StudioShellFloatingLayoutManager } from "./StudioShellFloatingLayoutManager";
import { StudioShellFloatingLayoutProvider } from "./StudioShellFloatingLayoutProvider";

/** Lazy document-lifetime owner for optional floating chrome and its durable preferences. */
export function StudioShellFloatingLayoutHost() {
  return (
    <StudioShellFloatingLayoutProvider>
      <StudioShellFloatingLayoutManager />
    </StudioShellFloatingLayoutProvider>
  );
}
