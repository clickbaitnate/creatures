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

const MATE_RANGE_SQ = 2.5 * 2.5;
const REPRODUCTION_COOLDOWN = 400; // ticks
const MAX_POPULATION = 40;

// Callback for spawning — set by main.ts
export type SpawnCallback = (genome: import('../genome/Genome').CreatureGenome, x: number, z: number) => void;

export class ReproductionSystem extends System {
  readonly query = MotorStore.bit | GenomeStore.bit | BiochemStore.bit | LifecycleStore.bit | TransformStore.bit;
  readonly priority = 60;

  onSpawn: SpawnCallback | null = null;

  update(world: World, _dt: number): void {
    if (!this.onSpawn) return;

    const entities = world.query(this.query);
    if (entities.length >= MAX_POPULATION) return;

    const alreadyMated = new Set<number>();

    for (const id of entities) {
      if (alreadyMated.has(id)) continue;

      const lifecycle = LifecycleStore.get(id)!;
      if (lifecycle.stage === LifeStage.Dead) continue;
      if (lifecycle.reproductionCooldown > 0) continue;
      if (lifecycle.age < 200) continue; // too young

      const motor = MotorStore.get(id)!;
      if (!motor.wantMate) continue;

      const { chemicals } = BiochemStore.get(id)!;
      const { genome: genomeA } = GenomeStore.get(id)!;
      if (chemicals[ChemId.Energy] < genomeA.fertilityThreshold) continue;

      const transformA = TransformStore.get(id)!;

      // Find a nearby willing mate
      for (const otherId of entities) {
        if (otherId === id || alreadyMated.has(otherId)) continue;

        const otherLifecycle = LifecycleStore.get(otherId)!;
        if (otherLifecycle.stage === LifeStage.Dead) continue;
        if (otherLifecycle.reproductionCooldown > 0) continue;
        if (otherLifecycle.age < 200) continue;

        const otherBiochem = BiochemStore.get(otherId)!;
        const { genome: genomeB } = GenomeStore.get(otherId)!;
        if (otherBiochem.chemicals[ChemId.Energy] < genomeB.fertilityThreshold) continue;

        const transformB = TransformStore.get(otherId)!;
        if (distSq(transformA.x, transformA.z, transformB.x, transformB.z) > MATE_RANGE_SQ) continue;

        // Mate!
        const childGenome = crossover(genomeA, genomeB);
        mutate(childGenome);

        const childX = (transformA.x + transformB.x) / 2;
        const childZ = (transformA.z + transformB.z) / 2;

        this.onSpawn(childGenome, childX, childZ);

        // Energy cost
        chemicals[ChemId.Energy] -= 0.3;
        otherBiochem.chemicals[ChemId.Energy] -= 0.3;

        // Reward both parents
        chemicals[ChemId.Reward] += 0.5;
        otherBiochem.chemicals[ChemId.Reward] += 0.5;

        // Cooldown
        lifecycle.reproductionCooldown = REPRODUCTION_COOLDOWN;
        otherLifecycle.reproductionCooldown = REPRODUCTION_COOLDOWN;

        alreadyMated.add(id);
        alreadyMated.add(otherId);
        break;
      }
    }
  }
}
