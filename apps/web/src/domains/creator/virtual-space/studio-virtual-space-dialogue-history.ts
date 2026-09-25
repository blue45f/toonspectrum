export interface StudioVirtualDialogueTurn {
  readonly id: string;
  readonly question: string;
  readonly answer: string;
  readonly createdAt: number;
}

const MAX_TURNS = 20;
const historyByNpc = new Map<string, readonly StudioVirtualDialogueTurn[]>();

function safeNpcId(value: string): string {
  return /^[a-z0-9][a-z0-9_-]{0,63}$/iu.test(value) ? value : "unknown";
}

function cleanText(value: string, max: number): string {
  return value.normalize("NFC").replace(/[\p{Cc}\p{Cf}]/gu, " ").replace(/\s+/gu, " ").trim().slice(0, max);
}

export function readStudioVirtualDialogueHistory(npcId: string): readonly StudioVirtualDialogueTurn[] {
  return historyByNpc.get(safeNpcId(npcId)) ?? Object.freeze([]);
}

export function appendStudioVirtualDialogueHistory(
  npcId: string,
  question: string,
  answer: string,
  now = Date.now(),
): readonly StudioVirtualDialogueTurn[] {
  const cleanQuestion = cleanText(question, 240);
  const cleanAnswer = cleanText(answer, 1_200);
  if (!cleanQuestion || !cleanAnswer) return readStudioVirtualDialogueHistory(npcId);
  const key = safeNpcId(npcId);
  const turn: StudioVirtualDialogueTurn = Object.freeze({
    id: `${Math.max(0, Math.floor(now)).toString(36)}-${(readStudioVirtualDialogueHistory(key).length + 1).toString(36)}`,
    question: cleanQuestion,
    answer: cleanAnswer,
    createdAt: Math.max(0, Math.floor(now)),
  });
  const next = Object.freeze([...readStudioVirtualDialogueHistory(key), turn].slice(-MAX_TURNS));
  historyByNpc.set(key, next);
  return next;
}

export function clearStudioVirtualDialogueHistory(npcId: string): void {
  historyByNpc.delete(safeNpcId(npcId));
}

export function speakStudioVirtualDialogue(text: string, lang = "ko-KR"): boolean {
  if (typeof window === "undefined" || !("speechSynthesis" in window) || typeof SpeechSynthesisUtterance === "undefined") return false;
  const clean = cleanText(text, 1_200);
  if (!clean) return false;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(clean);
  utterance.lang = lang;
  utterance.rate = .96;
  utterance.pitch = 1;
  window.speechSynthesis.speak(utterance);
  return true;
}
