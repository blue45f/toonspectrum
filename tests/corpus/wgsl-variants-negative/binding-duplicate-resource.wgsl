@group(0) @binding(0) var<storage, read> source : array<u32>;
@group(0) @binding(0) var<storage, read_write> destination : array<u32>;

@compute @workgroup_size(1)
fn main() {
  destination[0] = source[0];
}
