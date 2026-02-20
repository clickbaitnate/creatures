import { System } from '../ecs/System';
import type { World } from '../ecs/World';
import { BrainStore } from '../components/Brain';
import { SensesStore } from '../components/Senses';
import { BiochemStore } from '../components/Biochemistry';
import { LifecycleStore, LifeStage } from '../components/Lifecycle';
import { brainTick, applyLearning } from '../brain/CTRNN';
import { ChemId } from '../biochemistry/ChemicalRegistry';

export class BrainSystem extends System {
  readonly query = BrainStore.bit | SensesStore.bit | BiochemStore.bit;
  readonly priority = 20;

  update(world: World, dt: number): void {
    const entities = world.query(this.query);

    for (const id of entities) {
      const lifecycle = LifecycleStore.get(id);
      if (lifecycle && lifecycle.stage === LifeStage.Dead) continue;

      const { brain } = BrainStore.get(id)!;
      const senses = SensesStore.get(id)!;
      const { chemicals } = BiochemStore.get(id)!;

      // Inject drive inputs (Drive lobe: neurons 0-3)
      brain.inputs[0] = chemicals[ChemId.Hunger];       // hunger drive
      brain.inputs[1] = chemicals[ChemId.Tiredness];     // tiredness drive
      brain.inputs[2] = chemicals[ChemId.Pain];          // pain drive
      brain.inputs[3] = 1.0 - chemicals[ChemId.Energy];  // low energy = high drive

      // Inject sensory inputs (Sense lobe: neurons 4-11)
      // Food: angle mapped to left/right neurons, distance to near/far
      if (senses.foodVisible) {
        brain.inputs[4] = Math.max(0, -senses.nearestFoodAngle);  // food left
        brain.inputs[5] = Math.max(0, senses.nearestFoodAngle);   // food right
        brain.inputs[6] = 1.0 - senses.nearestFoodDist;           // food near
        brain.inputs[7] = senses.nearestFoodDist;                  // food far
      }
      // Creature: same pattern
      if (senses.creatureVisible) {
        brain.inputs[8] = Math.max(0, -senses.nearestCreatureAngle);  // creature left
        brain.inputs[9] = Math.max(0, senses.nearestCreatureAngle);   // creature right
        brain.inputs[10] = 1.0 - senses.nearestCreatureDist;          // creature near
        brain.inputs[11] = senses.nearestCreatureDist;                 // creature far
      }

      // Run CTRNN
      brainTick(brain, dt);

      // Apply learning modulated by reward/punishment chemicals
      applyLearning(brain, chemicals[ChemId.Reward], chemicals[ChemId.Punishment]);
    }
  }
}
