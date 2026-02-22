import { System } from '../ecs/System';
import type { World } from '../ecs/World';
import { MotorStore } from '../components/Motor';
import { BiochemStore } from '../components/Biochemistry';
import { GenomeStore } from '../components/Genome';
import { LifecycleStore, LifeStage } from '../components/Lifecycle';
import { InventoryStore, removeItem, ItemType } from '../components/Inventory';
import { SocialStore, Activity } from '../components/Social';
import { TransformStore } from '../components/Transform';
import { ChemId } from '../biochemistry/ChemicalRegistry';
import { clamp } from '../utils/Math';
import { inBabelZone } from '../world/BabelZone';

// Glucose values for raw food items
const FOOD_GLUCOSE: Partial<Record<ItemType, number>> = {
  [ItemType.RawBerry]: 0.35,
  [ItemType.RawGrass]: 0.25,
  [ItemType.RawRoot]: 0.30,
  [ItemType.RawMeat]: 0.55,
  [ItemType.FoodBundle]: 0.50,
};

// Which foods to try eating, in preference order
const FOOD_PRIORITY: ItemType[] = [
  ItemType.FoodBundle,
  ItemType.RawMeat,
  ItemType.RawBerry,
  ItemType.RawRoot,
  ItemType.RawGrass,
];

export class EatingSystem extends System {
  readonly query = MotorStore.bit | BiochemStore.bit | InventoryStore.bit | GenomeStore.bit;
  readonly priority = 55;

  update(world: World, _dt: number): void {
    const entities = world.query(this.query);

    for (const id of entities) {
      const lifecycle = LifecycleStore.get(id);
      if (lifecycle && lifecycle.stage === LifeStage.Dead) continue;

      const motor = MotorStore.get(id)!;
      const { chemicals } = BiochemStore.get(id)!;

      // Skip eating in Babel exclusion zone (forces leaving when hungry)
      const transform = TransformStore.get(id);
      if (transform && inBabelZone(transform.x, transform.z)) continue;

      // Auto-eat when hungry (don't require brain signal)
      const hungry = chemicals[ChemId.Hunger] > 0.3;
      if (!motor.wantEat && !hungry) continue;

      const inv = InventoryStore.get(id)!;
      const { genome } = GenomeStore.get(id)!;

      // Try to eat food from inventory in priority order
      for (const item of FOOD_PRIORITY) {
        let hasItem = false;
        for (const slot of inv.slots) {
          if (slot.item === item && slot.count > 0) { hasItem = true; break; }
        }
        if (!hasItem) continue;

        const glucoseValue = FOOD_GLUCOSE[item] ?? 0.2;

        // Diet efficiency for raw items
        let efficiency = 1.0;
        if (item === ItemType.RawBerry) efficiency = genome.dietBerry;
        else if (item === ItemType.RawGrass) efficiency = genome.dietGrass;
        else if (item === ItemType.RawRoot) efficiency = genome.dietRoot;

        const sizeBonus = 0.7 + genome.bodyScale * 0.3;
        const gained = glucoseValue * efficiency * sizeBonus;

        removeItem(inv, item, 1);
        chemicals[ChemId.Glucose] = clamp(chemicals[ChemId.Glucose] + gained, 0, 1);
        chemicals[ChemId.Reward] = clamp(chemicals[ChemId.Reward] + 0.15 * efficiency, 0, 1);

        // Activity and speech feedback
        const social = SocialStore.get(id);
        if (social) {
          social.activity = Activity.Eating;
          if (Math.random() < 0.25) {
            social.speechEmoji = '😋';
            social.speechTimer = 25;
          }
        }
        break; // eat one item per tick
      }
    }
  }
}
