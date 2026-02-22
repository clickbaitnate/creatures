import { System } from '../ecs/System';
import type { World } from '../ecs/World';
import { TransformStore } from '../components/Transform';
import { BrainStore } from '../components/Brain';
import { MotorStore } from '../components/Motor';
import { GenomeStore } from '../components/Genome';
import { BiochemStore } from '../components/Biochemistry';
import { LifecycleStore, LifeStage } from '../components/Lifecycle';
import { ChemId } from '../biochemistry/ChemicalRegistry';
import { SocialStore, Activity } from '../components/Social';
import { clamp } from '../utils/Math';
import { terrainY } from '../world/Environment';
import type { VoxelWorld } from '../voxel/VoxelWorld';
import { WORLD_HALF as VOXEL_WORLD_HALF } from '../voxel/VoxelWorld';

const WORLD_HALF = 50;

// Decision lobe: neurons 44-55
// 44=moveForward, 45=turnLeft, 46=turnRight, 47=speedMod,
// 48=eat, 49=gather, 50=hunt, 51=build,
// 52=craft, 53=deposit, 54=trade, 55=patrol

export class MotorSystem extends System {
  readonly query = TransformStore.bit | BrainStore.bit | MotorStore.bit | GenomeStore.bit;
  readonly priority = 50;

  voxelWorld: VoxelWorld | null = null;

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

      // Read Decision lobe outputs (neurons 44-55)
      const moveForward = brain.outputs[44];
      const turnLeft = brain.outputs[45];
      const turnRight = brain.outputs[46];
      const speedMod = brain.outputs[47];
      const eat = brain.outputs[48];
      const gather = brain.outputs[49];
      const hunt = brain.outputs[50];
      const build = brain.outputs[51];

      motor.forward = clamp(moveForward, 0, 2);
      motor.turnLeft = clamp(turnLeft, 0, 2);
      motor.turnRight = clamp(turnRight, 0, 2);
      motor.wantEat = eat > 0.5;
      // wantMate is driven by InstinctSystem directly — no dedicated neuron
      motor.wantGather = gather > 0.5;
      motor.wantHunt = hunt > 0.5;
      motor.wantBuild = build > 0.5;

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

      // Snap to terrain height — use voxel world if available, else fallback to terrainY
      if (this.voxelWorld) {
        transform.y = this.voxelWorld.getHeightWorld(transform.x, transform.z);
      } else {
        transform.y = terrainY(transform.x, transform.z);
      }

      // Keep in bounds — use voxel world bounds if available
      const halfBound = this.voxelWorld ? VOXEL_WORLD_HALF : WORLD_HALF;
      if (transform.x < -halfBound || transform.x > halfBound) {
        transform.x = clamp(transform.x, -halfBound, halfBound);
        transform.rotation = Math.PI - transform.rotation;
      }
      if (transform.z < -halfBound || transform.z > halfBound) {
        transform.z = clamp(transform.z, -halfBound, halfBound);
        transform.rotation = -transform.rotation;
      }

      // Set walking activity if actually moving
      const social = SocialStore.get(id);
      if (social && moveSpeed > 0.01 && social.activity === Activity.Idle) {
        social.activity = Activity.Walking;
      }

      // Movement costs energy — proportional to size (bigger burns more)
      if (biochem && moveSpeed > 0.005) {
        const cost = genome.muscleRate * moveSpeed * 0.1 * genome.bodyScale;
        biochem.chemicals[ChemId.ATP] = Math.max(0, biochem.chemicals[ChemId.ATP] - cost);
      }
    }
  }
}
