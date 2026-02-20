import { System } from '../ecs/System';
import type { World } from '../ecs/World';
import { BiochemStore } from '../components/Biochemistry';
import { GenomeStore } from '../components/Genome';
import { LifecycleStore, LifeStage } from '../components/Lifecycle';
import { ChemId, CHEMICALS } from '../biochemistry/ChemicalRegistry';
import { clamp } from '../utils/Math';

export class BiochemistrySystem extends System {
  readonly query = BiochemStore.bit | GenomeStore.bit;
  readonly priority = 30;

  update(world: World, _dt: number): void {
    const entities = world.query(this.query);

    for (const id of entities) {
      const lifecycle = LifecycleStore.get(id);
      if (lifecycle && lifecycle.stage === LifeStage.Dead) continue;

      const { chemicals } = BiochemStore.get(id)!;
      const { genome } = GenomeStore.get(id)!;

      // Stomach: glucose → ATP
      if (chemicals[ChemId.Glucose] > 0.05) {
        const converted = Math.min(chemicals[ChemId.Glucose], genome.stomachRate * 0.05);
        chemicals[ChemId.Glucose] -= converted;
        chemicals[ChemId.ATP] += converted * 0.8;
      }

      // Muscles: ATP → Energy (sustained energy)
      if (chemicals[ChemId.ATP] > 0.02) {
        const burned = genome.muscleRate * 0.02;
        chemicals[ChemId.ATP] -= Math.min(chemicals[ChemId.ATP], burned);
        chemicals[ChemId.Energy] += burned * 0.5;
      }

      // Hunger rises when glucose is low
      chemicals[ChemId.Hunger] = clamp(1.0 - chemicals[ChemId.Glucose] * 2.0, 0, 1);

      // Tiredness rises when ATP is low
      chemicals[ChemId.Tiredness] = clamp(1.0 - chemicals[ChemId.ATP] * 2.0, 0, 1);

      // Energy slowly drains (base metabolism)
      chemicals[ChemId.Energy] -= 0.001;

      // LifeForce degrades slowly; faster when starving
      if (chemicals[ChemId.Energy] < 0.1) {
        chemicals[ChemId.LifeForce] -= 0.002;
      }
      if (chemicals[ChemId.Glucose] < 0.01 && chemicals[ChemId.ATP] < 0.01) {
        chemicals[ChemId.LifeForce] -= 0.005;  // starving
      }

      // Age increases
      chemicals[ChemId.Age] += 0.0001;

      // Apply half-life decay
      for (let i = 0; i < CHEMICALS.length; i++) {
        chemicals[i] *= CHEMICALS[i].halfLife;
        chemicals[i] = clamp(chemicals[i], CHEMICALS[i].min, CHEMICALS[i].max);
      }
    }
  }
}
