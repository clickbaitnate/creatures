import { ComponentStorage } from '../ecs/Component';
import type { CreatureGenome } from '../genome/Genome';

export interface EggData {
  genome: CreatureGenome;
  hatchTimer: number;  // ticks until hatching
  parentFaction: number;
}

export const EggStore = new ComponentStorage<EggData>();
