import { System } from '../ecs/System';
import type { World } from '../ecs/World';
import { BrainStore } from '../components/Brain';
import { TransformStore } from '../components/Transform';
import { SensesStore } from '../components/Senses';
import { BiochemStore } from '../components/Biochemistry';
import { GenomeStore } from '../components/Genome';
import { MotorStore } from '../components/Motor';
import { LifecycleStore, LifeStage } from '../components/Lifecycle';
import { InventoryStore, hasSpace, hasFood, countItem, ItemType } from '../components/Inventory';
import { SocialStore, Activity } from '../components/Social';
import { ExpressionStore } from '../components/Expression';
import { ZealotryStore } from '../components/Zealotry';
import { VocabularyStore, knows } from '../components/Vocabulary';
import { ChemId } from '../biochemistry/ChemicalRegistry';
import { GoalStore, GoalType } from '../components/Goal';
import type { MemoryData } from '../components/Memory';
import { MemoryStore, MemoryType } from '../components/Memory';
import type { SeasonState } from '../world/Seasons';
import { Season } from '../world/Seasons';
import type { FactionManager } from '../world/FactionSystem';
import type { MonsterManager } from '../world/MonsterManager';
import type { DayNightState } from '../world/DayNightCycle';
import type { VoxelWorld } from '../voxel/VoxelWorld';
import { Block } from '../voxel/BlockTypes';

// Decision lobe: neurons 48-59
// 48=moveForward, 49=turnLeft, 50=turnRight, 51=speedMod,
// 52=eat, 53=gather, 54=hunt, 55=build,
// 56=craft, 57=deposit, 58=trade, 59=patrol

export class InstinctSystem extends System {
  readonly query = BrainStore.bit | SensesStore.bit | BiochemStore.bit;
  readonly priority = 25;

  seasonState: SeasonState | null = null;
  factionManager: FactionManager | null = null;
  monsterManager: MonsterManager | null = null;
  dayNight: DayNightState | null = null;
  voxelWorld: VoxelWorld | null = null;

  update(world: World, _dt: number): void {
    const entities = world.query(this.query);

    for (const id of entities) {
      const lifecycle = LifecycleStore.get(id);
      if (lifecycle && lifecycle.stage === LifeStage.Dead) continue;

      const { brain } = BrainStore.get(id)!;
      const senses = SensesStore.get(id)!;
      const { chemicals } = BiochemStore.get(id)!;
      const genomeData = GenomeStore.get(id);
      const motor = MotorStore.get(id);
      const inv = InventoryStore.get(id);
      const goal = GoalStore.get(id);
      const expr = ExpressionStore.get(id);
      const memory = MemoryStore.get(id);

      const hunger = chemicals[ChemId.Hunger];
      const energy = chemicals[ChemId.Energy];
      const genome = genomeData?.genome;

      // Reset activity to Idle each tick — other systems set it if active
      const social = SocialStore.get(id);
      if (social && social.matingTimer <= 0 && social.attackCooldown <= 0) {
        social.activity = Activity.Idle;
      }

      // ── Emotion multipliers ──────────────────────────
      const fear = expr?.fear ?? 0;
      const anger = expr?.anger ?? 0;
      const curiosity = expr?.curiosity ?? 0;
      const tiredness = expr?.tiredness ?? 0;
      const happiness = expr?.happiness ?? 0;

      // Tiredness suppresses all outputs
      const tirednessDamper = 1.0 - tiredness * 0.4;

      // Goal-driven instinct biases (from GoalSystem)
      if (goal) {
        switch (goal.activeGoal) {
          case GoalType.FindFood:
            if (senses.resourceVisible) {
              brain.outputs[48] += 0.5; // move toward resource
              if (senses.nearestResourceAngle < -0.1) brain.outputs[49] += 0.3;
              else if (senses.nearestResourceAngle > 0.1) brain.outputs[50] += 0.3;
            }
            if (inv && hasFood(inv)) brain.outputs[52] += 0.7;
            else brain.outputs[53] += 0.5; // gather
            break;
          case GoalType.BuildShelter:
            brain.outputs[55] += 0.6;
            if (senses.resourceVisible && inv && hasSpace(inv)) brain.outputs[53] += 0.4;
            break;
          case GoalType.CraftTool:
            brain.outputs[56] += 0.6; // craft
            break;
          case GoalType.Farm:
            brain.outputs[53] += 0.4; // gather
            brain.outputs[55] += 0.3; // build
            break;
          case GoalType.Defend:
            brain.outputs[59] += 0.5; // patrol
            brain.outputs[51] += 0.3; // speed boost
            break;
          case GoalType.Explore:
            brain.outputs[48] += 0.3 + curiosity * 0.3; // curiosity boosts exploration
            break;
        }
      }

      const transform = TransformStore.get(id);

      // Migration instinct: strong pull toward faction migration target
      if (transform && this.factionManager && social) {
        const faction = this.factionManager.getFaction(id);
        if (faction && (faction as any).migrationActive) {
          const tx = (faction as any).migrationTargetX as number;
          const tz = (faction as any).migrationTargetZ as number;
          const dx = tx - transform.x;
          const dz = tz - transform.z;
          const mdist = Math.sqrt(dx * dx + dz * dz);
          if (mdist > 5) {
            const migAngle = Math.atan2(dx, dz);
            let relAngle = migAngle - transform.rotation;
            while (relAngle > Math.PI) relAngle -= 2 * Math.PI;
            while (relAngle < -Math.PI) relAngle += 2 * Math.PI;
            const nav = relAngle / Math.PI;
            brain.outputs[48] += 0.8; // strong move toward target
            if (nav < -0.1) brain.outputs[49] += 0.5;
            else if (nav > 0.1) brain.outputs[50] += 0.5;
            brain.outputs[51] += 0.3; // speed boost
          }
        }
      }

      // Instinct 1: When hungry and resource visible, approach resource tile
      if (hunger > 0.3 && senses.resourceVisible) {
        const urgency = hunger * 0.6;
        brain.outputs[48] += urgency * 0.5; // move forward
        if (senses.nearestResourceAngle < -0.1) {
          brain.outputs[49] += urgency * 0.4; // turn left
        } else if (senses.nearestResourceAngle > 0.1) {
          brain.outputs[50] += urgency * 0.4; // turn right
        }
      }

      // Instinct 2: When on resource tile and hungry, eat from inventory or gather
      if (hunger > 0.2 && senses.currentResourceAmount > 0.2) {
        if (inv && hasFood(inv)) {
          brain.outputs[52] += 0.8; // eat from inventory
        } else {
          brain.outputs[53] += 0.7; // gather
        }
      }

      // Instinct 3: Gather when resource visible and inventory not full
      if (senses.resourceVisible && inv && hasSpace(inv) && genome) {
        const gatherUrge = genome.gatherAffinity * 0.4;
        if (senses.nearestResourceDist < 0.15) {
          brain.outputs[53] += gatherUrge + 0.3; // gather
        } else if (hunger > 0.2 || energy > 0.5) {
          brain.outputs[48] += gatherUrge * 0.3; // approach
        }
      }

      // Instinct 4: Eat from inventory when hungry and has food
      if (hunger > 0.3 && inv && hasFood(inv)) {
        brain.outputs[52] += hunger * 0.6;
      }

      // Instinct 5: Mate when conditions met (relaxed thresholds)
      if (hunger < 0.5 && energy > 0.3 && senses.creatureVisible && senses.nearestCreatureDist < 0.3) {
        if (motor) motor.wantMate = true;
      } else {
        if (motor) motor.wantMate = false;
      }

      // Instinct 6: Build when has materials and creative (relaxed)
      if (genome && genome.buildAffinity > 0.1 && energy > 0.3 && genome.creativity > 0.15) {
        brain.outputs[55] += genome.buildAffinity * 0.5;
      }

      // Instinct 7: Flee from threats — fear amplifies flee response
      if (senses.threatVisible && senses.threatLevel > 0.5) {
        const fleeBoost = 1.0 + fear * 0.8; // fear makes flee stronger
        brain.outputs[48] += 0.6 * fleeBoost; // run forward
        // Turn away from threat
        if (senses.nearestThreatAngle > 0) {
          brain.outputs[49] += 0.5 * fleeBoost; // turn left (away)
        } else {
          brain.outputs[50] += 0.5 * fleeBoost; // turn right (away)
        }
        brain.outputs[51] += 0.5 * fleeBoost; // speed boost
      }
      // Anger makes creature stand ground instead of fleeing (counteracts flee)
      else if (senses.threatVisible && senses.threatLevel > 0.3 && anger > 0.5) {
        brain.outputs[59] += anger * 0.4; // patrol/fight instead of flee
        brain.outputs[48] += 0.2; // approach threat
      }

      // Instinct 8: Hunt when prey visible and hungry
      if (senses.preyVisible && hunger > 0.3 && genome) {
        const huntUrge = genome.huntAffinity * (genome.aggression * 0.5 + 0.5);
        brain.outputs[54] += huntUrge * 0.5; // hunt
        brain.outputs[48] += huntUrge * 0.4; // chase
        if (senses.nearestPreyAngle < -0.1) {
          brain.outputs[49] += huntUrge * 0.3;
        } else if (senses.nearestPreyAngle > 0.1) {
          brain.outputs[50] += huntUrge * 0.3;
        }
      }

      // Instinct 9: Explore when no resources visible — curiosity amplifies
      if (!senses.resourceVisible && hunger > 0.2) {
        const exploreBoost = 1.0 + curiosity * 0.5;
        brain.outputs[48] += 0.3 * exploreBoost; // keep moving
        if (brain.states[24] > 0) {
          brain.outputs[49] += 0.15;
        } else {
          brain.outputs[50] += 0.15;
        }
      }

      // Instinct 10: Approach creatures socially — happiness boosts
      if (energy > 0.6 && senses.creatureVisible && !senses.resourceVisible) {
        const approach = 0.3 + happiness * 0.2;
        brain.outputs[48] += approach;
        if (senses.nearestCreatureAngle < -0.1) {
          brain.outputs[49] += approach * 0.3;
        } else if (senses.nearestCreatureAngle > 0.1) {
          brain.outputs[50] += approach * 0.3;
        }
      }

      // Instinct 11: Baseline wandering
      brain.outputs[48] += 0.15;

      // Instinct 12: Winter shelter-seeking
      if (this.seasonState && this.seasonState.season === Season.Winter) {
        // In winter, boost shelter-seeking and reduce wandering
        if (senses.buildingVisible && senses.nearestBuildingDist > 0.1) {
          brain.outputs[48] += 0.3; // move toward building
          const bAngle = senses.nearestBuildingAngle ?? 0;
          if (bAngle < -0.1) brain.outputs[49] += 0.2;
          else if (bAngle > 0.1) brain.outputs[50] += 0.2;
        }
        // Near shelter → stay put
        if (senses.buildingVisible && senses.nearestBuildingDist < 0.15) {
          brain.outputs[48] *= 0.3; // reduce wandering
        }
      }

      // Instinct 13: Altitude awareness — prefer lowlands when tired/hungry
      if (genome && (hunger > 0.4 || tiredness > 0.5)) {
        const altitude = brain.inputs[21] ?? 0;
        if (altitude > 0.5) {
          // High up and struggling → prefer going downhill
          const slope = brain.inputs[22] ?? 0;
          if (slope > 0.1) {
            // Facing uphill, turn away
            brain.outputs[49] += 0.2;
          }
        }
      }

      // Instinct 14: Memory-guided navigation
      if (memory) {
        this.applyMemoryInstincts(brain, memory, id, hunger, senses, fear);
      }

      // Instinct 15: Crowd avoidance — curious creatures flee crowds
      if (senses.crowdDensity > 0.4 && curiosity > 0.2) {
        const crowdPush = senses.crowdDensity * (0.3 + curiosity * 0.4);
        // Push away from nearest creature (proxy for crowd center)
        if (senses.creatureVisible) {
          // Turn away from nearest creature
          if (senses.nearestCreatureAngle > 0) {
            brain.outputs[49] += crowdPush * 0.4; // turn left (away)
          } else {
            brain.outputs[50] += crowdPush * 0.4; // turn right (away)
          }
          brain.outputs[48] += crowdPush * 0.3; // move forward (away)
        }
      }

      // Instinct 16: Settlement seeking — found resources, stop and build
      if (goal && goal.activeGoal === GoalType.Explore &&
          senses.resourceVisible && !senses.buildingVisible &&
          genome && genome.buildAffinity > 0.2) {
        brain.outputs[48] *= 0.5; // reduce forward movement
        brain.outputs[55] += 0.3; // boost build
        brain.outputs[53] += 0.3; // boost gather
      }

      // Instinct 17: Home pull — low energy creatures return home
      if (transform && memory && energy < 0.5) {
        const exempt = genome && genome.curiosity > 0.6; // scouts don't go home
        if (!exempt) {
          for (const mem of memory.entries) {
            if (mem.type === MemoryType.HomeLocation && mem.strength > 0.1) {
              const dx = mem.x - transform.x;
              const dz = mem.z - transform.z;
              const dist = Math.sqrt(dx * dx + dz * dz);
              if (dist > 20) {
                const angle = Math.atan2(dx, dz);
                let relAngle = angle - transform.rotation;
                while (relAngle > Math.PI) relAngle -= 2 * Math.PI;
                while (relAngle < -Math.PI) relAngle += 2 * Math.PI;
                const nav = relAngle / Math.PI;
                brain.outputs[48] += 0.2; // mild forward pull
                if (nav < -0.1) brain.outputs[49] += 0.15;
                else if (nav > 0.1) brain.outputs[50] += 0.15;
              }
              break;
            }
          }
        }
      }

      // Settle goal handling: gather-then-build loop
      if (goal && goal.activeGoal === GoalType.Settle) {
        const hasWood = inv ? countItem(inv, ItemType.RawWood) : 0;
        const hasStone = inv ? countItem(inv, ItemType.RawStone) : 0;
        if (hasWood < 3 && senses.resourceVisible) {
          // Need materials: go gather
          brain.outputs[53] += 0.6; // gather
          brain.outputs[48] += 0.3; // move toward resources
          brain.outputs[55] *= 0.2; // suppress build
        } else if (hasWood >= 3 || hasStone >= 3) {
          // Have materials: build
          brain.outputs[55] += 0.8; // strong build
          brain.outputs[48] *= 0.3; // stay put
        }
      }

      // Instinct 18: Fight-or-flight against monsters
      if (senses.monsterVisible && transform) {
        const monsterDist = senses.nearestMonsterDist; // 0-1 normalized
        const monsterAngle = senses.nearestMonsterAngle; // -1 to 1
        const urgency = 1.0 - monsterDist;

        // Determine if creature fights or flees:
        // Fight if: has weapon, OR high aggression, OR many allies nearby
        const hasWeapon = inv ? (countItem(inv, ItemType.WoodSword) > 0 || countItem(inv, ItemType.StoneSword) > 0 || countItem(inv, ItemType.IronSword) > 0 || countItem(inv, ItemType.StoneAxe) > 0 || countItem(inv, ItemType.StonePick) > 0) : false;
        const aggroBoost = genome ? genome.aggression : 0;
        const alliesNearby = senses.nearbyFactionCount;
        const courageFromAllies = Math.min(1, alliesNearby * 0.15); // 0.15 per ally, caps at 1
        const fightScore = (hasWeapon ? 0.5 : 0) + aggroBoost * 0.4 + courageFromAllies + anger * 0.3;
        const fleeScore = fear * 0.6 + (1 - (genome?.aggression ?? 0)) * 0.3 + (energy < 0.2 ? 0.4 : 0);

        if (fightScore > fleeScore && monsterDist < 0.5) {
          // FIGHT: approach monster and attack
          if (motor) motor.wantFightMonster = true;

          // Turn toward monster
          brain.outputs[48] += urgency * 0.6; // charge forward
          if (monsterAngle < -0.1) brain.outputs[49] += urgency * 0.4;
          else if (monsterAngle > 0.1) brain.outputs[50] += urgency * 0.4;
          brain.outputs[51] += 0.3; // speed boost

          // Set fighting activity
          if (social) social.activity = Activity.Fighting;
        } else {
          // FLEE: run away from monster
          if (motor) motor.wantFightMonster = false;

          const fleeBoost = 1.0 + fear * 0.5;
          // Turn AWAY from monster (opposite of angle)
          brain.outputs[48] += urgency * 0.7 * fleeBoost;
          if (monsterAngle > 0) brain.outputs[49] += urgency * 0.5 * fleeBoost;
          else brain.outputs[50] += urgency * 0.5 * fleeBoost;
          brain.outputs[51] += urgency * 0.5 * fleeBoost; // speed boost

          // Flee toward shelter if visible
          if (senses.buildingVisible) {
            brain.outputs[48] += 0.4;
          }
        }

        // Rally: if ally within range is near a monster, boost approach
        if (alliesNearby > 0 && fightScore > fleeScore * 0.8) {
          brain.outputs[48] += 0.3; // move toward the action
          brain.outputs[59] += 0.3; // patrol (defend)
        }

        // Boost anxiety from monster presence
        const biochem3 = BiochemStore.get(id);
        if (biochem3) {
          biochem3.chemicals[ChemId.Punishment] = Math.min(1,
            biochem3.chemicals[ChemId.Punishment] + urgency * 0.003);
        }
      } else {
        if (motor) motor.wantFightMonster = false;
      }

      // Instinct 19: Anxiety → violence/isolation
      const anxiety = expr?.anxiety ?? 0;
      if (anxiety > 0.3 && genome) {
        // Anxiety + aggression → boost fight/patrol
        brain.outputs[59] += anxiety * genome.aggression * 0.5; // patrol
        brain.outputs[48] += anxiety * 0.2; // restless movement
      }
      if (anxiety > 0.6) {
        // High anxiety → suppress trade (isolating behavior)
        brain.outputs[58] *= 0.3; // trade output
      }

      // Instinct 20: Tech discovery nudges
      if (transform && this.voxelWorld) {
        // Near CraftingTable + has raw materials → boost craft desire
        if (inv && genome) {
          const hasMaterials = countItem(inv, ItemType.RawStone) >= 2 || countItem(inv, ItemType.RawWood) >= 2;
          if (hasMaterials && this.nearCraftingTable(transform.x, transform.z)) {
            brain.outputs[56] += 0.5; // craft
          }
        }

        // Stuck at water edge (water ahead) → frustration, boost build/craft
        if (this.voxelWorld.isWaterAt(
          transform.x + Math.sin(transform.rotation) * 1.0,
          transform.z + Math.cos(transform.rotation) * 1.0,
        )) {
          brain.outputs[55] += 0.3; // build
          brain.outputs[56] += 0.3; // craft
          // Increase anxiety (frustration)
          const biochem2 = BiochemStore.get(id);
          if (biochem2) {
            biochem2.chemicals[ChemId.Anxiety] = Math.min(1,
              biochem2.chemicals[ChemId.Anxiety] + 0.002);
          }
        }
      }

      // Night + no shelter/torch nearby → amplified fear, stronger build/craft
      if (this.dayNight?.isNight && transform) {
        if (!senses.buildingVisible) {
          brain.outputs[55] += 0.4; // build shelter
          brain.outputs[56] += 0.3; // craft weapons/tools
          // Amplified fear at night without shelter
          const biochem3 = BiochemStore.get(id);
          if (biochem3) {
            biochem3.chemicals[ChemId.Punishment] = Math.min(1,
              biochem3.chemicals[ChemId.Punishment] + 0.001);
          }
        }
      }

      // Instinct 21: Contextual building urges
      if (motor && genome) {
        // Night + no shelter visible → strong build urge
        if (this.dayNight?.isNight && !senses.buildingVisible && genome.buildAffinity > 0.15) {
          motor.wantBuild = true;
          brain.outputs[55] += 0.5;
        }

        // Recently attacked by monsters → build defenses
        if (this.dayNight?.isNight && senses.threatVisible && genome.buildAffinity > 0.1) {
          motor.wantBuild = true;
        }

        // Low food + knows farming emoji → build farm
        const vocab = VocabularyStore.get(id);
        if (hunger > 0.4 && vocab && knows(vocab, '🌾') && genome.gatherAffinity > 0.3) {
          motor.wantBuild = true;
          brain.outputs[55] += 0.3;
        }

        // High zealotry → build monuments/shrines
        const zealotry = ZealotryStore.get(id);
        if (zealotry && zealotry.zealotry > 0.6 && genome.buildAffinity > 0.2) {
          motor.wantBuild = true;
          brain.outputs[55] += 0.3;
        }
      }

      // Apply tiredness damper to all decision outputs
      for (let d = 48; d < 60; d++) {
        brain.outputs[d] *= tirednessDamper;
      }
    }
  }

  private nearCraftingTable(wx: number, wz: number): boolean {
    if (!this.voxelWorld) return false;
    const [bx, , bz] = this.voxelWorld.worldToBlock(wx, 0, wz);
    const r = 3;
    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        const h = this.voxelWorld.getHeight(bx + dx, bz + dz);
        for (let dy = 0; dy <= 3; dy++) {
          if (this.voxelWorld.getBlock(bx + dx, h + dy, bz + dz) === Block.CraftingTable) {
            return true;
          }
        }
      }
    }
    return false;
  }

  private applyMemoryInstincts(
    brain: any, memory: MemoryData, id: number,
    hunger: number, senses: any, fear: number,
  ): void {
    const transform = TransformStore.get(id);
    if (!transform) return;

    // When hungry with no food visible, navigate toward remembered FoodLocation
    if (hunger > 0.4 && !senses.foodVisible) {
      let bestFood: { x: number; z: number; strength: number } | null = null;
      for (const mem of memory.entries) {
        if (mem.type === MemoryType.FoodLocation && mem.strength > 0.1) {
          if (!bestFood || mem.strength > bestFood.strength) {
            bestFood = { x: mem.x, z: mem.z, strength: mem.strength };
          }
        }
      }
      if (bestFood) {
        const dx = bestFood.x - transform.x;
        const dz = bestFood.z - transform.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist > 1) {
          const angle = Math.atan2(dx, dz);
          let relAngle = angle - transform.rotation;
          while (relAngle > Math.PI) relAngle -= 2 * Math.PI;
          while (relAngle < -Math.PI) relAngle += 2 * Math.PI;
          const nav = relAngle / Math.PI;
          brain.outputs[48] += 0.4 * bestFood.strength; // move toward
          if (nav < -0.1) brain.outputs[49] += 0.3 * bestFood.strength;
          else if (nav > 0.1) brain.outputs[50] += 0.3 * bestFood.strength;
        }
      }
    }

    // Avoid remembered DangerLocations
    for (const mem of memory.entries) {
      if (mem.type === MemoryType.DangerLocation && mem.strength > 0.2) {
        const dx = mem.x - transform.x;
        const dz = mem.z - transform.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist < 10) {
          const avoidance = (1.0 - dist / 10) * mem.strength * (1 + fear * 0.5);
          // Turn away from danger
          const angle = Math.atan2(dx, dz);
          let relAngle = angle - transform.rotation;
          while (relAngle > Math.PI) relAngle -= 2 * Math.PI;
          while (relAngle < -Math.PI) relAngle += 2 * Math.PI;
          if (relAngle > 0) brain.outputs[49] += avoidance * 0.3; // turn left (away)
          else brain.outputs[50] += avoidance * 0.3; // turn right (away)
          brain.outputs[48] += avoidance * 0.2; // move away
        }
      }
    }
  }
}
