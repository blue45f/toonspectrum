/** Compare deposited material after removing each recipe's own unpainted paper. */
export function brushV6InkField(painted: Uint8ClampedArray, paper: Uint8ClampedArray): Float32Array {
  if (painted.length !== paper.length || painted.length % 4 !== 0) {
    throw new Error("brush pixel buffers must have matching RGBA dimensions");
  }
  const field = new Float32Array(painted.length / 4);
  for (let pixel = 0; pixel < field.length; pixel += 1) {
    const offset = pixel * 4;
    // Absolute RGB change also detects light pigments. Alpha matters for water/lift tools.
    const color = (Math.abs(painted[offset]! - paper[offset]!)
      + Math.abs(painted[offset + 1]! - paper[offset + 1]!)
      + Math.abs(painted[offset + 2]! - paper[offset + 2]!)) / 3;
    field[pixel] = Math.max(color, Math.abs(painted[offset + 3]! - paper[offset + 3]!)) / 255;
  }
  return field;
}

/** Symmetric material distance; dividing each field by its mass removes opacity scaling. */
export function brushV6InkDistance(first: Float32Array, second: Float32Array): number {
  if (first.length !== second.length) throw new Error("brush ink fields must have matching dimensions");
  const firstMass = first.reduce((sum, value) => sum + value, 0);
  const secondMass = second.reduce((sum, value) => sum + value, 0);
  if (firstMass === 0 || secondMass === 0) return firstMass === secondMass ? 0 : 1;
  let distance = 0;
  for (let index = 0; index < first.length; index += 1) {
    distance += Math.abs(first[index]! / firstMass - second[index]! / secondMass);
  }
  return distance / 2;
}

export function brushV6InkStatistics(field: Float32Array): { paintedPixels: number; inkMass: number } {
  let paintedPixels = 0;
  let inkMass = 0;
  for (const ink of field) {
    if (ink > 3 / 255) paintedPixels += 1;
    inkMass += ink;
  }
  return { paintedPixels, inkMass };
}
