/**
 * Studio Custom Filter Preset Manager
 *
 * 웹툰 작가를 위한 커스텀 필터 프리셋 저장, 내보내기, 불러오기 및
 * 카테고리별 프리셋 팩(로맨스, 판타지, 다크, 액션, 스케치 등) 관리 시스템입니다.
 */

import type { StudioFilterDraft } from "./studio-filter-menu";

export interface StudioCustomFilterPreset {
  id: string;
  name: string;
  category: "romance" | "fantasy" | "action" | "dark" | "sketch" | "custom";
  description?: string;
  author?: string;
  createdAt: string;
  draft: StudioFilterDraft;
  favorite?: boolean;
}

export class StudioFilterPresetManager {
  private presets = new Map<string, StudioCustomFilterPreset>();

  constructor() {
    this.registerDefaultBuiltinPresets();
  }

  public registerPreset(preset: StudioCustomFilterPreset): void {
    this.presets.set(preset.id, preset);
  }

  public getPreset(id: string): StudioCustomFilterPreset | undefined {
    return this.presets.get(id);
  }

  public removePreset(id: string): boolean {
    return this.presets.delete(id);
  }

  public getAllPresets(): StudioCustomFilterPreset[] {
    return [...this.presets.values()];
  }

  public getPresetsByCategory(category: StudioCustomFilterPreset["category"]): StudioCustomFilterPreset[] {
    return [...this.presets.values()].filter((p) => p.category === category);
  }

  public toggleFavorite(id: string): boolean {
    const preset = this.presets.get(id);
    if (!preset) return false;
    preset.favorite = !preset.favorite;
    return true;
  }

  public getFavorites(): StudioCustomFilterPreset[] {
    return [...this.presets.values()].filter((p) => p.favorite);
  }

  /**
   * 커스텀 프리셋 패키지(JSON)로 내보냅니다.
   */
  public exportPresetsToJSON(presetIds?: string[]): string {
    const targets = presetIds
      ? presetIds.map((id) => this.presets.get(id)).filter(Boolean)
      : [...this.presets.values()];
    return JSON.stringify(targets, null, 2);
  }

  /**
   * 외부 커스텀 프리셋 패키지(JSON)를 불러옵니다.
   */
  public importPresetsFromJSON(json: string): { importedCount: number; errors: string[] } {
    const errors: string[] = [];
    let importedCount = 0;

    try {
      const parsed = JSON.parse(json) as StudioCustomFilterPreset[];
      if (!Array.isArray(parsed)) {
        errors.push("유효하지 않은 프리셋 데이터 포맷입니다 (배열 필요).");
        return { importedCount, errors };
      }

      for (const p of parsed) {
        if (!p.id || !p.name || !p.draft) {
          errors.push(`프리셋 필수 항목 누락: ${p.name ?? p.id ?? "알 수 없음"}`);
          continue;
        }
        this.presets.set(p.id, p);
        importedCount++;
      }
    } catch (e) {
      errors.push(`JSON 파싱 오류: ${e instanceof Error ? e.message : String(e)}`);
    }

    return { importedCount, errors };
  }

  private registerDefaultBuiltinPresets(): void {
    const defaultPresets: StudioCustomFilterPreset[] = [
      {
        id: "preset-romance-pink",
        name: "로맨스 판타지 핑크 톤",
        category: "romance",
        description: "화사하고 따뜻한 분홍빛 툰 보정",
        createdAt: "2026-08-01",
        draft: {
          kind: "photo-filter",
          values: { brightness: 10, contrast: 5, saturation: 15, tintColor: "#ffc0cb", tintAmount: 20 },
        },
      },
      {
        id: "preset-dark-apocalypse",
        name: "다크 아포칼립스 선화",
        category: "dark",
        description: "음영 강조 및 거친 잉크 텍스처",
        createdAt: "2026-08-01",
        draft: {
          kind: "photo-filter",
          values: { brightness: -15, contrast: 30, saturation: -20, tintColor: "#1a1a2e", tintAmount: 35 },
        },
      },
      {
        id: "preset-action-neon",
        name: "사이버펑크 네온 툰",
        category: "action",
        description: "강렬한 채도와 네온 블루/시안 강조",
        createdAt: "2026-08-01",
        draft: {
          kind: "photo-filter",
          values: { brightness: 5, contrast: 25, saturation: 40, tintColor: "#00f0ff", tintAmount: 25 },
        },
      },
      {
        id: "preset-sketch-pencil",
        name: "연필 스케치 터치",
        category: "sketch",
        description: "흑백 연필 선화 느낌의 질감 감성",
        createdAt: "2026-08-01",
        draft: {
          kind: "photo-filter",
          values: { brightness: 0, contrast: 40, saturation: -100, tintColor: "#000000", tintAmount: 0 },
        },
      },
    ];

    for (const p of defaultPresets) {
      this.presets.set(p.id, p);
    }
  }
}
