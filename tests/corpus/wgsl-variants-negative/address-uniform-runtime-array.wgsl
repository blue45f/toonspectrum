struct BadUniform {
  values : array<u32>,
}

@group(0) @binding(0) var<uniform> data : BadUniform;

@compute @workgroup_size(1)
fn main() {
  let value = data.values[0];
}
