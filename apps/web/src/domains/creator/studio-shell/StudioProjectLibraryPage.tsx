import { Suspense } from "react";
import { useSearchParams } from "react-router-dom";

import { lazyRetry } from "@/shared/lib/lazy-retry";

import { StudioHomeLoadingSkeleton } from "./StudioHomeLoadingSkeleton";
import { StudioProjectLibraryManagementPage } from "./StudioProjectLibraryManagementPage";

// 저장·내보내기·게시 보조 화면은 작품 홈 첫 화면 경로에서 분리한다.
const StudioSaveFirstProjectLibraryPage = lazyRetry(
  () => import("./StudioSaveFirstProjectLibraryPage").then((module) => ({
    default: module.StudioSaveFirstProjectLibraryPage,
  })),
  "StudioSaveFirstProjectLibraryPage",
);

const SECONDARY_VIEWS = new Set(["storage", "exports", "publications"]);

export function StudioProjectLibraryPage() {
  const [searchParams] = useSearchParams();
  if (!SECONDARY_VIEWS.has(searchParams.get("view") ?? "")) return <StudioProjectLibraryManagementPage />;
  return (
    <Suspense fallback={<StudioHomeLoadingSkeleton variant="list" />}>
      <StudioSaveFirstProjectLibraryPage />
    </Suspense>
  );
}
