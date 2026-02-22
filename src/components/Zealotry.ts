import { ComponentStorage } from '../ecs/Component';

export const enum CultStance {
  None = 0,
  Terror = 1,
  Awe = 2,
  Devotion = 3,
  Rebellion = 4,
}

export interface ZealotryData {
  zealotry: number;      // 0-1 — how devout
  deity: number;         // god ID (-1 = none, 0 = player)
  witnessed: string[];   // emojis of actions witnessed during possession (max 5)
  faithDecay: number;    // rate of zealotry decay when god not present
  // Cult gradient
  stance: CultStance;
  terror: number;        // 0-1 fear component
  awe: number;           // 0-1 wonder component
  devotion: number;      // 0-1 love/loyalty component
  rebellion: number;     // 0-1 resistance component
  timesLifted: number;   // how many god-hand interactions
  lastLiftTick: number;  // tick of last intervention (-1 = never)
  lastDropBiome: number; // biome where last dropped (-1 = never)
  displacementStress: number; // 0-1 stress from displacement
  divineFavor: number;   // -1 to 1
}

export function createZealotry(): ZealotryData {
  return {
    zealotry: 0,
    deity: -1,
    witnessed: [],
    faithDecay: 0.001,
    stance: CultStance.None,
    terror: 0,
    awe: 0,
    devotion: 0,
    rebellion: 0,
    timesLifted: 0,
    lastLiftTick: -1,
    lastDropBiome: -1,
    displacementStress: 0,
    divineFavor: 0,
  };
}

export const ZealotryStore = new ComponentStorage<ZealotryData>();
