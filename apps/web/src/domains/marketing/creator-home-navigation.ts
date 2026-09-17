/** Existing fragment IDs stay public; never interpret a URL fragment as a selector. */
export const CREATOR_HOME_SECTIONS = [
  { id: "creator-toolkit-title", headingId: "creator-toolkit-title", ko: "바로 시작", en: "Start here" },
  { id: "creator-process-title", headingId: "creator-process-title", ko: "전체 제작 흐름", en: "Full workflow" },
  { id: "creator-support-title", headingId: "creator-support-title", ko: "소재·협업·도움", en: "Assets, people & help" },
  { id: "creator-closing-title", headingId: "creator-closing-title", ko: "작품 시작", en: "Start creating" },
] as const;

const EXPERIENCE_SECTIONS = [
  { id: "creator-start", headingId: "creator-toolkit-title", ko: "바로 시작", en: "Start here" },
  { id: "creator-flow", headingId: "creator-process-title", ko: "전체 제작 흐름", en: "Full workflow" },
  { id: "creator-principles", headingId: "creator-principles-title", ko: "창작자 원칙", en: "Creator principles" },
  { id: "creator-support", headingId: "creator-support-title", ko: "소재·협업·도움", en: "Assets, people & help" },
] as const;

const LEGACY_SECTIONS = [
  { id: "creator-film", headingId: "creator-process-title", ko: "전체 제작 흐름", en: "Full workflow" },
  { id: "creator-faq-title", headingId: "creator-support-title", ko: "소재·협업·도움", en: "Assets, people & help" },
  { id: "creator-desk-title", headingId: "creator-toolkit-title", ko: "바로 시작", en: "Start here" },
  { id: "creator-offline-title", headingId: "creator-process-title", ko: "전체 제작 흐름", en: "Full workflow" },
] as const;

export type CreatorHomeSectionId =
  | (typeof CREATOR_HOME_SECTIONS)[number]["id"]
  | (typeof EXPERIENCE_SECTIONS)[number]["id"]
  | (typeof LEGACY_SECTIONS)[number]["id"];

export function creatorSectionFromHash(hash: string) {
  if (!hash.startsWith("#") || hash.length > 128) return undefined;
  try {
    const id = decodeURIComponent(hash.slice(1));
    return CREATOR_HOME_SECTIONS.find((section) => section.id === id)
      ?? EXPERIENCE_SECTIONS.find((section) => section.id === id)
      ?? LEGACY_SECTIONS.find((section) => section.id === id);
  } catch {
    return undefined;
  }
}

export function creatorWorkflowIndex(key: string, current: number, count: number): number | null {
  if (!Number.isSafeInteger(count) || count < 1) return null;
  const index = Number.isInteger(current) && current >= 0 && current < count ? current : 0;
  switch (key) {
    case "ArrowRight": return (index + 1) % count;
    case "ArrowLeft": return (index + count - 1) % count;
    case "Home": return 0;
    case "End": return count - 1;
    default: return null;
  }
}

export type CreatorJumpActivation = {
  button: number;
  defaultPrevented: boolean;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
};

export function isPlainCreatorJump(event: CreatorJumpActivation): boolean {
  return event.button === 0 && !event.defaultPrevented
    && !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey;
}

type CreatorSectionTarget = Pick<HTMLElement, "focus" | "scrollIntoView">;
type FindCreatorTarget = (id: string) => CreatorSectionTarget | null;

export function focusCreatorSection(hash: string, findTarget: FindCreatorTarget, scroll = false): boolean {
  const section = creatorSectionFromHash(hash);
  if (!section) return false;
  const target = findTarget(section.headingId);
  if (!target) return false;
  if (scroll) target.scrollIntoView({ block: "start", behavior: "instant" });
  target.focus({ preventScroll: true });
  return true;
}

export type CreatorNavigationHost = {
  getHash: () => string;
  findTarget: FindCreatorTarget;
  requestFrame: (callback: () => void) => number;
  cancelFrame: (handle: number) => void;
  subscribe: (callback: () => void) => () => void;
};

/** Resolve lazy-route headings without selectors, history writes or delayed focus after unmount. */
export function bindCreatorSectionNavigation(host: CreatorNavigationHost): () => void {
  let frame: number | undefined;
  let revision = 0;
  let disposed = false;

  const schedule = () => {
    if (disposed) return;
    const request = ++revision;
    if (frame !== undefined) host.cancelFrame(frame);
    frame = undefined;
    const hash = host.getHash();
    if (!creatorSectionFromHash(hash)) return;
    frame = host.requestFrame(() => {
      if (disposed || request !== revision || hash !== host.getHash()) return;
      frame = undefined;
      focusCreatorSection(hash, host.findTarget, true);
    });
  };

  const unsubscribe = host.subscribe(schedule);
  schedule();

  return () => {
    if (disposed) return;
    disposed = true;
    revision += 1;
    if (frame !== undefined) host.cancelFrame(frame);
    unsubscribe();
  };
}
