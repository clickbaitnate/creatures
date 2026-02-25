import { System } from '../ecs/System';
import type { World } from '../ecs/World';
import { TransformStore, type TransformData } from '../components/Transform';
import { BrainStore } from '../components/Brain';
import { MotorStore } from '../components/Motor';
import { GenomeStore } from '../components/Genome';
import { BiochemStore } from '../components/Biochemistry';
import { LifecycleStore, LifeStage } from '../components/Lifecycle';
import { ChemId } from '../biochemistry/ChemicalRegistry';
import { SocialStore, Activity } from '../components/Social';
import { InventoryStore, countItem, ItemType } from '../components/Inventory';
import { clamp } from '../utils/Math';
import { terrainY } from '../world/Environment';
import type { VoxelWorld } from '../voxel/VoxelWorld';
import { WORLD_HALF as VOXEL_WORLD_HALF } from '../voxel/VoxelWorld';
import { NEURON_INDICES, TIMERS, THRESHOLDS, MOVEMENT } from '../config/Constants';

// Decision lobe: neurons 48-59
// 48=moveForward, 49=turnLeft, 50=turnRight, 51=speedMod,
// 52=eat, 53=gather, 54=hunt, 55=build,
// 56=craft, 57=deposit, 58=trade, 59=patrol

const COLLISION_RADIUS = 0.35;   // creature body radius
const COLLISION_PUSH = 0.15;    // push-apart strength per frame
const COLLISION_CHECK_SQ = 1.2 * 1.2; // only check pairs within this distance²

export class MotorSystem extends System {
  readonly query = TransformStore.bit | BrainStore.bit | MotorStore.bit | GenomeStore.bit;
  readonly priority = 50;

  voxelWorld: VoxelWorld | null = null;

  update(world: World, dt: number): void {
    const entities = world.query(this.query);

    for (const id of entities) {
      const lifecycle = LifecycleStore.get(id);
      if (lifecycle && lifecycle.stage === LifeStage.Dead) continue;

      const motor = MotorStore.get(id);
      if (!motor || motor.godHeld) continue; // God hand is carrying this creature

      const brainData = BrainStore.get(id);
      const transform = TransformStore.get(id);
      const genomeData = GenomeStore.get(id);
      if (!brainData || !transform || !genomeData) continue;

      const { brain } = brainData;
      const { genome } = genomeData;
      const biochem = BiochemStore.get(id);

      // Read Decision lobe outputs (neurons 48-59)
      const moveForward = brain.outputs[NEURON_INDICES.DECISION_MOVE_FORWARD];
      const turnLeft = brain.outputs[NEURON_INDICES.DECISION_TURN_LEFT];
      const turnRight = brain.outputs[NEURON_INDICES.DECISION_TURN_RIGHT];
      const speedMod = brain.outputs[NEURON_INDICES.DECISION_SPEED_MOD];
      const eat = brain.outputs[NEURON_INDICES.DECISION_EAT];
      const gather = brain.outputs[NEURON_INDICES.DECISION_GATHER];
      const hunt = brain.outputs[NEURON_INDICES.DECISION_HUNT];
      const build = brain.outputs[NEURON_INDICES.DECISION_BUILD];

      motor.forward = clamp(moveForward, 0, 2);
      motor.turnLeft = clamp(turnLeft, 0, 2);
      motor.turnRight = clamp(turnRight, 0, 2);
      motor.wantEat = eat > 0.5;
      // wantMate is driven by InstinctSystem directly — no dedicated neuron
      motor.wantGather = gather > 0.5;
      motor.wantHunt = hunt > 0.5;
      motor.wantBuild = build > 0.5;

      // Stuck detection: if barely moved in N ticks, force a wander burst
      const dx = transform.x - motor.lastX;
      const dz = transform.z - motor.lastZ;
      if (dx * dx + dz * dz < THRESHOLDS.STUCK_DISTANCE_SQ) {
        motor.stuckTimer++;
      } else {
        motor.stuckTimer = 0;
        motor.lastX = transform.x;
        motor.lastZ = transform.z;
      }
      if (motor.stuckTimer >= TIMERS.STUCK_THRESHOLD) {
        // Force a random wander burst to break deadlock
        transform.rotation = Math.random() * Math.PI * 2;
        motor.forward = MOVEMENT.STUCK_BURST_FORWARD;
        motor.stuckTimer = 0;
        motor.lastX = transform.x;
        motor.lastZ = transform.z;
      }

      // Apply rotation
      const netTurn = (motor.turnRight - motor.turnLeft) * genome.turnRate * dt;
      transform.rotation += netTurn;

      // Apply movement — bigger creatures are slower
      const sizeSpeedPenalty = 1.0 / (0.5 + genome.bodyScale * 0.5);
      const speed = motor.forward * genome.speed * (0.5 + speedMod * 0.5) * sizeSpeedPenalty;
      const energyFactor = biochem ? clamp(biochem.chemicals[ChemId.Energy] * 4, 0.3, 1.0) : 1.0;
      let moveSpeed = speed * energyFactor * dt;

      // Slope movement cost: uphill is expensive, downhill is slightly faster
      if (this.voxelWorld) {
        const aheadX = transform.x + Math.sin(transform.rotation) * 0.5;
        const aheadZ = transform.z + Math.cos(transform.rotation) * 0.5;
        const aheadY = this.voxelWorld.getHeightWorld(aheadX, aheadZ);
        const slope = (aheadY - transform.y) / 0.5;
        if (slope > 0) {
          // Uphill: reduce speed proportionally (steep = very slow)
          moveSpeed *= clamp(1.0 - slope * 0.6, 0.2, 1.0);
        } else {
          // Downhill: slight speed boost
          moveSpeed *= clamp(1.0 - slope * 0.15, 1.0, 1.3);
        }
      }

      // Water barrier: block movement into water, retreat toward land
      if (this.voxelWorld) {
        const nextX = transform.x + Math.sin(transform.rotation) * moveSpeed;
        const nextZ = transform.z + Math.cos(transform.rotation) * moveSpeed;
        if (this.voxelWorld.isWaterAt(nextX, nextZ)) {
          const inv = InventoryStore.get(id);
          const hasBoat = inv ? countItem(inv, ItemType.Boat) > 0 : false;
          if (!hasBoat) {
            // Find dry direction: scan 8 directions, pick best land angle
            const landAngle = this.findLandDirection(transform.x, transform.z, transform.rotation);
            transform.rotation = landAngle;
            // Push inland with guaranteed minimum movement
            moveSpeed = Math.max(moveSpeed, MOVEMENT.MIN_MOVE_SPEED);
          } else {
            moveSpeed *= MOVEMENT.WATER_MOVE_PENALTY;
          }
        }
      }

      transform.x += Math.sin(transform.rotation) * moveSpeed;
      transform.z += Math.cos(transform.rotation) * moveSpeed;

      // Snap to terrain height
      if (this.voxelWorld) {
        transform.y = this.voxelWorld.getHeightWorld(transform.x, transform.z);

        // Emergency: standing on water without boat — deterministic inland push
        if (this.voxelWorld.isWaterAt(transform.x, transform.z)) {
          const inv = InventoryStore.get(id);
          const hasBoat = inv ? countItem(inv, ItemType.Boat) > 0 : false;
          if (!hasBoat) {
            const escAngle = this.findLandDirection(transform.x, transform.z, transform.rotation);
            transform.rotation = escAngle;
            transform.x += Math.sin(escAngle) * 0.2;
            transform.z += Math.cos(escAngle) * 0.2;
          }
        }
      } else {
        transform.y = terrainY(transform.x, transform.z);
      }

      // Keep in bounds — use voxel world bounds if available
      const halfBound = this.voxelWorld ? VOXEL_WORLD_HALF : MOVEMENT.WORLD_HALF;
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
      // Uphill costs extra energy
      if (biochem && moveSpeed > 0.005) {
        let cost = genome.muscleRate * moveSpeed * 0.1 * genome.bodyScale;
        // Slope surcharge
        if (this.voxelWorld) {
          const aheadX = transform.x + Math.sin(transform.rotation) * 0.5;
          const aheadZ = transform.z + Math.cos(transform.rotation) * 0.5;
          const aheadY = this.voxelWorld.getHeightWorld(aheadX, aheadZ);
          const slope = (aheadY - transform.y) / 0.5;
          if (slope > 0) cost *= 1.0 + slope * 0.5;
        }
        biochem.chemicals[ChemId.ATP] = Math.max(0, biochem.chemicals[ChemId.ATP] - cost);
      }
    }

    // ── Creature-to-creature collision resolution ──────────────
    // Simple O(n²) push-apart; fine for <200 creatures
    const alive: { id: number; t: TransformData }[] = [];
    for (const id of entities) {
      const lifecycle = LifecycleStore.get(id);
      if (lifecycle && lifecycle.stage === LifeStage.Dead) continue;
      const motor = MotorStore.get(id);
      if (motor?.godHeld) continue;
      const t = TransformStore.get(id);
      if (t) alive.push({ id, t });
    }

    for (let i = 0; i < alive.length; i++) {
      const a = alive[i];
      for (let j = i + 1; j < alive.length; j++) {
        const b = alive[j];
        const dx = b.t.x - a.t.x;
        const dz = b.t.z - a.t.z;
        const dsq = dx * dx + dz * dz;

        if (dsq < COLLISION_CHECK_SQ && dsq > 0.0001) {
          const dist = Math.sqrt(dsq);
          const overlap = COLLISION_RADIUS * 2 - dist;
          if (overlap > 0) {
            // Push apart along collision axis
            const nx = dx / dist;
            const nz = dz / dist;
            const push = Math.min(overlap * 0.5, COLLISION_PUSH);
            a.t.x -= nx * push;
            a.t.z -= nz * push;
            b.t.x += nx * push;
            b.t.z += nz * push;
          }
        }
      }
    }
  }

  /** Scan 8 directions and return the angle pointing furthest from water */
  private findLandDirection(x: number, z: number, currentRot: number): number {
    if (!this.voxelWorld) return currentRot + Math.PI;
    let bestAngle = currentRot + Math.PI; // default: 180° turn
    let bestDist = 0;
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      // Check at 1, 2, 3 units out — find direction with most land
      let landDist = 0;
      for (let r = 1; r <= 3; r++) {
        const tx = x + Math.sin(angle) * r;
        const tz = z + Math.cos(angle) * r;
        if (!this.voxelWorld.isWaterAt(tx, tz)) {
          landDist = r;
        } else {
          break;
        }
      }
      if (landDist > bestDist) {
        bestDist = landDist;
        bestAngle = angle;
      }
    }
    return bestAngle;
  }
}
