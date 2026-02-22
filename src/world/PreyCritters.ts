// Lightweight array-based prey critter simulation (NOT full ECS entities)
// Types: Rabbit (meadow/forest), Bug (everywhere), Fish (pond only)

import { randFloat, distSq, clamp } from '../utils/Math';

export const enum CritterType {
  Rabbit = 0,
  Bug = 1,
  Fish = 2,
}

interface CritterDef {
  speed: number;
  meatValue: number;
  fleeRadius: number;
  fleeRadiusSq: number;
}

const CRITTER_DEFS: Record<CritterType, CritterDef> = {
  [CritterType.Rabbit]: { speed: 4.0, meatValue: 0.6, fleeRadius: 6, fleeRadiusSq: 36 },
  [CritterType.Bug]:    { speed: 0.8, meatValue: 0.15, fleeRadius: 2, fleeRadiusSq: 4 },
  [CritterType.Fish]:   { speed: 2.5, meatValue: 0.4, fleeRadius: 4, fleeRadiusSq: 16 },
};

const MAX_CRITTERS = 60;
const BREED_INTERVAL = 500;
const POND_CX = 20;
const POND_CZ = -30;
const POND_RADIUS = 6;
const WORLD_HALF = 50;

export class CritterManager {
  // SoA for cache performance
  x: Float32Array;
  z: Float32Array;
  type: Uint8Array;
  alive: Uint8Array;
  heading: Float32Array;
  count: number = 0;
  private breedTimer: number = 0;

  constructor() {
    this.x = new Float32Array(MAX_CRITTERS);
    this.z = new Float32Array(MAX_CRITTERS);
    this.type = new Uint8Array(MAX_CRITTERS);
    this.alive = new Uint8Array(MAX_CRITTERS);
    this.heading = new Float32Array(MAX_CRITTERS);
  }

  init(): void {
    // Spawn initial population: 8 rabbits, 12 bugs, 6 fish
    for (let i = 0; i < 8; i++) this.spawn(CritterType.Rabbit);
    for (let i = 0; i < 12; i++) this.spawn(CritterType.Bug);
    for (let i = 0; i < 6; i++) this.spawn(CritterType.Fish);
  }

  private spawn(critterType: CritterType): number {
    if (this.count >= MAX_CRITTERS) return -1;
    const idx = this.count;

    if (critterType === CritterType.Fish) {
      // Spawn near pond
      const angle = randFloat(0, Math.PI * 2);
      const r = randFloat(0.5, POND_RADIUS - 0.5);
      this.x[idx] = POND_CX + Math.cos(angle) * r;
      this.z[idx] = POND_CZ + Math.sin(angle) * r;
    } else {
      this.x[idx] = randFloat(-45, 45);
      this.z[idx] = randFloat(-45, 45);
    }

    this.type[idx] = critterType;
    this.alive[idx] = 1;
    this.heading[idx] = randFloat(0, Math.PI * 2);
    this.count++;
    return idx;
  }

  /** Kill a critter by index. Returns meat value. */
  kill(index: number): number {
    if (index < 0 || index >= this.count || !this.alive[index]) return 0;
    const def = CRITTER_DEFS[this.type[index] as CritterType];
    this.alive[index] = 0;
    return def.meatValue;
  }

  /** Simulate critters for one tick. creaturePositions is array of [x,z] for threat avoidance. */
  tick(creatureXs: Float32Array | number[], creatureZs: Float32Array | number[], creatureCount: number): void {
    const dt = 0.05;

    for (let i = 0; i < this.count; i++) {
      if (!this.alive[i]) continue;

      const def = CRITTER_DEFS[this.type[i] as CritterType];
      let fleeX = 0, fleeZ = 0;
      let fleeing = false;

      // Check for nearby creatures to flee from
      for (let c = 0; c < creatureCount; c++) {
        const dsq = distSq(this.x[i], this.z[i], creatureXs[c] as number, creatureZs[c] as number);
        if (dsq < def.fleeRadiusSq && dsq > 0.01) {
          const d = Math.sqrt(dsq);
          fleeX += (this.x[i] - (creatureXs[c] as number)) / d;
          fleeZ += (this.z[i] - (creatureZs[c] as number)) / d;
          fleeing = true;
        }
      }

      if (fleeing) {
        // Normalize flee direction
        const mag = Math.sqrt(fleeX * fleeX + fleeZ * fleeZ) || 1;
        this.heading[i] = Math.atan2(fleeX / mag, fleeZ / mag);
      } else {
        // Random wander
        this.heading[i] += randFloat(-0.3, 0.3);
      }

      const speed = fleeing ? def.speed * 1.5 : def.speed * 0.3;
      this.x[i] += Math.sin(this.heading[i]) * speed * dt;
      this.z[i] += Math.cos(this.heading[i]) * speed * dt;

      // Fish are tethered to pond
      if (this.type[i] === CritterType.Fish) {
        const dxp = this.x[i] - POND_CX;
        const dzp = this.z[i] - POND_CZ;
        const distPond = Math.sqrt(dxp * dxp + dzp * dzp);
        if (distPond > POND_RADIUS - 0.5) {
          const angle = Math.atan2(dxp, dzp);
          this.x[i] = POND_CX + Math.sin(angle) * (POND_RADIUS - 0.5);
          this.z[i] = POND_CZ + Math.cos(angle) * (POND_RADIUS - 0.5);
          this.heading[i] = angle + Math.PI; // turn back
        }
      } else {
        // Keep in world bounds
        if (this.x[i] < -WORLD_HALF) { this.x[i] = -WORLD_HALF; this.heading[i] = Math.PI - this.heading[i]; }
        if (this.x[i] > WORLD_HALF) { this.x[i] = WORLD_HALF; this.heading[i] = Math.PI - this.heading[i]; }
        if (this.z[i] < -WORLD_HALF) { this.z[i] = -WORLD_HALF; this.heading[i] = -this.heading[i]; }
        if (this.z[i] > WORLD_HALF) { this.z[i] = WORLD_HALF; this.heading[i] = -this.heading[i]; }
      }
    }

    // Breeding
    this.breedTimer++;
    if (this.breedTimer >= BREED_INTERVAL) {
      this.breedTimer = 0;
      this.compact();

      // Count by type
      let rabbits = 0, bugs = 0, fish = 0;
      for (let i = 0; i < this.count; i++) {
        if (!this.alive[i]) continue;
        if (this.type[i] === CritterType.Rabbit) rabbits++;
        else if (this.type[i] === CritterType.Bug) bugs++;
        else fish++;
      }

      // Breed if population is low
      if (rabbits < 12 && rabbits >= 2) this.spawn(CritterType.Rabbit);
      if (bugs < 16 && bugs >= 2) this.spawn(CritterType.Bug);
      if (fish < 8 && fish >= 2) this.spawn(CritterType.Fish);
    }
  }

  /** Remove dead critters and compact arrays */
  private compact(): void {
    let write = 0;
    for (let read = 0; read < this.count; read++) {
      if (this.alive[read]) {
        if (write !== read) {
          this.x[write] = this.x[read];
          this.z[write] = this.z[read];
          this.type[write] = this.type[read];
          this.alive[write] = this.alive[read];
          this.heading[write] = this.heading[read];
        }
        write++;
      }
    }
    this.count = write;
  }

  getDef(critterType: CritterType): CritterDef {
    return CRITTER_DEFS[critterType];
  }
}
