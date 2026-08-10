fn invalid_shift(value : u32) -> u32 {
  return value << 32u;
}

@compute @workgroup_size(1)
fn main() {
  let value = invalid_shift(1u);
}
