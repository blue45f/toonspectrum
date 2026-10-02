/**
 * VRM 소품 GLB 에셋 매핑과 지오메트리 소스 판정.
 *
 * Blender로 제작해 public 번들에 포함한 소품의 안정적인 직렬화 ID → GLB 경로 매핑을
 * 들고, 소품 ID가 GLB 에셋을 가지면 gltf 소스를, 아니면 절차형 소스를 돌려준다.
 * (2026-10-03 파일 크기 래칫 해소로 studio-vrm-props에서 추출 — 동작 변경 없음.)
 */

import type { PropGeometrySource, PropGltfAssetUrl } from "./studio-vrm-props";

/** Blender로 제작해 public 번들에 포함한 소품의 안정적인 직렬화 ID → GLB 경로 매핑. */
export const BLENDER_PROP_GLTF_URLS = Object.freeze({
  mic: "/assets/3d/atelier_microphone.glb",
  beret: "/assets/3d/atelier_beret.glb",
  sunglasses: "/assets/3d/atelier_sunglasses.glb",
  headphones: "/assets/3d/atelier_headphones.glb",
  ribbon: "/assets/3d/atelier_ribbon.glb",
  beanie: "/assets/3d/atelier_beanie.glb",
  camera: "/assets/3d/atelier_camera.glb",
  medicalBag: "/assets/3d/atelier_medical_bag.glb",
  shoulderbag: "/assets/3d/atelier_shoulder_bag.glb",
  // Recommended-row stable IDs. Existing documents keep their IDs and rig profiles while the
  // renderer upgrades only their geometry source. The legacy blender phone ID below remains
  // resolvable and deliberately shares the same decoded GLB cache entry.
  smartphone: "/assets/3d/modern_smartphone_prop.glb",
  mug: "/assets/3d/everyday_mug.glb",
  book: "/assets/3d/everyday_book.glb",
  cap: "/assets/3d/everyday_cap.glb",
  glasses: "/assets/3d/everyday_glasses.glb",
  backpack: "/assets/3d/everyday_backpack.glb",
  stethoscope: "/assets/3d/medical_stethoscope.glb",
  blender_cyber_katana: "/assets/3d/cyber_katana.glb",
  blender_magic_staff: "/assets/3d/magic_staff_crystal.glb",
  blender_scifi_drone: "/assets/3d/scifi_drone_bot.glb",
  blender_neon_bench: "/assets/3d/neom_bench_prop.glb",
  blender_cyber_visor: "/assets/3d/cyber_helmet_visor.glb",
  blender_holo_tablet: "/assets/3d/hologram_tablet.glb",
  blender_rune_shield: "/assets/3d/ancient_rune_shield.glb",
  blender_arcade_cabinet: "/assets/3d/arcade_game_cabinet.glb",
  blender_medieval_greatsword: "/assets/3d/medieval_greatsword.glb",
  blender_cyber_hoverbike: "/assets/3d/cyberpunk_hoverbike.glb",
  blender_magic_chest: "/assets/3d/fantasy_magic_chest.glb",
  blender_modern_smartphone: "/assets/3d/modern_smartphone_prop.glb",
  blender_cyber_sniper_rifle: "/assets/3d/cyber_sniper_rifle.glb",
  blender_magic_wand_staff: "/assets/3d/fantasy_magic_wand_staff.glb",
  blender_steampunk_airship: "/assets/3d/steampunk_airship.glb",
  blender_cyberpunk_motorcycle: "/assets/3d/cyberpunk_motorcycle.glb",
  blender_scifi_laser_gun: "/assets/3d/scifi_laser_gun.glb",
  blender_magic_grimoire: "/assets/3d/magic_grimoire.glb",
  blender_cyber_glasses: "/assets/3d/cyber_glasses.glb",
  blender_medieval_shield: "/assets/3d/medieval_shield.glb",
  blender_street_lamp: "/assets/3d/street_lamp.glb",
  blender_vending_machine: "/assets/3d/vending_machine.glb",
  blender_royal_throne: "/assets/3d/royal_throne.glb",
  blender_crystal_orb: "/assets/3d/crystal_orb.glb",
  blender_tactical_helmet: "/assets/3d/tactical_helmet.glb",
  blender_school_desk: "/assets/3d/school_desk.glb",
  blender_adaptive_power_wheelchair: "/assets/3d/adaptive_power_wheelchair.glb",
  blender_ramen_bowl: "/assets/3d/ramen_bowl.glb",
  blender_ice_cream_cone: "/assets/3d/ice_cream_cone.glb",
  blender_bubble_tea: "/assets/3d/bubble_tea.glb",
  blender_paper_lantern: "/assets/3d/paper_lantern.glb",
  blender_potted_monstera: "/assets/3d/potted_monstera.glb",
  blender_bonsai_tree: "/assets/3d/bonsai_tree.glb",
  blender_street_food_cart: "/assets/3d/street_food_cart.glb",
  blender_traffic_light: "/assets/3d/traffic_light.glb",
  blender_mailbox: "/assets/3d/mailbox.glb",
  blender_grandfather_clock: "/assets/3d/grandfather_clock.glb",
  blender_fireplace: "/assets/3d/fireplace.glb",
  blender_bathtub: "/assets/3d/bathtub.glb",
  blender_kitchen_stove: "/assets/3d/kitchen_stove.glb",
  blender_campfire: "/assets/3d/campfire.glb",
  blender_wishing_well: "/assets/3d/wishing_well.glb",
  blender_robot_pet: "/assets/3d/robot_pet.glb",
  blender_mech_turret: "/assets/3d/mech_turret.glb",
  blender_fox_mask: "/assets/3d/fox_mask.glb",
  blender_wizard_hat: "/assets/3d/wizard_hat.glb",
  blender_tea_set: "/assets/3d/tea_set.glb",
  blender_hanging_sign: "/assets/3d/hanging_sign.glb",
} as const satisfies Readonly<Record<string, PropGltfAssetUrl>>);

const PROCEDURAL_PROP_GEOMETRY_SOURCE = Object.freeze({ kind: "procedural" } as const);

export function geometrySourceForPropId(id: string): PropGeometrySource {
  const url = (BLENDER_PROP_GLTF_URLS as Readonly<Record<string, PropGltfAssetUrl>>)[id];
  return url ? Object.freeze({ kind: "gltf" as const, url }) : PROCEDURAL_PROP_GEOMETRY_SOURCE;
}
