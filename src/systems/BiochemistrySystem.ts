import { System } from '../ecs/System';
import type { World } from '../ecs/World';
import { BiochemStore } from '../components/Biochemistry';
import { GenomeStore } from '../components/Genome';
import { LifecycleStore, LifeStage } from '../components/Lifecycle';
import { InventoryStore, totalItems, MAX_SLOTS, MAX_STACK } from '../components/Inventory';
import { ChemId, CHEMICALS } from '../biochemistry/ChemicalRegistry';
import { clamp } from '../utils/Math';
import type { SeasonState } from '../world/Seasons';

export class BiochemistrySystem extends System {
  readonly query = BiochemStore.bit | GenomeStore.bit;
  readonly priority = 30;

  seasonState: SeasonState | null = null;

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

      // Base metabolism: very gentle energy drain, amplified by season
      const seasonDrain = this.seasonState?.drainMult ?? 1.0;
      chemicals[ChemId.Energy] -= 0.00008 * seasonDrain;

      // LifeForce only degrades during serious starvation (lower threshold)
      if (chemicals[ChemId.Energy] < 0.03 && chemicals[ChemId.Glucose] < 0.02) {
        chemicals[ChemId.LifeForce] -= 0.0005;
      }
      if (chemicals[ChemId.Energy] <= 0 && chemicals[ChemId.ATP] <= 0) {
        chemicals[ChemId.LifeForce] -= 0.002; // actually starving
      }

      // Scarcity → Anxiety: hunger + low glucose + low energy + empty inventory
      const inv = InventoryStore.get(id);
      const invFullness = inv ? totalItems(inv) / (MAX_SLOTS * MAX_STACK) : 0;
      const scarcity = chemicals[ChemId.Hunger] + (1 - chemicals[ChemId.Glucose]) + (1 - chemicals[ChemId.Energy]) + (1 - invFullness);
      chemicals[ChemId.Anxiety] = clamp(chemicals[ChemId.Anxiety] + scarcity * 0.005 - 0.002, 0, 1);

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
