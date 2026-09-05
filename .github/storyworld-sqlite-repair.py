import hashlib
from pathlib import Path

STORE = '''/** Shared SQLite/OPFS authority; no browser-KV or hidden persistence fallback. */
import type { StudioLocalDatabase } from "../studio-local-database";
import type { StoryworldProject } from "./studio-storyworld-causality";

export const STORYWORLD_DRAFT_NAMESPACE = "studio-storyworld-drafts-v1";
const MAX_BYTES = 1_100_000;
type Database = Pick<StudioLocalDatabase, "kvGet" | "kvSet">;
type Decode = (serialized: string) => StoryworldProject;
function bounded(value: string): void {
  if (new TextEncoder().encode(value).byteLength > MAX_BYTES) {
    throw new Error("스토리월드 저장 데이터가 허용 크기를 초과했습니다.");
  }
}
export function createStoryworldDraftStore(acquireDatabase: () => Promise<Database>) {
  const tails = new Map<string, Promise<void>>();
  return {
    async load(key: string, decode: Decode): Promise<StoryworldProject | null> {
      await tails.get(key);
      const database = await acquireDatabase();
      const raw = await database.kvGet(STORYWORLD_DRAFT_NAMESPACE, key);
      if (raw === null) return null;
      bounded(raw);
      const envelope: unknown = JSON.parse(raw);
      if (typeof envelope !== "object" || envelope === null
        || !("version" in envelope) || envelope.version !== 1
        || !("documentKey" in envelope) || envelope.documentKey !== key
        || !("project" in envelope)) {
        throw new Error("스토리월드 저장 문서의 버전 또는 작품 범위가 일치하지 않습니다.");
      }
      return decode(JSON.stringify(envelope.project));
    },
    save(key: string, project: StoryworldProject): Promise<void> {
      // Capture the complete edit before waiting for earlier writes.
      let serialized: string;
      try {
        serialized = JSON.stringify({ version: 1, documentKey: key, savedAtIso: new Date().toISOString(), project });
        bounded(serialized);
      } catch (error) {
        return Promise.reject(error);
      }
      const current = (tails.get(key) ?? Promise.resolve()).catch(() => undefined).then(async () => {
        const database = await acquireDatabase();
        await database.kvSet(STORYWORLD_DRAFT_NAMESPACE, key, serialized);
      });
      tails.set(key, current);
      const retire = () => { if (tails.get(key) === current) tails.delete(key); };
      void current.then(retire, retire);
      return current;
    },
  };
}
export const storyworldDraftStore = createStoryworldDraftStore(async () => {
  const { acquireStudioLocalDatabase } = await import("../studio-local-database-runtime");
  return acquireStudioLocalDatabase();
});
'''

STORE_TEST = '''import { describe, expect, it, vi } from "vitest";

import { createStoryworldDraftStore, STORYWORLD_DRAFT_NAMESPACE } from "./draft-store";
import { STORYWORLD_DEMO_PROJECT } from "./studio-storyworld-causality";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => { resolve = yes; });
  return { promise, resolve };
}
function database() {
  const rows = new Map<string, string>();
  return {
    rows,
    kvGet: vi.fn(async (namespace: string, key: string) => rows.get(`${namespace}:${key}`) ?? null),
    kvSet: vi.fn(async (namespace: string, key: string, value: string) => { rows.set(`${namespace}:${key}`, value); }),
  };
}
const decode = (raw: string) => JSON.parse(raw) as typeof STORYWORLD_DEMO_PROJECT;

describe("Storyworld shared SQLite draft authority", () => {
  it("round trips complete documents with work/remix isolation", async () => {
    const db = database();
    const store = createStoryworldDraftStore(async () => db);
    expect(await store.load("work:a", decode)).toBeNull();
    await store.save("work:a", STORYWORLD_DEMO_PROJECT);
    expect(await store.load("work:a", decode)).toEqual(STORYWORLD_DEMO_PROJECT);
    expect(await store.load("remix:a", decode)).toBeNull();
    expect(db.kvSet).toHaveBeenCalledWith(STORYWORLD_DRAFT_NAMESPACE, "work:a", expect.any(String));
  });
  it("serializes writes and makes a remount load wait for the final complete document", async () => {
    const db = database();
    const first = deferred<void>();
    const original = db.kvSet.getMockImplementation()!;
    db.kvSet.mockImplementationOnce(async (namespace, key, value) => {
      await first.promise;
      await original(namespace, key, value);
    });
    const store = createStoryworldDraftStore(async () => db);
    const a = store.save("work:a", { ...STORYWORLD_DEMO_PROJECT, title: "first" });
    const b = store.save("work:a", { ...STORYWORLD_DEMO_PROJECT, title: "last" });
    const load = store.load("work:a", decode);
    expect(db.kvGet).not.toHaveBeenCalled();
    first.resolve();
    await Promise.all([a, b]);
    expect((await load)?.title).toBe("last");
    expect(db.kvSet).toHaveBeenCalledTimes(2);
  });
  it("reports a failed write, then permits a later retry", async () => {
    const db = database();
    db.kvSet.mockRejectedValueOnce(new Error("quota"));
    const store = createStoryworldDraftStore(async () => db);
    await expect(store.save("work:a", STORYWORLD_DEMO_PROJECT)).rejects.toThrow("quota");
    await store.save("work:a", STORYWORLD_DEMO_PROJECT);
    expect(await store.load("work:a", decode)).toEqual(STORYWORLD_DEMO_PROJECT);
  });
  it("rejects corrupt, foreign-scope, unsupported and oversized rows without writing", async () => {
    const db = database();
    const store = createStoryworldDraftStore(async () => db);
    for (const raw of ["{bad", JSON.stringify({ version: 2, documentKey: "work:a", project: STORYWORLD_DEMO_PROJECT }), JSON.stringify({ version: 1, documentKey: "work:b", project: STORYWORLD_DEMO_PROJECT }), "x".repeat(1_100_001)]) {
      db.kvGet.mockResolvedValueOnce(raw);
      await expect(store.load("work:a", decode)).rejects.toThrow();
    }
    expect(db.kvSet).not.toHaveBeenCalled();
  });
  it("preserves read and validation failures instead of creating an empty replacement", async () => {
    const db = database();
    const store = createStoryworldDraftStore(async () => db);
    db.kvGet.mockRejectedValueOnce(new Error("unavailable"));
    await expect(store.load("work:a", decode)).rejects.toThrow("unavailable");
    await store.save("work:a", STORYWORLD_DEMO_PROJECT);
    db.kvSet.mockClear();
    await expect(store.load("work:a", () => { throw new Error("invalid project"); })).rejects.toThrow("invalid project");
    expect(db.kvSet).not.toHaveBeenCalled();
  });
  it("refuses oversized writes before opening SQLite and never uses another backend", async () => {
    const acquire = vi.fn(async () => database());
    const store = createStoryworldDraftStore(acquire);
    await expect(store.save("work:a", { ...STORYWORLD_DEMO_PROJECT, title: "가".repeat(400_000) })).rejects.toThrow();
    expect(acquire).not.toHaveBeenCalled();
    const unavailable = createStoryworldDraftStore(async () => { throw new Error("OPFS unavailable"); });
    await expect(unavailable.save("work:a", STORYWORLD_DEMO_PROJECT)).rejects.toThrow("OPFS unavailable");
  });
});
'''

PAGE_TEST = '''// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { STORYWORLD_DRAFT_NAMESPACE } from "./draft-store";
import { STORYWORLD_DEMO_PROJECT } from "./studio-storyworld-causality";
import { StudioStoryworldLabPage } from "./StudioStoryworldLabPage";

const db = vi.hoisted(() => ({ rows: new Map<string, string>(), kvGet: vi.fn(), kvSet: vi.fn() }));
vi.mock("../studio-local-database-runtime", () => ({ acquireStudioLocalDatabase: async () => db }));
const key = (id: string) => `toonspectrum:storyworld-lab:v1:work:${id}`;
const rowKey = (id: string) => `${STORYWORLD_DRAFT_NAMESPACE}:${key(id)}`;
const saved = (id: string) => JSON.parse(db.rows.get(rowKey(id)) ?? "null");
function page(workId: string) {
  return <MemoryRouter><StudioStoryworldLabPage key={workId} workId={workId} remixSourceWorkId={null} /></MemoryRouter>;
}
async function ready() { await screen.findByRole("button", { name: "원본 데이터" }); }
async function open(workId: string) {
  const view = render(page(workId));
  await ready();
  return view;
}
function editProject(title: string) {
  fireEvent.click(screen.getByRole("button", { name: "원본 데이터" }));
  fireEvent.change(screen.getByRole("textbox", { name: "스토리월드 JSON" }), {
    target: { value: JSON.stringify({ ...STORYWORLD_DEMO_PROJECT, id: "authored-test", title }) },
  });
  fireEvent.click(screen.getByRole("button", { name: "적용 후 분석" }));
}

describe("Storyworld actual page integration", () => {
  beforeEach(() => {
    db.rows.clear();
    db.kvGet.mockReset().mockImplementation(async (namespace: string, id: string) => db.rows.get(`${namespace}:${id}`) ?? null);
    db.kvSet.mockReset().mockImplementation(async (namespace: string, id: string, value: string) => { db.rows.set(`${namespace}:${id}`, value); });
  });
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });
  it("uses the real href contract and labels demo data", async () => {
    await open("work-first");
    expect(screen.getByRole("link", { name: "Studio 편집기로 돌아가기" }).getAttribute("href")).toBe("/studio/work/work-first/canvas");
    expect(screen.getByText(/예시 데이터 ·/)).toBeTruthy();
    expect(screen.getByLabelText("스토리월드 JSON 가져오기")).toBeTruthy();
    expect(screen.getByText(/캔버스 원고와 자동 연결되지 않은 로컬 실험/)).toBeTruthy();
  });
  it("opens every user-facing analysis surface", async () => {
    await open("work-tabs");
    for (const label of ["모순·위험", "멀티버스", "인물 지식", "서사 계약", "창의 기능 지도", "원본 데이터", "대시보드"]) {
      fireEvent.click(screen.getByRole("button", { name: new RegExp(`^${label}`) }));
      expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(label);
    }
  });
  it("saves validated authored JSON only through the shared SQLite authority", async () => {
    const localWrite = vi.spyOn(Storage.prototype, "setItem");
    await open("work-save");
    editProject("내가 만든 세계");
    await waitFor(() => expect(saved("work-save")?.project.title).toBe("내가 만든 세계"));
    expect(db.kvSet).toHaveBeenCalledWith(STORYWORLD_DRAFT_NAMESPACE, key("work-save"), expect.any(String));
    expect(localWrite).not.toHaveBeenCalled();
  });
  it("keeps A-to-B-to-A private drafts isolated on real keyed remounts", async () => {
    const view = await open("work-a");
    editProject("A의 사적인 초안");
    await waitFor(() => expect(saved("work-a")?.project.title).toBe("A의 사적인 초안"));
    view.rerender(page("work-b"));
    await ready();
    await waitFor(() => expect(saved("work-b")?.project.title).toBe(STORYWORLD_DEMO_PROJECT.title));
    expect(saved("work-a").project.title).toBe("A의 사적인 초안");
    view.rerender(page("work-a"));
    await ready();
    expect(screen.getByText("A의 사적인 초안")).toBeTruthy();
    const router = readFileSync(resolve(process.cwd(), "src/domains/creator/studio-router/StudioRouter.tsx"), "utf8");
    expect(router).toContain("key={resolution.lifecycleKey}");
  });
  it("keeps the current project after malformed JSON is rejected", async () => {
    await open("work-invalid");
    fireEvent.click(screen.getByRole("button", { name: "원본 데이터" }));
    fireEvent.change(screen.getByRole("textbox", { name: "스토리월드 JSON" }), { target: { value: "{broken" } });
    fireEvent.click(screen.getByRole("button", { name: "적용 후 분석" }));
    expect(screen.getByRole("alert")).toBeTruthy();
    await waitFor(() => expect(saved("work-invalid")?.project.title).toBe(STORYWORLD_DEMO_PROJECT.title));
  });
  it("rejects excessive scene counts before analysis", async () => {
    await open("work-budget");
    fireEvent.click(screen.getByRole("button", { name: "원본 데이터" }));
    const oversized = { ...STORYWORLD_DEMO_PROJECT, scenes: Array.from({ length: 257 }, (_, i) => ({ id: `s-${i}`, title: "장면", order: i })) };
    fireEvent.change(screen.getByRole("textbox", { name: "스토리월드 JSON" }), { target: { value: JSON.stringify(oversized) } });
    fireEvent.click(screen.getByRole("button", { name: "적용 후 분석" }));
    expect(screen.getByRole("alert").textContent).toContain("장면 256개");
  });
  it("reports SQL write failures without claiming a durable save", async () => {
    db.kvSet.mockRejectedValue(new Error("quota"));
    await open("work-quota");
    editProject("아직 보관되지 않은 초안");
    expect(await screen.findByText("저장 실패")).toBeTruthy();
    expect(screen.getByText(/SQLite\\/OPFS에 저장하지 못했습니다/)).toBeTruthy();
    expect(screen.getByText("아직 보관되지 않은 초안")).toBeTruthy();
    expect(saved("work-quota")).toBeNull();
  });
  it("does not save a demo before asynchronous restoration completes", async () => {
    let finish!: (value: string) => void;
    db.kvGet.mockReturnValueOnce(new Promise<string>((resolveRead) => { finish = resolveRead; }));
    render(page("work-delayed"));
    expect(screen.queryByRole("button", { name: "원본 데이터" })).toBeNull();
    expect(db.kvSet).not.toHaveBeenCalled();
    await act(async () => {
      finish(JSON.stringify({ version: 1, documentKey: key("work-delayed"), project: { ...STORYWORLD_DEMO_PROJECT, title: "복원된 원본" } }));
    });
    await ready();
    await waitFor(() => expect(saved("work-delayed")?.project.title).toBe("복원된 원본"));
    expect(db.kvSet.mock.calls.every((call) => JSON.parse(String(call[2])).project.title === "복원된 원본")).toBe(true);
  });
  it("preserves corrupt rows and offers retry without writing demo data", async () => {
    db.rows.set(rowKey("work-corrupt"), "{corrupt");
    render(page("work-corrupt"));
    expect((await screen.findByRole("alert")).textContent).toContain("복원 실패");
    expect(db.rows.get(rowKey("work-corrupt"))).toBe("{corrupt");
    expect(db.kvSet).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "원본 데이터" })).toBeNull();
    db.rows.delete(rowKey("work-corrupt"));
    fireEvent.click(screen.getByRole("button", { name: "저장소 다시 열기" }));
    await ready();
  });
});
'''

WRAPPER = '''export function StudioStoryworldLabPage(props: StudioStoryworldLabPageProps) {
  useDocumentTitle("스토리월드 인과관계 랩 · Studio");
  const key = projectStorageKey(props.workId, props.remixSourceWorkId);
  const [loaded, setLoaded] = useState<{ key: string; project: StoryworldProject } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setLoaded(null);
    setError(null);
    void storyworldDraftStore.load(key, parseStoryworldProject).then((project) => {
      if (active) setLoaded({ key, project: project ?? cloneDemoProject() });
    }).catch((caught: unknown) => {
      if (active) setError(caught instanceof Error ? caught.message : "저장소를 열 수 없습니다.");
    });
    return () => { active = false; };
  }, [key, attempt]);
  if (loaded === null || loaded.key !== key) {
    return (
      <main className="storyworld-main" aria-busy={error === null}>
        <h1>스토리월드 인과관계 랩</h1>
        <p role={error === null ? "status" : "alert"}>
          {error === null ? "SQLite/OPFS에서 스토리월드 초안을 복원하는 중입니다." : `복원 실패: ${error} 저장된 원본은 변경하지 않았습니다.`}
        </p>
        {error !== null ? <button className="storyworld-button" type="button" onClick={() => setAttempt((value) => value + 1)}>저장소 다시 열기</button> : null}
        <Link className="storyworld-button" href={editorHref(props.workId, props.remixSourceWorkId)}>Studio 편집기로 돌아가기</Link>
      </main>
    );
  }
  return <StudioStoryworldLabEditor key={key} {...props} initialProject={loaded.project} />;
}

function StudioStoryworldLabEditor({
  workId,
  remixSourceWorkId,
  initialProject,
}: StudioStoryworldLabPageProps & { readonly initialProject: StoryworldProject }) {
'''

SAVE = '''  useEffect(() => {
    let active = true;
    setSaveState("idle");
    // Complete JSON edits queue immediately; only obsolete UI receipts are cancelled.
    void storyworldDraftStore.save(storageKey, project).then(() => {
      if (!active) return;
      setSaveState("saved");
      setStatusText("SQLite/OPFS에 스토리월드 초안을 저장했습니다.");
    }).catch(() => {
      if (!active) return;
      setSaveState("error");
      setStatusText("SQLite/OPFS에 저장하지 못했습니다. 현재 편집은 이 탭에만 남아 있습니다. JSON으로 내보내 보관하세요.");
    });
    return () => { active = false; };
  }, [project, storageKey]);
'''

page = Path('src/domains/creator/storyworld/StudioStoryworldLabPage.tsx')
b = page.read_bytes()
assert hashlib.sha1(b'blob ' + str(len(b)).encode() + b'\0' + b).hexdigest() == '707b5ed521ac79257a607509a90449a516b574cf', 'Page changed; review first'
s = b.decode()
s = s.replace('import "./studio-storyworld-lab.css";', 'import "./studio-storyworld-lab.css";\nimport { storyworldDraftStore } from "./draft-store";', 1)
a = s.index('type StoredStoryworldEnvelope = {')
z = s.index('\nconst TAB_ITEMS:', a)
s = s[:a] + s[z:]
a = s.index('function safeReadStoredProject(')
z = s.index('function projectStorageKey(', a)
s = s[:a] + s[z:]
a = s.index('export function StudioStoryworldLabPage({')
z = s.index('  const storageKey =', a)
s = s[:a] + WRAPPER + s[z:]
s = s.replace('useState<StoryworldProject>(() => safeReadStoredProject(storageKey) ?? cloneDemoProject())', 'useState<StoryworldProject>(initialProject)', 1)
a = s.index('  useEffect(() => {\n    const timer = window.setTimeout(')
z = s.index('\n  const reset =', a)
s = s[:a] + SAVE + s[z:]
assert 'localStorage' not in s and 'safeReadStoredProject' not in s and 'StoredStoryworldEnvelope' not in s
page.write_text(s)
root = page.parent
(root/'draft-store.ts').write_text(STORE)
(root/'draft-store.test.ts').write_text(STORE_TEST)
(root/'StudioStoryworldLabPage.test.tsx').write_text(PAGE_TEST)
doc = Path('docs/studio-storyworld-causality-lab-2026-09-05.md')
doc.write_text(doc.read_text() + '\n\n## SQLite/OPFS authority integration\n\nStoryworld drafts use the app-lifetime shared SQLite/OPFS handle in the isolated `studio-storyworld-drafts-v1` namespace. There are no localStorage or IndexedDB writes, automatic legacy imports, new database files, or hidden persistence fallbacks. The browser-KV boundary test is unchanged.\n\nThe editor mounts only after a valid document-scoped read completes. Unavailable or corrupt rows fail closed with retry/return actions and are never replaced by example content. Complete edits queue immediately in invocation order, remount reads wait for pending writes, and stale acknowledgements cannot mark a different edit saved. Failed writes retain editable tab state with an explicit JSON backup message. This remains local planning, not canonical canvas/server/CRDT storage.\n')
print('Applied bounded Storyworld SQLite repair; architecture boundary assertions unchanged.')
