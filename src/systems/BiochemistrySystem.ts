import { System } from '../ecs/System';
import type { World } from '../ecs/World';
import { BiochemStore } from '../components/Biochemistry';
import { GenomeStore } from '../components/Genome';
import { LifecycleStore, LifeStage } from '../components/Lifecycle';
import { InventoryStore, totalItems, MAX_SLOTS, MAX_STACK } from '../components/Inventory';
import { MotorStore } from '../components/Motor';
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

      // Stomach: glucose → ATP
      if (chemicals[ChemId.Glucose] > 0.01) {
        const converted = Math.min(chemicals[ChemId.Glucose] * 0.25, genome.stomachRate * 0.5);
        chemicals[ChemId.Glucose] -= converted;
        chemicals[ChemId.ATP] += converted;
      }

      // Muscles: ATP → Energy
      if (chemicals[ChemId.ATP] > 0.01) {
        const burned = genome.muscleRate * 0.08;
        chemicals[ChemId.ATP] -= Math.min(chemicals[ChemId.ATP], burned);
        chemicals[ChemId.Energy] += burned;
      }

      // Hunger: rises when glucose/energy are low, falls proportional to glucose
      const hungerRise = (1 - chemicals[ChemId.Glucose]) * 0.0015 + (1 - chemicals[ChemId.Energy]) * 0.001;
      const hungerFall = 0.001 + chemicals[ChemId.Glucose] * 0.004; // always some fall, more when fed
      chemicals[ChemId.Hunger] = clamp(chemicals[ChemId.Hunger] + hungerRise - hungerFall, 0, 1);

      // Tiredness accumulates gradually, reduced when sleeping (sleepTimer > 0 handled in InstinctSystem)
      // Rises slowly over time, faster when ATP is low
      const tiredRise = 0.0003 + (1 - chemicals[ChemId.ATP]) * 0.0002;
      chemicals[ChemId.Tiredness] = clamp(chemicals[ChemId.Tiredness] + tiredRise, 0, 1);

      // Base metabolism: energy drain, amplified by season
      const seasonDrain = this.seasonState?.drainMult ?? 1.0;
      chemicals[ChemId.Energy] -= 0.0002 * seasonDrain;

      // Movement energy cost
      const motor = MotorStore.get(id);
      if (motor) {
        chemicals[ChemId.Energy] -= 0.0001 * motor.forward;
      }

      // LifeForce only degrades during serious starvation
      if (chemicals[ChemId.Energy] < 0.03 && chemicals[ChemId.Glucose] < 0.02) {
        chemicals[ChemId.LifeForce] -= 0.0002;
      }
      if (chemicals[ChemId.Energy] <= 0 && chemicals[ChemId.ATP] <= 0) {
        chemicals[ChemId.LifeForce] -= 0.001; // actually starving
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
