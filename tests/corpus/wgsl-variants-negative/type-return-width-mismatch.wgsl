fn wrong_width() -> vec4<f32> {
  return vec3<f32>(1.0, 2.0, 3.0);
}

@compute @workgroup_size(1)
fn main() {
  let value = wrong_width();
}
