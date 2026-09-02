import {
  Grab,
  Camera,
  EyeOff,
  Sun,
  Scissors,
  Sparkles,
  Layers,
  Wind,
  Type,
  Palette,
} from "lucide-react";
import { useState } from "react";

import { StudioBg3dClonerPanel } from "./StudioBg3dClonerPanel";
import { StudioBg3dMatCapStudioPanel } from "./StudioBg3dMatCapStudioPanel";
import { StudioBg3dParticleVfxPanel } from "./StudioBg3dParticleVfxPanel";
import { StudioBg3dTextExtruderPanel } from "./StudioBg3dTextExtruderPanel";

import type { CameraLensPreset, PerspectiveGuideMode } from "../scene-3d/studio-3d-camera-perspective-lens";
import type { HairCrossSectionProfile } from "../scene-3d/studio-3d-procedural-hair-strand";
import type { HandGripArchetype, CharacterSocketSlot } from "../scene-3d/studio-3d-prop-hand-grip-solver";
import type { TimeOfDayPreset } from "../scene-3d/studio-3d-scene-auto-culling";

export type ProSuiteActiveTab =
  | "grip"
  | "lens"
  | "culling"
  | "hair"
  | "cloner"
  | "particle"
  | "text3d"
  | "matcap";

export interface StudioBg3dProSuitePanelProps {
  readonly disabled?: boolean;
}

export function StudioBg3dProSuitePanel({ disabled = false }: StudioBg3dProSuitePanelProps) {
  const [activeTab, setActiveTab] = useState<ProSuiteActiveTab>("grip");

  // Tab 1: Prop Grip State
  const [selectedGrip, setSelectedGrip] = useState<HandGripArchetype>("sword-power-grip");
  const [selectedSocket, setSelectedSocket] = useState<CharacterSocketSlot>("hand-right");
  const [tightness, setTightness] = useState(1.0);

  // Tab 2: Lens & Foreshortening State
  const [selectedLens, setSelectedLens] = useState<CameraLensPreset>("24mm-dramatic-low-angle");
  const [foreshortening, setForeshortening] = useState(1.8);
  const [guideMode, setGuideMode] = useState<PerspectiveGuideMode>("2-point");

  // Tab 3: Culling & Atmosphere State
  const [selectedTimeOfDay, setSelectedTimeOfDay] = useState<TimeOfDayPreset>("golden-hour-sunset");
  const [autoCullObstructions, setAutoCullObstructions] = useState(true);

  // Tab 4: Hair Strand State
  const [hairProfile, setHairProfile] = useState<HairCrossSectionProfile>("triangular-anime-spike");
  const [strandTaper, setStrandTaper] = useState(1.3);

  const navButtons: Array<{ id: ProSuiteActiveTab; label: string; icon: typeof Grab }> = [
    { id: "grip", label: "소품 그립", icon: Grab },
    { id: "lens", label: "만화 렌즈", icon: Camera },
    { id: "cloner", label: "3D 클로너", icon: Layers },
    { id: "particle", label: "3D 파티클", icon: Wind },
    { id: "text3d", label: "3D 효과음", icon: Type },
    { id: "matcap", label: "맷캡 재질", icon: Palette },
    { id: "culling", label: "배경 컬링", icon: Sun },
    { id: "hair", label: "헤어 가닥", icon: Scissors },
  ];

  return (
    <div className="flex flex-col gap-3 p-3 text-xs text-fg">
      {/* 8 Navigation Tabs Grid */}
      <div className="grid grid-cols-4 gap-1 rounded-lg border border-line bg-card p-1">
        {navButtons.map((btn) => {
          const Icon = btn.icon;
          const isSelected = activeTab === btn.id;
          return (
            <button
              key={btn.id}
              type="button"
              disabled={disabled}
              onClick={() => setActiveTab(btn.id)}
              className={`flex items-center justify-center gap-1 rounded-md py-1.5 text-[0.65rem] font-bold transition-all ${
                isSelected
                  ? "border border-line bg-raised text-fg shadow-sm"
                  : "text-fg-3 hover:text-fg"
              }`}
            >
              <Icon className="size-3.5 text-accent" />
              <span>{btn.label}</span>
            </button>
          );
        })}
      </div>

      {/* Tab 1: Prop Snapping & Hand Grip */}
      {activeTab === "grip" && (
        <div className="flex flex-col gap-2.5">
          <div>
            <span className="mb-1.5 block text-[0.7rem] font-semibold text-fg-2">
              6종 만화 손 그립 아키타입
            </span>
            <div className="grid grid-cols-2 gap-1.5">
              {[
                { id: "sword-power-grip", label: "검/칼 파워 그립" },
                { id: "gun-pistol-trigger", label: "권총 방아쇠 그립" },
                { id: "phone-pinch-hold", label: "스마트폰 핀치 홀드" },
                { id: "cup-wrap-grasp", label: "머그컵/음료 감싸기" },
                { id: "pen-precision-tripod", label: "펜/도구 정밀 삼점 그립" },
                { id: "relaxed-open-hold", label: "자연스러운 기본 손" },
              ].map((grip) => (
                <button
                  key={grip.id}
                  type="button"
                  disabled={disabled}
                  onClick={() => setSelectedGrip(grip.id as HandGripArchetype)}
                  className={`rounded-lg border p-1.5 text-left text-[0.68rem] font-semibold transition-all ${
                    selectedGrip === grip.id
                      ? "border-accent bg-accent/15 text-accent"
                      : "border-line bg-card text-fg hover:bg-raised"
                  }`}
                >
                  {grip.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1.5 rounded-xl border border-line bg-card/60 p-2.5">
            <div className="flex items-center justify-between text-[0.68rem]">
              <span className="font-semibold text-fg-2">소켓 바인딩 위치</span>
              <span className="font-bold text-accent">{selectedSocket}</span>
            </div>
            <div className="grid grid-cols-3 gap-1">
              {[
                { id: "hand-right", label: "오른손" },
                { id: "hand-left", label: "왼손" },
                { id: "back-sheath", label: "등 칼집" },
                { id: "waist-holster", label: "허리 홀스터" },
                { id: "head-accessory", label: "머리 모자" },
                { id: "glasses-bridge", label: "안경 안면" },
              ].map((socket) => (
                <button
                  key={socket.id}
                  type="button"
                  disabled={disabled}
                  onClick={() => setSelectedSocket(socket.id as CharacterSocketSlot)}
                  className={`rounded border p-1 text-center text-[0.62rem] font-semibold ${
                    selectedSocket === socket.id
                      ? "border-accent bg-accent/20 text-accent"
                      : "border-line bg-card text-fg hover:bg-raised"
                  }`}
                >
                  {socket.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1 rounded-xl border border-line bg-card/60 p-2.5">
            <div className="flex items-center justify-between text-[0.68rem]">
              <span className="font-semibold text-fg-2">손가락 쥐는 악력 (Tightness)</span>
              <span className="font-bold text-accent">{tightness.toFixed(2)}x</span>
            </div>
            <input
              type="range"
              min="0.5"
              max="1.5"
              step="0.05"
              disabled={disabled}
              value={tightness}
              onChange={(e) => setTightness(parseFloat(e.target.value))}
              className="w-full accent-accent"
            />
          </div>
        </div>
      )}

      {/* Tab 2: Dynamic Lens & Foreshortening */}
      {activeTab === "lens" && (
        <div className="flex flex-col gap-2.5">
          <div>
            <span className="mb-1.5 block text-[0.7rem] font-semibold text-fg-2">
              초점거리 렌즈 화각 프리셋
            </span>
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
              {[
                { id: "12mm-ultra-wide-fisheye", label: "12mm 어안 (격투 펀치)" },
                { id: "24mm-dramatic-low-angle", label: "24mm 드라마틱 로우" },
                { id: "50mm-natural-dialogue", label: "50mm 자연스러운 대화" },
                { id: "85mm-portrait-bokeh", label: "85mm 로맨스 인물샷" },
                { id: "200mm-telephoto-compression", label: "200mm 망원 압축" },
              ].map((lens) => (
                <button
                  key={lens.id}
                  type="button"
                  disabled={disabled}
                  onClick={() => setSelectedLens(lens.id as CameraLensPreset)}
                  className={`rounded-lg border p-1.5 text-center text-[0.68rem] font-semibold transition-all ${
                    selectedLens === lens.id
                      ? "border-accent bg-accent/15 text-accent"
                      : "border-line bg-card text-fg hover:bg-raised"
                  }`}
                >
                  {lens.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1 rounded-xl border border-line bg-card/60 p-2.5">
            <div className="flex items-center justify-between text-[0.68rem]">
              <span className="font-semibold text-fg-2">만화 다이내믹 원근 왜곡 배율</span>
              <span className="font-bold text-accent">{foreshortening.toFixed(1)}x</span>
            </div>
            <input
              type="range"
              min="1.0"
              max="3.5"
              step="0.1"
              disabled={disabled}
              value={foreshortening}
              onChange={(e) => setForeshortening(parseFloat(e.target.value))}
              className="w-full accent-accent"
            />
          </div>

          <div className="flex items-center justify-between rounded-xl border border-line bg-card/60 p-2.5 text-[0.68rem]">
            <span className="font-semibold text-fg-2">투시 소점 가이드 라인</span>
            <div className="flex gap-1">
              {(["off", "1-point", "2-point", "3-point"] as PerspectiveGuideMode[]).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  disabled={disabled}
                  onClick={() => setGuideMode(mode)}
                  className={`rounded px-2 py-0.5 font-bold ${
                    guideMode === mode
                      ? "bg-accent text-bg"
                      : "border border-line bg-card text-fg hover:bg-raised"
                  }`}
                >
                  {mode}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: Cloner Panel */}
      {activeTab === "cloner" && <StudioBg3dClonerPanel disabled={disabled} />}

      {/* Tab 4: Particle VFX Panel */}
      {activeTab === "particle" && <StudioBg3dParticleVfxPanel disabled={disabled} />}

      {/* Tab 5: 3D Text Extruder Panel */}
      {activeTab === "text3d" && <StudioBg3dTextExtruderPanel disabled={disabled} />}

      {/* Tab 6: MatCap Studio Panel */}
      {activeTab === "matcap" && <StudioBg3dMatCapStudioPanel disabled={disabled} />}

      {/* Tab 7: Architecture Auto-Culling & Day/Night */}
      {activeTab === "culling" && (
        <div className="flex flex-col gap-2.5">
          <div className="flex items-center justify-between rounded-xl border border-line bg-card/60 p-2.5 text-[0.68rem]">
            <div className="flex flex-col">
              <span className="font-bold text-fg">시야 방해 벽체/천장 자동 숨김</span>
              <span className="text-[0.62rem] text-fg-3">
                카메라와 캐릭터 사이를 가로막는 앞벽/천장 자동 투명화
              </span>
            </div>
            <button
              type="button"
              disabled={disabled}
              onClick={() => setAutoCullObstructions(!autoCullObstructions)}
              className={`flex items-center gap-1 rounded-md border px-2.5 py-1 font-bold transition-all ${
                autoCullObstructions
                  ? "border-accent bg-accent text-bg"
                  : "border-line bg-card text-fg hover:bg-raised"
              }`}
            >
              <EyeOff className="h-3 w-3" />
              <span>{autoCullObstructions ? "컬링 ON" : "컬링 OFF"}</span>
            </button>
          </div>

          <div>
            <span className="mb-1.5 block text-[0.7rem] font-semibold text-fg-2">
              시간대별 조명 & 분위기 프리셋
            </span>
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
              {[
                { id: "noon-clear-sky", label: "정오 쾌청 햇살" },
                { id: "golden-hour-sunset", label: "골든아워 노을" },
                { id: "blue-hour-dusk", label: "블루아워 황혼" },
                { id: "cyberpunk-neon-night", label: "사이버펑크 네온야경" },
                { id: "eerie-fog-mist", label: "새벽 안개/미스트" },
              ].map((time) => (
                <button
                  key={time.id}
                  type="button"
                  disabled={disabled}
                  onClick={() => setSelectedTimeOfDay(time.id as TimeOfDayPreset)}
                  className={`rounded-lg border p-1.5 text-center text-[0.68rem] font-semibold transition-all ${
                    selectedTimeOfDay === time.id
                      ? "border-accent bg-accent/15 text-accent"
                      : "border-line bg-card text-fg hover:bg-raised"
                  }`}
                >
                  {time.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Tab 8: Hair Strand Maker */}
      {activeTab === "hair" && (
        <div className="flex flex-col gap-2.5">
          <div>
            <span className="mb-1.5 block text-[0.7rem] font-semibold text-fg-2">
              머리카락 가닥 단면 프로파일
            </span>
            <div className="grid grid-cols-2 gap-1.5">
              {[
                { id: "triangular-anime-spike", label: "아니메 삼각 스파이크" },
                { id: "flat-ribbon", label: "납작 리본 가닥" },
                { id: "round-smooth-curl", label: "부드러운 원형 컬" },
                { id: "creased-manga-chunk", label: "음영 각진 만화 덩어리" },
              ].map((prof) => (
                <button
                  key={prof.id}
                  type="button"
                  disabled={disabled}
                  onClick={() => setHairProfile(prof.id as HairCrossSectionProfile)}
                  className={`rounded-lg border p-1.5 text-left text-[0.68rem] font-semibold transition-all ${
                    hairProfile === prof.id
                      ? "border-accent bg-accent/15 text-accent"
                      : "border-line bg-card text-fg hover:bg-raised"
                  }`}
                >
                  {prof.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1 rounded-xl border border-line bg-card/60 p-2.5">
            <div className="flex items-center justify-between text-[0.68rem]">
              <span className="font-semibold text-fg-2">끝단 뾰족함 (Taper Sharpness)</span>
              <span className="font-bold text-accent">{strandTaper.toFixed(2)}</span>
            </div>
            <input
              type="range"
              min="0.8"
              max="2.5"
              step="0.1"
              disabled={disabled}
              value={strandTaper}
              onChange={(e) => setStrandTaper(parseFloat(e.target.value))}
              className="w-full accent-accent"
            />
          </div>

          <button
            type="button"
            disabled={disabled}
            className="flex items-center justify-center gap-1.5 rounded-lg bg-accent py-2 text-[0.7rem] font-bold text-bg shadow-sm transition-all hover:opacity-90"
          >
            <Sparkles className="h-3.5 w-3.5" />
            <span>새 가닥 생성 & 3D 메쉬 빌드</span>
          </button>
        </div>
      )}
    </div>
  );
}
