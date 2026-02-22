import { ComponentStorage } from '../ecs/Component';

export const enum BuildingType {
  Shelter = 0,   // reduces energy drain for nearby creatures
  Wall = 1,      // territory marker, slows enemies
  Monument = 2,  // boosts faction morale (reward chemical)
  Farm = 3,      // converts adjacent cells to Farmland
  Mine = 4,      // 2x extraction rate on tile
  Workshop = 5,  // enables advanced crafting
  Granary = 6,   // faction food storage
  Tower = 7,     // doubles sensory range for nearby faction
  Campfire = 8,  // cooking station + comfort aura
  Longhouse = 9, // communal housing (6 capacity)
}

export interface BuildingData {
  type: BuildingType;
  factionId: number;
  health: number;  // 0-1
  age: number;     // ticks since built
  storage: number; // for Granary: current food stored (0-20)
  workerCount: number;
  capacity: number;   // max occupants (Shelter=2, Longhouse=6)
  occupants: number;  // current occupants
  cookingQueue: number; // active cooking operations (Campfire)
}

export const BuildingStore = new ComponentStorage<BuildingData>();

export const BUILDING_NAMES: Record<BuildingType, string> = {
  [BuildingType.Shelter]: '🏠',
  [BuildingType.Wall]: '🧱',
  [BuildingType.Monument]: '🗿',
  [BuildingType.Farm]: '🌾',
  [BuildingType.Mine]: '⛏️',
  [BuildingType.Workshop]: '🔧',
  [BuildingType.Granary]: '🏪',
  [BuildingType.Tower]: '🗼',
  [BuildingType.Campfire]: '🔥',
  [BuildingType.Longhouse]: '🏛️',
};

// Resource costs for buildings: [RawWood, RawStone, Plank, CutStone]
import { ItemType } from './Inventory';

export interface BuildingCost {
  items: [ItemType, number][];
}

export const BUILDING_COSTS: Record<BuildingType, BuildingCost> = {
  [BuildingType.Shelter]:   { items: [[ItemType.RawWood, 2]] },
  [BuildingType.Wall]:      { items: [[ItemType.RawStone, 3]] },
  [BuildingType.Monument]:  { items: [[ItemType.RawStone, 4], [ItemType.RawWood, 2]] },
  [BuildingType.Farm]:      { items: [[ItemType.RawWood, 2], [ItemType.RawStone, 1]] },
  [BuildingType.Mine]:      { items: [[ItemType.RawWood, 3], [ItemType.RawStone, 2]] },
  [BuildingType.Workshop]:  { items: [[ItemType.RawWood, 4], [ItemType.RawStone, 3]] },
  [BuildingType.Granary]:   { items: [[ItemType.RawWood, 3], [ItemType.CutStone, 2]] },
  [BuildingType.Tower]:     { items: [[ItemType.RawStone, 4], [ItemType.Plank, 2]] },
  [BuildingType.Campfire]:  { items: [[ItemType.RawWood, 2], [ItemType.RawStone, 1]] },
  [BuildingType.Longhouse]: { items: [[ItemType.RawWood, 5]] },
};
