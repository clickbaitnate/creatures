// Combat component: holds CombatNet state and tactical combat tracking.

import { ComponentStorage } from '../ecs/Component';
import { createCombatNet, type CombatNetState } from '../brain/CombatNet';

export interface CombatData {
  net: CombatNetState;
  inCombat: boolean;
  combatTicks: number;       // how long in current combat
  recentDamage: number;      // exponential decay, spikes on hit
  callingForHelp: boolean;   // set by combat net, read by allies
  noCombatTicks: number;     // ticks since last threat (for combat exit)
  combatReward: number;      // accumulated reward for learning
  startHealth: number;       // health at combat start
}

export function createCombat(
  weightsIH?: number[],
  biasH?: number[],
  weightsHO?: number[],
  biasO?: number[],
): CombatData {
  return {
    net: createCombatNet(weightsIH, biasH, weightsHO, biasO),
    inCombat: false,
    combatTicks: 0,
    recentDamage: 0,
    callingForHelp: false,
    noCombatTicks: 0,
    combatReward: 0,
    startHealth: 1,
  };
}

export const CombatStore = new ComponentStorage<CombatData>();
