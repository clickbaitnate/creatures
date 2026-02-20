import { ComponentStorage } from '../ecs/Component';
import type { CreatureGenome } from '../genome/Genome';

export interface GenomeData {
  genome: CreatureGenome;
}

export const GenomeStore = new ComponentStorage<GenomeData>();
