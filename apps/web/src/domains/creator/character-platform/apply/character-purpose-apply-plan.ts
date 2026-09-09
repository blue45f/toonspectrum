import type { CharacterSemanticPassId } from "../../character-shaper/character-shaper-contract";

export type CharacterApplyPurpose =
  | "manuscript"
  | "line-and-color"
  | "ai-control"
  | "review"
  | "file-export";

export type CharacterApplyExtendedPassId =
  | CharacterSemanticPassId
  | "part-id"
  | "material-id"
  | "depth"
  | "normal";

export interface CharacterPurposeApplyPass {
  readonly pass: CharacterApplyExtendedPassId;
  readonly required: boolean;
  readonly status: "planned" | "skipped";
  readonly reason: string | null;
}

export interface CharacterPurposeApplyPlan {
  readonly purpose: CharacterApplyPurpose;
  readonly atomic: boolean;
  readonly replaceMode: "new-group" | "replace-linked-group";
  readonly passes: readonly CharacterPurposeApplyPass[];
  readonly ready: boolean;
  readonly blockers: readonly string[];
}

const PURPOSE_PASSES: Readonly<Record<CharacterApplyPurpose, readonly {
  pass: CharacterApplyExtendedPassId;
  required: boolean;
}[]>> = {
  manuscript: [
    { pass: "beauty", required: true },
    { pass: "line", required: false },
    { pass: "shadow", required: false },
    { pass: "mask-face", required: false },
  ],
  "line-and-color": [
    { pass: "flat", required: true },
    { pass: "line", required: true },
    { pass: "shadow", required: false },
    { pass: "highlight", required: false },
    { pass: "mask-face", required: false },
    { pass: "mask-hair", required: false },
    { pass: "mask-top", required: false },
    { pass: "mask-bottom", required: false },
  ],
  "ai-control": [
    { pass: "depth", required: true },
    { pass: "normal", required: false },
    { pass: "part-id", required: false },
    { pass: "line", required: false },
  ],
  review: [
    { pass: "beauty", required: true },
    { pass: "part-id", required: false },
  ],
  "file-export": [
    { pass: "beauty", required: true },
    { pass: "flat", required: false },
    { pass: "line", required: false },
    { pass: "shadow", required: false },
    { pass: "highlight", required: false },
    { pass: "surface-paint", required: false },
    { pass: "part-id", required: false },
  ],
};

export function planCharacterPurposeApply(input: {
  readonly purpose: CharacterApplyPurpose;
  readonly availablePasses: readonly CharacterApplyExtendedPassId[];
  readonly replaceLinkedGroup: boolean;
}): CharacterPurposeApplyPlan {
  const available = new Set(input.availablePasses);
  const blockers: string[] = [];
  const passes = PURPOSE_PASSES[input.purpose].map(({ pass, required }) => {
    if (available.has(pass)) {
      return Object.freeze({ pass, required, status: "planned" as const, reason: null });
    }
    const reason = required
      ? `${pass} 필수 패스를 현재 렌더러가 생성할 수 없습니다.`
      : `${pass} 선택 패스를 지원하지 않아 건너뜁니다.`;
    if (required) blockers.push(reason);
    return Object.freeze({ pass, required, status: "skipped" as const, reason });
  });
  return Object.freeze({
    purpose: input.purpose,
    atomic: true,
    replaceMode: input.replaceLinkedGroup ? "replace-linked-group" : "new-group",
    passes: Object.freeze(passes),
    ready: blockers.length === 0,
    blockers: Object.freeze(blockers),
  });
}
