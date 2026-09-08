import { describe, expect, it } from "vitest";

import { decodeHtmlEntities } from "../crawl-helpers.mjs";
import { decodeEntities, stripTags } from "../crawlers/_shared.mjs";
import { decodeEntities as relatedInfoText } from "../related-info-parse.mjs";
import { normalizeCompetitorBody } from "../studio-competitor-watch.mjs";
import { decodeHtmlText, decodeXmlText, htmlToText } from "./html-text.mjs";

describe("untrusted feed text", () => {
  it("decodes one entity layer without promoting encoded markup", () => {
    for (const decode of [decodeHtmlText, decodeXmlText, decodeEntities, decodeHtmlEntities]) {
      expect(decode("&amp;lt;script&amp;gt;")).toBe("&lt;script&gt;");
      expect(decode("&amp;#39;")).toBe("&#39;");
      expect(decode("A &amp; B &#x1F642;")).toBe("A & B 🙂");
    }
    expect(htmlToText("&lt;b&gt;literal&lt;/b&gt;")).toBe("<b>literal</b>");
  });

  it("parses uppercase and whitespace-terminated script/style elements", () => {
    const hostile = '<p>before</p><SCRIPT type="text/javascript">secret()</SCRIPT ><style>hidden</style ><p>after</p>';
    expect(htmlToText(hostile)).toBe("beforeafter");
    expect(stripTags(hostile)).toBe("beforeafter");
    expect(relatedInfoText(hostile)).toBe("beforeafter");
    expect(normalizeCompetitorBody(hostile)).toBe("before after");
  });

  it("handles tag delimiters in quoted attributes and malformed closing tags", () => {
    expect(htmlToText('<b title="1 > 0">visible</b>')).toBe("visible");
    expect(htmlToText("before<script>never closed")).toBe("before");
    expect(htmlToText("<b>first</b><!-- comment --><i>second</i>")).toBe("firstsecond");
    expect(decodeHtmlText("&#999999999999;")).toBe("�");
  });
});
