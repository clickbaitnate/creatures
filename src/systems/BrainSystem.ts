import { System } from '../ecs/System';
import type { World } from '../ecs/World';
import { BrainStore } from '../components/Brain';
import { SensesStore } from '../components/Senses';
import { BiochemStore } from '../components/Biochemistry';
import { LifecycleStore, LifeStage } from '../components/Lifecycle';
import { brainTick, applyLearning } from '../brain/CTRNN';
import { ChemId } from '../biochemistry/ChemicalRegistry';

// 56-neuron layout:
// Drive(0-3), Sense(4-19), Concept(20-35), Planning(36-43), Decision(44-55)
//
// Sense inputs [4-19]:
//   4: food angle left      5: food angle right
//   6: food near             7: food far
//   8: creature angle left   9: creature angle right
//  10: creature near         11: creature far
//  12: resource angle left   13: resource angle right
//  14: resource near         15: prey near
//  16: building near         17: threat level
//  18: current tile has resource  19: prey visible
//
// Planning [36-43]:
//  36: goalFood  37: goalShelter  38: goalWeapon  39: goalSocial
//  40: goalExplore  41: goalDefend  42: goalTrade  43: goalBuild
//
// Decision outputs [44-55]:
//  44: moveForward  45: turnLeft  46: turnRight  47: speedMod
//  48: eat          49: gather    50: hunt       51: build
//  52: craft        53: deposit   54: trade      55: patrol

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

      // Inject sensory inputs (Sense lobe: neurons 4-19)
      // Food
      if (senses.foodVisible) {
        brain.inputs[4] = Math.max(0, -senses.nearestFoodAngle);  // food left
        brain.inputs[5] = Math.max(0, senses.nearestFoodAngle);   // food right
        brain.inputs[6] = 1.0 - senses.nearestFoodDist;           // food near
        brain.inputs[7] = senses.nearestFoodDist;                  // food far
      }
      // Creature
      if (senses.creatureVisible) {
        brain.inputs[8] = Math.max(0, -senses.nearestCreatureAngle);  // creature left
        brain.inputs[9] = Math.max(0, senses.nearestCreatureAngle);   // creature right
        brain.inputs[10] = 1.0 - senses.nearestCreatureDist;          // creature near
        brain.inputs[11] = senses.nearestCreatureDist;                 // creature far
      }
      // Resource
      if (senses.resourceVisible) {
        brain.inputs[12] = Math.max(0, -senses.nearestResourceAngle);
        brain.inputs[13] = Math.max(0, senses.nearestResourceAngle);
        brain.inputs[14] = 1.0 - senses.nearestResourceDist;
      }
      // Prey
      if (senses.preyVisible) {
        brain.inputs[15] = 1.0 - senses.nearestPreyDist;
      }
      // Building
      if (senses.buildingVisible) {
        brain.inputs[16] = 1.0 - senses.nearestBuildingDist;
      }
      // Threat
      brain.inputs[17] = senses.threatLevel;
      // Current tile
      brain.inputs[18] = senses.currentResourceAmount;
      brain.inputs[19] = senses.preyVisible ? 1 : 0;

      // Run CTRNN
      brainTick(brain, dt);

      // Apply learning modulated by reward/punishment chemicals
      applyLearning(brain, chemicals[ChemId.Reward], chemicals[ChemId.Punishment]);
    }
  }
}
