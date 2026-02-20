import { System } from '../ecs/System';
import type { World } from '../ecs/World';
import { BrainStore } from '../components/Brain';
import { SensesStore } from '../components/Senses';
import { BiochemStore } from '../components/Biochemistry';
import { LifecycleStore, LifeStage } from '../components/Lifecycle';
import { ChemId } from '../biochemistry/ChemicalRegistry';

// Phase 1 instincts: hardwired stimulus→action mappings that bias Decision lobe outputs.
// These give creatures baseline survival behavior before learning kicks in.

export class InstinctSystem extends System {
  readonly query = BrainStore.bit | SensesStore.bit | BiochemStore.bit;
  readonly priority = 25; // After brain input injection, before motor reads outputs

  update(world: World, _dt: number): void {
    const entities = world.query(this.query);

    for (const id of entities) {
      const lifecycle = LifecycleStore.get(id);
      if (lifecycle && lifecycle.stage === LifeStage.Dead) continue;

      const { brain } = BrainStore.get(id)!;
      const senses = SensesStore.get(id)!;
      const { chemicals } = BiochemStore.get(id)!;

      const hunger = chemicals[ChemId.Hunger];
      const energy = chemicals[ChemId.Energy];

      // Decision lobe neurons: 24=forward, 25=turnLeft, 26=turnRight, 27=speed,
      //                        28=eat, 29=flee, 30=mate, 31=idle

      // Instinct 1: When hungry and food visible, approach food
      if (hunger > 0.3 && senses.foodVisible) {
        const urgency = hunger * 0.6;
        brain.outputs[24] += urgency * 0.5; // move forward
        // Steer toward food
        if (senses.nearestFoodAngle < -0.1) {
          brain.outputs[25] += urgency * 0.4; // turn left
        } else if (senses.nearestFoodAngle > 0.1) {
          brain.outputs[26] += urgency * 0.4; // turn right
        }
      }

      // Instinct 2: When adjacent to food and hungry, eat
      if (hunger > 0.2 && senses.foodVisible && senses.nearestFoodDist < 0.15) {
        brain.outputs[28] += 0.8; // eat
      }

      // Instinct 3: When not hungry and energy high, and near another creature, mate
      if (hunger < 0.3 && energy > 0.7 && senses.creatureVisible && senses.nearestCreatureDist < 0.2) {
        brain.outputs[30] += 0.6; // mate
      }

      // Instinct 4: Random exploration when no food visible
      if (!senses.foodVisible && hunger > 0.2) {
        brain.outputs[24] += 0.3; // keep moving
        // Random turn bias (changes per creature via brain state noise)
        if (brain.states[12] > 0) {
          brain.outputs[25] += 0.15;
        } else {
          brain.outputs[26] += 0.15;
        }
      }

      // Instinct 5: Approach creatures when energy is high (social/mating)
      if (energy > 0.6 && senses.creatureVisible && !senses.foodVisible) {
        const approach = 0.3;
        brain.outputs[24] += approach;
        if (senses.nearestCreatureAngle < -0.1) {
          brain.outputs[25] += approach * 0.3;
        } else if (senses.nearestCreatureAngle > 0.1) {
          brain.outputs[26] += approach * 0.3;
        }
      }

      // Instinct 6: Baseline wandering to prevent getting stuck
      brain.outputs[24] += 0.15;
    }
  }
}
