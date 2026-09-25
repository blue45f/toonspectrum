import { lazy, Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { CampusObjectPublisherContext } from "@/shared/components/spatial-campus/campus-object-context";
import { CampusPaletteContext } from "@/shared/components/spatial-campus/campus-palette-context";
import { saveCampusPaletteToStudio } from "./campus-palette-adapter";
import { campusSceneObjects, type CampusObject } from "@/shared/lib/spatial-campus/campus-objects";
import { useLocation } from "react-router-dom";
import { useSession } from "@/domains/auth/public/session/auth-session-store";
import { useCreatorExperienceMode } from "@/shared/lib/creator-experience-mode";
import { campusDistrict, type CampusBinding, type CampusMode } from "@/shared/lib/spatial-campus/campus-model";
import { campusDocumentHref, campusSessionStorage, readCampusReturn, writeCampusReturn, CAMPUS_RETURN_TTL, type CampusReturnTarget } from "@/shared/lib/spatial-campus/campus-return";
import { CampusContext } from "@/shared/components/spatial-campus/campus-context";
import { CampusControls } from "@/shared/components/spatial-campus/CampusControls";
import { CampusSceneBoundary } from "@/shared/components/spatial-campus/CampusSceneBoundary";
import { CampusSceneRecovery } from "@/shared/components/spatial-campus/CampusSceneRecovery";
import { CampusPrivacyCurtain } from "@/shared/components/spatial-campus/CampusPrivacyCurtain";
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
  const [privacyMode, setPrivacyMode] = useState(false);
  const protectedRoute = binding?.surface === "protected";
  const districtId = binding?.districtId ?? null;
  const readerFocus = pathname.startsWith("/create/")
    && new URLSearchParams(search).get("view") === "reader";
  const privacySensitive = binding?.surface === "room" && binding.private;
  const privacyActive = Boolean(privacySensitive && privacyMode);
  const sceneObjectsAllowed = !protectedRoute
    && !readerFocus
    && binding?.surface === "room"
    && districtId !== null
    && districtId !== "observatory"
    && districtId !== "service";
  const scope = JSON.stringify([owner, routeKey]);
  const activeScope = useRef(scope);
  activeScope.current = scope;
  const paletteScope = JSON.stringify([owner, routeKey, districtId]);
  const activePaletteScope = useRef(paletteScope);
  activePaletteScope.current = paletteScope;
  const savePalette = useCallback((colors: readonly string[]) => {
    const requestedScope = paletteScope;
    return saveCampusPaletteToStudio(colors, () => {
      if (activePaletteScope.current !== requestedScope) {
        throw new DOMException("Palette destination changed.", "AbortError");
      }
    });
  }, [paletteScope]);
  const [projection, setProjection] = useState<{
    scope: string;
    sources: Readonly<Record<string, readonly CampusObject[]>>;
  } | null>(null);
  const publishObjects = useCallback((sourceId: string, candidates: readonly CampusObject[]) => {
    if (!sceneObjectsAllowed || !districtId || activeScope.current !== scope) return () => undefined;
    const next = campusSceneObjects(candidates, districtId);
    setProjection((current) => ({
      scope,
      sources: {
        ...(current?.scope === scope ? current.sources : {}),
        [sourceId]: next,
      },
    }));
    return () => setProjection((current) => {
      if (current?.scope !== scope || !(sourceId in current.sources)) return current;
      const sources = { ...current.sources };
      delete sources[sourceId];
      return Object.keys(sources).length ? { scope, sources } : null;
    });
  }, [districtId, sceneObjectsAllowed, scope]);
  const objects = sceneObjectsAllowed && !privacyActive && districtId && projection?.scope === scope
    ? campusSceneObjects(Object.values(projection.sources).flat(), districtId)
    : [];
  useEffect(() => {
    const storage = campusSessionStorage();
    const changedOwner = previousOwner.current !== owner;
    previousOwner.current = owner;
    if (changedOwner) {
      writeCampusReturn(storage, null);
      setMemory(null);
      setPrivacyMode(false);
    }
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
  useEffect(() => {
    if (!privacySensitive) setPrivacyMode(false);
  }, [privacySensitive]);
  const mode: CampusMode = readerFocus
    ? "focus"
    : focusPath === pathname
      ? "focus"
      : preference === "virtual-studio"
        ? "scene"
        : "task";
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
    ? {
        binding,
        district,
        mode,
        privacyMode: privacyActive,
        privacySensitive,
        returnHref,
        setMode,
        setPrivacyMode,
      } : null;
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
  const scene = ownsRoom && !readerFocus && mode === "scene" && district ? (
    <CampusSceneBoundary resetKey={district.id} fallback={<CampusSceneRecovery />}>
      <Suspense fallback={<div className="campus-room-loading" role="status">{district.label.ko} · {district.label.en}</div>}>
        <CampusRoom key={district.id} district={district} objects={objects} />
      </Suspense>
    </CampusSceneBoundary>
  ) : null;
  const domain = privacySensitive ? (
    <CampusPrivacyCurtain key={owner} active={privacyActive} onReveal={() => setPrivacyMode(false)}>
      {children}
    </CampusPrivacyCurtain>
  ) : children;
  return <CampusContext.Provider value={context}>
    <CampusPaletteContext.Provider value={!protectedRoute && districtId === "observatory" ? savePalette : null}>
      <CampusObjectPublisherContext.Provider value={sceneObjectsAllowed ? publishObjects : null}>
        <WorkspaceTaskFrame route={route}
          campusMode={ownsRoom ? mode : undefined}
          campusControls={ownsRoom && !readerFocus ? <CampusControls /> : undefined}
          campusScene={scene}>
          {domain}
        </WorkspaceTaskFrame>
      </CampusObjectPublisherContext.Provider>
    </CampusPaletteContext.Provider>
  </CampusContext.Provider>;
}
