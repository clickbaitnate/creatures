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
import { NEURON_INDICES, SEASON_WARMTH, TERRAIN, TIMERS } from '../config/Constants';

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

      const brainData = BrainStore.get(id);
      const senses = SensesStore.get(id);
      const biochemData = BiochemStore.get(id);
      if (!brainData || !senses || !biochemData) continue;

      const { brain } = brainData;
      const { chemicals } = biochemData;

      // Inject drive inputs (Drive lobe: neurons 0-3)
      brain.inputs[NEURON_INDICES.DRIVE_HUNGER] = chemicals[ChemId.Hunger];
      brain.inputs[NEURON_INDICES.DRIVE_TIREDNESS] = chemicals[ChemId.Tiredness];
      brain.inputs[NEURON_INDICES.DRIVE_PAIN] = chemicals[ChemId.Pain];
      brain.inputs[NEURON_INDICES.DRIVE_ENERGY] = 1.0 - chemicals[ChemId.Energy];  // low energy = high drive

      // Inject sensory inputs (Sense lobe: neurons 4-23)
      // Food
      if (senses.foodVisible) {
        brain.inputs[NEURON_INDICES.SENSE_FOOD_LEFT] = Math.max(0, -senses.nearestFoodAngle);
        brain.inputs[NEURON_INDICES.SENSE_FOOD_RIGHT] = Math.max(0, senses.nearestFoodAngle);
        brain.inputs[NEURON_INDICES.SENSE_FOOD_NEAR] = 1.0 - senses.nearestFoodDist;
        brain.inputs[NEURON_INDICES.SENSE_FOOD_FAR] = senses.nearestFoodDist;
      }
      // Creature
      if (senses.creatureVisible) {
        brain.inputs[NEURON_INDICES.SENSE_CREATURE_LEFT] = Math.max(0, -senses.nearestCreatureAngle);
        brain.inputs[NEURON_INDICES.SENSE_CREATURE_RIGHT] = Math.max(0, senses.nearestCreatureAngle);
        brain.inputs[NEURON_INDICES.SENSE_CREATURE_NEAR] = 1.0 - senses.nearestCreatureDist;
        brain.inputs[NEURON_INDICES.SENSE_CREATURE_FAR] = senses.nearestCreatureDist;
      }
      // Resource
      if (senses.resourceVisible) {
        brain.inputs[NEURON_INDICES.SENSE_RESOURCE_LEFT] = Math.max(0, -senses.nearestResourceAngle);
        brain.inputs[NEURON_INDICES.SENSE_RESOURCE_RIGHT] = Math.max(0, senses.nearestResourceAngle);
        brain.inputs[NEURON_INDICES.SENSE_RESOURCE_NEAR] = 1.0 - senses.nearestResourceDist;
      }
      // Prey
      if (senses.preyVisible) {
        brain.inputs[NEURON_INDICES.SENSE_PREY_NEAR] = 1.0 - senses.nearestPreyDist;
      }
      // Building
      if (senses.buildingVisible) {
        brain.inputs[NEURON_INDICES.SENSE_BUILDING_NEAR] = 1.0 - senses.nearestBuildingDist;
      }
      // Threat
      brain.inputs[NEURON_INDICES.SENSE_THREAT_LEVEL] = senses.threatLevel;
      // Current tile
      brain.inputs[NEURON_INDICES.SENSE_CURRENT_RESOURCE] = senses.currentResourceAmount;
      // Crowd density
      brain.inputs[NEURON_INDICES.SENSE_CROWD_DENSITY] = senses.crowdDensity;

      // Environment sense inputs (neurons 20-23)
      // Season warmth: spring/summer warm (0.7-1.0), autumn cool (0.4), winter cold (0.1)
      if (this.seasonState) {
        const warmthValues = [SEASON_WARMTH.SPRING, SEASON_WARMTH.SUMMER, SEASON_WARMTH.AUTUMN, SEASON_WARMTH.WINTER];
        const warmth = warmthValues[this.seasonState.season] ?? SEASON_WARMTH.DEFAULT;
        brain.inputs[NEURON_INDICES.SENSE_SEASON_WARMTH] = warmth;
      }

      // Altitude: normalized creature height (0=sea level, 1=high)
      const transform = TransformStore.get(id);
      if (transform) {
        brain.inputs[NEURON_INDICES.SENSE_ALTITUDE] = Math.min(1, Math.max(0, transform.y / TERRAIN.MAX_ALTITUDE));

        // Terrain slope: difference in height ahead vs current position
        if (this.voxelWorld) {
          const aheadX = transform.x + Math.sin(transform.rotation) * TERRAIN.SLOPE_CHECK_DISTANCE;
          const aheadZ = transform.z + Math.cos(transform.rotation) * TERRAIN.SLOPE_CHECK_DISTANCE;
          const aheadY = this.voxelWorld.getHeightWorld(aheadX, aheadZ);
          const slope = (aheadY - transform.y) / TERRAIN.SLOPE_CHECK_DISTANCE;
          brain.inputs[NEURON_INDICES.SENSE_TERRAIN_SLOPE] = Math.min(TERRAIN.SLOPE_MAX, Math.max(TERRAIN.SLOPE_MIN, slope));
        }
      }

      // Time of day: sinusoidal cycle based on season tick
      if (this.seasonState) {
        const dayPhase = (this.seasonState.tick % TIMERS.DAY_TICKS) / TIMERS.DAY_TICKS;
        brain.inputs[NEURON_INDICES.SENSE_TIME_OF_DAY] = Math.sin(dayPhase * Math.PI * 2) * 0.5 + 0.5;
      }

      // Run CTRNN
      brainTick(brain, dt);

      // Apply learning modulated by reward/punishment chemicals
      applyLearning(brain, chemicals[ChemId.Reward], chemicals[ChemId.Punishment]);
    }
  }
}
