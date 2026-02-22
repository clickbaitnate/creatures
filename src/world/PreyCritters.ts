// Lightweight array-based prey critter simulation (NOT full ECS entities)
// Types: Rabbit, Bug, Fish, Deer, Boar, Turkey, Frog, Snake, Squirrel, Elk
// Water/land constraints: land critters avoid water, water critters stay in water,
// frogs are amphibious (water + shoreline)

import { randFloat, distSq, clamp } from '../utils/Math';
import { ItemType } from '../components/Inventory';
import type { VoxelWorld } from '../voxel/VoxelWorld';

export const enum CritterType {
  Rabbit = 0,
  Bug = 1,
  Fish = 2,
  Deer = 3,
  Boar = 4,
  Turkey = 5,
  Frog = 6,
  Snake = 7,
  Squirrel = 8,
  Elk = 9,
}

export const enum CritterDomain {
  Land = 0,
  Water = 1,
  Amphibious = 2,
}

export interface CritterDef {
  speed: number;
  meatValue: number;
  fleeRadius: number;
  fleeRadiusSq: number;
  size: number;         // 1=small, 2=medium, 3=large
  biome: string;
  domain: CritterDomain;
  meatType: ItemType;
  soloHuntable: boolean;
  packSize: number;     // min hunters needed
}

export const CRITTER_DEFS: Record<number, CritterDef> = {
  [CritterType.Rabbit]:   { speed: 4.0, meatValue: 0.6,  fleeRadius: 6,  fleeRadiusSq: 36,  size: 1, biome: 'meadow',    domain: CritterDomain.Land,       meatType: ItemType.RawMeat,   soloHuntable: true,  packSize: 1 },
  [CritterType.Bug]:      { speed: 0.8, meatValue: 0.15, fleeRadius: 2,  fleeRadiusSq: 4,   size: 1, biome: 'any',       domain: CritterDomain.Land,       meatType: ItemType.RawMeat,   soloHuntable: true,  packSize: 1 },
  [CritterType.Fish]:     { speed: 2.5, meatValue: 0.4,  fleeRadius: 4,  fleeRadiusSq: 16,  size: 1, biome: 'water',     domain: CritterDomain.Water,      meatType: ItemType.RawFish,   soloHuntable: true,  packSize: 1 },
  [CritterType.Deer]:     { speed: 5.5, meatValue: 1.0,  fleeRadius: 10, fleeRadiusSq: 100, size: 3, biome: 'forest',    domain: CritterDomain.Land,       meatType: ItemType.LargeMeat, soloHuntable: false, packSize: 3 },
  [CritterType.Boar]:     { speed: 3.0, meatValue: 0.8,  fleeRadius: 5,  fleeRadiusSq: 25,  size: 2, biome: 'forest',    domain: CritterDomain.Land,       meatType: ItemType.RawMeat,   soloHuntable: false, packSize: 2 },
  [CritterType.Turkey]:   { speed: 2.8, meatValue: 0.5,  fleeRadius: 6,  fleeRadiusSq: 36,  size: 2, biome: 'grassland', domain: CritterDomain.Land,       meatType: ItemType.RawMeat,   soloHuntable: true,  packSize: 1 },
  [CritterType.Frog]:     { speed: 1.5, meatValue: 0.2,  fleeRadius: 3,  fleeRadiusSq: 9,   size: 1, biome: 'water',     domain: CritterDomain.Amphibious, meatType: ItemType.RawMeat,   soloHuntable: true,  packSize: 1 },
  [CritterType.Snake]:    { speed: 2.0, meatValue: 0.3,  fleeRadius: 4,  fleeRadiusSq: 16,  size: 1, biome: 'grassland', domain: CritterDomain.Land,       meatType: ItemType.RawMeat,   soloHuntable: true,  packSize: 1 },
  [CritterType.Squirrel]: { speed: 5.0, meatValue: 0.25, fleeRadius: 7,  fleeRadiusSq: 49,  size: 1, biome: 'forest',    domain: CritterDomain.Land,       meatType: ItemType.RawMeat,   soloHuntable: true,  packSize: 1 },
  [CritterType.Elk]:      { speed: 4.5, meatValue: 1.2,  fleeRadius: 12, fleeRadiusSq: 144, size: 3, biome: 'meadow',    domain: CritterDomain.Land,       meatType: ItemType.LargeMeat, soloHuntable: false, packSize: 4 },
};

const CRITTER_TYPE_COUNT = 10;

const MAX_CRITTERS = 150;
const BREED_INTERVAL = 500;
const POND_CX = 20;
const POND_CZ = -30;
const POND_RADIUS = 6;
const AMPHIBIOUS_RANGE = 10; // frogs can wander this far from water
const WORLD_HALF = 50;

// Per-type population caps and minimum breed counts
const POP_CAP: Record<number, number> = {
  [CritterType.Rabbit]: 20, [CritterType.Bug]: 20, [CritterType.Fish]: 12,
  [CritterType.Deer]: 8, [CritterType.Boar]: 10, [CritterType.Turkey]: 12,
  [CritterType.Frog]: 10, [CritterType.Snake]: 10, [CritterType.Squirrel]: 12,
  [CritterType.Elk]: 6,
};
const MIN_BREED: Record<number, number> = {
  [CritterType.Rabbit]: 2, [CritterType.Bug]: 2, [CritterType.Fish]: 2,
  [CritterType.Deer]: 2, [CritterType.Boar]: 2, [CritterType.Turkey]: 2,
  [CritterType.Frog]: 2, [CritterType.Snake]: 2, [CritterType.Squirrel]: 2,
  [CritterType.Elk]: 2,
};

export class CritterManager {
  // SoA for cache performance
  x: Float32Array;
  z: Float32Array;
  type: Uint8Array;
  alive: Uint8Array;
  heading: Float32Array;
  count: number = 0;
  private breedTimer: number = 0;
  voxelWorld: VoxelWorld | null = null;

  constructor() {
    this.x = new Float32Array(MAX_CRITTERS);
    this.z = new Float32Array(MAX_CRITTERS);
    this.type = new Uint8Array(MAX_CRITTERS);
    this.alive = new Uint8Array(MAX_CRITTERS);
    this.heading = new Float32Array(MAX_CRITTERS);
  }

  init(): void {
    // Spawn initial populations
    for (let i = 0; i < 8; i++) this.spawn(CritterType.Rabbit);
    for (let i = 0; i < 12; i++) this.spawn(CritterType.Bug);
    for (let i = 0; i < 6; i++) this.spawn(CritterType.Fish);
    for (let i = 0; i < 4; i++) this.spawn(CritterType.Deer);
    for (let i = 0; i < 5; i++) this.spawn(CritterType.Boar);
    for (let i = 0; i < 6; i++) this.spawn(CritterType.Turkey);
    for (let i = 0; i < 5; i++) this.spawn(CritterType.Frog);
    for (let i = 0; i < 5; i++) this.spawn(CritterType.Snake);
    for (let i = 0; i < 6; i++) this.spawn(CritterType.Squirrel);
    for (let i = 0; i < 3; i++) this.spawn(CritterType.Elk);
  }

  private spawn(critterType: CritterType): number {
    if (this.count >= MAX_CRITTERS) return -1;
    const idx = this.count;
    const def = CRITTER_DEFS[critterType];

    if (def.domain === CritterDomain.Water) {
      // Spawn in pond
      const angle = randFloat(0, Math.PI * 2);
      const r = randFloat(0.5, POND_RADIUS - 0.5);
      this.x[idx] = POND_CX + Math.cos(angle) * r;
      this.z[idx] = POND_CZ + Math.sin(angle) * r;
    } else if (def.domain === CritterDomain.Amphibious) {
      // Spawn near pond edge
      const angle = randFloat(0, Math.PI * 2);
      const r = randFloat(POND_RADIUS - 1, POND_RADIUS + 3);
      this.x[idx] = POND_CX + Math.cos(angle) * r;
      this.z[idx] = POND_CZ + Math.sin(angle) * r;
    } else if (def.biome === 'forest') {
      // Spawn in forest zones, ensuring not in water
      let attempts = 0;
      do {
        const fx = randFloat(-30, -10);
        const fz = randFloat(10, 30);
        this.x[idx] = Math.random() < 0.5 ? fx : -fx;
        this.z[idx] = Math.random() < 0.5 ? fz : -fz;
        attempts++;
      } while (this.voxelWorld && this.voxelWorld.isWaterAt(this.x[idx], this.z[idx]) && attempts < 10);
    } else if (def.biome === 'grassland') {
      let attempts = 0;
      do {
        this.x[idx] = randFloat(-35, 35);
        this.z[idx] = randFloat(-35, 35);
        attempts++;
      } while (this.voxelWorld && this.voxelWorld.isWaterAt(this.x[idx], this.z[idx]) && attempts < 10);
    } else {
      // meadow / any — avoid water
      let attempts = 0;
      do {
        this.x[idx] = randFloat(-45, 45);
        this.z[idx] = randFloat(-45, 45);
        attempts++;
      } while (this.voxelWorld && this.voxelWorld.isWaterAt(this.x[idx], this.z[idx]) && attempts < 10);
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
    const def = CRITTER_DEFS[this.type[index]];
    this.alive[index] = 0;
    return def.meatValue;
  }

  /** Simulate critters for one tick. creaturePositions used for threat avoidance. */
  tick(creatureXs: Float32Array | number[], creatureZs: Float32Array | number[], creatureCount: number): void {
    const dt = 0.05;

    for (let i = 0; i < this.count; i++) {
      if (!this.alive[i]) continue;

      const def = CRITTER_DEFS[this.type[i]];
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
        const mag = Math.sqrt(fleeX * fleeX + fleeZ * fleeZ) || 1;
        this.heading[i] = Math.atan2(fleeX / mag, fleeZ / mag);
      } else {
        this.heading[i] += randFloat(-0.3, 0.3);
      }

      const speed = fleeing ? def.speed * 1.5 : def.speed * 0.3;
      const newX = this.x[i] + Math.sin(this.heading[i]) * speed * dt;
      const newZ = this.z[i] + Math.cos(this.heading[i]) * speed * dt;

      // Domain enforcement
      if (def.domain === CritterDomain.Water) {
        // Water critters: stay in pond
        const dxp = newX - POND_CX;
        const dzp = newZ - POND_CZ;
        const distPond = Math.sqrt(dxp * dxp + dzp * dzp);
        if (distPond > POND_RADIUS - 0.5) {
          // Would leave water — clamp and turn back
          const angle = Math.atan2(dxp, dzp);
          this.x[i] = POND_CX + Math.sin(angle) * (POND_RADIUS - 0.5);
          this.z[i] = POND_CZ + Math.cos(angle) * (POND_RADIUS - 0.5);
          this.heading[i] = angle + Math.PI;
        } else {
          this.x[i] = newX;
          this.z[i] = newZ;
        }
      } else if (def.domain === CritterDomain.Amphibious) {
        // Frogs: can be in water or within AMPHIBIOUS_RANGE of pond center
        const dxp = newX - POND_CX;
        const dzp = newZ - POND_CZ;
        const distPond = Math.sqrt(dxp * dxp + dzp * dzp);
        if (distPond > AMPHIBIOUS_RANGE) {
          // Too far from water — turn back toward pond
          const angle = Math.atan2(dxp, dzp);
          this.x[i] = POND_CX + Math.sin(angle) * AMPHIBIOUS_RANGE;
          this.z[i] = POND_CZ + Math.cos(angle) * AMPHIBIOUS_RANGE;
          this.heading[i] = angle + Math.PI;
        } else {
          this.x[i] = newX;
          this.z[i] = newZ;
        }
      } else {
        // Land critters: avoid water
        const isWater = this.voxelWorld ? this.voxelWorld.isWaterAt(newX, newZ) : false;
        if (isWater) {
          // Would enter water — don't move, turn away
          this.heading[i] += Math.PI * 0.5 + randFloat(-0.3, 0.3);
        } else {
          this.x[i] = newX;
          this.z[i] = newZ;
        }

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
      const counts = new Uint16Array(CRITTER_TYPE_COUNT);
      for (let i = 0; i < this.count; i++) {
        if (this.alive[i]) counts[this.type[i]]++;
      }

      // Breed if population is low and minimum breeding pair exists
      for (let t = 0; t < CRITTER_TYPE_COUNT; t++) {
        if (counts[t] < POP_CAP[t] && counts[t] >= MIN_BREED[t]) {
          this.spawn(t as CritterType);
        }
      }
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

  getDef(critterType: number): CritterDef {
    return CRITTER_DEFS[critterType];
  }
}
