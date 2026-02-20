import { System } from '../ecs/System';
import type { World } from '../ecs/World';
import { TransformStore } from '../components/Transform';
import { BrainStore } from '../components/Brain';
import { MotorStore } from '../components/Motor';
import { GenomeStore } from '../components/Genome';
import { BiochemStore } from '../components/Biochemistry';
import { LifecycleStore, LifeStage } from '../components/Lifecycle';
import { ChemId } from '../biochemistry/ChemicalRegistry';
import { clamp } from '../utils/Math';

const WORLD_HALF = 24;

export class MotorSystem extends System {
  readonly query = TransformStore.bit | BrainStore.bit | MotorStore.bit | GenomeStore.bit;
  readonly priority = 50;

  update(world: World, dt: number): void {
    const entities = world.query(this.query);

    for (const id of entities) {
      const lifecycle = LifecycleStore.get(id);
      if (lifecycle && lifecycle.stage === LifeStage.Dead) continue;

      const { brain } = BrainStore.get(id)!;
      const motor = MotorStore.get(id)!;
      const transform = TransformStore.get(id)!;
      const { genome } = GenomeStore.get(id)!;
      const biochem = BiochemStore.get(id);

      // Read Decision lobe outputs (neurons 24-31)
      const moveForward = brain.outputs[24];
      const turnLeft = brain.outputs[25];
      const turnRight = brain.outputs[26];
      const speedMod = brain.outputs[27];
      const eat = brain.outputs[28];
      const _flee = brain.outputs[29];
      const mate = brain.outputs[30];
      const _idle = brain.outputs[31];

      motor.forward = clamp(moveForward, 0, 2);
      motor.turnLeft = clamp(turnLeft, 0, 2);
      motor.turnRight = clamp(turnRight, 0, 2);
      motor.wantEat = eat > 0.5;
      motor.wantMate = mate > 0.5;

      // Apply rotation
      const netTurn = (motor.turnRight - motor.turnLeft) * genome.turnRate * dt;
      transform.rotation += netTurn;

      // Apply movement — bigger creatures are slower
      const sizeSpeedPenalty = 1.0 / (0.5 + genome.bodyScale * 0.5);
      const speed = motor.forward * genome.speed * (0.5 + speedMod * 0.5) * sizeSpeedPenalty;
      const energyFactor = biochem ? clamp(biochem.chemicals[ChemId.Energy] * 4, 0.3, 1.0) : 1.0;
      const moveSpeed = speed * energyFactor * dt;

      transform.x += Math.sin(transform.rotation) * moveSpeed;
      transform.z += Math.cos(transform.rotation) * moveSpeed;

      // Keep in bounds — bounce off edges
      if (transform.x < -WORLD_HALF || transform.x > WORLD_HALF) {
        transform.x = clamp(transform.x, -WORLD_HALF, WORLD_HALF);
        transform.rotation = Math.PI - transform.rotation;
      }
      if (transform.z < -WORLD_HALF || transform.z > WORLD_HALF) {
        transform.z = clamp(transform.z, -WORLD_HALF, WORLD_HALF);
        transform.rotation = -transform.rotation;
      }

      // Movement costs energy — proportional to size (bigger burns more)
      if (biochem && moveSpeed > 0.005) {
        const cost = genome.muscleRate * moveSpeed * 0.1 * genome.bodyScale;
        biochem.chemicals[ChemId.ATP] = Math.max(0, biochem.chemicals[ChemId.ATP] - cost);
      }
    }
  }
}
