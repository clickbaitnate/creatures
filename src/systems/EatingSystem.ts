import { System } from '../ecs/System';
import type { World } from '../ecs/World';
import { MotorStore } from '../components/Motor';
import { BiochemStore } from '../components/Biochemistry';
import { GenomeStore } from '../components/Genome';
import { LifecycleStore, LifeStage } from '../components/Lifecycle';
import { InventoryStore, removeItem, addItem, hasFood, isFood, ItemType } from '../components/Inventory';
import { SocialStore, Activity } from '../components/Social';
import { TransformStore } from '../components/Transform';
import { SensesStore } from '../components/Senses';
import { VocabularyStore, ITEM_EMOJI, learn } from '../components/Vocabulary';
import { ChemId } from '../biochemistry/ChemicalRegistry';
import { clamp, distSq } from '../utils/Math';
import { inBabelZone } from '../world/BabelZone';
import { DiaryStore, addDiaryEntry, DiaryEventType } from '../components/Diary';
import { simStats } from '../stats/SimStats';

// Glucose values for food items
const FOOD_GLUCOSE: Partial<Record<ItemType, number>> = {
  [ItemType.RawBerry]: 0.15,
  [ItemType.RawGrass]: 0.12,
  [ItemType.RawRoot]: 0.15,
  [ItemType.RawMeat]: 0.20,
  [ItemType.FoodBundle]: 0.50,
  [ItemType.RawFish]: 0.18,
  [ItemType.CookedMeat]: 0.85,
  [ItemType.CookedBerry]: 0.50,
  [ItemType.CookedFish]: 0.75,
  [ItemType.LargeMeat]: 0.25,
};

// Which foods to try eating, in preference order
const FOOD_PRIORITY: ItemType[] = [
  ItemType.CookedMeat,
  ItemType.CookedFish,
  ItemType.LargeMeat,
  ItemType.FoodBundle,
  ItemType.RawMeat,
  ItemType.CookedBerry,
  ItemType.RawFish,
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
      const hungry = chemicals[ChemId.Hunger] > 0.2;
      if (!motor.wantEat && !hungry) continue;

      // Defer to CookingSystem when creature wants to cook and campfire is visible
      // But override if starving — eat raw food to survive
      const senses = SensesStore.get(id);
      if (motor.wantCook && senses?.campfireVisible && chemicals[ChemId.Hunger] < 0.5) continue;

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
        simStats.recordEat();

        // Vocabulary: learn food emoji and eating emoji
        const vocab = VocabularyStore.get(id);
        if (vocab) {
          learn(vocab, '🍽️');
          const foodEmoji = ITEM_EMOJI[item];
          if (foodEmoji) learn(vocab, foodEmoji);
        }

        // Activity and speech feedback
        const social = SocialStore.get(id);
        if (social) {
          social.activity = Activity.Eating;
          if (Math.random() < 0.25 && vocab) {
            learn(vocab, '😋');
            social.speechEmoji = '😋';
            social.speechTimer = 25;
          }
        }
        break; // eat one item per tick
      }
    }

    // Food sharing: satiated creatures share with hungry same-faction neighbors
    for (const id of entities) {
      const lifecycle = LifecycleStore.get(id);
      if (lifecycle && lifecycle.stage === LifeStage.Dead) continue;

      const { chemicals } = BiochemStore.get(id)!;
      if (chemicals[ChemId.Hunger] > 0.3) continue; // only share when not hungry

      const inv = InventoryStore.get(id)!;
      if (!hasFood(inv)) continue;

      const transform = TransformStore.get(id);
      if (!transform) continue;

      const senses = SensesStore.get(id);
      const social = SocialStore.get(id);
      if (!senses || !social) continue;

      // Find nearest same-faction hungry creature within 3 units
      const shareRange = 3 * 3; // squared
      let bestTarget = -1;
      let bestDsq = shareRange;

      for (const otherId of entities) {
        if (otherId === id) continue;
        const otherLC = LifecycleStore.get(otherId);
        if (otherLC && otherLC.stage === LifeStage.Dead) continue;

        const otherBio = BiochemStore.get(otherId);
        if (!otherBio || otherBio.chemicals[ChemId.Hunger] < 0.5) continue;

        const otherT = TransformStore.get(otherId);
        if (!otherT) continue;

        const dsq = distSq(transform.x, transform.z, otherT.x, otherT.z);
        if (dsq < bestDsq) {
          bestDsq = dsq;
          bestTarget = otherId;
        }
      }

      if (bestTarget >= 0) {
        const targetInv = InventoryStore.get(bestTarget);
        if (!targetInv) continue;

        // Share one food item
        for (const food of FOOD_PRIORITY) {
          let hasItem = false;
          for (const slot of inv.slots) {
            if (slot.item === food && slot.count > 0) { hasItem = true; break; }
          }
          if (!hasItem) continue;

          removeItem(inv, food, 1);
          addItem(targetInv, food, 1);

          // Both get reward boost
          chemicals[ChemId.Reward] = clamp(chemicals[ChemId.Reward] + 0.1, 0, 1);
          const targetBio = BiochemStore.get(bestTarget);
          if (targetBio) {
            targetBio.chemicals[ChemId.Reward] = clamp(targetBio.chemicals[ChemId.Reward] + 0.1, 0, 1);
          }

          // Diary: food shared/received
          const sharerDiary = DiaryStore.get(id);
          const receiverDiary = DiaryStore.get(bestTarget);
          const targetSocial = SocialStore.get(bestTarget);
          if (sharerDiary) addDiaryEntry(sharerDiary, 0, DiaryEventType.FoodShared, {
            otherId: bestTarget, otherName: targetSocial?.name ?? '',
          });
          if (receiverDiary) addDiaryEntry(receiverDiary, 0, DiaryEventType.FoodReceived, {
            otherId: id, otherName: social?.name ?? '',
          });
          break;
        }
      }
    }
  }
}
