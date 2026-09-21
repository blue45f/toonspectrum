import { useCallback, useState } from "react";
import { createRoot } from "react-dom/client";

import { validateStudioWorldManifest, type StudioVirtualSpaceWorldManifest as World } from "../../src/domains/creator/virtual-space/studio-virtual-space-world-manifest";
import { StudioWorldAuthoringEntry } from "../../src/domains/creator/virtual-space/StudioWorldAuthoringEntry";
import { useStudioWorldRuleGate } from "../../src/domains/creator/virtual-space/StudioWorldRuleGate";

import type { StudioVirtualSpaceActivity } from "../../src/domains/creator/virtual-space/studio-virtual-space-model";
import "../../src/styles/globals.css";

import "../../src/domains/creator/virtual-space/studio-virtual-space.css";
import "../../src/shared/components/workspace/workspace.css";

function initial(): World { return { id: "authoring-fixture", version: 1, width: 650, height: 420,
  backgroundAssetKey: "fixture-background", backgroundUrl: "/assets/virtual-studio/living-world/master-clean-plate.webp",
  rooms: [{ id: "lounge", x: 0, y: 0, width: 650, height: 420, labelKo: "시험 공간", labelEn: "Fixture room" }],
  props: [{ id: "prop-a", kind: "decor", x: 180, y: 170, width: 40, height: 60, assetUrl: "/assets/virtual-studio/reference/player-pink.png", labelKo: "시험 소품 A", labelEn: "Fixture prop A" },
    { id: "prop-b", kind: "decor", x: 420, y: 180, width: 32, height: 52, assetUrl: "/assets/virtual-studio/reference/player-pink.png", assetKey: "prop-a", labelKo: "시험 소품 B", labelEn: "Fixture prop B" },
    { id: "painted", kind: "decor", x: 540, y: 300, labelKo: "배경 기준점", labelEn: "Painted anchor" }],
  spawns: [{ id: "entry", point: { x: 30, y: 30 } }], colliders: [], portals: [], npcs: [],
  interactions: [{ id: "tool", zoneId: "lounge", point: { x: 80, y: 320 }, radius: 40, action: "review", labelKo: "시험 검수 도구", labelEn: "Fixture review tool" }] }; }
function Fixture() {
  const [world, setWorld] = useState(initial), [changes, setChanges] = useState(0), [disabled, setDisabled] = useState(false);
  const [activity, setActivity] = useState<StudioVirtualSpaceActivity>("available"), [actions, setActions] = useState<string[]>([]);
  const activate = useCallback((action: string) => setActions((current) => [...current, action]), []);
  const gate = useStudioWorldRuleGate(world, activity, activate);
  return <main className="mx-auto max-w-6xl space-y-4 p-4 text-fg">
    <h1 className="text-xl font-bold">공간 편집 실동작 검증</h1>
    <p className="text-sm">등록된 원본 이미지와 합성 공간을 사용하는 로컬 시험입니다. 게시·권한·API 쓰기는 실행하지 않습니다.</p>
    <div className="flex flex-wrap gap-2"><button className="min-h-11 rounded-lg border px-3" onClick={() => setDisabled(!disabled)}>편집 권한 전환</button>
      <button className="min-h-11 rounded-lg border px-3" onClick={() => setWorld((current) => ({ ...current, version: current.version + 1 }))}>외부 버전 변경</button>
      <button className="min-h-11 rounded-lg border px-3" onClick={() => { setWorld(initial()); setChanges(0); }}>시험 공간 초기화</button>
      <label className="text-sm">시험 작업 상태 <select aria-label="시험 작업 상태" className="min-h-11 rounded-lg border bg-card px-3" value={activity} onChange={(event) => setActivity(event.target.value as StudioVirtualSpaceActivity)}><option value="available">작업 가능</option><option value="focused">집중</option></select></label>
      <button className="min-h-11 rounded-lg border px-3" onClick={() => { const tool = world.interactions.find((entry) => entry.id === "tool"); if (tool) gate.request(tool); }}>시험 도구 사용</button>
    </div>{gate.element}
    <StudioWorldAuthoringEntry projectId="world-authoring-fixture" manifest={world} basePublishedRevisionId="fixed-test-revision" disabled={disabled}
      onChange={(next) => { setWorld(next); setChanges((value) => value + 1); }} onReset={() => setWorld(initial())} />
    <output data-authoring-changes={changes} data-action-count={actions.length} data-validation-errors={validateStudioWorldManifest(world).length}
      className="block rounded-lg border border-line p-3 text-sm">편집 횟수 {changes} · 도구 실행 {actions.length}</output>
    <script type="application/json" id="world-state">{JSON.stringify(world)}</script>
  </main>;
}
const root = document.getElementById("root"); if (!root) throw new Error("Fixture root missing"); createRoot(root).render(<Fixture />);
