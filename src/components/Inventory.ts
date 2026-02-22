import { ComponentStorage } from '../ecs/Component';

export const enum ItemType {
  None = -1,
  RawBerry = 0,
  RawGrass = 1,
  RawRoot = 2,
  RawWood = 3,
  RawStone = 4,
  RawOre = 5,
  RawMeat = 6,
  Plank = 10,
  CutStone = 11,
  MetalIngot = 12,
  StoneAxe = 13,
  StonePick = 14,
  MetalAxe = 15,
  MetalPick = 16,
  FoodBundle = 17,
  Coal = 20,
  RawIron = 21,
  RawGold = 22,
  IronIngot = 23,
  GoldIngot = 24,
  Torch = 25,
  IronSword = 26,
  IronArmor = 27,
  SaplingItem = 28,
  Boat = 30,
  CraftingTableItem = 31,
  WoodSword = 32,
  StoneSword = 33,
  Shield = 34,
  Ship = 35,
  RawFish = 36,
  CookedMeat = 37,
  CookedBerry = 38,
  CookedFish = 39,
  LargeMeat = 40,
}

export const ITEM_NAMES: Partial<Record<ItemType, string>> = {
  [ItemType.RawBerry]: 'Berry',
  [ItemType.RawGrass]: 'Grass',
  [ItemType.RawRoot]: 'Root',
  [ItemType.RawWood]: 'Wood',
  [ItemType.RawStone]: 'Stone',
  [ItemType.RawOre]: 'Ore',
  [ItemType.RawMeat]: 'Meat',
  [ItemType.Plank]: 'Plank',
  [ItemType.CutStone]: 'CutStone',
  [ItemType.MetalIngot]: 'Ingot',
  [ItemType.StoneAxe]: 'StoneAxe',
  [ItemType.StonePick]: 'StonePick',
  [ItemType.MetalAxe]: 'MetalAxe',
  [ItemType.MetalPick]: 'MetalPick',
  [ItemType.FoodBundle]: 'FoodBundle',
  [ItemType.Coal]: 'Coal',
  [ItemType.RawIron]: 'RawIron',
  [ItemType.RawGold]: 'RawGold',
  [ItemType.IronIngot]: 'IronIngot',
  [ItemType.GoldIngot]: 'GoldIngot',
  [ItemType.Torch]: 'Torch',
  [ItemType.IronSword]: 'IronSword',
  [ItemType.IronArmor]: 'IronArmor',
  [ItemType.SaplingItem]: 'Sapling',
  [ItemType.Boat]: 'Boat',
  [ItemType.CraftingTableItem]: 'CraftTable',
  [ItemType.WoodSword]: 'WoodSword',
  [ItemType.StoneSword]: 'StoneSword',
  [ItemType.Shield]: 'Shield',
  [ItemType.Ship]: 'Ship',
  [ItemType.RawFish]: 'RawFish',
  [ItemType.CookedMeat]: 'CookedMeat',
  [ItemType.CookedBerry]: 'CookedBerry',
  [ItemType.CookedFish]: 'CookedFish',
  [ItemType.LargeMeat]: 'LargeMeat',
};

export const MAX_SLOTS = 6;
export const MAX_STACK = 10;

export interface InventorySlot {
  item: ItemType;
  count: number;
}

export interface InventoryData {
  slots: InventorySlot[];
  equippedTool: ItemType; // ItemType.None if nothing equipped
  gatherTarget: number;   // cell index, -1 if not gathering
  gatherProgress: number; // 0-1
}

export function createInventory(): InventoryData {
  return {
    slots: [
      { item: ItemType.RawBerry, count: 1 }, // minimal start — must forage to survive
      ...Array.from({ length: MAX_SLOTS - 1 }, () => ({ item: ItemType.None, count: 0 })),
    ],
    equippedTool: ItemType.None,
    gatherTarget: -1,
    gatherProgress: 0,
  };
}

/** Try to add an item to inventory. Returns true if successful. */
export function addItem(inv: InventoryData, item: ItemType, count: number = 1): boolean {
  // Try to stack onto existing slot
  for (const slot of inv.slots) {
    if (slot.item === item && slot.count < MAX_STACK) {
      const space = MAX_STACK - slot.count;
      const toAdd = Math.min(count, space);
      slot.count += toAdd;
      count -= toAdd;
      if (count <= 0) return true;
    }
  }
  // Try empty slot
  for (const slot of inv.slots) {
    if (slot.item === ItemType.None) {
      const toAdd = Math.min(count, MAX_STACK);
      slot.item = item;
      slot.count = toAdd;
      count -= toAdd;
      if (count <= 0) return true;
    }
  }
  return count <= 0;
}

/** Remove items from inventory. Returns number actually removed. */
export function removeItem(inv: InventoryData, item: ItemType, count: number = 1): number {
  let removed = 0;
  for (const slot of inv.slots) {
    if (slot.item === item) {
      const toRemove = Math.min(count - removed, slot.count);
      slot.count -= toRemove;
      removed += toRemove;
      if (slot.count <= 0) {
        slot.item = ItemType.None;
        slot.count = 0;
      }
      if (removed >= count) break;
    }
  }
  return removed;
}

/** Count total of a specific item type */
export function countItem(inv: InventoryData, item: ItemType): number {
  let total = 0;
  for (const slot of inv.slots) {
    if (slot.item === item) total += slot.count;
  }
  return total;
}

/** Check if inventory has space for at least one more item */
export function hasSpace(inv: InventoryData): boolean {
  for (const slot of inv.slots) {
    if (slot.item === ItemType.None) return true;
    if (slot.count < MAX_STACK) return true;
  }
  return false;
}

/** Check if any food items in inventory */
export function hasFood(inv: InventoryData): boolean {
  for (const slot of inv.slots) {
    if (isFood(slot.item) && slot.count > 0) return true;
  }
  return false;
}

/** Get total item count across all slots */
export function totalItems(inv: InventoryData): number {
  let total = 0;
  for (const slot of inv.slots) {
    if (slot.item !== ItemType.None) total += slot.count;
  }
  return total;
}

export function isFood(item: ItemType): boolean {
  return item === ItemType.RawBerry || item === ItemType.RawGrass ||
         item === ItemType.RawRoot || item === ItemType.RawMeat ||
         item === ItemType.FoodBundle || item === ItemType.RawFish ||
         item === ItemType.CookedMeat || item === ItemType.CookedBerry ||
         item === ItemType.CookedFish || item === ItemType.LargeMeat;
}

export function isTool(item: ItemType): boolean {
  return item === ItemType.StoneAxe || item === ItemType.StonePick ||
         item === ItemType.MetalAxe || item === ItemType.MetalPick;
}

export function isWeapon(item: ItemType): boolean {
  return item === ItemType.IronSword || item === ItemType.WoodSword || item === ItemType.StoneSword;
}

export function isArmor(item: ItemType): boolean {
  return item === ItemType.IronArmor || item === ItemType.Shield;
}

export function hasWeapon(inv: InventoryData): boolean {
  for (const slot of inv.slots) {
    if (isWeapon(slot.item) && slot.count > 0) return true;
  }
  return false;
}

export function hasArmor(inv: InventoryData): boolean {
  for (const slot of inv.slots) {
    if (isArmor(slot.item) && slot.count > 0) return true;
  }
  return false;
}

/** Damage multiplier for weapon types */
export const WEAPON_DAMAGE: Partial<Record<ItemType, number>> = {
  [ItemType.WoodSword]: 1.3,
  [ItemType.StoneSword]: 1.6,
  [ItemType.IronSword]: 2.0,
};

/** Damage reduction for armor types */
export const ARMOR_REDUCTION: Partial<Record<ItemType, number>> = {
  [ItemType.IronArmor]: 0.4,
  [ItemType.Shield]: 0.25,
};

/** Get the best weapon from inventory and its damage multiplier */
export function getBestWeapon(inv: InventoryData): { item: ItemType; damage: number } {
  let best = { item: ItemType.None, damage: 1.0 };
  for (const slot of inv.slots) {
    if (isWeapon(slot.item) && slot.count > 0) {
      const dmg = WEAPON_DAMAGE[slot.item] ?? 1.0;
      if (dmg > best.damage) best = { item: slot.item, damage: dmg };
    }
  }
  return best;
}

/** Get total armor damage reduction from inventory */
export function getArmorReduction(inv: InventoryData): number {
  let reduction = 0;
  for (const slot of inv.slots) {
    if (isArmor(slot.item) && slot.count > 0) {
      reduction += ARMOR_REDUCTION[slot.item] ?? 0;
    }
  }
  return Math.min(reduction, 0.6); // cap at 60% reduction
}

export const InventoryStore = new ComponentStorage<InventoryData>();
