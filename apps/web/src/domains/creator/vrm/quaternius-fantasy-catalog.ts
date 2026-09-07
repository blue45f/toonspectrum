/** Four authored outfit designs, not recolors counted as new characters. */
export const QUATERNIUS_FANTASY_VRMS = [
  { id: "quaternius-female-peasant", name: "Quaternius Peasant (Female)" },
  { id: "quaternius-male-peasant", name: "Quaternius Peasant (Male)" },
  { id: "quaternius-female-ranger", name: "Quaternius Ranger (Female)" },
  { id: "quaternius-male-ranger", name: "Quaternius Ranger (Male)" },
].map((model) => ({
  ...model,
  url: `/vrm/quaternius-fantasy-v1/${model.id}.vrm`,
  thumbnailUrl: `/assets/3d/characters/thumbnails/quaternius-fantasy-v1/${model.id}.png`,
  limitations: ["no-expressions" as const],
}));
