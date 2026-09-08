import { decodeHTML, decodeXML } from "entities";
import { parseFragment } from "parse5";

/** Decode exactly one layer. The result is plain text, never trusted HTML. */
export function decodeHtmlText(value) {
  return decodeHTML(String(value ?? ""));
}

export function decodeXmlText(value) {
  return decodeXML(String(value ?? ""));
}

/**
 * Extract readable text with an HTML parser rather than treating a tag regex as
 * a sanitizer. Do not reinterpret the returned text as HTML: encoded markup is
 * deliberately retained as literal text and entity decoding happens once.
 */
export function htmlToText(value, { separator = "" } = {}) {
  const root = parseFragment(String(value ?? ""));
  const pending = [...root.childNodes].reverse();
  const chunks = [];
  while (pending.length > 0) {
    const node = pending.pop();
    if (node.nodeName === "#text") chunks.push(node.value);
    else if ("tagName" in node && ["script", "style", "noscript", "template"].includes(node.tagName)) {
      chunks.push(separator);
    } else if ("childNodes" in node) {
      if (separator) chunks.push(separator);
      for (let index = node.childNodes.length - 1; index >= 0; index -= 1) {
        pending.push(node.childNodes[index]);
      }
    }
  }
  return chunks.join(separator);
}
