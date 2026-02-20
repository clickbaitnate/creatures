import { ComponentStorage } from '../ecs/Component';

export const enum LifeStage {
  Alive = 0,
  Dead = 1,
}

export interface LifecycleData {
  age: number;         // ticks lived
  stage: LifeStage;
  maxAge: number;      // from genome
  reproductionCooldown: number; // ticks until can reproduce again
}

export function createLifecycle(maxAge: number): LifecycleData {
  return {
    age: 0,
    stage: LifeStage.Alive,
    maxAge,
    reproductionCooldown: 0,
  };
}

export const LifecycleStore = new ComponentStorage<LifecycleData>();
