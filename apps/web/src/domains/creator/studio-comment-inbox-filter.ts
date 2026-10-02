import { parseMentions } from "./comments-plus/studio-comment-enhance";

import type {
  StudioCommentActor,
  StudioCommentThread,
  StudioCommentsDocument,
} from "./studio-comments";

function normalizeMentionName(displayName: string): string {
  return displayName.trim().normalize("NFKC").toLocaleLowerCase();
}

function normalizedActorName(actor: StudioCommentActor): string {
  return normalizeMentionName(actor.displayName);
}

/** Matches the same collaborator while keeping account IDs authoritative. */
export function studioCommentActorsRepresentSamePerson(
  left: StudioCommentActor,
  right: StudioCommentActor
): boolean {
  if (left.id || right.id) return Boolean(left.id && right.id && left.id === right.id);
  return normalizedActorName(left) === normalizedActorName(right);
}

export function studioCommentThreadAssignedToActor(
  thread: StudioCommentThread,
  actor: StudioCommentActor
): boolean {
  return Boolean(
    thread.assignee
    && studioCommentActorsRepresentSamePerson(thread.assignee, actor)
  );
}

/** The opening message and every reply participate in the mention inbox. */
export function studioCommentThreadMentionsActor(
  thread: StudioCommentThread,
  actor: StudioCommentActor
): boolean {
  return [thread, ...thread.replies].some((message) =>
    message.mentions.some((mention) =>
      studioCommentActorsRepresentSamePerson(mention, actor)
    )
  );
}

function mentionCandidateKey(actor: StudioCommentActor): string {
  return actor.id ? `id:${actor.id}` : `name:${normalizedActorName(actor)}`;
}

/**
 * Everyone a body `@name` can resolve to: the current actor plus every author, assignee, and
 * already-recorded mention in the document. Order is stable (current actor first, then document
 * order) so derivation is deterministic.
 */
export function collectStudioCommentMentionCandidates(
  document: StudioCommentsDocument,
  currentActor: StudioCommentActor
): StudioCommentActor[] {
  const candidates: StudioCommentActor[] = [];
  const seen = new Set<string>();
  const push = (actor: StudioCommentActor | undefined) => {
    if (!actor) return;
    const key = mentionCandidateKey(actor);
    if (seen.has(key)) return;
    seen.add(key);
    candidates.push(actor);
  };
  push(currentActor);
  for (const thread of document.threads) {
    push(thread.author);
    push(thread.assignee);
    for (const mention of thread.mentions) push(mention);
    for (const reply of thread.replies) {
      push(reply.author);
      for (const mention of reply.mentions) push(mention);
    }
  }
  return candidates;
}

const STUDIO_COMMENT_MENTION_TOKEN_PATTERN = /@([가-힣a-zA-Z0-9_]{1,20})/g;

/**
 * `@name` tokens before particle stripping, in the same order `parseMentions` reports them
 * (same pattern, same e-mail guard). "김작가"처럼 조사와 같은 글자로 끝나는 이름은 조사
 * 제거를 먼저 적용하면 다른 이름이 되므로, 후보 매칭은 원형 일치를 우선해야 한다.
 */
function rawStudioCommentMentionNames(body: string): string[] {
  const names: string[] = [];
  for (const match of body.matchAll(STUDIO_COMMENT_MENTION_TOKEN_PATTERN)) {
    const previous = match.index > 0 ? body[match.index - 1] : "";
    if (/[\w가-힣]/u.test(previous)) continue;
    names.push(match[1]);
  }
  return names;
}

/**
 * Resolves `@name` tokens in a comment body to actors. Names matching a candidate keep that
 * candidate's identity (including its account id); unknown names stay display-name-only actors,
 * which the inbox matcher compares by name — the same rule the comments-plus filter already uses.
 */
export function deriveStudioCommentMentionsFromBody(
  body: string,
  candidates: readonly StudioCommentActor[]
): StudioCommentActor[] {
  const parsed = parseMentions(body);
  const rawNames = rawStudioCommentMentionNames(body);
  const derived: StudioCommentActor[] = [];
  const seen = new Set<string>();
  parsed.forEach((mention, index) => {
    const rawName = rawNames[index] ?? mention.name;
    const matched = candidates.find(
      (candidate) => normalizedActorName(candidate) === normalizeMentionName(rawName)
    ) ?? candidates.find(
      (candidate) => normalizedActorName(candidate) === normalizeMentionName(mention.name)
    );
    const actor: StudioCommentActor = matched ?? { displayName: mention.name };
    const key = mentionCandidateKey(actor);
    if (seen.has(key)) return;
    seen.add(key);
    derived.push(actor);
  });
  return derived;
}

/**
 * Display-time mention completion. The team sync contract (v1 mutation plans) cannot carry
 * mentions, so creation paths persist none; without this derivation the mention inbox, counts,
 * and chips would never light up for comments people actually wrote. Persisted mentions always
 * win — derivation only fills messages that have none. Mutations must keep using the original
 * thread object; this returns a copy solely for reading/filtering/rendering.
 */
export function withDerivedStudioCommentMentions(
  thread: StudioCommentThread,
  candidates: readonly StudioCommentActor[]
): StudioCommentThread {
  const threadMentions = thread.mentions.length > 0
    ? thread.mentions
    : deriveStudioCommentMentionsFromBody(thread.body, candidates);
  let repliesChanged = false;
  const replies = thread.replies.map((reply) => {
    if (reply.mentions.length > 0) return reply;
    const derived = deriveStudioCommentMentionsFromBody(reply.body, candidates);
    if (derived.length === 0) return reply;
    repliesChanged = true;
    return { ...reply, mentions: derived };
  });
  if (threadMentions === thread.mentions && !repliesChanged) return thread;
  return { ...thread, mentions: threadMentions, replies };
}
