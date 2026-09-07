/** Independently authored outfit meshes from the official free Humanoid Rig exports. */
const MEN = ["Adventurer", "Beach", "Casual", "Casual2", "Farmer", "King", "Punk", "Spacesuit", "Suit", "Swat", "Worker"];
const WOMEN = ["Adventurer", "Casual", "Formal", "Medieval", "Punk", "SciFi", "Soldier", "Suit", "Witch", "Worker"];

export const QUATERNIUS_MODULAR_VRMS = ([
  ...MEN.map((sourceName) => ({ sourceName, gender: "male" as const })),
  ...WOMEN.map((sourceName) => ({ sourceName, gender: "female" as const })),
]).map(({ sourceName, gender }) => {
  const id = `quaternius-modular-${gender}-${sourceName.toLowerCase()}`;
  return {
    id,
    name: `Quaternius ${sourceName} (${gender === "male" ? "Male" : "Female"})`,
    url: `/vrm/quaternius-modular-v1/${id}.vrm`,
    thumbnailUrl: `/assets/3d/characters/thumbnails/quaternius-modular-v1/${id}.png`,
    limitations: gender === "male"
      ? ["no-expressions" as const, "limited-hand-rig" as const]
      : ["no-expressions" as const],
  };
});
