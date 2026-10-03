import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { STUDIO_LPC_ASSET_ROOT, STUDIO_LPC_LICENSE_USES } from "./studio-lpc-characters";
import {
  isStudioLpcCreditWebUrl,
  parseStudioLpcCreditEntries,
  studioLpcCreditUrlLabel,
} from "./studio-lpc-credits";

const VALID_ENTRY = {
  id: "body-bodies-female",
  sourcePath: "body/bodies/female",
  chosenLicense: "OGA-BY 3.0",
  chosenLicenseUrl: "https://static.opengameart.org/OGA-BY-3.0.txt",
  authors: ["bluecarrot16", "Evert"],
  urls: ["https://opengameart.org/content/lpc-character-bases"],
};

describe("LPC 레이어별 크레딧 해석", () => {
  it("올바른 credits.json 모양에서 화면에 필요한 필드만 읽는다", () => {
    const entries = parseStudioLpcCreditEntries({ version: 1, entries: [{ ...VALID_ENTRY, files: ["a.png"], usedBy: ["npc-cafe"] }] });
    expect(entries).toEqual([VALID_ENTRY]);
  });

  it("겹친 출처 주소는 처음 순서를 지키며 하나로 합친다(링크 키 충돌 방지)", () => {
    const [first, second] = ["https://opengameart.org/content/a", "https://opengameart.org/content/b"];
    const entries = parseStudioLpcCreditEntries({ entries: [{ ...VALID_ENTRY, urls: [first, second, first] }] });
    expect(entries?.[0]?.urls).toEqual([first, second]);
  });

  it("모양이 다르거나 비어 있으면 null이다", () => {
    for (const value of [null, undefined, "x", 3, [], {}, { entries: [] }, { entries: "x" }]) {
      expect(parseStudioLpcCreditEntries(value), JSON.stringify(value)).toBeNull();
    }
  });

  it("한 항목이라도 깨졌으면 일부만 보여 주지 않고 전체를 거부한다(크레딧이 조용히 빠지지 않게)", () => {
    const broken: readonly Record<string, unknown>[] = [
      { ...VALID_ENTRY, id: "" },
      { ...VALID_ENTRY, sourcePath: undefined },
      { ...VALID_ENTRY, chosenLicense: 3 },
      { ...VALID_ENTRY, authors: [] },
      { ...VALID_ENTRY, authors: ["ok", ""] },
      { ...VALID_ENTRY, urls: "https://opengameart.org" },
    ];
    for (const entry of broken) {
      expect(parseStudioLpcCreditEntries({ entries: [VALID_ENTRY, entry] }), JSON.stringify(entry)).toBeNull();
    }
  });

  it("웹 주소(http·https)가 아닌 값(javascript:·data:·vbscript:·ftp:·상대 경로)은 링크가 되지 못하게 거부한다", () => {
    for (const bad of ["javascript:alert(1)", "data:text/html,hi", "vbscript:msgbox(1)", "ftp://opengameart.org/x", "not a url", "//opengameart.org", "/assets/x"]) {
      expect(isStudioLpcCreditWebUrl(bad), bad).toBe(false);
      expect(parseStudioLpcCreditEntries({ entries: [{ ...VALID_ENTRY, urls: [bad] }] }), bad).toBeNull();
      expect(parseStudioLpcCreditEntries({ entries: [{ ...VALID_ENTRY, chosenLicenseUrl: bad }] }), bad).toBeNull();
    }
    expect(isStudioLpcCreditWebUrl("https://opengameart.org/content/x")).toBe(true);
  });

  it("원본 크레딧에 섞인 http:// 출처 주소는 그대로 받는다(해당 레이어 크레딧이 빠지지 않게)", () => {
    const entries = parseStudioLpcCreditEntries({ entries: [{ ...VALID_ENTRY, urls: ["http://opengameart.org/content/lpc-clothing-updates"] }] });
    expect(entries?.[0]?.urls).toEqual(["http://opengameart.org/content/lpc-clothing-updates"]);
  });

  it("실제 생성된 credits.json이 전부 통과하고 라이선스별 레이어 수 요약과 같다", () => {
    const root = join(resolve(process.cwd(), "apps/web/public"), STUDIO_LPC_ASSET_ROOT.replace(/^\//u, ""));
    const body: unknown = JSON.parse(readFileSync(join(root, "credits.json"), "utf8"));
    const entries = parseStudioLpcCreditEntries(body);
    expect(entries).not.toBeNull();
    expect(entries?.length).toBe(STUDIO_LPC_LICENSE_USES.reduce((sum, use) => sum + use.layers, 0));
    for (const entry of entries ?? []) {
      expect(entry.authors.length, entry.id).toBeGreaterThan(0);
      expect(entry.urls.length, entry.id).toBeGreaterThan(0);
    }
  });
});

describe("출처 주소 표시", () => {
  it("스킴과 앞의 www.·끝 슬래시를 떼어 짧게 보여 준다", () => {
    expect(studioLpcCreditUrlLabel("https://opengameart.org/content/lpc-be-seated/")).toBe("opengameart.org/content/lpc-be-seated");
    expect(studioLpcCreditUrlLabel("https://www.example.com/a")).toBe("example.com/a");
  });

  it("너무 길면 가운데를 줄여 최대 길이를 지키고 앞뒤 글자를 남긴다", () => {
    const url = "https://github.com/ElizaWy/LPC/tree/main/Characters/Head%20Accessories/with/a/very/long/path";
    const label = studioLpcCreditUrlLabel(url, 40);
    expect(label.length).toBe(40);
    expect(label).toContain("…");
    expect(label.startsWith("github.com/ElizaWy")).toBe(true);
    expect(label.endsWith("long/path")).toBe(true);
  });
});
