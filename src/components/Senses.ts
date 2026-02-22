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

  // Resource grid tile sensing
  nearestResourceAngle: number;
  nearestResourceDist: number;
  nearestResourceType: number;
  nearestResourceAmount: number;
  nearestResourceCell: number;
  resourceVisible: boolean;

  // Tile underfoot
  currentBiome: number;
  currentResource: number;
  currentResourceAmount: number;
  currentCell: number;

  // Building sensing
  nearestBuildingAngle: number;
  nearestBuildingDist: number;
  nearestBuildingType: number;
  nearestBuildingFaction: number;
  buildingVisible: boolean;
  nearestBuildingId: number;

  // Threat sensing
  nearestThreatAngle: number;
  nearestThreatDist: number;
  threatLevel: number;
  threatVisible: boolean;

  // Prey sensing
  nearestPreyAngle: number;
  nearestPreyDist: number;
  nearestPreyType: number;
  preyVisible: boolean;
  nearestPreyIndex: number;

  // Monster sensing
  monsterVisible: boolean;
  nearestMonsterDist: number;  // 0-1 normalized
  nearestMonsterAngle: number; // -1 to 1
  nearestMonsterIndex: number; // index in MonsterManager arrays
  nearestMonsterType: number;

  // Campfire sensing
  nearestCampfireAngle: number; // -1 to 1
  nearestCampfireDist: number;  // 0-1 normalized
  campfireVisible: boolean;
  nearestCampfireId: number;

  // Crowd sensing
  crowdDensity: number;        // 0-1, capped at 8 neighbors within 12 units
  nearbyFactionCount: number;  // same-faction creatures within 12 units
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

    nearestResourceAngle: 0,
    nearestResourceDist: 1,
    nearestResourceType: 0,
    nearestResourceAmount: 0,
    nearestResourceCell: -1,
    resourceVisible: false,

    currentBiome: 0,
    currentResource: 0,
    currentResourceAmount: 0,
    currentCell: -1,

    nearestBuildingAngle: 0,
    nearestBuildingDist: 1,
    nearestBuildingType: -1,
    nearestBuildingFaction: -1,
    buildingVisible: false,
    nearestBuildingId: -1,

    nearestThreatAngle: 0,
    nearestThreatDist: 1,
    threatLevel: 0,
    threatVisible: false,

    nearestPreyAngle: 0,
    nearestPreyDist: 1,
    nearestPreyType: -1,
    preyVisible: false,
    nearestPreyIndex: -1,

    monsterVisible: false,
    nearestMonsterDist: 1,
    nearestMonsterAngle: 0,
    nearestMonsterIndex: -1,
    nearestMonsterType: -1,

    nearestCampfireAngle: 0,
    nearestCampfireDist: 1,
    campfireVisible: false,
    nearestCampfireId: -1,

    crowdDensity: 0,
    nearbyFactionCount: 0,
  };
}

export const SensesStore = new ComponentStorage<SensesData>();
