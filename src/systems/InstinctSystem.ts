import { System } from '../ecs/System';
import type { World } from '../ecs/World';
import { BrainStore } from '../components/Brain';
import { SensesStore } from '../components/Senses';
import { BiochemStore } from '../components/Biochemistry';
import { GenomeStore } from '../components/Genome';
import { MotorStore } from '../components/Motor';
import { LifecycleStore, LifeStage } from '../components/Lifecycle';
import { InventoryStore, hasSpace, hasFood } from '../components/Inventory';
import { SocialStore, Activity } from '../components/Social';
import { ChemId } from '../biochemistry/ChemicalRegistry';
import { GoalStore, GoalType } from '../components/Goal';

// Decision lobe: neurons 44-55
// 44=moveForward, 45=turnLeft, 46=turnRight, 47=speedMod,
// 48=eat, 49=gather, 50=hunt, 51=build,
// 52=craft, 53=deposit, 54=trade, 55=patrol

export class InstinctSystem extends System {
  readonly query = BrainStore.bit | SensesStore.bit | BiochemStore.bit;
  readonly priority = 25;

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

      const hunger = chemicals[ChemId.Hunger];
      const energy = chemicals[ChemId.Energy];
      const genome = genomeData?.genome;

      // Reset activity to Idle each tick — other systems set it if active
      const social = SocialStore.get(id);
      if (social && social.matingTimer <= 0 && social.attackCooldown <= 0) {
        social.activity = Activity.Idle;
      }

      // Goal-driven instinct biases (from GoalSystem)
      if (goal) {
        switch (goal.activeGoal) {
          case GoalType.FindFood:
            if (senses.resourceVisible) {
              brain.outputs[44] += 0.5; // move toward resource
              if (senses.nearestResourceAngle < -0.1) brain.outputs[45] += 0.3;
              else if (senses.nearestResourceAngle > 0.1) brain.outputs[46] += 0.3;
            }
            if (inv && hasFood(inv)) brain.outputs[48] += 0.7;
            else brain.outputs[49] += 0.5; // gather
            break;
          case GoalType.BuildShelter:
            brain.outputs[51] += 0.6;
            if (senses.resourceVisible && inv && hasSpace(inv)) brain.outputs[49] += 0.4;
            break;
          case GoalType.CraftTool:
            brain.outputs[52] += 0.6; // craft
            break;
          case GoalType.Farm:
            brain.outputs[49] += 0.4; // gather
            brain.outputs[51] += 0.3; // build
            break;
          case GoalType.Defend:
            brain.outputs[55] += 0.5; // patrol
            brain.outputs[47] += 0.3; // speed boost
            break;
          case GoalType.Explore:
            brain.outputs[44] += 0.3;
            break;
        }
      }

      // Instinct 1: When hungry and resource visible, approach resource tile
      if (hunger > 0.3 && senses.resourceVisible) {
        const urgency = hunger * 0.6;
        brain.outputs[44] += urgency * 0.5; // move forward
        if (senses.nearestResourceAngle < -0.1) {
          brain.outputs[45] += urgency * 0.4; // turn left
        } else if (senses.nearestResourceAngle > 0.1) {
          brain.outputs[46] += urgency * 0.4; // turn right
        }
      }

      // Instinct 2: When on resource tile and hungry, eat from inventory or gather
      if (hunger > 0.2 && senses.currentResourceAmount > 0.2) {
        if (inv && hasFood(inv)) {
          brain.outputs[48] += 0.8; // eat from inventory
        } else {
          brain.outputs[49] += 0.7; // gather
        }
      }

      // Instinct 3: Gather when resource visible and inventory not full
      if (senses.resourceVisible && inv && hasSpace(inv) && genome) {
        const gatherUrge = genome.gatherAffinity * 0.4;
        if (senses.nearestResourceDist < 0.15) {
          brain.outputs[49] += gatherUrge + 0.3; // gather
        } else if (hunger > 0.2 || energy > 0.5) {
          brain.outputs[44] += gatherUrge * 0.3; // approach
        }
      }

      // Instinct 4: Eat from inventory when hungry and has food
      if (hunger > 0.3 && inv && hasFood(inv)) {
        brain.outputs[48] += hunger * 0.6;
      }

      // Instinct 5: Mate when conditions met (relaxed thresholds)
      if (hunger < 0.5 && energy > 0.3 && senses.creatureVisible && senses.nearestCreatureDist < 0.3) {
        if (motor) motor.wantMate = true;
      } else {
        if (motor) motor.wantMate = false;
      }

      // Instinct 6: Build when has materials and creative (relaxed)
      if (genome && genome.buildAffinity > 0.1 && energy > 0.3 && genome.creativity > 0.15) {
        brain.outputs[51] += genome.buildAffinity * 0.5;
      }

      // Instinct 7: Flee from threats
      if (senses.threatVisible && senses.threatLevel > 0.5) {
        brain.outputs[44] += 0.6; // run forward
        // Turn away from threat
        if (senses.nearestThreatAngle > 0) {
          brain.outputs[45] += 0.5; // turn left (away)
        } else {
          brain.outputs[46] += 0.5; // turn right (away)
        }
        brain.outputs[47] += 0.5; // speed boost
      }

      // Instinct 8: Hunt when prey visible and hungry
      if (senses.preyVisible && hunger > 0.3 && genome) {
        const huntUrge = genome.huntAffinity * (genome.aggression * 0.5 + 0.5);
        brain.outputs[50] += huntUrge * 0.5; // hunt
        brain.outputs[44] += huntUrge * 0.4; // chase
        if (senses.nearestPreyAngle < -0.1) {
          brain.outputs[45] += huntUrge * 0.3;
        } else if (senses.nearestPreyAngle > 0.1) {
          brain.outputs[46] += huntUrge * 0.3;
        }
      }

      // Instinct 9: Explore when no resources visible
      if (!senses.resourceVisible && hunger > 0.2) {
        brain.outputs[44] += 0.3; // keep moving
        if (brain.states[20] > 0) {
          brain.outputs[45] += 0.15;
        } else {
          brain.outputs[46] += 0.15;
        }
      }

      // Instinct 10: Approach creatures socially
      if (energy > 0.6 && senses.creatureVisible && !senses.resourceVisible) {
        const approach = 0.3;
        brain.outputs[44] += approach;
        if (senses.nearestCreatureAngle < -0.1) {
          brain.outputs[45] += approach * 0.3;
        } else if (senses.nearestCreatureAngle > 0.1) {
          brain.outputs[46] += approach * 0.3;
        }
      }

      // Instinct 11: Baseline wandering
      brain.outputs[44] += 0.15;
    }
  }
}
