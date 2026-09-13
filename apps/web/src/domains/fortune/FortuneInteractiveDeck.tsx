import { useState } from "react";
import type { CSSProperties } from "react";
import { Shuffle } from "lucide-react";
import { shuffleFortuneDeck } from "./fortune-cinematic-model";

interface FortuneInteractiveDeckProps {
  value: number | null;
  onChange: (value: number | null) => void;
  three: boolean;
}

export function FortuneInteractiveDeck({ value, onChange, three }: FortuneInteractiveDeckProps) {
  const [order, setOrder] = useState(() => Array.from({ length: 22 }, (_, i) => i));
  const [shuffleCount, setShuffleCount] = useState(0);
  const shuffle = () => { setOrder(shuffleFortuneDeck()); setShuffleCount((count) => count + 1); onChange(null); };
  return <fieldset className="fo-tarot-picker fo-deck">
    <legend>마음이 가는 카드 뒷면을 골라 주세요</legend>
    <div className="fo-deck-actions"><p>{three ? "한 장을 고르면 과거·현재·미래의 세 장이 펼쳐져요." : "스물두 장 중, 오늘 마음에 닿는 한 장."}<small>카드 번호가 해석을 결정해요. 같은 날·같은 번호는 같은 결과입니다.</small></p><button type="button" className="fo-button" onClick={shuffle}><Shuffle size={16} />카드 섞기</button></div>
    <div className="fo-deck-track" key={shuffleCount} aria-label="22장의 카드 선택">
      {order.map((number, index) => <label className="fo-deck-card" key={number} data-selected={value === number} style={{ "--fo-card-angle": `${(index % 5 - 2) * 1.3}deg`, "--fo-card-delay": `${Math.min(index, 7) * 25}ms` } as CSSProperties}>
        <input type="radio" name="fo-card" value={number} checked={value === number} onChange={() => onChange(number)} required aria-label={`${number + 1}번 카드`} />
        <span className="fo-deck-back" aria-hidden="true"><span>✦</span><i /><b>STORY<br />WITHIN</b></span><small>{number + 1}번</small>
      </label>)}
    </div>
    <p className="fo-deck-status" role="status">{value === null ? (shuffleCount ? "카드의 배치가 바뀌었어요. 한 장을 다시 골라 주세요." : "옆으로 넘겨 살펴보고, 한 장을 선택하세요.") : `${value + 1}번 카드를 골랐어요. 아래 버튼으로 이야기를 펼쳐 보세요.`}</p>
  </fieldset>;
}
