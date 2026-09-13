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
