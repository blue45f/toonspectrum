import { DoorOpen, LockKeyhole, Network, Search } from "lucide-react";
import { useMemo, useState } from "react";

import Link from "@/shared/navigation/router-link";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import type { StudioVirtualSpaceZoneId } from "./studio-virtual-space-model";
import {
  STUDIO_SPACE_MODULES,
  type StudioSpaceModule,
  type StudioSpaceModuleCategory,
  type StudioSpaceModulePanel,
} from "./studio-virtual-space-room-catalog";

const CATEGORIES: readonly ["all" | StudioSpaceModuleCategory, string, string][] = [
  ["all", "전체", "All"],
  ["collaboration", "협업", "Collaboration"],
  ["production", "제작", "Production"],
  ["interview", "면접", "Interview"],
  ["rest", "휴식", "Rest"],
  ["fortune", "운세", "Fortune"],
  ["play", "놀이", "Play"],
];

const privacyCopy = {
  team: ["팀", "Team"],
  "invite-only": ["초대 전용", "Invite only"],
  private: ["개인", "Private"],
  public: ["공개", "Public"],
} as const;
export function StudioVirtualSpaceRoomCatalog({
  projectAvailable,
  onPanel,
  onZone,
}: {
  readonly projectAvailable: boolean;
  readonly onPanel: (panel: StudioSpaceModulePanel) => void;
  readonly onZone: (zoneId: StudioVirtualSpaceZoneId) => void;
}) {
  const bt = useBilingual("StudioVirtualSpaceRoomCatalog");
  const [category, setCategory] = useState<"all" | StudioSpaceModuleCategory>("all");
  const [query, setQuery] = useState("");
  const normalized = query.trim().normalize("NFKC").toLocaleLowerCase();
  const modules = useMemo(() => STUDIO_SPACE_MODULES.filter((module) => {
    if (category !== "all" && module.category !== category) return false;
    if (!normalized) return true;
    return `${module.labelKo} ${module.labelEn} ${module.descriptionKo} ${module.descriptionEn}`
      .normalize("NFKC").toLocaleLowerCase().includes(normalized);
  }), [category, normalized]);

  return <section className="studio-space-module-catalog" aria-labelledby="studio-space-module-title">
    <header>
      <div>
        <h2 id="studio-space-module-title">{bt("공간 모듈", "Space modules")}</h2>
        <p>{bt(
          "협업·면접·휴식·놀이 공간을 같은 확장 계약으로 열어요.",
          "Open collaboration, interview, rest and play spaces through one extensible contract.",
        )}</p>
      </div>
      <DoorOpen size={20} aria-hidden />
    </header>
    <label className="studio-space-module-search">
      <Search size={15} aria-hidden />
      <span className="sr-only">{bt("공간 검색", "Search spaces")}</span>
      <input
        type="search"
        maxLength={80}
        value={query}
        placeholder={bt("회의실·타로·오락실 검색", "Search meetings, tarot or arcade")}
        onChange={(event) => setQuery(event.target.value)}
      />
    </label>
    <div className="studio-space-module-filters" role="group"
      aria-label={bt("공간 종류", "Space category")}>
      {CATEGORIES.map(([value, ko, en]) => <button
        key={value}
        type="button"
        aria-pressed={category === value}
        onClick={() => setCategory(value)}
      >{bt(ko, en)}</button>)}
    </div>
    <div className="studio-space-module-grid">
      {modules.map((module) => <ModuleCard
        key={module.id}
        module={module}
        disabled={module.requiresProject && !projectAvailable}
        onPanel={onPanel}
        onZone={onZone}
      />)}
    </div>
    {!modules.length ? <p role="status" className="studio-space-module-empty">
      {bt("일치하는 공간이 없어요.", "No matching space found.")}
    </p> : null}
  </section>;
}
function ModuleCard({
  module,
  disabled,
  onPanel,
  onZone,
}: {
  readonly module: StudioSpaceModule;
  readonly disabled: boolean;
  readonly onPanel: (panel: StudioSpaceModulePanel) => void;
  readonly onZone: (zoneId: StudioVirtualSpaceZoneId) => void;
}) {
  const bt = useBilingual(`StudioSpaceModule.${module.id}`);
  const [privacyKo, privacyEn] = privacyCopy[module.privacy];
  const content = <>
    <div className="studio-space-module-meta">
      <span><LockKeyhole size={12} aria-hidden />{bt(privacyKo, privacyEn)}</span>
      {module.transport === "p2p-direct" ? <span>
        <Network size={12} aria-hidden />P2P
      </span> : null}
      {module.capacity ? <span>{bt(`${module.capacity}명`, `${module.capacity} people`)}</span> : null}
    </div>
    <strong>{bt(module.labelKo, module.labelEn)}</strong>
    <p>{bt(module.descriptionKo, module.descriptionEn)}</p>
    {disabled ? <small>{bt("프로젝트 공간에서 사용할 수 있어요.", "Available inside a project space.")}</small> : null}
  </>;

  if (module.entry.type === "route") {
    return <Link href={module.entry.href} className="studio-space-module-card">
      {content}
    </Link>;
  }
  const entry = module.entry;
  const activate = entry.type === "panel"
    ? () => onPanel(entry.panel)
    : () => onZone(entry.zoneId);
  return <button
    type="button"
    className="studio-space-module-card"
    disabled={disabled}
    onClick={activate}
  >{content}</button>;
}
