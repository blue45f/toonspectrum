import type { CreatorMarketplaceResourceRecord } from "@/lib/creator-marketplace-resource-contract";

const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/u;

/**
 * 팔레트 리소스의 portable JSON definition에서 실제 색상 배열을 꺼낸다.
 * 계약상 colors는 중복 없는 소문자 #rrggbb 1~64개이지만, 저장 시점 버전 차이에
 * 대비해 여기서 한 번 더 방어적으로 검증한다. 팔레트가 아니면 null.
 */
export function palettePreviewColors(
  record: CreatorMarketplaceResourceRecord
): readonly string[] | null {
  if (record.kind !== "palette") return null;
  for (const entry of record.entries) {
    if (entry.delivery.mode !== "portable-json") continue;
    const definition = entry.delivery.payload.definition as { colors?: unknown };
    const colors = definition?.colors;
    if (
      Array.isArray(colors)
      && colors.length > 0
      && colors.every((color) => typeof color === "string" && HEX_COLOR_PATTERN.test(color))
    ) {
      return colors;
    }
  }
  return null;
}
