/** Ephemeral activities. A participant can publish only their own authenticated state. */
export const HUDDLE_CHALLENGES = [
  { id: "expressions", title: "표정 6컷", prompt: "같은 캐릭터의 기쁨·놀람·분노·슬픔·당황·안도를 여섯 컷으로 그려 보세요.", seconds: 300 },
  { id: "silhouette", title: "실루엣 캐릭터", prompt: "검은 실루엣만으로 직업과 성격이 드러나는 캐릭터 세 명을 그려 보세요.", seconds: 180 },
  { id: "silent-story", title: "무대사 4컷", prompt: "대사 없이 ‘오해가 풀리는 순간’을 네 컷으로 전달해 보세요.", seconds: 600 },
  { id: "three-colors", title: "3색 분위기", prompt: "세 가지 색만 사용해 같은 장소의 편안함과 긴장감을 각각 표현해 보세요.", seconds: 300 },
  { id: "camera", title: "시선 유도 구도", prompt: "같은 장면을 원경·중경·클로즈업으로 그려 시선이 자연스럽게 이어지게 해 보세요.", seconds: 300 },
  { id: "gesture", title: "60초 동세", prompt: "큰 선 다섯 개 이내로 점프·달리기·웅크리기의 무게 중심을 표현해 보세요.", seconds: 60 },
] as const;
export interface HuddleChallenge {
  id: string; title: string; prompt: string; remainingMs: number; running: boolean;
}
export interface HuddlePoll { id: string; question: string; options: string[]; open: boolean }
export interface HuddleVote { owner: string; pollId: string; choice: number }
export interface HuddleActivityState {
  sequence: number; challenge: HuddleChallenge | null; poll: HuddlePoll | null; votes: HuddleVote[];
}
export interface HuddleActivityView {
  owner: string; self: boolean; challenge: HuddleChallenge | null;
  poll: (HuddlePoll & { counts: number[]; myChoice: number | null; voters: number }) | null;
}
const MAX_TIME = 30 * 60 * 1000;
const MAX_SEQUENCE = 1_000_000_000;
const id = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9_-]{1,80}$/u.test(v);
const text = (v: unknown, limit: number): v is string => typeof v === "string" && Boolean(v.trim()) && v.length <= limit;
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
/** Reconstruct nested input; never accept remote aggregate tallies or claimed voters. */
export function parseHuddleActivity(value: unknown): HuddleActivityState | null {
  if (!record(value) || !Number.isInteger(value.sequence) || Number(value.sequence) < 1
    || Number(value.sequence) > MAX_SEQUENCE || !Array.isArray(value.votes) || value.votes.length > 4) return null;
  let challenge: HuddleChallenge | null = null;
  if (value.challenge !== null) {
    const c = value.challenge;
    if (!record(c) || !id(c.id) || !text(c.title, 80) || !text(c.prompt, 500)
      || !Number.isInteger(c.remainingMs) || Number(c.remainingMs) < 0 || Number(c.remainingMs) > MAX_TIME
      || typeof c.running !== "boolean") return null;
    challenge = { id: c.id, title: c.title, prompt: c.prompt, remainingMs: Number(c.remainingMs), running: c.running };
  }
  let poll: HuddlePoll | null = null;
  if (value.poll !== null) {
    const p = value.poll;
    if (!record(p) || !id(p.id) || !text(p.question, 160) || typeof p.open !== "boolean"
      || !Array.isArray(p.options) || p.options.length < 2 || p.options.length > 4
      || !p.options.every((o) => text(o, 60)) || new Set(p.options.map((o) => o.trim())).size !== p.options.length) return null;
    poll = { id: p.id, question: p.question, options: p.options.map((o) => String(o)), open: p.open };
  }
  const votes: HuddleVote[] = []; const owners = new Set<string>();
  for (const v of value.votes) {
    if (!record(v) || !id(v.owner) || !id(v.pollId) || !Number.isInteger(v.choice)
      || Number(v.choice) < 0 || Number(v.choice) > 3 || owners.has(v.owner)) return null;
    owners.add(v.owner); votes.push({ owner: v.owner, pollId: v.pollId, choice: Number(v.choice) });
  }
  return { sequence: Number(value.sequence), challenge, poll, votes };
}
interface TimedState { state: HuddleActivityState; receivedAt: number }
const clone = (s: HuddleActivityState): HuddleActivityState => ({ ...s,
  challenge: s.challenge ? { ...s.challenge } : null,
  poll: s.poll ? { ...s.poll, options: [...s.poll.options] } : null,
  votes: s.votes.map((v) => ({ ...v })) });
/** Each sender owns one round and poll. No network, persistence or remote-control privileges. */
export class HuddleActivities {
  private own: HuddleActivityState = { sequence: 0, challenge: null, poll: null, votes: [] };
  private ownAt: number;
  private readonly remote = new Map<string, TimedState>();
  constructor(private readonly self: string, private readonly now: () => number,
    private readonly makeId: () => string, private readonly getPeers: () => string[],
    private readonly send: (target: string, state: HuddleActivityState) => boolean) { this.ownAt = now(); }
  private current(entry: TimedState): HuddleActivityState {
    const state = clone(entry.state);
    if (state.challenge?.running) {
      state.challenge.remainingMs = Math.round(Math.max(0, state.challenge.remainingMs - Math.max(0, this.now() - entry.receivedAt)));
      if (state.challenge.remainingMs === 0) state.challenge.running = false;
    }
    return state;
  }
  private settle(): void { this.own = this.current({ state: this.own, receivedAt: this.ownAt }); this.ownAt = this.now(); }
  private stateOf(owner: string): HuddleActivityState | null {
    if (owner === this.self) return this.current({ state: this.own, receivedAt: this.ownAt });
    const remote = this.remote.get(owner); return remote ? this.current(remote) : null;
  }
  receive(owner: string, state: HuddleActivityState): void {
    if (owner === this.self || !this.getPeers().includes(owner)) return;
    const previous = this.remote.get(owner);
    if (previous && state.sequence <= previous.state.sequence) return;
    const next = clone(state);
    const old = previous ? this.current(previous).challenge : null;
    // Variable packet latency must not lengthen an already-running round.
    if (old?.running && next.challenge?.running && old.id === next.challenge.id)
      next.challenge.remainingMs = Math.min(old.remainingMs, next.challenge.remainingMs);
    this.remote.set(owner, { state: next, receivedAt: this.now() }); this.pruneVotes();
  }
  sync(target?: string): boolean {
    this.settle(); this.pruneVotes(); this.own.sequence = Math.min(MAX_SEQUENCE, this.own.sequence + 1);
    const state = clone(this.own);
    return this.getPeers().filter((p) => !target || p === target).map((p) => this.send(p, state)).every(Boolean);
  }
  startChallenge(templateId: string): boolean {
    const template = HUDDLE_CHALLENGES.find((c) => c.id === templateId);
    if (!template || !this.getPeers().length) return false;
    this.settle(); this.own.challenge = { id: this.makeId(), title: template.title, prompt: template.prompt,
      remainingMs: template.seconds * 1000, running: true }; return this.sync();
  }
  toggleChallenge(): boolean {
    this.settle(); const c = this.own.challenge;
    if (!c || c.remainingMs === 0) return false;
    c.running = !c.running; return this.sync();
  }
  clearChallenge(): boolean { this.own.challenge = null; return this.sync(); }
  createPoll(question: string, options: string[]): boolean {
    const poll = { id: this.makeId(), question: question.trim(), options: options.map((o) => o.trim()), open: true };
    if (!this.getPeers().length || !parseHuddleActivity({ sequence: 1, challenge: null, poll, votes: [] })) return false;
    this.own.poll = poll; return this.sync();
  }
  clearPoll(): boolean { this.own.poll = null; return this.sync(); }
  vote(owner: string, choice: number): boolean {
    const poll = this.stateOf(owner)?.poll;
    if (!poll?.open || !Number.isInteger(choice) || choice < 0 || choice >= poll.options.length) return false;
    this.own.votes = this.own.votes.filter((v) => v.owner !== owner);
    this.own.votes.push({ owner, pollId: poll.id, choice }); return this.sync();
  }
  private pruneVotes(): void {
    this.own.votes = this.own.votes.filter((v) => this.stateOf(v.owner)?.poll?.id === v.pollId);
  }
  snapshot(): HuddleActivityView[] {
    const entries = [this.self, ...this.getPeers()];
    return entries.map((owner): HuddleActivityView | null => {
      const state = this.stateOf(owner);
      if (!state || (!state.challenge && !state.poll)) return null;
      const poll = state.poll;
      const votes = poll ? entries.flatMap((voter) => (this.stateOf(voter)?.votes ?? [])
        .filter((v) => v.owner === owner && v.pollId === poll.id && v.choice < poll.options.length)) : [];
      const myChoice = this.own.votes.find((v) => v.owner === owner && v.pollId === poll?.id)?.choice ?? null;
      return { owner, self: owner === this.self, challenge: state.challenge,
        poll: poll ? { ...poll, counts: poll.options.map((_, i) => votes.filter((v) => v.choice === i).length),
          myChoice, voters: votes.length } : null };
    }).filter((v): v is HuddleActivityView => v !== null);
  }
  remove(owner: string): void { this.remote.delete(owner); this.pruneVotes(); }
  clear(): void {
    this.remote.clear(); this.own = { sequence: 0, challenge: null, poll: null, votes: [] }; this.ownAt = this.now();
  }
}
