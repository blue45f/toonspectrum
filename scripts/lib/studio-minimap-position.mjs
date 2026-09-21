import assert from "node:assert/strict";

/** Read the position actually painted on the public minimap, never DEV telemetry. */
export function parseStudioMinimapPosition(left, top) {
  const coordinate = (value) => {
    assert.equal(typeof value, "string", "Missing public minimap coordinate");
    assert(value.endsWith("%") && value.slice(0, -1).trim() !== "", "Minimap position must be a percentage");
    const number = Number(value.slice(0, -1));
    assert(Number.isFinite(number) && number >= 0 && number <= 100, "Invalid minimap coordinate");
    return number;
  };
  return [coordinate(left), coordinate(top)];
}
