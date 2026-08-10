@group(0) @binding(0) var output_texture : texture_storage_2d<rgba8unorm, write>;

@compute @workgroup_size(1)
fn main() {
  let value = textureLoad(output_texture, vec2<i32>(0, 0));
}
