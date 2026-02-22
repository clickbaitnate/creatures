// Night monsters: SoA-based (not ECS) for performance.
// Types: Skeleton (fast, fragile), Demon (tough, slow), GiantSpider (ambush), Zombie (horde).

import type { DayNightState } from './DayNightCycle';
import type { VoxelWorld } from '../voxel/VoxelWorld';
import { Block } from '../voxel/BlockTypes';
import { WORLD_HALF } from '../voxel/VoxelWorld';

export const MAX_MONSTERS = 20;

export const enum MonsterType {
  None = 0,
  Skeleton = 1,
  Demon = 2,
  GiantSpider = 3,
  Zombie = 4,
}

export const MONSTER_NAMES: Record<number, string> = {
  [MonsterType.Skeleton]: 'Skeleton',
  [MonsterType.Demon]: 'Demon',
  [MonsterType.GiantSpider]: 'Giant Spider',
  [MonsterType.Zombie]: 'Zombie',
};

export const MONSTER_EMOJI: Record<number, string> = {
  [MonsterType.Skeleton]: '💀',
  [MonsterType.Demon]: '👹',
  [MonsterType.GiantSpider]: '🕷️',
  [MonsterType.Zombie]: '🧟',
};

// Per-type stats
const MONSTER_STATS: Record<number, { speed: number; damage: number; maxHealth: number; attackInterval: number }> = {
  [MonsterType.Skeleton]: { speed: 0.18, damage: 0.015, maxHealth: 0.5, attackInterval: 40 },
  [MonsterType.Demon]:    { speed: 0.08, damage: 0.035, maxHealth: 1.5, attackInterval: 60 },
  [MonsterType.GiantSpider]: { speed: 0.22, damage: 0.012, maxHealth: 0.35, attackInterval: 25 },
  [MonsterType.Zombie]:   { speed: 0.06, damage: 0.02, maxHealth: 0.7, attackInterval: 50 },
};

// SoA storage
export class MonsterManager {
  count = 0;
  type = new Uint8Array(MAX_MONSTERS);
  x = new Float32Array(MAX_MONSTERS);
  z = new Float32Array(MAX_MONSTERS);
  y = new Float32Array(MAX_MONSTERS);
  vx = new Float32Array(MAX_MONSTERS);
  vz = new Float32Array(MAX_MONSTERS);
  health = new Float32Array(MAX_MONSTERS);
  maxHealth = new Float32Array(MAX_MONSTERS);
  targetCreature = new Int32Array(MAX_MONSTERS); // creature entity id, -1 if none
  alive = new Uint8Array(MAX_MONSTERS);
  attackCooldown = new Float32Array(MAX_MONSTERS);
  /** Incremented on death so renderer can detect changes */
  deathCounter = 0;

  private spawnTimer = 0;

  tick(
    dayNight: DayNightState,
    voxelWorld: VoxelWorld | null,
    creatureX: Float32Array,
    creatureZ: Float32Array,
    creatureCrowd: Float32Array,
    creatureCount: number,
    creatureIds: number[],
    damageCallback: (creatureId: number, damage: number) => void,
  ): void {
    // Despawn at dawn
    if (!dayNight.isNight) {
      for (let i = 0; i < MAX_MONSTERS; i++) {
        if (this.alive[i]) {
          this.alive[i] = 0;
          this.deathCounter++;
        }
      }
      this.count = 0;
      return;
    }

    // Spawn at world edges when night (slower rate than before)
    this.spawnTimer++;
    if (this.spawnTimer >= 120 && this.count < 12 && creatureCount > 0) {
      this.spawnTimer = 0;
      this.spawnMonster();
    }

    // Update each active monster
    for (let i = 0; i < MAX_MONSTERS; i++) {
      if (!this.alive[i]) continue;

      const mType = this.type[i] as MonsterType;
      const stats = MONSTER_STATS[mType];

      // Tick attack cooldown
      if (this.attackCooldown[i] > 0) this.attackCooldown[i]--;

      // Skeletons flee from torches
      if (mType === MonsterType.Skeleton && voxelWorld) {
        if (this.nearTorch(voxelWorld, this.x[i], this.z[i])) {
          this.vx[i] = (Math.random() - 0.5) * 0.5;
          this.vz[i] = (Math.random() - 0.5) * 0.5;
          this.x[i] += this.vx[i];
          this.z[i] += this.vz[i];
          continue;
        }
      }

      // Spiders prefer to ambush loners (similar to old wraith)
      // Demons charge the strongest group
      // Zombies wander slowly toward nearest

      // Find target creature
      let bestDSq = Infinity;
      let bestIdx = -1;
      for (let c = 0; c < creatureCount; c++) {
        const dx = creatureX[c] - this.x[i];
        const dz = creatureZ[c] - this.z[i];
        let dsq = dx * dx + dz * dz;

        // Spiders prefer loners
        if (mType === MonsterType.GiantSpider) {
          dsq *= (0.3 + creatureCrowd[c]);
        }
        // Demons prefer groups (drawn to activity)
        if (mType === MonsterType.Demon) {
          dsq *= (1.5 - creatureCrowd[c] * 0.5);
        }

        if (dsq < bestDSq) {
          bestDSq = dsq;
          bestIdx = c;
        }
      }

      if (bestIdx >= 0) {
        const dx = creatureX[bestIdx] - this.x[i];
        const dz = creatureZ[bestIdx] - this.z[i];
        const dist = Math.sqrt(dx * dx + dz * dz);

        if (dist > 0.5) {
          this.vx[i] = (dx / dist) * stats.speed;
          this.vz[i] = (dz / dist) * stats.speed;
        }

        // Attack if close AND cooldown is 0
        if (dist < 2.0 && this.attackCooldown[i] <= 0) {
          damageCallback(creatureIds[bestIdx], stats.damage);
          this.targetCreature[i] = creatureIds[bestIdx];
          this.attackCooldown[i] = stats.attackInterval;
        }
      }

      this.x[i] += this.vx[i];
      this.z[i] += this.vz[i];

      // Keep in bounds
      const halfBound = WORLD_HALF - 2;
      if (this.x[i] < -halfBound || this.x[i] > halfBound) this.vx[i] *= -1;
      if (this.z[i] < -halfBound || this.z[i] > halfBound) this.vz[i] *= -1;

      // Update y from voxel world
      if (voxelWorld) {
        this.y[i] = voxelWorld.getHeightWorld(this.x[i], this.z[i]) + 0.5;
      }
    }
  }

  /** Apply damage to a monster. Returns true if killed. */
  takeDamage(index: number, damage: number): boolean {
    if (!this.alive[index]) return false;
    this.health[index] -= damage;
    if (this.health[index] <= 0) {
      this.alive[index] = 0;
      this.count--;
      this.deathCounter++;
      return true;
    }
    return false;
  }

  private spawnMonster(): void {
    let slot = -1;
    for (let i = 0; i < MAX_MONSTERS; i++) {
      if (!this.alive[i]) { slot = i; break; }
    }
    if (slot < 0) return;

    // Weighted type selection
    const r = Math.random();
    let mType: MonsterType;
    if (r < 0.35) mType = MonsterType.Skeleton;
    else if (r < 0.55) mType = MonsterType.Zombie;
    else if (r < 0.75) mType = MonsterType.GiantSpider;
    else mType = MonsterType.Demon;

    const stats = MONSTER_STATS[mType];

    this.alive[slot] = 1;
    this.health[slot] = stats.maxHealth;
    this.maxHealth[slot] = stats.maxHealth;
    this.targetCreature[slot] = -1;
    this.type[slot] = mType;
    this.attackCooldown[slot] = 0;

    // Spawn at world edge
    const edge = Math.floor(Math.random() * 4);
    const halfBound = WORLD_HALF - 5;
    switch (edge) {
      case 0: this.x[slot] = -halfBound; this.z[slot] = (Math.random() - 0.5) * halfBound * 2; break;
      case 1: this.x[slot] = halfBound; this.z[slot] = (Math.random() - 0.5) * halfBound * 2; break;
      case 2: this.z[slot] = -halfBound; this.x[slot] = (Math.random() - 0.5) * halfBound * 2; break;
      case 3: this.z[slot] = halfBound; this.x[slot] = (Math.random() - 0.5) * halfBound * 2; break;
    }

    this.count++;
  }

  private nearTorch(voxelWorld: VoxelWorld, wx: number, wz: number): boolean {
    const [bx, , bz] = voxelWorld.worldToBlock(wx, 0, wz);
    const r = 4;
    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        const h = voxelWorld.getHeight(bx + dx, bz + dz);
        for (let dy = 0; dy <= 3; dy++) {
          if (voxelWorld.getBlock(bx + dx, h + dy, bz + dz) === Block.Torch) {
            return true;
          }
        }
      }
    }
    return false;
  }
}
