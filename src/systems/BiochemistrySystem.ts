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

      // Stomach: glucose → ATP (generous conversion — doubled cap)
      if (chemicals[ChemId.Glucose] > 0.01) {
        const converted = Math.min(chemicals[ChemId.Glucose] * 0.25, genome.stomachRate * 0.2);
        chemicals[ChemId.Glucose] -= converted;
        chemicals[ChemId.ATP] += converted * 1.5;
      }

      // Muscles: ATP → Energy (sustained — tripled rate)
      if (chemicals[ChemId.ATP] > 0.01) {
        const burned = genome.muscleRate * 0.04;
        chemicals[ChemId.ATP] -= Math.min(chemicals[ChemId.ATP], burned);
        chemicals[ChemId.Energy] += burned * 1.0;
      }

      // Passive energy recovery — creatures slowly recover when not starving
      if (chemicals[ChemId.ATP] > 0.1 && chemicals[ChemId.Energy] < 0.8) {
        chemicals[ChemId.Energy] += 0.0003;
      }

      // Hunger rises when glucose is low (gentler curve)
      chemicals[ChemId.Hunger] = clamp(1.0 - chemicals[ChemId.Glucose] * 2.0 - chemicals[ChemId.ATP] * 0.5, 0, 1);

      // Tiredness rises when ATP is low
      chemicals[ChemId.Tiredness] = clamp(1.0 - chemicals[ChemId.ATP] * 3.0, 0, 1);

      // Base metabolism: very gentle energy drain
      chemicals[ChemId.Energy] -= 0.00008;

      // LifeForce only degrades during serious starvation (lower threshold)
      if (chemicals[ChemId.Energy] < 0.03 && chemicals[ChemId.Glucose] < 0.02) {
        chemicals[ChemId.LifeForce] -= 0.0005;
      }
      if (chemicals[ChemId.Energy] <= 0 && chemicals[ChemId.ATP] <= 0) {
        chemicals[ChemId.LifeForce] -= 0.002; // actually starving
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
