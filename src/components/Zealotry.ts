import { ComponentStorage } from '../ecs/Component';

export interface ZealotryData {
  zealotry: number;      // 0-1 — how devout
  deity: number;         // god ID (-1 = none, 0 = player)
  witnessed: string[];   // emojis of actions witnessed during possession (max 5)
  faithDecay: number;    // rate of zealotry decay when god not present
}

export function createZealotry(): ZealotryData {
  return {
    zealotry: 0,
    deity: -1,
    witnessed: [],
    faithDecay: 0.001,
  };
}

export const ZealotryStore = new ComponentStorage<ZealotryData>();
