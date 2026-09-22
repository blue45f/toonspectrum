import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Footprints, Pause, ArrowUpRight } from "lucide-react";
import { CampusSceneBoundary } from "@/shared/components/spatial-campus/CampusSceneBoundary";
import { CampusSceneRecovery } from "@/shared/components/spatial-campus/CampusSceneRecovery";
import { useI18n } from "@/shared/lib/i18n";
import type { CampusDistrict } from "@/shared/lib/spatial-campus/campus-model";
import { useCampus } from "@/shared/components/spatial-campus/campus-context";
import type { CampusObject } from "@/shared/lib/spatial-campus/campus-objects";
import { StudioVirtualSpaceEngineBridge } from "@/domains/creator/virtual-space/studio-virtual-space-engine-bridge";
import { studioVirtualSpaceState } from "@/domains/creator/virtual-space/studio-virtual-space-model";
import type { StudioVirtualSpaceSnapshot } from "@/domains/creator/virtual-space/studio-virtual-space-presence";
import { campusObjectInteractionIndex, campusWorld } from "./campus-world";

const PhaserCanvas = lazy(() => import("@/domains/creator/virtual-space/StudioVirtualSpacePhaserCanvas").then((module) => ({ default: module.StudioVirtualSpacePhaserCanvas })));
const noOperation = () => undefined;

export function CampusRoom({ district, objects }: { readonly district: CampusDistrict; readonly objects: readonly CampusObject[] }) {
  const locale = useI18n((state) => state.lang.startsWith("ko") ? "ko" : "en");
  const campus = useCampus();
  const location = useLocation();
  const navigate = useNavigate();
  const manifest = useMemo(() => campusWorld(district, objects), [district, objects]);
  const bridge = useMemo(() => new StudioVirtualSpaceEngineBridge(), []);
  const [walking, setWalking] = useState(false);
  const [visible, setVisible] = useState(true);
  const [imageFailed, setImageFailed] = useState(false);
  const host = useRef<HTMLDivElement>(null);
  const point = useRef(manifest.spawns[0]!.point);
  const [snapshot, setSnapshot] = useState<StudioVirtualSpaceSnapshot>(() => ({
    self: studioVirtualSpaceState(manifest.spawns[0]!.point), peers: [], nearbyPeers: [], selfReaction: null, peerReactions: [], direct: false,
  }));
  useEffect(() => {
    point.current = manifest.spawns[0]!.point;
    setWalking(false);
    setImageFailed(false);
    return () => bridge.clearMovement();
  }, [manifest, bridge]);
  useEffect(() => {
    let intersects = true;
    const update = () => {
      setSnapshot((current) => ({ ...current, self: studioVirtualSpaceState(point.current) }));
      setVisible(intersects && !document.hidden);
    };
    const observer = typeof IntersectionObserver === "undefined" ? null : new IntersectionObserver(([entry]) => {
      intersects = Boolean(entry?.isIntersecting); update();
    });
    if (host.current) observer?.observe(host.current);
    document.addEventListener("visibilitychange", update);
    update();
    return () => { observer?.disconnect(); document.removeEventListener("visibilitychange", update); };
  }, []);
  const artwork = !imageFailed ? <img src={district.artworkUrl} alt="" width={manifest.width} height={manifest.height}
    onError={() => setImageFailed(true)} decoding="async" /> : <p role="status">{locale === "ko" ? "그림 없이도 아래 기능을 사용할 수 있어요." : "All actions remain available without the artwork."}</p>;
  return <section className="campus-room" aria-label={district.label[locale]} data-campus-room={district.id}>
    <header><h2>{district.label[locale]}</h2><p>{district.description[locale]}</p></header>
    <div className="campus-room-art" ref={host}>
      {walking && visible ? <CampusSceneBoundary resetKey={district.id} fallback={<CampusSceneRecovery />}><Suspense fallback={artwork}>
        <PhaserCanvas manifest={manifest} snapshot={snapshot} bridge={bridge} atmosphere="focus"
          onLocalState={(state) => {
            point.current = state.point;
            // Local-only renderer diagnostics: no identity, domain input, peers or network writes.
            if (host.current) {
              host.current.dataset.campusWalkX = state.point.x.toFixed(3);
              host.current.dataset.campusWalkY = state.point.y.toFixed(3);
            }
          }} onPeerSelect={noOperation} onCancelFollow={noOperation}
          onInteract={(interaction) => {
            const interactionId = interaction?.id;
            if (!interactionId) return;
            const target = district.destinations.find((item) => item.id === interactionId);
            if (target) {
              navigate(target.href);
              return;
            }
            const objectIndex = campusObjectInteractionIndex(interactionId);
            const object = objectIndex === null ? null : objects[objectIndex];
            if (object) navigate(object.href);
          }} />
      </Suspense></CampusSceneBoundary> : artwork}
    </div>
    <div className="campus-room-action-row">
      <button type="button" className="campus-control" aria-pressed={walking} onClick={() => { setSnapshot((current) => ({ ...current, self: studioVirtualSpaceState(point.current) })); setWalking((value) => !value); }}>
        {walking ? <Pause size={16} aria-hidden="true" /> : <Footprints size={16} aria-hidden="true" />}
        {locale === "ko" ? (walking ? "걷기 멈추기" : "공용 아틀리에 걷기") : (walking ? "Stop walking" : "Walk the shared atelier")}
      </button>
      <small>{locale === "ko" ? "아래 기능은 바로 열 수 있어요." : "Open any action directly below."}</small>
    </div>
    <nav className="campus-room-destinations" aria-label={locale === "ko" ? "이 공간의 기능" : "Actions in this place"}>
      {district.destinations.map((destination) => <Link key={destination.id} to={destination.href}
        aria-current={`${location.pathname}${location.search}` === destination.href ? "page" : undefined}>
        <span>{destination.label[locale]}</span><ArrowUpRight size={16} aria-hidden="true" />
      </Link>)}
    </nav>
    {objects.length > 0 && <nav className="campus-public-objects" aria-label={locale === "ko" ? "이 공간에서 바로 열 수 있는 항목" : "Items available in this place"}>
      {objects.slice(0, 6).map((object) => <Link key={`${object.kind ?? "item"}:${object.id}:${object.href}`} to={object.href} data-campus-object-exposure={object.exposure ?? "public"}>
        {object.thumbnail ? <img src={object.thumbnail} alt="" loading="lazy" width={48} height={48} /> : null}
        <span>{object.title}{object.exposure === "private" ? <small>{locale === "ko" ? "내 화면에서만" : "Only in your view"}</small> : null}</span><ArrowUpRight size={16} aria-hidden="true" />
      </Link>)}
    </nav>}
    {district.id === "observatory" && <p className="campus-private-note">{locale === "ko"
      ? "입력과 해석은 나만의 세션입니다. 이 공간은 위치·질문·결과를 다른 사람에게 전송하지 않아요."
      : "Inputs and readings stay in your session. This scene does not broadcast your location, questions or results."}</p>}
    {campus?.binding.private && district.id !== "observatory" && <p className="campus-private-note">
      {locale === "ko"
        ? "이 공간에는 비공개 작품·팀 정보가 보일 수 있습니다. 화면 공유나 공개 스트리밍 전에 표시 내용을 확인하세요."
        : "This place can contain private work or team information. Check what is visible before screen sharing or streaming."}
    </p>}
  </section>;
}
