import { System } from '../ecs/System';
import type { World } from '../ecs/World';
import { BrainStore } from '../components/Brain';
import { SensesStore } from '../components/Senses';
import { BiochemStore } from '../components/Biochemistry';
import { GenomeStore } from '../components/Genome';
import { LifecycleStore, LifeStage } from '../components/Lifecycle';
import { InventoryStore, hasFood, hasSpace, countItem, isTool, ItemType } from '../components/Inventory';
import { SocialStore } from '../components/Social';
import { GoalStore, GoalType } from '../components/Goal';
import { BuildingStore, BuildingType } from '../components/Building';
import { TransformStore } from '../components/Transform';
import { ChemId } from '../biochemistry/ChemicalRegistry';
import { distSq } from '../utils/Math';

// Planning lobe neurons: 36-43
// 36=goalFood, 37=goalShelter, 38=goalWeapon, 39=goalSocial
// 40=goalExplore, 41=goalDefend, 42=goalTrade, 43=goalBuild

export class GoalSystem extends System {
  readonly query = GoalStore.bit | BrainStore.bit | BiochemStore.bit | SensesStore.bit;
  readonly priority = 22;

  update(world: World, _dt: number): void {
    const entities = world.query(this.query);
    const buildings = world.query(BuildingStore.bit | TransformStore.bit);

    for (const id of entities) {
      const lifecycle = LifecycleStore.get(id);
      if (lifecycle && lifecycle.stage === LifeStage.Dead) continue;

      const goal = GoalStore.get(id)!;
      const { brain } = BrainStore.get(id)!;
      const { chemicals } = BiochemStore.get(id)!;
      const senses = SensesStore.get(id)!;
      const genomeData = GenomeStore.get(id);
      const inv = InventoryStore.get(id);
      const social = SocialStore.get(id);

      goal.goalTicks++;
      const genome = genomeData?.genome;
      const hunger = chemicals[ChemId.Hunger];
      const energy = chemicals[ChemId.Energy];

      // Re-evaluate goal every 50 ticks or when current goal completes
      if (goal.goalTicks < 50 && goal.activeGoal !== GoalType.None) continue;

      // Priority-ordered goal selection
      let newGoal = GoalType.Explore; // default

      // 1. FindFood: hungry and no food in inventory
      if (hunger > 0.4 && inv && !hasFood(inv)) {
        newGoal = GoalType.FindFood;
      }
      // 2. CraftTool: has raw materials, no tool, creative
      else if (genome && genome.buildAffinity > 0.3 && inv &&
               !hasTool(inv) && countItem(inv, ItemType.RawWood) >= 2) {
        newGoal = GoalType.CraftTool;
      }
      // 3. BuildShelter: no shelter nearby and has wood
      else if (genome && genome.buildAffinity > 0.2 && inv &&
               countItem(inv, ItemType.RawWood) >= 3 &&
               !hasShelterNearby(id, buildings, world)) {
        newGoal = GoalType.BuildShelter;
      }
      // 4. Farm: has farm nearby and farmland
      else if (genome && genome.gatherAffinity > 0.4 && hasFarmNearby(id, buildings, world)) {
        newGoal = GoalType.Farm;
      }
      // 5. FindMate: healthy and not hungry
      else if (energy > 0.4 && hunger < 0.3 && senses.creatureVisible) {
        newGoal = GoalType.FindMate;
      }
      // 6. Defend: threat visible
      else if (senses.threatVisible && senses.threatLevel > 0.3) {
        newGoal = GoalType.Defend;
      }

      if (newGoal !== goal.activeGoal) {
        goal.activeGoal = newGoal;
        goal.goalProgress = 0;
        goal.goalTicks = 0;
      }

      // Feed goal into Planning neurons
      // Clear planning bias first
      for (let p = 36; p < 44; p++) brain.inputs[p] = 0;

      const g = goal.activeGoal as number;
      if (g === GoalType.FindFood) {
        brain.inputs[36] = 0.8;
      } else if (g === GoalType.BuildShelter) {
        brain.inputs[37] = 0.7;
        brain.inputs[43] = 0.5;
      } else if (g === GoalType.CraftTool) {
        brain.inputs[38] = 0.7;
      } else if (g === GoalType.FindMate) {
        brain.inputs[39] = 0.7;
      } else if (g === GoalType.Explore) {
        brain.inputs[40] = 0.5;
      } else if (g === GoalType.Defend) {
        brain.inputs[41] = 0.8;
      } else if (g === GoalType.Trade) {
        brain.inputs[42] = 0.6;
      } else if (g === GoalType.Farm) {
        brain.inputs[36] = 0.3;
        brain.inputs[43] = 0.4;
      }
    }
  }
}

function hasTool(inv: any): boolean {
  for (const slot of inv.slots) {
    if (isTool(slot.item)) return true;
  }
  return false;
}

function hasShelterNearby(entityId: number, buildings: number[], world: World): boolean {
  const transform = TransformStore.get(entityId);
  if (!transform) return false;
  const social = SocialStore.get(entityId);
  for (const bid of buildings) {
    const b = BuildingStore.get(bid);
    const bt = TransformStore.get(bid);
    if (b && bt && b.type === BuildingType.Shelter &&
        b.factionId === social?.factionId &&
        distSq(transform.x, transform.z, bt.x, bt.z) < 100) {
      return true;
    }
  }
  return false;
}

function hasFarmNearby(entityId: number, buildings: number[], world: World): boolean {
  const transform = TransformStore.get(entityId);
  if (!transform) return false;
  const social = SocialStore.get(entityId);
  for (const bid of buildings) {
    const b = BuildingStore.get(bid);
    const bt = TransformStore.get(bid);
    if (b && bt && b.type === BuildingType.Farm &&
        b.factionId === social?.factionId &&
        distSq(transform.x, transform.z, bt.x, bt.z) < 100) {
      return true;
    }
  }
  return false;
}
