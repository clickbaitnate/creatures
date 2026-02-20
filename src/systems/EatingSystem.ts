import { System } from '../ecs/System';
import type { World } from '../ecs/World';
import { TransformStore } from '../components/Transform';
import { MotorStore } from '../components/Motor';
import { BiochemStore } from '../components/Biochemistry';
import { GenomeStore } from '../components/Genome';
import { SensesStore } from '../components/Senses';
import { RenderableStore } from '../components/Renderable';
import { LifecycleStore, LifeStage } from '../components/Lifecycle';
import { FoodStore, FoodType } from './SensorySystem';
import { ChemId } from '../biochemistry/ChemicalRegistry';
import { distSq, clamp } from '../utils/Math';

const EAT_RANGE_SQ = 2.2 * 2.2;

export class EatingSystem extends System {
  readonly query = MotorStore.bit | BiochemStore.bit | SensesStore.bit | TransformStore.bit | GenomeStore.bit;
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

      // Dietary efficiency based on genome
      const { genome } = GenomeStore.get(id)!;
      let efficiency: number;
      switch (food.type) {
        case FoodType.Berry: efficiency = genome.dietBerry; break;
        case FoodType.Grass: efficiency = genome.dietGrass; break;
        case FoodType.Root:  efficiency = genome.dietRoot; break;
        default: efficiency = 0.33;
      }

      // Bigger creatures extract more energy but efficiency still matters
      const sizeBonus = 0.7 + genome.bodyScale * 0.3;
      const energyGained = food.energy * efficiency * sizeBonus;

      const { chemicals } = BiochemStore.get(id)!;
      chemicals[ChemId.Glucose] = clamp(chemicals[ChemId.Glucose] + energyGained, 0, 1);
      chemicals[ChemId.Reward] = clamp(chemicals[ChemId.Reward] + 0.25 * efficiency, 0, 1);

      // Remove food and its mesh
      const renderable = RenderableStore.get(foodId);
      if (renderable) {
        const parent = renderable.object.parent;
        if (parent) parent.remove(renderable.object);
      }
      world.destroy(foodId);
    }
  }
}
