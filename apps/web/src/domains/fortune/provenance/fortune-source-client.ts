import { api } from "@/platform/api";

import type { FortuneSign, SourcedFortune } from "../../../../../../packages/contracts/src/fortune-provenance";

/** Ready for the FortunePage owner to wire; no DOB/name and no hiring consumer. */
export function readSourcedZodiac(sign: FortuneSign): Promise<SourcedFortune> {
  return api.post<SourcedFortune>("/fortune/source/zodiac", { sign }, { timeout: 5000 });
}
