import type { CampusPaletteReceipt } from "@/shared/components/spatial-campus/campus-palette-context";

const HEX = /^#[0-9a-f]{6}$/iu;

interface CampusPalette {
  readonly id: string;
  readonly colors: string[];
  readonly name: string;
  readonly createdAt: number;
  readonly updatedAt: number;
}

interface CampusPalettePort {
  readonly create: (name: string, colors: string[]) => CampusPalette;
  readonly commit: (input: {
    readonly upsert: readonly CampusPalette[];
    readonly expected: { readonly items: readonly { readonly id: string; readonly value: null }[] };
    readonly assertCurrent: () => void;
  }) => Promise<unknown>;
}

async function loadCampusPalettePort(): Promise<CampusPalettePort> {
  const [{ createPalette }, { getProductStudioPaletteSqliteRepository }] = await Promise.all([
    import("@/domains/creator/studio-palette-library"),
    import("@/domains/creator/studio-palette-sqlite-repository"),
  ]);
  const repository = getProductStudioPaletteSqliteRepository();
  return { create: createPalette, commit: (input) => repository.commitBatch(input) };
}

export async function saveCampusPaletteToStudio(
  colors: readonly string[],
  assertCurrent: () => void,
  load: () => Promise<CampusPalettePort> = loadCampusPalettePort,
): Promise<CampusPaletteReceipt> {
  if (!Array.isArray(colors) || colors.length === 0 || colors.length > 16 || colors.some((color) => typeof color !== "string" || !HEX.test(color))) {
    throw new Error("Studio에 보낼 팔레트 색상 형식이 올바르지 않습니다.");
  }
  assertCurrent();
  const port = await load();
  assertCurrent();
  const palette = port.create("별빛 관측소에서 고른 색", [...colors]);
  await port.commit({
    upsert: [palette],
    expected: { items: [{ id: palette.id, value: null }] },
    assertCurrent,
  });
  assertCurrent();
  return {
    paletteId: palette.id,
    colorCount: palette.colors.length,
    authority: "studio-sqlite",
  };
}
