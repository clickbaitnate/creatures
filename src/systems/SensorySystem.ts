import { System } from '../ecs/System';
import type { World } from '../ecs/World';
import { TransformStore } from '../components/Transform';
import { SensesStore } from '../components/Senses';
import { LifecycleStore, LifeStage } from '../components/Lifecycle';
import { distSq } from '../utils/Math';

// Tag component for food entities
import { ComponentStorage } from '../ecs/Component';

export interface FoodData {
  energy: number;
}
export const FoodStore = new ComponentStorage<FoodData>();

const SIGHT_RANGE = 12;
const SIGHT_RANGE_SQ = SIGHT_RANGE * SIGHT_RANGE;

export class SensorySystem extends System {
  readonly query = SensesStore.bit | TransformStore.bit;
  readonly priority = 10;

  update(world: World, _dt: number): void {
    const creatures = world.query(this.query);
    // Gather all food positions
    const foodEntities = world.query(FoodStore.bit | TransformStore.bit);

    for (const id of creatures) {
      const senses = SensesStore.get(id)!;
      const transform = TransformStore.get(id)!;
      const lifecycle = LifecycleStore.get(id);
      if (lifecycle && lifecycle.stage === LifeStage.Dead) continue;

      // Find nearest food
      let bestFoodDSq = Infinity;
      let bestFoodId = -1;
      let bestFoodX = 0;
      let bestFoodZ = 0;

      for (const fid of foodEntities) {
        const ft = TransformStore.get(fid)!;
        const dsq = distSq(transform.x, transform.z, ft.x, ft.z);
        if (dsq < bestFoodDSq && dsq < SIGHT_RANGE_SQ) {
          bestFoodDSq = dsq;
          bestFoodId = fid;
          bestFoodX = ft.x;
          bestFoodZ = ft.z;
        }
      }

      if (bestFoodId >= 0) {
        senses.foodVisible = true;
        senses.nearestFoodId = bestFoodId;
        senses.nearestFoodDist = Math.sqrt(bestFoodDSq) / SIGHT_RANGE;
        // Relative angle: positive = food is to the right
        const dx = bestFoodX - transform.x;
        const dz = bestFoodZ - transform.z;
        const angleToFood = Math.atan2(dx, dz);
        let relAngle = angleToFood - transform.rotation;
        // Normalize to [-PI, PI]
        while (relAngle > Math.PI) relAngle -= 2 * Math.PI;
        while (relAngle < -Math.PI) relAngle += 2 * Math.PI;
        senses.nearestFoodAngle = relAngle / Math.PI; // [-1, 1]
      } else {
        senses.foodVisible = false;
        senses.nearestFoodId = -1;
        senses.nearestFoodDist = 1;
        senses.nearestFoodAngle = 0;
      }

      // Find nearest other creature
      let bestCreatureDSq = Infinity;
      let bestCreatureId = -1;
      let bestCX = 0;
      let bestCZ = 0;

      for (const cid of creatures) {
        if (cid === id) continue;
        const cl = LifecycleStore.get(cid);
        if (cl && cl.stage === LifeStage.Dead) continue;
        const ct = TransformStore.get(cid)!;
        const dsq = distSq(transform.x, transform.z, ct.x, ct.z);
        if (dsq < bestCreatureDSq && dsq < SIGHT_RANGE_SQ) {
          bestCreatureDSq = dsq;
          bestCreatureId = cid;
          bestCX = ct.x;
          bestCZ = ct.z;
        }
      }

      if (bestCreatureId >= 0) {
        senses.creatureVisible = true;
        senses.nearestCreatureId = bestCreatureId;
        senses.nearestCreatureDist = Math.sqrt(bestCreatureDSq) / SIGHT_RANGE;
        const dx = bestCX - transform.x;
        const dz = bestCZ - transform.z;
        const angleToCreature = Math.atan2(dx, dz);
        let relAngle = angleToCreature - transform.rotation;
        while (relAngle > Math.PI) relAngle -= 2 * Math.PI;
        while (relAngle < -Math.PI) relAngle += 2 * Math.PI;
        senses.nearestCreatureAngle = relAngle / Math.PI;
      } else {
        senses.creatureVisible = false;
        senses.nearestCreatureId = -1;
        senses.nearestCreatureDist = 1;
        senses.nearestCreatureAngle = 0;
      }
    }
  }
}
