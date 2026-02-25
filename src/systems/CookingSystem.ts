// CookingSystem: creatures carry raw food to campfires, cook it, and enjoy comfort aura.

import { System } from '../ecs/System';
import type { World } from '../ecs/World';
import { TransformStore } from '../components/Transform';
import { MotorStore } from '../components/Motor';
import { BiochemStore } from '../components/Biochemistry';
import { InventoryStore, removeItem, addItem, countItem, ItemType } from '../components/Inventory';
import { SocialStore, Activity } from '../components/Social';
import { SensesStore } from '../components/Senses';
import { LifecycleStore, LifeStage } from '../components/Lifecycle';
import { BuildingStore, BuildingType } from '../components/Building';
import { VocabularyStore, learn } from '../components/Vocabulary';
import { DiaryStore, addDiaryEntry, DiaryEventType } from '../components/Diary';
import { ChemId } from '../biochemistry/ChemicalRegistry';
import { clamp, distSq } from '../utils/Math';

// Cooking recipes: input → output, cook ticks
interface CookRecipe {
  input: ItemType;
  output: ItemType;
  ticks: number;
}

const COOK_RECIPES: CookRecipe[] = [
  { input: ItemType.RawMeat,   output: ItemType.CookedMeat,  ticks: 30 },
  { input: ItemType.RawBerry,  output: ItemType.CookedBerry, ticks: 15 },
  { input: ItemType.RawFish,   output: ItemType.CookedFish,  ticks: 25 },
  { input: ItemType.LargeMeat, output: ItemType.CookedMeat,  ticks: 40 },
];

interface CookState {
  targetCampfireId: number;
  cookingItem: ItemType;
  cookingOutput: ItemType;
  progress: number;
  totalTicks: number;
  cooldown: number;
}

const CAMPFIRE_RANGE_SQ = 4 * 4; // must be within 4 units to cook
const COMFORT_RANGE_SQ = 4 * 4;  // comfort aura radius

export class CookingSystem extends System {
  readonly query = MotorStore.bit | TransformStore.bit | InventoryStore.bit;
  readonly priority = 54;

  private cookStates = new Map<number, CookState>();

  update(world: World, _dt: number): void {
    const entities = world.query(this.query);
    const buildings = world.query(BuildingStore.bit | TransformStore.bit);

    // Collect campfire positions for comfort aura
    const campfires: { id: number; x: number; z: number; factionId: number }[] = [];
    for (const bid of buildings) {
      const bd = BuildingStore.get(bid)!;
      if (bd.type !== BuildingType.Campfire) continue;
      const bt = TransformStore.get(bid)!;
      campfires.push({ id: bid, x: bt.x, z: bt.z, factionId: bd.factionId });
    }

    // Campfire comfort aura: passive biochem effects for nearby creatures
    for (const cf of campfires) {
      for (const id of entities) {
        const lifecycle = LifecycleStore.get(id);
        if (lifecycle && lifecycle.stage === LifeStage.Dead) continue;

        const ct = TransformStore.get(id)!;
        const dsq = distSq(ct.x, ct.z, cf.x, cf.z);
        if (dsq > COMFORT_RANGE_SQ) continue;

        const biochem = BiochemStore.get(id);
        if (!biochem) continue;

        // Comfort aura: reduce anxiety + punishment, boost reward
        biochem.chemicals[ChemId.Anxiety] = Math.max(0, biochem.chemicals[ChemId.Anxiety] - 0.002);
        biochem.chemicals[ChemId.Punishment] = Math.max(0, biochem.chemicals[ChemId.Punishment] - 0.001);
        biochem.chemicals[ChemId.Reward] = clamp(biochem.chemicals[ChemId.Reward] + 0.001, 0, 1);
      }
    }

    // Cooking behavior
    for (const id of entities) {
      const lifecycle = LifecycleStore.get(id);
      if (lifecycle && lifecycle.stage === LifeStage.Dead) continue;

      const motor = MotorStore.get(id)!;
      if (!motor.wantCook) continue;

      const transform = TransformStore.get(id)!;
      const inv = InventoryStore.get(id)!;
      const biochem = BiochemStore.get(id);
      const social = SocialStore.get(id);
      const senses = SensesStore.get(id);
      if (!biochem) continue;

      let state = this.cookStates.get(id);

      // Cooldown
      if (state && state.cooldown > 0) {
        state.cooldown--;
        continue;
      }

      // Find a raw food to cook
      if (!state || state.cookingItem === ItemType.None) {
        let recipe: CookRecipe | null = null;
        for (const r of COOK_RECIPES) {
          if (countItem(inv, r.input) > 0) {
            recipe = r;
            break;
          }
        }
        if (!recipe) {
          motor.wantCook = false;
          motor.cookWaitTimer = 0;
          continue;
        }

        // Find nearest campfire (prefer same faction)
        const myFaction = social?.factionId ?? -1;
        let bestCampfire = -1;
        let bestDsq = Infinity;
        for (const cf of campfires) {
          let dsq = distSq(transform.x, transform.z, cf.x, cf.z);
          // Halve effective distance for same-faction campfires
          if (cf.factionId === myFaction) dsq *= 0.5;
          if (dsq < bestDsq) {
            bestDsq = dsq;
            bestCampfire = cf.id;
          }
        }

        if (bestCampfire < 0) {
          motor.wantCook = false;
          continue;
        }

        state = {
          targetCampfireId: bestCampfire,
          cookingItem: recipe.input,
          cookingOutput: recipe.output,
          progress: 0,
          totalTicks: recipe.ticks,
          cooldown: 0,
        };
        this.cookStates.set(id, state);
      }

      // Navigate to campfire
      const campfireT = TransformStore.get(state.targetCampfireId);
      if (!campfireT) {
        // Campfire destroyed
        this.cookStates.delete(id);
        motor.wantCook = false;
        motor.cookWaitTimer = 0;
        continue;
      }

      const dsq = distSq(transform.x, transform.z, campfireT.x, campfireT.z);

      if (dsq > CAMPFIRE_RANGE_SQ) {
        // If campfire is very far away (>20 units), give up and eat raw
        if (dsq > 20 * 20) {
          this.cookStates.delete(id);
          motor.wantCook = false;
          motor.cookWaitTimer = 0;
          continue;
        }
        // Walk toward campfire
        const dx = campfireT.x - transform.x;
        const dz = campfireT.z - transform.z;
        transform.rotation = Math.atan2(dx, dz);
        motor.forward = 1.0;
        if (social) social.activity = Activity.Walking;
        continue;
      }

      // At campfire — cook
      if (state.progress === 0) {
        // Remove raw item from inventory
        if (countItem(inv, state.cookingItem) <= 0) {
          this.cookStates.delete(id);
          motor.wantCook = false;
          continue;
        }
        removeItem(inv, state.cookingItem, 1);
      }

      state.progress++;
      if (social) social.activity = Activity.Cooking;

      // Speech while cooking
      if (state.progress === 1) {
        const vocab = VocabularyStore.get(id);
        if (vocab) {
          learn(vocab, '🔥');
          social!.speechEmoji = '🔥';
          social!.speechTimer = 30;
        }
      }

      if (state.progress >= state.totalTicks) {
        // Done cooking — add cooked item
        addItem(inv, state.cookingOutput, 1);
        biochem.chemicals[ChemId.Reward] = clamp(biochem.chemicals[ChemId.Reward] + 0.15, 0, 1);

        // Diary
        const diary = DiaryStore.get(id);
        if (diary) addDiaryEntry(diary, 0, DiaryEventType.GatherMilestone, {
          detail: 'cooked food',
        });

        // Reset
        state.cookingItem = ItemType.None;
        state.progress = 0;
        state.cooldown = 30; // short cooldown between cooks
        motor.wantCook = false;
        motor.cookWaitTimer = 0;
      }
    }
  }

  cleanup(deadIds: number[]): void {
    for (const id of deadIds) {
      this.cookStates.delete(id);
    }
  }
}
