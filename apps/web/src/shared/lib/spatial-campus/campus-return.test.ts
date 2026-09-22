import { describe, expect, it } from "vitest";
import { campusDocumentHref, readCampusReturn, writeCampusReturn, CAMPUS_RETURN_KEY, CAMPUS_RETURN_TTL } from "./campus-return";

function memoryStorage() {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
}
describe("campus document return", () => {
  it.each(["/studio/p/project-A/d/document-B", "/studio/draft/local-draft", "/studio/work/work-A/canvas", "/studio/remix/work-B/comic"])("keeps the exact identity: %s", (path) => {
    expect(campusDocumentHref(path, "?pageId=page-C&revision=version-D")).toBe(`${path}?pageId=page-C&revision=version-D`);
  });
  it.each(["/fortune", "/market", "//evil.test/a", "/studio/p/../d/x", "/studio/p/%2e%2e/d/x", "/studio/p/%2fsecret/d/x", "/studio/p/%ZZ/d/x", "/studio/p/x/d/y/extra"])("rejects a non-document or ambiguous identity: %s", (path) => {
    expect(campusDocumentHref(path)).toBeNull();
  });
  it.each(["token=x", "shareToken=x", "invite=x", "q=private", "birth=1981-01-01", "pageId=one&pageId=two", "pageId=%2Fother", "question=private"])("never carries private or unknown query data: %s", (query) => {
    expect(campusDocumentHref("/studio/p/A/d/B", query)).toBeNull();
  });
  it("roundtrips an owner-scoped reference, not artwork", () => {
    const storage = memoryStorage();
    const target = { owner: "one", href: "/studio/p/A/d/B?pageId=C", savedAt: 100 };
    expect(writeCampusReturn(storage, target)).toBe(true);
    expect(readCampusReturn(storage, "one", 101)).toEqual(target);
    expect(readCampusReturn(storage, "two", 101)).toBeNull();
    expect(readCampusReturn(storage, "one", 100 + CAMPUS_RETURN_TTL + 1)).toBeNull();
    expect(readCampusReturn(storage, "one", 99)).toBeNull();
  });
  it.each(["null", "{}", "[]", "not-json", JSON.stringify({ owner: "one", href: "https://evil.test", savedAt: 100 }), JSON.stringify({ owner: "one", href: "/studio/p/A/d/B#secret", savedAt: 100 })])("fails closed for malformed storage", (value) => {
    const storage = memoryStorage();
    storage.setItem(CAMPUS_RETURN_KEY, value);
    expect(readCampusReturn(storage, "one", 101)).toBeNull();
  });
  it("storage failures cannot prevent local work", () => {
    const failure = () => { throw new Error("storage unavailable"); };
    expect(readCampusReturn({ getItem: failure }, "one")).toBeNull();
    expect(writeCampusReturn({ setItem: failure, removeItem: failure }, null)).toBe(false);
    expect(writeCampusReturn(undefined, null)).toBe(false);
  });
  it("clears the current tab's reference", () => {
    const storage = memoryStorage();
    writeCampusReturn(storage, { owner: "one", href: "/studio/p/A/d/B", savedAt: 100 });
    expect(writeCampusReturn(storage, null)).toBe(true);
    expect(readCampusReturn(storage, "one", 101)).toBeNull();
  });
});

it("writes only the canonical return fields and rejects double-encoded paths", () => {
  const storage = memoryStorage();
  const source = { owner: "one", href: "/studio/p/A/d/B", savedAt: 100, question: "must not persist" };
  expect(writeCampusReturn(storage, source)).toBe(true);
  expect(JSON.parse(storage.getItem(CAMPUS_RETURN_KEY)!)).toEqual({ owner: "one", href: "/studio/p/A/d/B", savedAt: 100 });
  expect(campusDocumentHref("/studio/p/%252fsecret/d/B")).toBeNull();
});
