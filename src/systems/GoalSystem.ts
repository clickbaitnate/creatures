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
import { ExpressionStore } from '../components/Expression';
import { BuildingStore, BuildingType } from '../components/Building';
import { TransformStore } from '../components/Transform';
import { ChemId } from '../biochemistry/ChemicalRegistry';
import { distSq } from '../utils/Math';
import { inBabelZone } from '../world/BabelZone';
import type { FactionManager } from '../world/FactionSystem';

// Planning lobe neurons: 40-47
// 40=goalFood, 41=goalShelter, 42=goalWeapon, 43=goalSocial
// 44=goalExplore, 45=goalDefend, 46=goalTrade, 47=goalBuild

export class GoalSystem extends System {
  readonly query = GoalStore.bit | BrainStore.bit | BiochemStore.bit | SensesStore.bit;
  readonly priority = 22;

  factionManager: FactionManager | null = null;

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
      const expr = ExpressionStore.get(id);

      goal.goalTicks++;
      const genome = genomeData?.genome;
      const hunger = chemicals[ChemId.Hunger];
      const energy = chemicals[ChemId.Energy];

      // Faction personality bias
      const faction = this.factionManager?.getFaction(id);
      const factionBuildBias = faction ? this.getFactionAvg(faction, 'buildAffinity') : 0;
      const factionAggrBias = faction ? this.getFactionAvg(faction, 'aggression') : 0;
      const factionCuriosityBias = faction ? this.getFactionAvg(faction, 'curiosity') : 0;

      // Explore goals last longer for curious factions
      const goalDuration = factionCuriosityBias > 0.5 ? 70 : 50;

      // Re-evaluate goal every N ticks or when current goal completes
      if (goal.goalTicks < goalDuration && goal.activeGoal !== GoalType.None) continue;

      // Babel zone override: hungry in zone → FindFood (forces leaving)
      const transform = TransformStore.get(id);
      const inBabel = transform ? inBabelZone(transform.x, transform.z) : false;

      // Priority-ordered goal selection
      let newGoal = GoalType.Explore; // default

      // Emotion overrides: fear forces Defend, curiosity biases Explore
      const fear = expr?.fear ?? 0;
      const curiosity = expr?.curiosity ?? 0;

      // Check for Migrate goal (from faction system)
      if (goal.activeGoal === GoalType.Migrate && hunger < 0.7) {
        newGoal = GoalType.Migrate;
      }
      // 0. Fear override: high fear → Defend regardless
      else if (fear > 0.6 && senses.threatVisible) {
        newGoal = GoalType.Defend;
      }
      // 1. FindFood: hungry and no food in inventory
      else if (hunger > 0.4 && inv && !hasFood(inv)) {
        newGoal = GoalType.FindFood;
      }
      // 2. CraftTool: has raw materials, no tool, creative
      else if (genome && genome.buildAffinity > 0.3 && inv &&
               !hasTool(inv) && countItem(inv, ItemType.RawWood) >= 2) {
        newGoal = GoalType.CraftTool;
      }
      // 3. BuildShelter: no shelter nearby and has wood (blocked in Babel zone)
      else if (!inBabel && genome && genome.buildAffinity > (factionBuildBias > 0.5 ? 0.1 : 0.2) && inv &&
               countItem(inv, ItemType.RawWood) >= 3 &&
               !hasShelterNearby(id, buildings, world)) {
        newGoal = GoalType.BuildShelter;
      }
      // 3b. Settle: has resources, build affinity, no shelter nearby, not in Babel
      else if (!inBabel && genome && genome.buildAffinity > (factionBuildBias > 0.5 ? 0.1 : 0.2) &&
               inv && (countItem(inv, ItemType.RawWood) >= 1 || countItem(inv, ItemType.RawStone) >= 1) &&
               !hasShelterNearby(id, buildings, world)) {
        newGoal = GoalType.Settle;
      }
      // 4. Farm: has farm nearby and farmland
      else if (genome && genome.gatherAffinity > 0.4 && hasFarmNearby(id, buildings, world)) {
        newGoal = GoalType.Farm;
      }
      // 5. FindMate: healthy and not hungry
      else if (energy > 0.4 && hunger < 0.3 && senses.creatureVisible) {
        newGoal = GoalType.FindMate;
      }
      // 6. Defend: threat visible (aggressive factions trigger more easily)
      else if (senses.threatVisible && senses.threatLevel > (factionAggrBias > 0.5 ? 0.15 : 0.3)) {
        newGoal = GoalType.Defend;
      }
      // 7. Curiosity bias: curious creatures explore more eagerly
      else if (curiosity > 0.5) {
        newGoal = GoalType.Explore;
      }

      if (newGoal !== goal.activeGoal) {
        goal.activeGoal = newGoal;
        goal.goalProgress = 0;
        goal.goalTicks = 0;
      }

      // Feed goal into Planning neurons (40-47)
      // Clear planning bias first
      for (let p = 40; p < 48; p++) brain.inputs[p] = 0;

      const g = goal.activeGoal as number;
      if (g === GoalType.FindFood) {
        brain.inputs[40] = 0.8;
      } else if (g === GoalType.BuildShelter) {
        brain.inputs[41] = 0.7;
        brain.inputs[47] = 0.5;
      } else if (g === GoalType.CraftTool) {
        brain.inputs[42] = 0.7;
      } else if (g === GoalType.FindMate) {
        brain.inputs[43] = 0.7;
      } else if (g === GoalType.Explore) {
        brain.inputs[44] = 0.5 + curiosity * 0.3; // curiosity boosts explore
      } else if (g === GoalType.Defend) {
        brain.inputs[45] = 0.8;
      } else if (g === GoalType.Trade) {
        brain.inputs[46] = 0.6;
      } else if (g === GoalType.Farm) {
        brain.inputs[40] = 0.3;
        brain.inputs[47] = 0.4;
      } else if (g === GoalType.Migrate) {
        brain.inputs[44] = 0.9; // strong explore (migration)
      } else if (g === GoalType.Settle) {
        brain.inputs[47] = 0.8; // strong build signal
        brain.inputs[41] = 0.6; // shelter goal
      }
    }
  }

  /** Compute average of a genome trait across faction members */
  private getFactionAvg(faction: { memberIds: Set<number> }, trait: string): number {
    let sum = 0;
    let count = 0;
    for (const mid of faction.memberIds) {
      const g = GenomeStore.get(mid);
      if (g && (g.genome as any)[trait] !== undefined) {
        sum += (g.genome as any)[trait];
        count++;
      }
    }
    return count > 0 ? sum / count : 0;
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
