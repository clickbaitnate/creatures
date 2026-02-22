import { System } from '../ecs/System';
import type { World } from '../ecs/World';
import { BrainStore } from '../components/Brain';
import { SensesStore } from '../components/Senses';
import { BiochemStore } from '../components/Biochemistry';
import { TransformStore } from '../components/Transform';
import { LifecycleStore, LifeStage } from '../components/Lifecycle';
import { brainTick, applyLearning } from '../brain/CTRNN';
import { ChemId } from '../biochemistry/ChemicalRegistry';
import type { SeasonState } from '../world/Seasons';
import type { VoxelWorld } from '../voxel/VoxelWorld';

// 60-neuron layout:
// Drive(0-3), Sense(4-23), Concept(24-39), Planning(40-47), Decision(48-59)
//
// Sense inputs [4-23]:
//   4: food angle left      5: food angle right
//   6: food near             7: food far
//   8: creature angle left   9: creature angle right
//  10: creature near         11: creature far
//  12: resource angle left   13: resource angle right
//  14: resource near         15: prey near
//  16: building near         17: threat level
//  18: current tile has resource  19: prey visible
//  20: season warmth         21: altitude
//  22: terrain slope         23: time of day
//
// Planning [40-47]:
//  40: goalFood  41: goalShelter  42: goalWeapon  43: goalSocial
//  44: goalExplore  45: goalDefend  46: goalTrade  47: goalBuild
//
// Decision outputs [48-59]:
//  48: moveForward  49: turnLeft  50: turnRight  51: speedMod
//  52: eat          53: gather    54: hunt       55: build
//  56: craft        57: deposit   58: trade      59: patrol

export class BrainSystem extends System {
  readonly query = BrainStore.bit | SensesStore.bit | BiochemStore.bit;
  readonly priority = 20;

  seasonState: SeasonState | null = null;
  voxelWorld: VoxelWorld | null = null;

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

      // Inject sensory inputs (Sense lobe: neurons 4-23)
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
      // Crowd density (repurpose neuron 19 — was prey visible bool, redundant with 15)
      brain.inputs[19] = senses.crowdDensity;

      // Environment sense inputs (neurons 20-23)
      // Season warmth: spring/summer warm (0.7-1.0), autumn cool (0.4), winter cold (0.1)
      if (this.seasonState) {
        const warmth = [0.7, 1.0, 0.4, 0.1][this.seasonState.season] ?? 0.5;
        brain.inputs[20] = warmth;
      }

      // Altitude: normalized creature height (0=sea level, 1=high)
      const transform = TransformStore.get(id);
      if (transform) {
        brain.inputs[21] = Math.min(1, Math.max(0, transform.y / 20));

        // Terrain slope: difference in height ahead vs current position
        if (this.voxelWorld) {
          const aheadX = transform.x + Math.sin(transform.rotation) * 1.0;
          const aheadZ = transform.z + Math.cos(transform.rotation) * 1.0;
          const aheadY = this.voxelWorld.getHeightWorld(aheadX, aheadZ);
          const slope = (aheadY - transform.y) / 1.0; // rise over run
          brain.inputs[22] = Math.min(1, Math.max(-1, slope)); // -1 to 1
        }
      }

      // Time of day: sinusoidal cycle based on season tick
      if (this.seasonState) {
        const dayPhase = (this.seasonState.tick % 200) / 200; // 200-tick day
        brain.inputs[23] = Math.sin(dayPhase * Math.PI * 2) * 0.5 + 0.5;
      }

      // Run CTRNN
      brainTick(brain, dt);

      // Apply learning modulated by reward/punishment chemicals
      applyLearning(brain, chemicals[ChemId.Reward], chemicals[ChemId.Punishment]);
    }
  }
}
