import { useSearchParams } from "react-router-dom";

import { StudioProjectLibraryManagementPage } from "./StudioProjectLibraryManagementPage";
import { StudioSaveFirstProjectLibraryPage } from "./StudioSaveFirstProjectLibraryPage";

const SECONDARY_VIEWS = new Set(["storage", "exports", "publications"]);

export function StudioProjectLibraryPage() {
  const [searchParams] = useSearchParams();
  return SECONDARY_VIEWS.has(searchParams.get("view") ?? "")
    ? <StudioSaveFirstProjectLibraryPage />
    : <StudioProjectLibraryManagementPage />;
}
