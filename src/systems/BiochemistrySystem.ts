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

      // Stomach: glucose → ATP (generous conversion)
      if (chemicals[ChemId.Glucose] > 0.02) {
        const converted = Math.min(chemicals[ChemId.Glucose] * 0.15, genome.stomachRate * 0.08);
        chemicals[ChemId.Glucose] -= converted;
        chemicals[ChemId.ATP] += converted * 1.2;
      }

      // Muscles: ATP → Energy (sustained)
      if (chemicals[ChemId.ATP] > 0.01) {
        const burned = genome.muscleRate * 0.015;
        chemicals[ChemId.ATP] -= Math.min(chemicals[ChemId.ATP], burned);
        chemicals[ChemId.Energy] += burned * 0.8;
      }

      // Hunger rises when glucose is low (but not as aggressively)
      chemicals[ChemId.Hunger] = clamp(1.0 - chemicals[ChemId.Glucose] * 3.0, 0, 1);

      // Tiredness rises when ATP is low
      chemicals[ChemId.Tiredness] = clamp(1.0 - chemicals[ChemId.ATP] * 3.0, 0, 1);

      // Base metabolism: very gentle energy drain
      chemicals[ChemId.Energy] -= 0.0003;

      // LifeForce only degrades during serious starvation
      if (chemicals[ChemId.Energy] < 0.05 && chemicals[ChemId.Glucose] < 0.02) {
        chemicals[ChemId.LifeForce] -= 0.001;
      }
      if (chemicals[ChemId.Energy] <= 0 && chemicals[ChemId.ATP] <= 0) {
        chemicals[ChemId.LifeForce] -= 0.003; // actually starving
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
