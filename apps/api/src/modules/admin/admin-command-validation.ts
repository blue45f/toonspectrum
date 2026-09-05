import { BadRequestException } from "@nestjs/common";

/** Destructive commands require an explicit JSON boolean, not truthiness.
 * In particular, "false", 0, null, a missing field and arrays must not silently
 * switch content visibility or take the service into maintenance mode.
 */
export function requireAdminCommandBoolean(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") {
    throw new BadRequestException({
      error: `${field} 값은 true 또는 false여야 해요.`,
    });
  }
  return value;
}
