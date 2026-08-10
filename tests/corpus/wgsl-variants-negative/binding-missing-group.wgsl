@binding(0) var<storage, read> source : array<u32>;

@compute @workgroup_size(1)
fn main() {
  let value = source[0];
}
