import { System } from '../ecs/System';
import type { World } from '../ecs/World';
import { TransformStore } from '../components/Transform';
import { GenomeStore } from '../components/Genome';
import { BiochemStore } from '../components/Biochemistry';
import { LifecycleStore, LifeStage } from '../components/Lifecycle';
import { InventoryStore, countItem, removeItem, addItem, ItemType, hasSpace } from '../components/Inventory';
import { BuildingStore, BuildingType } from '../components/Building';
import { ChemId } from '../biochemistry/ChemicalRegistry';
import { distSq, clamp } from '../utils/Math';

interface Recipe {
  inputs: [ItemType, number][];
  output: ItemType;
  outputCount: number;
  requiresWorkshop: boolean;
}

const RECIPES: Recipe[] = [
  // Anywhere
  { inputs: [[ItemType.RawStone, 2], [ItemType.RawWood, 1]], output: ItemType.StoneAxe, outputCount: 1, requiresWorkshop: false },
  { inputs: [[ItemType.RawStone, 3]], output: ItemType.StonePick, outputCount: 1, requiresWorkshop: false },
  { inputs: [[ItemType.RawBerry, 2], [ItemType.RawGrass, 1]], output: ItemType.FoodBundle, outputCount: 1, requiresWorkshop: false },
  // Workshop required
  { inputs: [[ItemType.RawWood, 2]], output: ItemType.Plank, outputCount: 3, requiresWorkshop: true },
  { inputs: [[ItemType.RawStone, 2]], output: ItemType.CutStone, outputCount: 2, requiresWorkshop: true },
  { inputs: [[ItemType.RawOre, 2], [ItemType.RawWood, 1]], output: ItemType.MetalIngot, outputCount: 1, requiresWorkshop: true },
  { inputs: [[ItemType.MetalIngot, 1], [ItemType.RawWood, 1]], output: ItemType.MetalAxe, outputCount: 1, requiresWorkshop: true },
  { inputs: [[ItemType.MetalIngot, 1], [ItemType.RawWood, 1]], output: ItemType.MetalPick, outputCount: 1, requiresWorkshop: true },
];

const WORKSHOP_RANGE_SQ = 5 * 5;

export class CraftingSystem extends System {
  readonly query = InventoryStore.bit | TransformStore.bit | GenomeStore.bit;
  readonly priority = 63;

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

      // Check if near a workshop
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

      // Try recipes based on creativity and randomness
      if (Math.random() > genome.creativity * 0.02) continue;

      for (const recipe of RECIPES) {
        if (recipe.requiresWorkshop && !nearWorkshop) continue;

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

        // Auto-equip tools
        if (recipe.output === ItemType.StoneAxe || recipe.output === ItemType.StonePick ||
            recipe.output === ItemType.MetalAxe || recipe.output === ItemType.MetalPick) {
          inv.equippedTool = recipe.output;
        }

        biochem.chemicals[ChemId.Reward] = clamp(biochem.chemicals[ChemId.Reward] + 0.15, 0, 1);
        this.craftTimers.set(id, 100); // cooldown
        break; // one craft per tick
      }
    }
  }
}
