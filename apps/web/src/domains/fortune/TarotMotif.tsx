import {
  Backpack, CarFront, Circle, CircleDot, Crown, Dumbbell, Flame, FlaskConical, Flower2,
  Globe2, Heart, KeyRound, Lamp, Megaphone, Moon, Orbit, RefreshCw, Scale, Star,
  Sun, TowerControl, WandSparkles, type LucideIcon,
} from "lucide-react";

const MOTIFS: readonly LucideIcon[] = [
  Backpack, WandSparkles, Moon, Flower2, Crown, KeyRound, Heart, CarFront, Dumbbell, Lamp,
  CircleDot, Scale, RefreshCw, Orbit, FlaskConical, Flame, TowerControl, Star, Circle, Sun,
  Megaphone, Globe2,
];

export function TarotMotif({ id, size = 56, strokeWidth = 1.65 }: { readonly id: number; readonly size?: number; readonly strokeWidth?: number }) {
  const Icon = MOTIFS[id] ?? Star;
  return <Icon width={size} height={size} strokeWidth={strokeWidth} aria-hidden />;
}
