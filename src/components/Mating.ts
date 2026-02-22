import { ComponentStorage } from '../ecs/Component';
import { Sex } from '../genome/Genome';

export interface MatingData {
  sex: Sex;
  bondedPartner: number;      // entity ID, -1 if none
  bondStrength: number;        // 0-1, decays over time
  courtshipTarget: number;     // entity being courted, -1 if none
  courtshipProgress: number;   // 0-1
  attractiveness: number;      // computed each tick
}

export function createMating(sex: Sex): MatingData {
  return {
    sex,
    bondedPartner: -1,
    bondStrength: 0,
    courtshipTarget: -1,
    courtshipProgress: 0,
    attractiveness: 0,
  };
}

export const MatingStore = new ComponentStorage<MatingData>();
