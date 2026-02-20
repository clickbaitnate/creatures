import { ComponentStorage } from '../ecs/Component';

export interface SensesData {
  // Nearest food: relative angle (-1 to 1, left to right) and distance (0-1, near to far)
  nearestFoodAngle: number;
  nearestFoodDist: number;
  foodVisible: boolean;
  // Nearest creature
  nearestCreatureAngle: number;
  nearestCreatureDist: number;
  creatureVisible: boolean;
  // What entity is nearest food / creature
  nearestFoodId: number;
  nearestCreatureId: number;
}

export function createSenses(): SensesData {
  return {
    nearestFoodAngle: 0,
    nearestFoodDist: 1,
    foodVisible: false,
    nearestCreatureAngle: 0,
    nearestCreatureDist: 1,
    creatureVisible: false,
    nearestFoodId: -1,
    nearestCreatureId: -1,
  };
}

export const SensesStore = new ComponentStorage<SensesData>();
