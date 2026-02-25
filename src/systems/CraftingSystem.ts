import { System } from '../ecs/System';
import type { World } from '../ecs/World';
import { TransformStore } from '../components/Transform';
import { GenomeStore } from '../components/Genome';
import { BiochemStore } from '../components/Biochemistry';
import { LifecycleStore, LifeStage } from '../components/Lifecycle';
import { InventoryStore, countItem, removeItem, addItem, ItemType, hasSpace, hasFood } from '../components/Inventory';
import { BuildingStore, BuildingType } from '../components/Building';
import { VocabularyStore, ITEM_EMOJI, knows, learn } from '../components/Vocabulary';
import { ChemId } from '../biochemistry/ChemicalRegistry';
import { distSq, clamp } from '../utils/Math';
import type { VoxelWorld } from '../voxel/VoxelWorld';
import { Block } from '../voxel/BlockTypes';
import { BrainStore } from '../components/Brain';
import { SocialStore } from '../components/Social';
import { GoalStore, GoalType } from '../components/Goal';
import { simStats } from '../stats/SimStats';

interface Recipe {
  inputs: [ItemType, number][];
  output: ItemType;
  outputCount: number;
  requiresWorkshop: boolean;
  requiresCraftingTable: boolean;
  requiredKnowledge: string[]; // emojis creature must know to craft
}

const RECIPES: Recipe[] = [
  // Anywhere — no table needed
  { inputs: [[ItemType.RawBerry, 2], [ItemType.RawGrass, 1]], output: ItemType.FoodBundle, outputCount: 1, requiresWorkshop: false, requiresCraftingTable: false, requiredKnowledge: ['🍎', '🌿', '🍽️'] },
  { inputs: [[ItemType.RawGrass, 3]], output: ItemType.FoodBundle, outputCount: 1, requiresWorkshop: false, requiresCraftingTable: false, requiredKnowledge: ['🌿'] },
  { inputs: [[ItemType.RawWood, 4]], output: ItemType.CraftingTableItem, outputCount: 1, requiresWorkshop: false, requiresCraftingTable: false, requiredKnowledge: ['🪵'] },
  // Requires CraftingTable block nearby
  { inputs: [[ItemType.RawStone, 2], [ItemType.RawWood, 1]], output: ItemType.StoneAxe, outputCount: 1, requiresWorkshop: false, requiresCraftingTable: true, requiredKnowledge: ['🪨', '🪵'] },
  { inputs: [[ItemType.RawStone, 3]], output: ItemType.StonePick, outputCount: 1, requiresWorkshop: false, requiresCraftingTable: true, requiredKnowledge: ['🪨'] },
  { inputs: [[ItemType.RawWood, 3]], output: ItemType.WoodSword, outputCount: 1, requiresWorkshop: false, requiresCraftingTable: true, requiredKnowledge: ['🪵', '⚔️'] },
  { inputs: [[ItemType.RawStone, 2], [ItemType.RawWood, 1]], output: ItemType.StoneSword, outputCount: 1, requiresWorkshop: false, requiresCraftingTable: true, requiredKnowledge: ['🪨', '🪵', '⚔️'] },
  { inputs: [[ItemType.RawWood, 2], [ItemType.RawStone, 1]], output: ItemType.Shield, outputCount: 1, requiresWorkshop: false, requiresCraftingTable: true, requiredKnowledge: ['🪨', '🪵', '🛡️'] },
  // CraftingTable required (no workshop needed for basic processing)
  { inputs: [[ItemType.RawWood, 2]], output: ItemType.Plank, outputCount: 3, requiresWorkshop: false, requiresCraftingTable: true, requiredKnowledge: ['🪵'] },
  { inputs: [[ItemType.RawStone, 2]], output: ItemType.CutStone, outputCount: 2, requiresWorkshop: false, requiresCraftingTable: true, requiredKnowledge: ['🪨'] },
  // Metal tools: workshop + crafting table (use IronIngot)
  { inputs: [[ItemType.IronIngot, 1], [ItemType.RawWood, 1]], output: ItemType.MetalAxe, outputCount: 1, requiresWorkshop: true, requiresCraftingTable: true, requiredKnowledge: ['⚙️', '🪵'] },
  { inputs: [[ItemType.IronIngot, 1], [ItemType.RawWood, 1]], output: ItemType.MetalPick, outputCount: 1, requiresWorkshop: true, requiresCraftingTable: true, requiredKnowledge: ['⚙️', '🪵'] },
  // Boat: crafting table only (water crossing is essential)
  { inputs: [[ItemType.Plank, 3], [ItemType.RawWood, 2]], output: ItemType.Boat, outputCount: 1, requiresWorkshop: false, requiresCraftingTable: true, requiredKnowledge: ['💧', '🪵'] },
  // Ship: larger vessel
  { inputs: [[ItemType.Plank, 5], [ItemType.RawWood, 3]], output: ItemType.Ship, outputCount: 1, requiresWorkshop: true, requiresCraftingTable: true, requiredKnowledge: ['💧', '🪵', '⛵'] },
  // Torch: no table needed
  { inputs: [[ItemType.Coal, 1], [ItemType.RawWood, 1]], output: ItemType.Torch, outputCount: 2, requiresWorkshop: false, requiresCraftingTable: false, requiredKnowledge: ['🔥', '🪵'] },
  // Smelting: workshop + crafting table required
  { inputs: [[ItemType.RawIron, 2], [ItemType.Coal, 1]], output: ItemType.IronIngot, outputCount: 1, requiresWorkshop: true, requiresCraftingTable: true, requiredKnowledge: ['⛏️', '🔥'] },
  { inputs: [[ItemType.RawGold, 2], [ItemType.Coal, 1]], output: ItemType.GoldIngot, outputCount: 1, requiresWorkshop: true, requiresCraftingTable: true, requiredKnowledge: ['⛏️', '🔥'] },
  // Metal equipment: workshop + crafting table
  { inputs: [[ItemType.IronIngot, 2], [ItemType.RawWood, 1]], output: ItemType.IronSword, outputCount: 1, requiresWorkshop: true, requiresCraftingTable: true, requiredKnowledge: ['⚙️', '⚔️'] },
  { inputs: [[ItemType.IronIngot, 3]], output: ItemType.IronArmor, outputCount: 1, requiresWorkshop: true, requiresCraftingTable: true, requiredKnowledge: ['⚙️', '🛡️'] },
];

const WORKSHOP_RANGE_SQ = 5 * 5;
const CRAFT_TABLE_SCAN_RADIUS = 3; // blocks

export class CraftingSystem extends System {
  readonly query = InventoryStore.bit | TransformStore.bit | GenomeStore.bit;
  readonly priority = 63;

  voxelWorld: VoxelWorld | null = null;
  factionManager: any = null; // FactionManager for islander detection
  private craftTimers = new Map<number, number>();

  update(world: World, _dt: number): void {
    const entities = world.query(this.query);
    const buildings = world.query(BuildingStore.bit | TransformStore.bit);

    for (const id of entities) {
      const lifecycle = LifecycleStore.get(id);
      if (lifecycle && lifecycle.stage === LifeStage.Dead) continue;

      let timer = this.craftTimers.get(id) ?? 0;
      if (timer > 0) {
        this.craftTimers.set(id, timer - 1);
        continue;
      }

      const inv = InventoryStore.get(id)!;
      const transform = TransformStore.get(id)!;
      const { genome } = GenomeStore.get(id)!;
      const biochem = BiochemStore.get(id);

      if (!biochem || biochem.chemicals[ChemId.Energy] < 0.3) continue;
      if (!hasSpace(inv)) continue;

      // Check if near a workshop (building)
      let nearWorkshop = false;
      for (const bid of buildings) {
        const bdata = BuildingStore.get(bid)!;
        if (bdata.type !== BuildingType.Workshop) continue;
        const bt = TransformStore.get(bid)!;
        if (distSq(transform.x, transform.z, bt.x, bt.z) < WORKSHOP_RANGE_SQ) {
          nearWorkshop = true;
          break;
        }
      }

      // Check if near a CraftingTable block in voxel world
      let nearCraftingTable = false;
      if (this.voxelWorld) {
        nearCraftingTable = this.scanForCraftingTable(transform.x, transform.z);
      }

      const vocab = VocabularyStore.get(id);

      // Hunger-aware fast path: if very hungry and has food ingredients, auto-craft FoodBundle
      if (biochem.chemicals[ChemId.Hunger] > 0.3 && !hasFood(inv)) {
        const hasBerry = countItem(inv, ItemType.RawBerry) >= 2;
        const hasGrass = countItem(inv, ItemType.RawGrass) >= 1;
        if (hasBerry && hasGrass) {
          removeItem(inv, ItemType.RawBerry, 2);
          removeItem(inv, ItemType.RawGrass, 1);
          addItem(inv, ItemType.FoodBundle, 1);
          if (vocab) learn(vocab, '🍽️');
          biochem.chemicals[ChemId.Reward] = clamp(biochem.chemicals[ChemId.Reward] + 0.1, 0, 1);
          this.craftTimers.set(id, 30);
          continue;
        }
        // Fallback: 3 grass = 1 food bundle
        if (countItem(inv, ItemType.RawGrass) >= 3) {
          removeItem(inv, ItemType.RawGrass, 3);
          addItem(inv, ItemType.FoodBundle, 1);
          if (vocab) learn(vocab, '🍽️');
          biochem.chemicals[ChemId.Reward] = clamp(biochem.chemicals[ChemId.Reward] + 0.1, 0, 1);
          this.craftTimers.set(id, 30);
          continue;
        }
      }

      // Goal-driven crafting gate: brain signal + goal bonus replaces pure RNG
      const brainData = BrainStore.get(id);
      const goalData = GoalStore.get(id);
      const brainCraftSignal = brainData ? Math.max(0, brainData.brain.outputs[56]) : 0;
      const goalBonus = goalData?.activeGoal === GoalType.CraftTool ? 0.3 : 0;
      // Check if this is an islander
      const social = SocialStore.get(id);
      const isIslander = social && this.factionManager?.factions.find((f: any) => f.id === social.factionId)?.name === 'Islanders';
      
      // Increased base crafting chance, especially for boats
      let craftChance = Math.max(genome.creativity * 0.2, brainCraftSignal * 0.5) + goalBonus;
      
      // Islanders get MASSIVE boat crafting boost
      if (isIslander) {
        craftChance += 0.6; // Very high chance for islanders
      }
      
      // Special boost for boats when near water
      if (this.voxelWorld) {
        const [bx, , bz] = this.voxelWorld.worldToBlock(transform.x, 0, transform.z);
        const height = this.voxelWorld.getHeight(bx, bz);
        const hasWaterNearby = this.voxelWorld.getBlock(bx, height, bz) === Block.Water ||
                               this.voxelWorld.getBlock(bx, height + 1, bz) === Block.Water;
        if (hasWaterNearby) {
          craftChance += 0.15; // Boost boat crafting near water
        }
      }
      if (Math.random() > craftChance) continue;

      for (const recipe of RECIPES) {
        // Islanders can craft boats without workshop (they're desperate!)
        const skipWorkshop = isIslander && recipe.output === ItemType.Boat;
        if (recipe.requiresWorkshop && !nearWorkshop && !skipWorkshop) continue;
        if (recipe.requiresCraftingTable && !nearCraftingTable) continue;

        // Check vocabulary knowledge gate
        if (vocab && recipe.requiredKnowledge.length > 0) {
          let knowsAll = true;
          for (const emoji of recipe.requiredKnowledge) {
            if (!knows(vocab, emoji)) { knowsAll = false; break; }
          }
          if (!knowsAll) continue;
        }

        // Check inputs
        let canCraft = true;
        for (const [item, count] of recipe.inputs) {
          if (countItem(inv, item) < count) {
            canCraft = false;
            break;
          }
        }
        if (!canCraft) continue;

        // Craft!
        for (const [item, count] of recipe.inputs) {
          removeItem(inv, item, count);
        }
        addItem(inv, recipe.output, recipe.outputCount);

        // Vocabulary: learn the output item's emoji
        if (vocab) {
          const outputEmoji = ITEM_EMOJI[recipe.output];
          if (outputEmoji) learn(vocab, outputEmoji);
        }

        // Auto-equip tools and weapons
        if (recipe.output === ItemType.StoneAxe || recipe.output === ItemType.StonePick ||
            recipe.output === ItemType.MetalAxe || recipe.output === ItemType.MetalPick) {
          inv.equippedTool = recipe.output;
        }
        if (recipe.output === ItemType.WoodSword || recipe.output === ItemType.StoneSword ||
            recipe.output === ItemType.IronSword) {
          inv.equippedTool = recipe.output;
        }
        if (recipe.output === ItemType.IronArmor) {
          // IronArmor doesn't replace equipped tool, but creature "wears" it
          // (future: separate armor slot)
        }

        // Place CraftingTableItem as a CraftingTable block
        if (recipe.output === ItemType.CraftingTableItem && this.voxelWorld) {
          this.placeCraftingTable(transform.x, transform.z);
          removeItem(inv, ItemType.CraftingTableItem, 1);
        }

        biochem.chemicals[ChemId.Reward] = clamp(biochem.chemicals[ChemId.Reward] + 0.15, 0, 1);
        simStats.recordCraft();
        this.craftTimers.set(id, 50);
        break;
      }
    }
  }

  private scanForCraftingTable(wx: number, wz: number): boolean {
    if (!this.voxelWorld) return false;
    const [cbx, , cbz] = this.voxelWorld.worldToBlock(wx, 0, wz);
    const r = CRAFT_TABLE_SCAN_RADIUS;
    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        const bx = cbx + dx;
        const bz = cbz + dz;
        const height = this.voxelWorld.getHeight(bx, bz);
        // Scan surface and a few blocks up
        for (let dy = -1; dy <= 3; dy++) {
          if (this.voxelWorld.getBlock(bx, height + dy, bz) === Block.CraftingTable) {
            return true;
          }
        }
      }
    }
    return false;
  }

  private placeCraftingTable(wx: number, wz: number): void {
    if (!this.voxelWorld) return;
    const [bx, , bz] = this.voxelWorld.worldToBlock(wx, 0, wz);
    const surfY = this.voxelWorld.getHeight(bx, bz);
    this.voxelWorld.setBlock(bx, surfY + 1, bz, Block.CraftingTable);
  }
}
