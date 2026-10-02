import "../styles/brush-lab.css";

import { useEffect, useMemo, useState } from "react";

import { LAB_SCHEMA_VERSION, SUMI_ENGINE_VERSION } from "../../engine/core/version";
import { LANE_REGISTRY } from "../../lanes/registry";
import { createBrowserLaneEnvironment } from "../../platform/browser-environment";
import { createBenchRunner } from "../state/bench-runner";
import { createLabActions, labStore, useLabState } from "../state/lab-store";
import { messageOf, probeAllLanes } from "../state/run-compare";
import { CapabilityBanner } from "../ui/CapabilityBanner";
import { CompareView } from "../views/CompareView";
import { GalleryView } from "../views/GalleryView";
import { ReportView } from "../views/ReportView";
import { createGalleryWorkerClient } from "../workers/create-gallery-worker";

import { LabContext } from "./lab-context";

import type { LabContextValue } from "./lab-context";
import type { LaneDescriptor, LaneEnvironment } from "../../lanes/lane";
import type { GalleryRenderer } from "../../platform/worker-client";
import type { BenchRunner } from "../state/bench-runner";
import type { LabStore, LabTab } from "../state/lab-store";
import type { KeyboardEvent } from "react";

export interface BrushLabAppProps {
  /** 기본 LANE_REGISTRY. 테스트는 모의 레지스트리를 넣는다. */
  registry?: readonly LaneDescriptor[];
  env?: LaneEnvironment;
  runner?: BenchRunner;
  store?: LabStore;
  /** 갤러리 렌더러. 생략하면 Worker 클라이언트를 만들고, 실패하면 사유를 갤러리 탭에 보여준다. */
  gallery?: GalleryRenderer | null;
  galleryError?: string | null;
  /** 마운트 시 모든 레인을 probe한다(기본 true). */
  autoProbe?: boolean;
}

const TABS: readonly { id: LabTab; label: string }[] = [
  { id: "gallery", label: "갤러리" },
  { id: "compare", label: "A/B 비교" },
  { id: "report", label: "리포트" },
];

interface GallerySlot {
  renderer: GalleryRenderer | null;
  error: string | null;
}

/** 탭 셸(갤러리 | A/B 비교 | 리포트). 상태는 `labStore`, 런타임 의존성은 `LabContext`로 공유한다. */
export function BrushLabApp(props: BrushLabAppProps) {
  const [store] = useState<LabStore>(() => props.store ?? labStore);
  const [actions] = useState(() => createLabActions(store));
  const [registry] = useState<readonly LaneDescriptor[]>(() => props.registry ?? LANE_REGISTRY);
  const [env] = useState<LaneEnvironment>(() => props.env ?? createBrowserLaneEnvironment());
  const [runner] = useState<BenchRunner>(() => props.runner ?? createBenchRunner());
  const [gallery, setGallery] = useState<GallerySlot>(() =>
    props.gallery !== undefined
      ? { renderer: props.gallery, error: props.galleryError ?? null }
      : { renderer: null, error: props.galleryError ?? "갤러리 Worker 준비 중" },
  );
  const tab = useLabTab(store);

  // Worker는 effect에서 만들어 StrictMode 이중 초기화와 언마운트 누수를 막는다.
  useEffect(() => {
    if (props.gallery !== undefined) return;
    try {
      const client = createGalleryWorkerClient();
      setGallery({ renderer: client, error: null });
      return () => client.dispose();
    } catch (error) {
      setGallery({ renderer: null, error: messageOf(error) });
      return undefined;
    }
  }, [props.gallery]);

  useEffect(() => {
    if (props.autoProbe === false) return;
    probeAllLanes({ registry, env, actions }).catch((error: unknown) => {
      actions.pushError({ laneId: null, code: "probe-failed", message: `레인 probe 실패: ${messageOf(error)}` });
    });
  }, [props.autoProbe, registry, env, actions]);

  const value = useMemo<LabContextValue>(
    () => ({ store, actions, registry, env, runner, gallery: gallery.renderer, galleryError: gallery.error }),
    [store, actions, registry, env, runner, gallery],
  );

  const onTabKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    const idx = TABS.findIndex((t) => t.id === tab);
    let next: number;
    if (e.key === "ArrowRight") next = (idx + 1) % TABS.length;
    else if (e.key === "ArrowLeft") next = (idx - 1 + TABS.length) % TABS.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = TABS.length - 1;
    else return;
    e.preventDefault();
    const target = TABS[next];
    if (!target) return;
    actions.setTab(target.id);
    const el = document.getElementById(`lab-tab-${target.id}`);
    if (el) el.focus();
  };

  return (
    <LabContext.Provider value={value}>
      <main className="lab-shell">
        <header className="lab-brand" aria-label="ToonStudio Brush Lab">
          <p className="lab-eyebrow">실험 앱 · 배포 대상 아님</p>
          <h1>ToonStudio Brush Lab</h1>
          <p className="lab-status">
            Sumi 엔진 {SUMI_ENGINE_VERSION} · 랩 스키마 {LAB_SCHEMA_VERSION} · 브러시 테스트 전용(undo·레이어·문서·저장 없음)
          </p>
        </header>
        <CapabilityBanner />
        <div role="tablist" aria-label="브러시 랩 화면" className="lab-tabs" onKeyDown={onTabKeyDown}>
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              id={`lab-tab-${t.id}`}
              className="lab-tab"
              aria-selected={tab === t.id}
              aria-controls={`lab-panel-${t.id}`}
              tabIndex={tab === t.id ? 0 : -1}
              onClick={() => actions.setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div role="tabpanel" id={`lab-panel-${tab}`} aria-labelledby={`lab-tab-${tab}`} tabIndex={0}>
          {tab === "gallery" ? <GalleryView /> : tab === "compare" ? <CompareView /> : <ReportView />}
        </div>
      </main>
    </LabContext.Provider>
  );
}

/** 저장소의 현재 탭 구독(셸은 아직 컨텍스트 밖이므로 저장소를 직접 넘긴다). */
function useLabTab(store: LabStore): LabTab {
  return useLabState((s) => s.tab, store);
}
