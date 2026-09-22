import { matchRoutes } from "react-router-dom";
import { appRoutes } from "../routes/groups/app-routes";
import { campusBinding } from "@/shared/lib/spatial-campus/campus-bindings";
import { campusDistrict, type CampusBinding } from "@/shared/lib/spatial-campus/campus-model";
import type { WorkspaceTaskRoute } from "@/shared/components/workspace/workspace-task-route";

/** Match registered routes first; unknown URLs never become pretend campus destinations. */
export function resolveCampusLocation(pathname: string, search = ""): CampusBinding | null {
  const route = matchRoutes(appRoutes, { pathname })?.at(-1)?.route;
  return route?.id ? campusBinding(route.id, pathname, search) : null;
}
export function campusTaskRoute(binding: CampusBinding | null): WorkspaceTaskRoute | null {
  if (!binding || binding.surface !== "room") return null;
  const district = campusDistrict(binding.districtId);
  return {
    section: binding.districtId === "service" ? "support" : binding.districtId === "production" ? "team" : "explore",
    titleKo: district.label.ko,
    titleEn: district.label.en,
    hintKo: district.description.ko,
    hintEn: district.description.en,
  };
}
