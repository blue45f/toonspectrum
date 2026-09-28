import type { CharacterSlotKind } from "./character-shaper-contract";
import type { VrmLibraryEntry } from "../vrm/vrm-library";

/** 화면의 카테고리만 묶는다. 문서의 15개 슬롯과 적용 명령은 바꾸지 않는다. */
export const CHARACTER_EDIT_CATEGORIES = [
  { id: "face", label: "얼굴", icon: "face-shape", slots: ["face-shape", "eyes", "irises", "nose", "mouth", "ears", "expression"] },
  { id: "hair", label: "헤어", icon: "hair", slots: ["hair"] },
  { id: "outfit", label: "의상", icon: "top", slots: ["top", "bottom", "shoes"] },
  { id: "body", label: "체형", icon: "body", slots: ["body"] },
  { id: "pose", label: "포즈", icon: "pose", slots: ["pose", "hand-pose"] },
  { id: "props", label: "소품", icon: "accessory", slots: ["accessory"] },
] as const satisfies readonly {
  readonly id: string;
  readonly label: string;
  readonly icon: CharacterSlotKind;
  readonly slots: readonly CharacterSlotKind[];
}[];

export function characterEditCategory(slot: CharacterSlotKind) {
  return CHARACTER_EDIT_CATEGORIES.find((category) => (category.slots as readonly CharacterSlotKind[]).includes(slot))
    ?? CHARACTER_EDIT_CATEGORIES[0];
}

export type CharacterLibraryCollection = "all" | "mine";
const PORTRAIT_ORDER = ["sample-vrm", "avatar-a", "avatar-b", "avatar-c", "shion", "shino", "vita"];

export function discoverCharacterLibrary(
  entries: readonly VrmLibraryEntry[],
  query: string,
  collection: CharacterLibraryCollection,
): readonly VrmLibraryEntry[] {
  const needle = query.normalize("NFKC").trim().toLowerCase();
  return entries.filter((entry) =>
    (collection === "all" || entry.source !== "sample")
    && (!needle || entry.name.normalize("NFKC").toLowerCase().includes(needle)),
  ).toSorted((a, b) => {
    // 실제 등록된 항목만 정렬한다. 권리·품질 검증을 건너뛰고 원본 카탈로그를 보충하지 않는다.
    if (a.source !== b.source) return a.source === "sample" ? 1 : b.source === "sample" ? -1 : b.updatedAt - a.updatedAt;
    if (a.source !== "sample") return b.updatedAt - a.updatedAt;
    const rank = (id: string) => { const index = PORTRAIT_ORDER.indexOf(id); return index < 0 ? PORTRAIT_ORDER.length : index; };
    return rank(a.id) - rank(b.id);
  });
}
