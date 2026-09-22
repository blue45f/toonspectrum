import { createContext, useContext } from "react";

export interface CampusPaletteReceipt {
  readonly paletteId: string;
  readonly colorCount: number;
  readonly authority: "studio-sqlite";
}

export type CampusPaletteSave = (colors: readonly string[]) => Promise<CampusPaletteReceipt>;

export const CampusPaletteContext = createContext<CampusPaletteSave | null>(null);

export function useCampusPaletteSave(): CampusPaletteSave | null {
  return useContext(CampusPaletteContext);
}
