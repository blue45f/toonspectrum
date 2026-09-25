import { describe, expect, it } from "vitest";

import {
  LIBRARY_HOLDINGS_XML_BYTE_LIMIT,
  parseLibraryHoldingsXml,
} from "./library-holdings-xml";

describe("library holdings XML", () => {
  it("parses bounded library records and normalizes safe fields", () => {
    const result = parseLibraryHoldingsXml(`<?xml version="1.0"?>
      <response><libs><lib>
        <libCode>  1234  </libCode>
        <libName> 중앙   도서관 </libName>
        <address> 서울시 중구 </address>
        <tel>02-123-4567</tel>
        <homepage>https://library.example/path</homepage>
        <latitude>37.5665</latitude>
        <longitude>126.9780</longitude>
      </lib></libs></response>`);

    expect(result).toEqual([{
      libraryCode: "1234",
      name: "중앙 도서관",
      address: "서울시 중구",
      telephone: "02-123-4567",
      homepage: "https://library.example/path",
      latitude: "37.5665",
      longitude: "126.9780",
    }]);
  });

  it("rejects malformed documents and active XML declarations", () => {
    expect(() => parseLibraryHoldingsXml(
      "<!DOCTYPE response [<!ENTITY xxe SYSTEM 'file:///etc/passwd'>]><response>&xxe;</response>",
    )).toThrow(/declarations/u);
    expect(() => parseLibraryHoldingsXml(
      "<response><libs><lib><libCode>1</libCode>",
    )).toThrow(/malformed/u);
  });

  it("drops markup-shaped text, unsafe homepages and invalid coordinates", () => {
    const result = parseLibraryHoldingsXml(`<response><libs>
      <lib><libCode>safe-1</libCode><libName><![CDATA[<script>alert(1)</script>]]></libName></lib>
      <lib><libCode>safe-2</libCode><libName>안전 도서관</libName>
        <homepage>javascript:alert(1)</homepage>
        <latitude>200</latitude><longitude>-181</longitude>
      </lib>
    </libs></response>`);

    expect(result).toEqual([expect.objectContaining({
      libraryCode: "safe-2",
      name: "안전 도서관",
      homepage: "",
      latitude: "",
      longitude: "",
    })]);
  });

  it("rejects responses beyond the byte budget before parsing", () => {
    expect(() => parseLibraryHoldingsXml(
      "x".repeat(LIBRARY_HOLDINGS_XML_BYTE_LIMIT + 1),
    )).toThrow(/byte limit/u);
  });

  it("caps the parsed collection before unbounded traversal", () => {
    const records = Array.from({ length: 120 }, (_, index) => `
      <lib><libCode>${index}</libCode><libName>도서관 ${index}</libName></lib>`)
      .join("");

    const result = parseLibraryHoldingsXml(`<response><libs>${records}</libs></response>`);

    expect(result).toHaveLength(100);
    expect(result[0]?.libraryCode).toBe("0");
    expect(result.at(-1)?.libraryCode).toBe("99");
  });
});
