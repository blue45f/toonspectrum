import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { studioCharacterSkinByKey } from "./studio-virtual-space-character-skins";
import { studioNpcInteraction, studioNpcLabel } from "./studio-virtual-space-npc-director";
import { studioWorldCanOccupy } from "./studio-virtual-space-world-pathfinding";
import type { StudioVirtualSpaceWorldManifest, StudioWorldInteractionDefinition } from "./studio-virtual-space-world-manifest";

export interface StudioVirtualSpaceNpcPanelProps {
  readonly manifest: StudioVirtualSpaceWorldManifest;
  readonly onInteract: (interaction: StudioWorldInteractionDefinition) => void;
}

/** Keyboard and touch access to the same explicit tool choices as the canvas NPCs. */
export function StudioVirtualSpaceNpcPanel({ manifest, onInteract }: StudioVirtualSpaceNpcPanelProps) {
  const bt = useBilingual("StudioVirtualSpaceNpcPanel");
  const assistants = manifest.npcs.slice(0, 8)
    .filter((npc) => studioWorldCanOccupy(manifest, npc.point))
    .flatMap((npc) => {
      const interaction = studioNpcInteraction(manifest, npc);
      if (!interaction) return [];
      return [{ npc, interaction, skin: studioCharacterSkinByKey(npc.skinKey), role: studioNpcLabel(npc) }];
    });
  if (!assistants.length) return null;

  return (
    <section className="vs2-panel studio-vspace-npc-panel" data-space-interactive="true" aria-label={bt("스튜디오 도우미 NPC", "Studio NPC helpers")}>
      <h2>{bt("스튜디오 도우미", "Studio helpers")}</h2>
      <p>{bt("NPC를 선택하면 연결된 작업 도구를 열어요.", "Choose an NPC to open their workspace tool.")}</p>
      <ul className="studio-vspace-npc-list">
        {assistants.map(({ npc, interaction, skin, role }) => (
          <li key={npc.id}>
            <button
              type="button"
              className="studio-vspace-npc-button"
              aria-label={`${bt(skin.labelKo, skin.labelEn)} · ${bt(role.ko, role.en)} · ${bt("열기", "Open")} ${bt(interaction.labelKo, interaction.labelEn)}`}
              onClick={() => onInteract(interaction)}
            >
              <span className="studio-vspace-npc-identity">
                <strong>{bt(skin.labelKo, skin.labelEn)}</strong>
                <span>{bt(role.ko, role.en)}</span>
              </span>
              <span className="studio-vspace-npc-action">{bt(interaction.labelKo, interaction.labelEn)} {bt("열기", "Open")}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
