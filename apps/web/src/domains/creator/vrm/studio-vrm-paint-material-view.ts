import type * as THREE from "three";

import { STUDIO_VRM_TEXTURE_PAINT_CHANNELS, type StudioVrmTexturePaintChannel } from "./studio-vrm-texture-paint-channel";
import { studioVrmMaterialSupportsPaintChannel } from "./studio-vrm-texture-paint-material";

export interface StudioVrmPaintMaterialViewSnapshot {
  readonly id: string;
  readonly label: string;
  readonly visible: boolean;
  readonly supportedChannels: readonly StudioVrmTexturePaintChannel[];
}

interface Entry {
  readonly material: THREE.Material;
  readonly id: string;
  readonly originalVisible: boolean;
  visible: boolean;
  appliedVisible: boolean;
}

/** View-only isolation never edits geometry, texture bytes, or the source asset archive. */
export class StudioVrmPaintMaterialView {
  private readonly entries: readonly Entry[];
  selectedId: string | null = null;
  soloId: string | null = null;

  constructor(materials: Iterable<readonly [THREE.Material, { readonly materialLocator: string }]>) {
    this.entries = [...materials].map(([material, descriptor]) => ({
      material, id: descriptor.materialLocator,
      originalVisible: material.visible, visible: material.visible, appliedVisible: material.visible,
    }));
  }

  selectedMaterial(): THREE.Material | null {
    return this.entries.find((entry) => entry.id === this.selectedId)?.material ?? null;
  }

  select(id: string | null): boolean {
    if (id !== null && !this.entries.some((entry) => entry.id === id)) return false;
    this.selectedId = id;
    if (this.soloId !== null) this.soloId = id;
    this.applyVisibility();
    return true;
  }

  setSolo(solo: boolean): boolean {
    if (solo && this.selectedId === null) return false;
    this.soloId = solo ? this.selectedId : null;
    this.applyVisibility();
    return true;
  }

  setVisible(id: string, visible: boolean): boolean {
    const entry = this.entries.find((candidate) => candidate.id === id);
    if (!entry) return false;
    entry.visible = visible;
    this.applyVisibility();
    return true;
  }

  accepts(material: THREE.Material): boolean {
    return material.visible && (this.selectedId === null || material === this.selectedMaterial());
  }

  reveal(materials: Iterable<THREE.Material>): void {
    const candidates = new Set(materials);
    if (this.selectedId === null || candidates.has(this.selectedMaterial()!)) return;
    const entry = this.entries.find((candidate) => candidates.has(candidate.material));
    if (entry) this.select(entry.id);
  }

  snapshot(): readonly StudioVrmPaintMaterialViewSnapshot[] {
    return Object.freeze(this.entries.map((entry, index) => Object.freeze({
      id: entry.id,
      label: entry.material.name || `재질 ${index + 1}`,
      visible: entry.visible,
      supportedChannels: Object.freeze(STUDIO_VRM_TEXTURE_PAINT_CHANNELS.filter((channel) =>
        studioVrmMaterialSupportsPaintChannel(entry.material, channel))),
    })));
  }

  dispose(): void {
    for (const entry of this.entries) {
      // A later owner may have deliberately changed visibility. Restore only our last value.
      if (entry.material.visible === entry.appliedVisible) entry.material.visible = entry.originalVisible;
    }
  }

  private applyVisibility(): void {
    for (const entry of this.entries) {
      const visible = entry.visible && (this.soloId === null || entry.id === this.soloId);
      entry.material.visible = visible;
      entry.appliedVisible = visible;
    }
  }
}
