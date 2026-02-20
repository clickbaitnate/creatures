import { System } from '../ecs/System';
import type { World } from '../ecs/World';
import { TransformStore } from '../components/Transform';
import { MotorStore } from '../components/Motor';
import { GenomeStore } from '../components/Genome';
import { BiochemStore } from '../components/Biochemistry';
import { LifecycleStore, LifeStage } from '../components/Lifecycle';
import { ChemId } from '../biochemistry/ChemicalRegistry';
import { distSq } from '../utils/Math';
import { crossover } from '../genome/Crossover';
import { mutate } from '../genome/Mutation';

const MATE_RANGE_SQ = 3.0 * 3.0;
const REPRODUCTION_COOLDOWN = 200; // ticks (was 400)
const MAX_POPULATION = 60;

export type SpawnCallback = (genome: import('../genome/Genome').CreatureGenome, x: number, z: number) => void;

export class ReproductionSystem extends System {
  readonly query = MotorStore.bit | GenomeStore.bit | BiochemStore.bit | LifecycleStore.bit | TransformStore.bit;
  readonly priority = 60;

  onSpawn: SpawnCallback | null = null;

  update(world: World, _dt: number): void {
    if (!this.onSpawn) return;

    const entities = world.query(this.query);
    const aliveCount = entities.filter(id => {
      const lc = LifecycleStore.get(id);
      return lc && lc.stage === LifeStage.Alive;
    }).length;
    if (aliveCount >= MAX_POPULATION) return;

    const alreadyMated = new Set<number>();

    for (const id of entities) {
      if (alreadyMated.has(id)) continue;

      const lifecycle = LifecycleStore.get(id)!;
      if (lifecycle.stage === LifeStage.Dead) continue;
      if (lifecycle.reproductionCooldown > 0) continue;
      if (lifecycle.age < 100) continue; // maturity age lowered

      const { chemicals } = BiochemStore.get(id)!;
      const { genome: genomeA } = GenomeStore.get(id)!;

      // Either wants to mate via brain, or proximity + energy triggers it
      const motor = MotorStore.get(id)!;
      const willingToMate = motor.wantMate || chemicals[ChemId.Energy] > genomeA.fertilityThreshold;
      if (!willingToMate) continue;
      if (chemicals[ChemId.Energy] < 0.4) continue; // minimum energy

      const transformA = TransformStore.get(id)!;

      for (const otherId of entities) {
        if (otherId === id || alreadyMated.has(otherId)) continue;

        const otherLifecycle = LifecycleStore.get(otherId)!;
        if (otherLifecycle.stage === LifeStage.Dead) continue;
        if (otherLifecycle.reproductionCooldown > 0) continue;
        if (otherLifecycle.age < 100) continue;

        const otherBiochem = BiochemStore.get(otherId)!;
        if (otherBiochem.chemicals[ChemId.Energy] < 0.4) continue;

        const transformB = TransformStore.get(otherId)!;
        if (distSq(transformA.x, transformA.z, transformB.x, transformB.z) > MATE_RANGE_SQ) continue;

        // Mate!
        const childGenome = crossover(genomeA, GenomeStore.get(otherId)!.genome);
        mutate(childGenome);

        const childX = (transformA.x + transformB.x) / 2;
        const childZ = (transformA.z + transformB.z) / 2;

        this.onSpawn(childGenome, childX, childZ);

        // Energy cost (modest)
        chemicals[ChemId.Energy] -= 0.15;
        otherBiochem.chemicals[ChemId.Energy] -= 0.15;

        // Reward
        chemicals[ChemId.Reward] += 0.4;
        otherBiochem.chemicals[ChemId.Reward] += 0.4;

        lifecycle.reproductionCooldown = REPRODUCTION_COOLDOWN;
        otherLifecycle.reproductionCooldown = REPRODUCTION_COOLDOWN;

        alreadyMated.add(id);
        alreadyMated.add(otherId);
        break;
      }
    }
  }
}
