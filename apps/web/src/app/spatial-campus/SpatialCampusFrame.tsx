import { lazy, Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { CampusObjectPublisherContext } from "@/shared/components/spatial-campus/campus-object-context";
import { campusPublicObjects, type CampusObject } from "@/shared/lib/spatial-campus/campus-objects";
import { useLocation } from "react-router-dom";
import { useSession } from "@/compat/auth-session-store";
import { useCreatorExperienceMode } from "@/shared/lib/creator-experience-mode";
import { campusDistrict, type CampusBinding, type CampusMode } from "@/shared/lib/spatial-campus/campus-model";
import { campusDocumentHref, campusSessionStorage, readCampusReturn, writeCampusReturn, CAMPUS_RETURN_TTL, type CampusReturnTarget } from "@/shared/lib/spatial-campus/campus-return";
import { CampusContext } from "@/shared/components/spatial-campus/campus-context";
import { CampusControls } from "@/shared/components/spatial-campus/CampusControls";
import { CampusSceneBoundary } from "@/shared/components/spatial-campus/CampusSceneBoundary";
import { CampusSceneRecovery } from "@/shared/components/spatial-campus/CampusSceneRecovery";
import { WorkspaceTaskFrame } from "@/shared/components/workspace/WorkspaceTaskFrame";
import type { WorkspaceTaskRoute } from "@/shared/components/workspace/workspace-task-route";
import "@/shared/components/spatial-campus/campus.css";

const CampusRoom = lazy(() => import("./CampusRoom").then((module) => ({ default: module.CampusRoom })));

/** Presentation is independent from the page tree, document engine and domain authorities. */
export function SpatialCampusFrame({ binding, route, children }: {
  readonly binding: CampusBinding | null;
  readonly route: WorkspaceTaskRoute | null;
  readonly children: ReactNode;
}) {
  const { pathname, search, key: routeKey } = useLocation();
  const session = useSession();
  const owner = session.data?.user.id ?? "local";
  const previousOwner = useRef(owner);
  const [memory, setMemory] = useState<CampusReturnTarget | null>(null);
  const preference = useCreatorExperienceMode((state) => state.mode);
  const setPreference = useCreatorExperienceMode((state) => state.setMode);
  const [focusPath, setFocusPath] = useState<string | null>(null);
  const protectedRoute = binding?.surface === "protected";
  const publicObjectsAllowed = !protectedRoute && binding?.routeId === "market-browse";
  const scope = JSON.stringify([owner, routeKey]);
  const activeScope = useRef(scope);
  activeScope.current = scope;
  const [projection, setProjection] = useState<{ scope: string; sourceId: string; objects: readonly CampusObject[] } | null>(null);
  const publishObjects = useCallback((sourceId: string, objects: readonly CampusObject[]) => {
    if (!publicObjectsAllowed || activeScope.current !== scope) return () => undefined;
    setProjection({ scope, sourceId, objects: campusPublicObjects(objects) });
    return () => setProjection((current) => current?.scope === scope && current.sourceId === sourceId ? null : current);
  }, [scope, publicObjectsAllowed]);
  const objects = publicObjectsAllowed && projection?.scope === scope ? projection.objects : [];
  useEffect(() => {
    const storage = campusSessionStorage();
    const changedOwner = previousOwner.current !== owner;
    previousOwner.current = owner;
    if (changedOwner) { writeCampusReturn(storage, null); setMemory(null); }
    if (protectedRoute || !session.ready) return;
    const href = campusDocumentHref(pathname, search);
    if (href) {
      const target = { owner, href, savedAt: Date.now() };
      writeCampusReturn(storage, target);
      setMemory(target);
    } else {
      const stored = readCampusReturn(storage, owner);
      setMemory((current) => stored ?? (current?.owner === owner && Date.now() - current.savedAt < CAMPUS_RETURN_TTL ? current : null));
    }
  }, [owner, pathname, search, session.ready, protectedRoute]);
  const mode: CampusMode = focusPath === pathname ? "focus" : preference === "virtual-studio" ? "scene" : "task";
  const setMode = (next: CampusMode) => {
    setFocusPath(next === "focus" ? pathname : null);
    if (next !== "focus") setPreference(next === "scene" ? "virtual-studio" : "classic");
  };
  useEffect(() => {
    if (!memory) return;
    const remaining = CAMPUS_RETURN_TTL - (Date.now() - memory.savedAt);
    const expire = () => setMemory((current) => current === memory ? null : current);
    if (remaining <= 0) { expire(); return; }
    const timer = window.setTimeout(expire, remaining);
    const check = () => { if (Date.now() - memory.savedAt >= CAMPUS_RETURN_TTL) expire(); };
    document.addEventListener("visibilitychange", check);
    return () => { window.clearTimeout(timer); document.removeEventListener("visibilitychange", check); };
  }, [memory]);
  const returnHref = !protectedRoute && session.ready && memory?.owner === owner ? memory.href : null;
  const district = binding ? campusDistrict(binding.districtId) : null;
  const context = binding && district && !protectedRoute
    ? { binding, district, mode, setMode, returnHref } : null;
  const ownsRoom = binding?.surface === "room";
  const activeDistrictId = context?.district.id;
  useEffect(() => {
    if (!activeDistrictId) return;
    document.documentElement.dataset.campusDistrict = activeDistrictId;
    document.documentElement.dataset.campusMode = mode;
    return () => {
      delete document.documentElement.dataset.campusDistrict;
      delete document.documentElement.dataset.campusMode;
    };
  }, [activeDistrictId, mode]);
  const scene = ownsRoom && mode === "scene" && district ? (
    <CampusSceneBoundary resetKey={district.id} fallback={<CampusSceneRecovery />}>
      <Suspense fallback={<div className="campus-room-loading" role="status">{district.label.ko} · {district.label.en}</div>}>
        <CampusRoom key={district.id} district={district} objects={objects} />
      </Suspense>
    </CampusSceneBoundary>
  ) : null;
  return <CampusContext.Provider value={context}>
    <CampusObjectPublisherContext.Provider value={publicObjectsAllowed ? publishObjects : null}>
    <WorkspaceTaskFrame route={route}
      campusMode={ownsRoom ? mode : undefined}
      campusControls={ownsRoom ? <CampusControls /> : undefined}
      campusScene={scene}>
      {children}
    </WorkspaceTaskFrame>
    </CampusObjectPublisherContext.Provider>
  </CampusContext.Provider>;
}
