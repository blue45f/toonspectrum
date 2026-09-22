import { afterEach, describe, expect, it, vi } from "vitest";
import { readFortunePreferences, writeFortunePreferences, clearFortunePreferences } from "./fortune-observatory-storage";

afterEach(() => vi.unstubAllGlobals());
function storage(seed: string | null = null) { let value=seed; vi.stubGlobal("localStorage", { getItem:()=>value, setItem:(_key:string,next:string)=>{value=next;}, removeItem:()=>{value=null;} }); return ()=>value; }
describe("observatory preferences", () => {
  it("starts empty and handles corrupt JSON", () => { storage("bad json");expect(readFortunePreferences()).toEqual({favorites:[],notebook:[]}); });
  it("keeps only valid unique experience ids", () => { storage(JSON.stringify({favorites:["saju","saju","dream","unknown",5]}));expect(readFortunePreferences().favorites).toEqual(["saju","dream"]); });
  it("bounds and validates saved notebook entries", () => { storage(JSON.stringify({notebook:[null,{id:1},...Array.from({length:20},(_,i)=>({id:String(i),title:"사주",text:"해석",savedAt:"2026-09-13"}))]}));expect(readFortunePreferences().notebook).toHaveLength(12); });
  it("writes explicit saves and clears all observatory data", () => { const get=storage();expect(writeFortunePreferences({favorites:["saju"],notebook:[]})).toBe(true);expect(get()).toContain("saju");expect(clearFortunePreferences()).toBe(true);expect(get()).toBeNull(); });
  it("reports blocked storage without throwing or claiming success", () => { vi.stubGlobal("localStorage",{getItem:()=>{throw Error("blocked");},setItem:()=>{throw Error("blocked");},removeItem:()=>{throw Error("blocked");}});expect(readFortunePreferences()).toEqual({favorites:[],notebook:[]});expect(writeFortunePreferences({favorites:[],notebook:[]})).toBe(false);expect(clearFortunePreferences()).toBe(false); });
});

function scopedStorage() {
  const records = new Map<string, string>();
  vi.stubGlobal("localStorage", { getItem: (key: string) => records.get(key) ?? null,
    setItem: (key: string, value: string) => { records.set(key, value); }, removeItem: (key: string) => { records.delete(key); } });
  return records;
}
describe("account-specific device notebooks", () => {
  const notes = { favorites: ["tarot"], notebook: [{ id: "entry-A", title: "Private reading", text: "Only A", savedAt: "2026-09-22" }] };
  it("separates account A, account B and the signed-out device shelf", () => {
    scopedStorage();
    expect(writeFortunePreferences(notes, "A")).toBe(true);
    expect(readFortunePreferences("A")).toEqual(notes);
    expect(readFortunePreferences("B")).toEqual({ favorites: [], notebook: [] });
    expect(readFortunePreferences()).toEqual({ favorites: [], notebook: [] });
  });
  it("never migrates or deletes legacy device notes when an account opens or clears its shelf", () => {
    const records = scopedStorage();
    writeFortunePreferences(notes);
    const before = records.get("toonstudio-fortune-observatory-v1");
    expect(readFortunePreferences("A").notebook).toHaveLength(0);
    writeFortunePreferences(notes, "A");
    expect(clearFortunePreferences("A")).toBe(true);
    expect(records.get("toonstudio-fortune-observatory-v1")).toBe(before);
    expect(readFortunePreferences()).toEqual(notes);
  });
  it("only clears the requested account", () => {
    scopedStorage();
    writeFortunePreferences(notes, "A"); writeFortunePreferences(notes, "B");
    clearFortunePreferences("A");
    expect(readFortunePreferences("A").notebook).toHaveLength(0);
    expect(readFortunePreferences("B")).toEqual(notes);
  });
  it("keeps literal separators and escaped identifiers in different scopes", () => {
    scopedStorage();
    writeFortunePreferences(notes, "A/B");
    expect(readFortunePreferences("A%2FB").notebook).toHaveLength(0);
    expect(readFortunePreferences("A/B")).toEqual(notes);
  });
  it("does not fall back to the shared device key for an invalid account", () => {
    scopedStorage(); writeFortunePreferences(notes);
    expect(writeFortunePreferences(notes, "")).toBe(false);
    expect(readFortunePreferences("").notebook).toHaveLength(0);
    expect(clearFortunePreferences("")).toBe(false);
    expect(readFortunePreferences()).toEqual(notes);
  });
});
