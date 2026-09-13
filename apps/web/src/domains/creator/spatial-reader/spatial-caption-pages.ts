/** Four bounded body lines leave one line for the in-world title on a 1024x256 label. */
export function spatialCaptionPages(text: string): string[] {
  const lines: string[] = [];
  for (const paragraph of text.replace(/\r\n?/gu, "\n").split("\n")) {
    const characters = Array.from(paragraph);
    if (!characters.length) lines.push("");
    for (let offset = 0; offset < characters.length; offset += 28) lines.push(characters.slice(offset, offset + 28).join(""));
  }
  const pages: string[] = [];
  for (let offset = 0; offset < lines.length; offset += 4) pages.push(lines.slice(offset, offset + 4).join("\n"));
  return pages.length ? pages : [""];
}
