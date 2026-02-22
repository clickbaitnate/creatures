// 50x50 cellular automata resource grid over 100x100 world
// SoA flat arrays for cache performance

export const GRID_SIZE = 50;
export const CELL_SIZE = 2; // 2-unit cells over 100x100 world
export const GRID_CELLS = GRID_SIZE * GRID_SIZE; // 2500

export const enum Biome {
  Meadow = 0,    // berry zone
  Forest = 1,    // grass/herb zone
  Scrubland = 2, // root zone
  Rocky = 3,     // edges
  Wetland = 4,   // near pond
}

export const enum Resource {
  Empty = 0,
  Grass = 1,
  BerryBush = 2,
  RootTuber = 3,
  Wood = 4,
  Stone = 5,
  Ore = 6,
  Farmland = 7,
}

// Growth rates per tick
const GROWTH_RATES: Record<Resource, number> = {
  [Resource.Empty]: 0,
  [Resource.Grass]: 0.003,
  [Resource.BerryBush]: 0.002,
  [Resource.RootTuber]: 0.0015,
  [Resource.Wood]: 0.001,
  [Resource.Stone]: 0.0005,
  [Resource.Ore]: 0.0003,
  [Resource.Farmland]: 0.006, // 2x grass
};

// Spread probability when mature (amount > 0.8)
const SPREAD_RATES: Record<Resource, number> = {
  [Resource.Empty]: 0,
  [Resource.Grass]: 0.008,
  [Resource.BerryBush]: 0.003,
  [Resource.RootTuber]: 0.002,
  [Resource.Wood]: 0.001,
  [Resource.Stone]: 0,
  [Resource.Ore]: 0,
  [Resource.Farmland]: 0,
};

// Cooldown ticks after harvesting
const HARVEST_COOLDOWNS: Record<Resource, number> = {
  [Resource.Empty]: 0,
  [Resource.Grass]: 100,
  [Resource.BerryBush]: 150,
  [Resource.RootTuber]: 120,
  [Resource.Wood]: 500,
  [Resource.Stone]: 3000,
  [Resource.Ore]: 5000,
  [Resource.Farmland]: 80,
};

// Points of Interest — hardcoded attractor locations
export interface POI {
  name: string;
  x: number;      // world X
  z: number;      // world Z
  radius: number;  // world units
  biome: Biome;
  growthBonus: number; // multiplier on growth rate
}

export const POIS: POI[] = [
  { name: 'Oasis',            x:  5,   z:  5,   radius: 12, biome: Biome.Meadow,    growthBonus: 2.0 },
  { name: 'Forest Grove',     x: -30,  z:  30,  radius: 15, biome: Biome.Forest,    growthBonus: 1.5 },
  { name: 'Rocky Highlands',  x:  35,  z:  30,  radius: 14, biome: Biome.Rocky,     growthBonus: 1.3 },
  { name: 'Fertile Valley',   x: -25,  z: -25,  radius: 14, biome: Biome.Scrubland, growthBonus: 1.8 },
  { name: 'Pond',             x:  20,  z: -30,  radius: 10, biome: Biome.Wetland,   growthBonus: 1.6 },
  { name: 'Ancient Stones',   x: -10,  z:  0,   radius:  8, biome: Biome.Rocky,     growthBonus: 1.2 },
];

export class ResourceGrid {
  biome: Uint8Array;
  resource: Uint8Array;
  amount: Float32Array;
  cooldown: Uint16Array;
  dirty: boolean = true; // for renderer rebuild
  private farmTimers: Uint16Array; // ticks since creature was nearby
  private poiGrowthBonus: Float32Array; // per-cell growth multiplier from POIs

  constructor() {
    this.biome = new Uint8Array(GRID_CELLS);
    this.resource = new Uint8Array(GRID_CELLS);
    this.amount = new Float32Array(GRID_CELLS);
    this.cooldown = new Uint16Array(GRID_CELLS);
    this.farmTimers = new Uint16Array(GRID_CELLS);
    this.poiGrowthBonus = new Float32Array(GRID_CELLS).fill(1.0);
  }

  init(): void {
    const WORLD_HALF = GRID_SIZE * CELL_SIZE / 2; // 50
    const EDGE_DIST = WORLD_HALF - 8;

    // Pre-compute POI growth bonuses per cell
    for (let gz = 0; gz < GRID_SIZE; gz++) {
      for (let gx = 0; gx < GRID_SIZE; gx++) {
        const idx = gz * GRID_SIZE + gx;
        const wx = (gx - GRID_SIZE / 2) * CELL_SIZE + CELL_SIZE / 2;
        const wz = (gz - GRID_SIZE / 2) * CELL_SIZE + CELL_SIZE / 2;

        // Distance from center
        const distCenter = Math.sqrt(wx * wx + wz * wz);

        // Check which POI this cell is in (use closest with strongest influence)
        let bestPoiBiome: Biome | null = null;
        let bestPoiInfluence = 0;
        let poiBonus = 1.0;

        for (const poi of POIS) {
          const dx = wx - poi.x;
          const dz = wz - poi.z;
          const dist = Math.sqrt(dx * dx + dz * dz);
          if (dist < poi.radius) {
            const influence = 1.0 - dist / poi.radius;
            if (influence > bestPoiInfluence) {
              bestPoiInfluence = influence;
              bestPoiBiome = poi.biome;
              poiBonus = 1.0 + (poi.growthBonus - 1.0) * influence;
            }
          }
        }

        this.poiGrowthBonus[idx] = poiBonus;

        // Assign biome: POI overrides, then angle-based zones, then rocky edges
        let biome: Biome;
        if (bestPoiBiome !== null && bestPoiInfluence > 0.3) {
          biome = bestPoiBiome;
        } else if (distCenter > EDGE_DIST) {
          biome = Biome.Rocky;
        } else {
          // Use angle-based sectors with some noise for variety
          const angle = Math.atan2(wz, wx);
          const noise = Math.sin(wx * 0.15) * Math.cos(wz * 0.2) * 0.3;
          const adjustedAngle = angle + noise;
          if (adjustedAngle < -Math.PI * 0.6) biome = Biome.Scrubland;
          else if (adjustedAngle < -Math.PI * 0.1) biome = Biome.Forest;
          else if (adjustedAngle < Math.PI * 0.4) biome = Biome.Meadow;
          else if (adjustedAngle < Math.PI * 0.7) biome = Biome.Forest;
          else biome = Biome.Scrubland;
        }
        this.biome[idx] = biome;

        // Assign initial resources based on biome
        let res: Resource;
        const r = Math.random();
        switch (biome) {
          case Biome.Meadow:
            res = r < 0.5 ? Resource.BerryBush : r < 0.8 ? Resource.Grass : Resource.Empty;
            break;
          case Biome.Forest:
            res = r < 0.4 ? Resource.Grass : r < 0.7 ? Resource.Wood : r < 0.85 ? Resource.BerryBush : Resource.Empty;
            break;
          case Biome.Scrubland:
            res = r < 0.4 ? Resource.RootTuber : r < 0.65 ? Resource.Grass : r < 0.8 ? Resource.Stone : Resource.Empty;
            break;
          case Biome.Rocky:
            res = r < 0.4 ? Resource.Stone : r < 0.6 ? Resource.Ore : r < 0.75 ? Resource.Grass : Resource.Empty;
            break;
          case Biome.Wetland:
            res = r < 0.5 ? Resource.Grass : r < 0.7 ? Resource.BerryBush : Resource.Empty;
            break;
          default:
            res = Resource.Empty;
        }
        this.resource[idx] = res;
        this.amount[idx] = res !== Resource.Empty ? Math.random() * 0.5 + 0.3 : 0;
      }
    }
    this.dirty = true;
  }

  /** Run CA rules. Call every CA_INTERVAL ticks. */
  tick(growthMult: number, spreadMult: number): void {
    // Growth phase
    for (let i = 0; i < GRID_CELLS; i++) {
      if (this.cooldown[i] > 0) {
        this.cooldown[i]--;
        continue;
      }
      const res = this.resource[i] as Resource;
      if (res === Resource.Empty) continue;

      const rate = GROWTH_RATES[res] * growthMult * this.poiGrowthBonus[i];
      if (this.amount[i] < 1.0) {
        this.amount[i] = Math.min(1.0, this.amount[i] + rate);
        this.dirty = true;
      }
    }

    // Spreading phase — mature cells seed empty neighbors
    for (let gz = 0; gz < GRID_SIZE; gz++) {
      for (let gx = 0; gx < GRID_SIZE; gx++) {
        const idx = gz * GRID_SIZE + gx;
        const res = this.resource[idx] as Resource;
        if (res === Resource.Empty || res === Resource.Stone || res === Resource.Ore) continue;
        if (this.amount[idx] < 0.8) continue;

        const spreadRate = SPREAD_RATES[res] * spreadMult;
        if (spreadRate <= 0) continue;

        // 4-connected neighbors
        const neighbors = [
          gx > 0 ? idx - 1 : -1,
          gx < GRID_SIZE - 1 ? idx + 1 : -1,
          gz > 0 ? idx - GRID_SIZE : -1,
          gz < GRID_SIZE - 1 ? idx + GRID_SIZE : -1,
        ];

        for (const ni of neighbors) {
          if (ni < 0) continue;
          if (this.resource[ni] === Resource.Empty && this.cooldown[ni] === 0 && Math.random() < spreadRate) {
            this.resource[ni] = res;
            this.amount[ni] = 0.1;
            this.dirty = true;
          }
        }
      }
    }

    // Competition: grass shaded out if surrounded by 3+ wood neighbors
    for (let gz = 0; gz < GRID_SIZE; gz++) {
      for (let gx = 0; gx < GRID_SIZE; gx++) {
        const idx = gz * GRID_SIZE + gx;
        if (this.resource[idx] !== Resource.Grass) continue;

        let woodCount = 0;
        if (gx > 0 && this.resource[idx - 1] === Resource.Wood) woodCount++;
        if (gx < GRID_SIZE - 1 && this.resource[idx + 1] === Resource.Wood) woodCount++;
        if (gz > 0 && this.resource[idx - GRID_SIZE] === Resource.Wood) woodCount++;
        if (gz < GRID_SIZE - 1 && this.resource[idx + GRID_SIZE] === Resource.Wood) woodCount++;

        if (woodCount >= 3) {
          this.resource[idx] = Resource.Empty;
          this.amount[idx] = 0;
          this.dirty = true;
        }
      }
    }

    // Farmland revert if no creature nearby for 200 ticks
    for (let i = 0; i < GRID_CELLS; i++) {
      if (this.resource[i] === Resource.Farmland) {
        this.farmTimers[i]++;
        if (this.farmTimers[i] > 200) {
          this.resource[i] = Resource.Grass;
          this.amount[i] = 0.2;
          this.farmTimers[i] = 0;
          this.dirty = true;
        }
      }
    }
  }

  /** Mark farmland cell as having a nearby creature (resets revert timer) */
  markFarmlandActive(cellIdx: number): void {
    if (this.resource[cellIdx] === Resource.Farmland) {
      this.farmTimers[cellIdx] = 0;
    }
  }

  /** Harvest a cell. Returns true if successful. */
  harvest(cellIdx: number): boolean {
    if (cellIdx < 0 || cellIdx >= GRID_CELLS) return false;
    const res = this.resource[cellIdx] as Resource;
    if (res === Resource.Empty || this.amount[cellIdx] < 0.2) return false;

    this.amount[cellIdx] = Math.max(0, this.amount[cellIdx] - 0.3);
    this.cooldown[cellIdx] = HARVEST_COOLDOWNS[res];
    this.dirty = true;
    return true;
  }

  /** Convert world position to grid cell index. Returns -1 if out of bounds. */
  worldToCell(wx: number, wz: number): number {
    const gx = Math.floor((wx + GRID_SIZE * CELL_SIZE / 2) / CELL_SIZE);
    const gz = Math.floor((wz + GRID_SIZE * CELL_SIZE / 2) / CELL_SIZE);
    if (gx < 0 || gx >= GRID_SIZE || gz < 0 || gz >= GRID_SIZE) return -1;
    return gz * GRID_SIZE + gx;
  }

  /** Convert cell index to world center position */
  cellToWorld(idx: number): [number, number] {
    const gx = idx % GRID_SIZE;
    const gz = Math.floor(idx / GRID_SIZE);
    const wx = (gx - GRID_SIZE / 2) * CELL_SIZE + CELL_SIZE / 2;
    const wz = (gz - GRID_SIZE / 2) * CELL_SIZE + CELL_SIZE / 2;
    return [wx, wz];
  }

  /** Set cells around a position to farmland (for Farm building) */
  setFarmland(wx: number, wz: number, radius: number = 1): void {
    const cx = Math.floor((wx + GRID_SIZE * CELL_SIZE / 2) / CELL_SIZE);
    const cz = Math.floor((wz + GRID_SIZE * CELL_SIZE / 2) / CELL_SIZE);
    for (let dz = -radius; dz <= radius; dz++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const gx = cx + dx;
        const gz = cz + dz;
        if (gx < 0 || gx >= GRID_SIZE || gz < 0 || gz >= GRID_SIZE) continue;
        const idx = gz * GRID_SIZE + gx;
        if (this.resource[idx] !== Resource.Stone && this.resource[idx] !== Resource.Ore) {
          this.resource[idx] = Resource.Farmland;
          this.amount[idx] = Math.max(this.amount[idx], 0.3);
          this.farmTimers[idx] = 0;
          this.dirty = true;
        }
      }
    }
  }

  /** Get biome at a world position */
  getBiomeAt(wx: number, wz: number): Biome {
    const idx = this.worldToCell(wx, wz);
    if (idx < 0) return 0 as Biome; // Meadow default
    return this.biome[idx] as Biome;
  }
}
