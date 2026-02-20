import { ComponentStorage } from '../ecs/Component';
import type { BrainState } from '../brain/CTRNN';

export interface BrainData {
  brain: BrainState;
}

export const BrainStore = new ComponentStorage<BrainData>();
