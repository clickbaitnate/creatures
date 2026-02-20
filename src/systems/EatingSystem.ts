import { System } from '../ecs/System';
import type { World } from '../ecs/World';
import { TransformStore } from '../components/Transform';
import { MotorStore } from '../components/Motor';
import { BiochemStore } from '../components/Biochemistry';
import { SensesStore } from '../components/Senses';
import { LifecycleStore, LifeStage } from '../components/Lifecycle';
import { FoodStore } from './SensorySystem';
import { ChemId } from '../biochemistry/ChemicalRegistry';
import { distSq, clamp } from '../utils/Math';

const EAT_RANGE_SQ = 1.8 * 1.8;

export class EatingSystem extends System {
  readonly query = MotorStore.bit | BiochemStore.bit | SensesStore.bit | TransformStore.bit;
  readonly priority = 55;

  update(world: World, _dt: number): void {
    const entities = world.query(this.query);

    for (const id of entities) {
      const lifecycle = LifecycleStore.get(id);
      if (lifecycle && lifecycle.stage === LifeStage.Dead) continue;

      const motor = MotorStore.get(id)!;
      if (!motor.wantEat) continue;

      const senses = SensesStore.get(id)!;
      if (!senses.foodVisible || senses.nearestFoodId < 0) continue;

      const transform = TransformStore.get(id)!;
      const foodId = senses.nearestFoodId;

      if (!world.has(foodId)) continue;

      const foodTransform = TransformStore.get(foodId);
      if (!foodTransform) continue;

      if (distSq(transform.x, transform.z, foodTransform.x, foodTransform.z) > EAT_RANGE_SQ) continue;

      const food = FoodStore.get(foodId);
      if (!food) continue;

      // Eat!
      const { chemicals } = BiochemStore.get(id)!;
      chemicals[ChemId.Glucose] = clamp(chemicals[ChemId.Glucose] + food.energy, 0, 1);
      chemicals[ChemId.Reward] = clamp(chemicals[ChemId.Reward] + 0.3, 0, 1);

      // Remove food
      world.destroy(foodId);
    }
  }
}
