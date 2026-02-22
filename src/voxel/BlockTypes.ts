// Block type definitions for the voxel world.

import { ItemType } from '../components/Inventory';

export const enum Block {
  Air = 0,
  Dirt = 1,
  Grass = 2,
  Stone = 3,
  Sand = 4,
  Gravel = 5,
  Water = 6,
  Snow = 7,
  Clay = 8,
  Wood = 9,
  Plank = 10,
  Cobblestone = 11,
  StoneBrick = 12,
  Glass = 13,
  Thatch = 14,
  OreBlock = 15,
  Leaf = 16,
  Torch = 17,
  Flower = 18,
  Mushroom = 19,
  TallGrass = 20,
  BerryBush = 21,
  Coal = 22,
  IronOre = 23,
  GoldOre = 24,
  CraftingTable = 25,
  Furnace = 26,
  Sapling = 27,
  DarkGrass = 28,    // swamp biome
  DeadGrass = 29,    // dry/tundra border
  Cactus = 30,       // desert
  RedSand = 31,      // mesa/desert variant
  PackedIce = 32,    // tundra
  Campfire = 33,     // cooking station
}

export const BLOCK_COUNT = 34;

export interface BlockProps {
  color: number;       // RGB hex
  solid: boolean;
  transparent: boolean;
  mineable: boolean;
  mineYield: ItemType | null;
  mineTicks: number;   // ticks to mine
  emissive: boolean;   // emits light (torches, furnaces)
}

// prettier-ignore
export const BLOCK_PROPS: BlockProps[] = [
  /* Air          */ { color: 0x000000, solid: false, transparent: true,  mineable: false, mineYield: null,              mineTicks: 0,  emissive: false },
  /* Dirt         */ { color: 0x8B6914, solid: true,  transparent: false, mineable: true,  mineYield: null,              mineTicks: 15, emissive: false },
  /* Grass        */ { color: 0x4CAF50, solid: true,  transparent: false, mineable: true,  mineYield: null,              mineTicks: 15, emissive: false },
  /* Stone        */ { color: 0x808080, solid: true,  transparent: false, mineable: true,  mineYield: ItemType.RawStone, mineTicks: 50, emissive: false },
  /* Sand         */ { color: 0xE8D68E, solid: true,  transparent: false, mineable: true,  mineYield: null,              mineTicks: 10, emissive: false },
  /* Gravel       */ { color: 0xA0A0A0, solid: true,  transparent: false, mineable: true,  mineYield: ItemType.RawStone, mineTicks: 20, emissive: false },
  /* Water        */ { color: 0x2266CC, solid: false, transparent: true,  mineable: false, mineYield: null,              mineTicks: 0,  emissive: false },
  /* Snow         */ { color: 0xF0F0FF, solid: true,  transparent: false, mineable: true,  mineYield: null,              mineTicks: 8,  emissive: false },
  /* Clay         */ { color: 0xC4A882, solid: true,  transparent: false, mineable: true,  mineYield: null,              mineTicks: 18, emissive: false },
  /* Wood         */ { color: 0x8B5A2B, solid: true,  transparent: false, mineable: true,  mineYield: ItemType.RawWood,  mineTicks: 40, emissive: false },
  /* Plank        */ { color: 0xC4A050, solid: true,  transparent: false, mineable: true,  mineYield: ItemType.RawWood,  mineTicks: 20, emissive: false },
  /* Cobblestone  */ { color: 0x6B6B6B, solid: true,  transparent: false, mineable: true,  mineYield: ItemType.RawStone, mineTicks: 45, emissive: false },
  /* StoneBrick   */ { color: 0x909090, solid: true,  transparent: false, mineable: true,  mineYield: ItemType.CutStone, mineTicks: 50, emissive: false },
  /* Glass        */ { color: 0xCCEEFF, solid: true,  transparent: true,  mineable: true,  mineYield: null,              mineTicks: 5,  emissive: false },
  /* Thatch       */ { color: 0xD4B85C, solid: true,  transparent: false, mineable: true,  mineYield: ItemType.RawGrass, mineTicks: 10, emissive: false },
  /* OreBlock     */ { color: 0xB87333, solid: true,  transparent: false, mineable: true,  mineYield: ItemType.RawOre,   mineTicks: 50, emissive: false },
  /* Leaf         */ { color: 0x2D7D2D, solid: true,  transparent: true,  mineable: true,  mineYield: null,              mineTicks: 5,  emissive: false },
  /* Torch        */ { color: 0xFFCC33, solid: false, transparent: true,  mineable: true,  mineYield: null,              mineTicks: 2,  emissive: true  },
  /* Flower       */ { color: 0xFF6699, solid: false, transparent: true,  mineable: true,  mineYield: null,              mineTicks: 2,  emissive: false },
  /* Mushroom     */ { color: 0xCC3344, solid: false, transparent: true,  mineable: true,  mineYield: ItemType.RawRoot,  mineTicks: 2,  emissive: false },
  /* TallGrass    */ { color: 0x6B8E23, solid: false, transparent: true,  mineable: true,  mineYield: ItemType.RawGrass, mineTicks: 10, emissive: false },
  /* BerryBush    */ { color: 0x228B22, solid: true,  transparent: false, mineable: true,  mineYield: ItemType.RawBerry, mineTicks: 20, emissive: false },
  /* Coal         */ { color: 0x333333, solid: true,  transparent: false, mineable: true,  mineYield: ItemType.Coal,     mineTicks: 35, emissive: false },
  /* IronOre      */ { color: 0xA0522D, solid: true,  transparent: false, mineable: true,  mineYield: ItemType.RawIron,  mineTicks: 45, emissive: false },
  /* GoldOre      */ { color: 0xDAA520, solid: true,  transparent: false, mineable: true,  mineYield: ItemType.RawGold,  mineTicks: 55, emissive: false },
  /* CraftingTable*/ { color: 0xB5651D, solid: true,  transparent: false, mineable: true,  mineYield: null,              mineTicks: 20, emissive: false },
  /* Furnace      */ { color: 0x696969, solid: true,  transparent: false, mineable: true,  mineYield: null,              mineTicks: 30, emissive: true  },
  /* Sapling      */ { color: 0x66AA44, solid: false, transparent: true,  mineable: true,  mineYield: null,              mineTicks: 2,  emissive: false },
  /* DarkGrass    */ { color: 0x2D5E2D, solid: true,  transparent: false, mineable: true,  mineYield: null,              mineTicks: 15, emissive: false },
  /* DeadGrass    */ { color: 0xA89860, solid: true,  transparent: false, mineable: true,  mineYield: null,              mineTicks: 12, emissive: false },
  /* Cactus       */ { color: 0x2D8B2D, solid: true,  transparent: false, mineable: true,  mineYield: ItemType.RawWood,  mineTicks: 15, emissive: false },
  /* RedSand      */ { color: 0xC2784E, solid: true,  transparent: false, mineable: true,  mineYield: null,              mineTicks: 10, emissive: false },
  /* PackedIce    */ { color: 0xA0D0F0, solid: true,  transparent: true,  mineable: true,  mineYield: null,              mineTicks: 25, emissive: false },
  /* Campfire     */ { color: 0xFF6600, solid: false, transparent: true,  mineable: true,  mineYield: null,              mineTicks: 5,  emissive: true  },
];

/** Map from ItemType to the Block it places during construction */
export const ITEM_TO_BLOCK: Partial<Record<ItemType, Block>> = {
  [ItemType.RawStone]:   Block.Cobblestone,
  [ItemType.CutStone]:   Block.StoneBrick,
  [ItemType.RawWood]:    Block.Wood,
  [ItemType.Plank]:      Block.Plank,
  [ItemType.RawOre]:     Block.OreBlock,
  [ItemType.RawGrass]:   Block.Thatch,
  [ItemType.CraftingTableItem]: Block.CraftingTable,
};

/** Map from Block to the ItemType needed to place it during construction */
export const BLOCK_TO_ITEM: Partial<Record<Block, ItemType>> = {
  [Block.StoneBrick]:    ItemType.CutStone,
  [Block.Cobblestone]:   ItemType.RawStone,
  [Block.Wood]:          ItemType.RawWood,
  [Block.Plank]:         ItemType.Plank,
  [Block.Glass]:         ItemType.CutStone,
  [Block.OreBlock]:      ItemType.RawOre,
  [Block.Thatch]:        ItemType.RawGrass,
  [Block.Dirt]:          ItemType.RawStone, // fallback
  [Block.Stone]:         ItemType.RawStone,
};
