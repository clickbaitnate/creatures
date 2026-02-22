// Chunk-based voxel world: terrain generation, block get/set, height queries.

import { Block, BLOCK_PROPS } from './BlockTypes';
import { terrainY } from '../world/Environment';

export const BLOCK_SIZE = 0.5;
export const CHUNK_W = 16;
export const CHUNK_H = 64;
export const CHUNK_D = 16;
export const CHUNKS_X = 25;
export const CHUNKS_Z = 25;
export const WORLD_BLOCKS_X = CHUNKS_X * CHUNK_W; // 400
export const WORLD_BLOCKS_Z = CHUNKS_Z * CHUNK_D; // 400
export const SEA_LEVEL = 10;

// World offset: block (0,0) maps to world (-WORLD_HALF, -WORLD_HALF)
const WORLD_HALF = (CHUNKS_X * CHUNK_W * BLOCK_SIZE) / 2; // 52

export const enum Biome {
  Plains = 0,
  Forest = 1,
  Desert = 2,
  Tundra = 3,
  Swamp = 4,
}

export interface Chunk {
  blocks: Uint8Array; // CHUNK_W * CHUNK_H * CHUNK_D = 16384
  dirty: boolean;
}

function chunkIndex(lx: number, ly: number, lz: number): number {
  return (ly * CHUNK_D + lz) * CHUNK_W + lx;
}

export class VoxelWorld {
  chunks: Chunk[];
  /** Sapling growth timers: blockKey → ticks remaining */
  saplingTimers = new Map<string, number>();

  constructor() {
    this.chunks = new Array(CHUNKS_X * CHUNKS_Z);
    for (let i = 0; i < this.chunks.length; i++) {
      this.chunks[i] = {
        blocks: new Uint8Array(CHUNK_W * CHUNK_H * CHUNK_D),
        dirty: true,
      };
    }
  }

  private getChunkIdx(cx: number, cz: number): number {
    return cz * CHUNKS_X + cx;
  }

  /** Get block at block coordinates. Returns Air for out-of-bounds. */
  getBlock(bx: number, by: number, bz: number): Block {
    if (by < 0 || by >= CHUNK_H) return Block.Air;
    const cx = Math.floor(bx / CHUNK_W);
    const cz = Math.floor(bz / CHUNK_D);
    if (cx < 0 || cx >= CHUNKS_X || cz < 0 || cz >= CHUNKS_Z) return Block.Air;
    const lx = bx - cx * CHUNK_W;
    const lz = bz - cz * CHUNK_D;
    const chunk = this.chunks[this.getChunkIdx(cx, cz)];
    return chunk.blocks[chunkIndex(lx, by, lz)] as Block;
  }

  /** Set block at block coordinates. Marks chunk(s) dirty. */
  setBlock(bx: number, by: number, bz: number, block: Block): void {
    if (by < 0 || by >= CHUNK_H) return;
    const cx = Math.floor(bx / CHUNK_W);
    const cz = Math.floor(bz / CHUNK_D);
    if (cx < 0 || cx >= CHUNKS_X || cz < 0 || cz >= CHUNKS_Z) return;
    const lx = bx - cx * CHUNK_W;
    const lz = bz - cz * CHUNK_D;
    const chunk = this.chunks[this.getChunkIdx(cx, cz)];
    chunk.blocks[chunkIndex(lx, by, lz)] = block;
    chunk.dirty = true;
    // Mark adjacent chunks dirty if on boundary
    if (lx === 0 && cx > 0) this.chunks[this.getChunkIdx(cx - 1, cz)].dirty = true;
    if (lx === CHUNK_W - 1 && cx < CHUNKS_X - 1) this.chunks[this.getChunkIdx(cx + 1, cz)].dirty = true;
    if (lz === 0 && cz > 0) this.chunks[this.getChunkIdx(cx, cz - 1)].dirty = true;
    if (lz === CHUNK_D - 1 && cz < CHUNKS_Z - 1) this.chunks[this.getChunkIdx(cx, cz + 1)].dirty = true;
  }

  /** Highest solid block Y at (bx, bz). Returns 0 if column is empty. */
  getHeight(bx: number, bz: number): number {
    const cx = Math.floor(bx / CHUNK_W);
    const cz = Math.floor(bz / CHUNK_D);
    if (cx < 0 || cx >= CHUNKS_X || cz < 0 || cz >= CHUNKS_Z) return 0;
    const lx = bx - cx * CHUNK_W;
    const lz = bz - cz * CHUNK_D;
    const chunk = this.chunks[this.getChunkIdx(cx, cz)];
    for (let y = CHUNK_H - 1; y >= 0; y--) {
      const b = chunk.blocks[chunkIndex(lx, y, lz)] as Block;
      if (BLOCK_PROPS[b].solid) return y;
    }
    return 0;
  }

  /** World coords → surface world Y (top of highest solid block, or water surface if above). */
  getHeightWorld(wx: number, wz: number): number {
    const [bx, , bz] = this.worldToBlock(wx, 0, wz);
    const solidY = this.getHeight(bx, bz);
    // Check if block above solid surface is water — if so, find water top
    let y = solidY;
    if (this.getBlock(bx, y + 1, bz) === Block.Water) {
      // Scan up to find water surface
      y = y + 1;
      while (y < CHUNK_H - 1 && this.getBlock(bx, y + 1, bz) === Block.Water) {
        y++;
      }
      return (y + 1) * BLOCK_SIZE - WORLD_HALF_Y;
    }
    return (solidY + 1) * BLOCK_SIZE - WORLD_HALF_Y;
  }

  /** Check if the block at surface height for world coords (wx, wz) is Water. */
  isWaterAt(wx: number, wz: number): boolean {
    const [bx, , bz] = this.worldToBlock(wx, 0, wz);
    const surfY = this.getHeight(bx, bz);
    // Check if the block at surface level or just above is water
    const blockAtSurf = this.getBlock(bx, surfY, bz);
    const blockAbove = this.getBlock(bx, surfY + 1, bz);
    return blockAtSurf === Block.Water || blockAbove === Block.Water;
  }

  /** World coords (wx, wy, wz) → block coords (bx, by, bz). */
  worldToBlock(wx: number, wy: number, wz: number): [number, number, number] {
    const bx = Math.floor((wx + WORLD_HALF) / BLOCK_SIZE);
    const by = Math.floor((wy + WORLD_HALF_Y) / BLOCK_SIZE);
    const bz = Math.floor((wz + WORLD_HALF) / BLOCK_SIZE);
    return [bx, by, bz];
  }

  /** Block coords (bx, by, bz) → world coords center of block. */
  blockToWorld(bx: number, by: number, bz: number): [number, number, number] {
    const wx = bx * BLOCK_SIZE + BLOCK_SIZE * 0.5 - WORLD_HALF;
    const wy = by * BLOCK_SIZE + BLOCK_SIZE * 0.5 - WORLD_HALF_Y;
    const wz = bz * BLOCK_SIZE + BLOCK_SIZE * 0.5 - WORLD_HALF;
    return [wx, wy, wz];
  }

  /** Biome at block position. Uses temperature/moisture noise. */
  getBiome(bx: number, bz: number): Biome {
    const wx = bx * BLOCK_SIZE - WORLD_HALF;
    const wz = bz * BLOCK_SIZE - WORLD_HALF;

    // Temperature: warm in south, cold in north, with noise variation
    const temp = 0.5
      + wz / (WORLD_HALF * 2) * 0.4  // latitude gradient
      + Math.sin(wx * 0.06 + wz * 0.04) * 0.2
      + Math.sin(wx * 0.12) * Math.cos(wz * 0.08) * 0.15;

    // Moisture: varies east-west with noise
    const moist = 0.5
      + Math.sin(wx * 0.05 + 3.7) * Math.cos(wz * 0.07 + 1.3) * 0.3
      + Math.sin(wx * 0.1 + wz * 0.06) * 0.15
      + Math.cos(wz * 0.04 + wx * 0.03) * 0.1;

    if (temp < 0.25) return Biome.Tundra;
    if (temp > 0.72 && moist < 0.35) return Biome.Desert;
    if (moist > 0.65 && temp > 0.35) return Biome.Swamp;
    if (moist > 0.4 && temp > 0.3 && temp < 0.7) return Biome.Forest;
    return Biome.Plains;
  }

  /** Generate terrain from terrainY() heightmap with biomes. */
  generate(): void {
    const rng = mulberry32(42); // deterministic

    // Phase 1: Terrain + biome-aware surface
    for (let bx = 0; bx < WORLD_BLOCKS_X; bx++) {
      for (let bz = 0; bz < WORLD_BLOCKS_Z; bz++) {
        const wx = bx * BLOCK_SIZE + BLOCK_SIZE * 0.5 - WORLD_HALF;
        const wz = bz * BLOCK_SIZE + BLOCK_SIZE * 0.5 - WORLD_HALF;
        const biome = this.getBiome(bx, bz);

        // Map terrainY into block heights; flatten deserts, deepen swamps
        let ty = terrainY(wx, wz);
        if (biome === Biome.Desert) ty *= 0.5; // flatter
        if (biome === Biome.Swamp) ty = ty * 0.3 - 0.5; // low and flat
        if (biome === Biome.Plains) ty *= 0.8; // gentle rolling

        const surfaceY = SEA_LEVEL + Math.floor(ty * 4);
        const clampedSurface = Math.max(1, Math.min(surfaceY, CHUNK_H - 10));

        for (let by = 0; by < clampedSurface; by++) {
          let block: Block;
          if (by < clampedSurface - 4) {
            block = Block.Stone;
          } else if (by < clampedSurface - 1) {
            // Sub-surface varies by biome
            switch (biome) {
              case Biome.Desert: block = Block.Sand; break;
              case Biome.Tundra: block = by === clampedSurface - 2 ? Block.Gravel : Block.Dirt; break;
              case Biome.Swamp: block = Block.Clay; break;
              default: block = Block.Dirt; break;
            }
          } else {
            // Surface block by biome
            if (clampedSurface <= SEA_LEVEL) {
              block = biome === Biome.Tundra ? Block.PackedIce : Block.Sand;
            } else if (clampedSurface > SEA_LEVEL + 16) {
              block = Block.Snow;
            } else {
              switch (biome) {
                case Biome.Desert: block = Block.Sand; break;
                case Biome.Tundra: block = clampedSurface > SEA_LEVEL + 2 ? Block.Snow : Block.DeadGrass; break;
                case Biome.Swamp: block = Block.DarkGrass; break;
                case Biome.Forest: block = Block.Grass; break;
                case Biome.Plains: block = Block.Grass; break;
                default: block = Block.Grass; break;
              }
            }
          }
          this.setBlockRaw(bx, by, bz, block);
        }

        // Water fill below sea level
        for (let by = clampedSurface; by < SEA_LEVEL; by++) {
          this.setBlockRaw(bx, by, bz, Block.Water);
        }

        // Swamp: shallow water pools at low elevations
        if (biome === Biome.Swamp && clampedSurface <= SEA_LEVEL + 2 && clampedSurface > SEA_LEVEL) {
          this.setBlockRaw(bx, clampedSurface, bz, Block.Water);
        }
      }
    }

    // Phase 2: Trees — density varies by biome
    for (let i = 0; i < 1200; i++) {
      const bx = Math.floor(rng() * WORLD_BLOCKS_X);
      const bz = Math.floor(rng() * WORLD_BLOCKS_Z);
      const biome = this.getBiome(bx, bz);

      // Skip biomes that shouldn't have trees, or thin based on biome
      if (biome === Biome.Desert) continue;
      if (biome === Biome.Tundra && rng() > 0.15) continue; // very sparse
      if (biome === Biome.Plains && rng() > 0.3) continue; // sparse
      if (biome === Biome.Swamp && rng() > 0.4) continue; // moderate
      // Forest: keep all (dense)

      const surfY = this.getHeightRaw(bx, bz);
      if (surfY <= SEA_LEVEL || surfY > SEA_LEVEL + 14) continue;
      const topBlock = this.getBlockRaw(bx, surfY - 1, bz);
      if (topBlock !== Block.Grass && topBlock !== Block.DarkGrass && topBlock !== Block.DeadGrass && topBlock !== Block.Snow) continue;

      const trunkH = biome === Biome.Tundra ? 2 + Math.floor(rng() * 2) : 3 + Math.floor(rng() * 3);
      // Trunk
      for (let dy = 0; dy < trunkH; dy++) {
        this.setBlockRaw(bx, surfY + dy, bz, Block.Wood);
      }
      // Canopy
      const canopyR = biome === Biome.Tundra ? 1 : 2;
      const canopyY = surfY + trunkH;
      for (let dx = -canopyR; dx <= canopyR; dx++) {
        for (let dy = -1; dy <= canopyR; dy++) {
          for (let dz = -canopyR; dz <= canopyR; dz++) {
            if (dx * dx + dy * dy + dz * dz <= canopyR * canopyR + 1) {
              const lbx = bx + dx, lby = canopyY + dy, lbz = bz + dz;
              if (this.getBlockRaw(lbx, lby, lbz) === Block.Air) {
                this.setBlockRaw(lbx, lby, lbz, Block.Leaf);
              }
            }
          }
        }
      }
    }

    // Phase 3: Desert cacti
    for (let i = 0; i < 200; i++) {
      const bx = Math.floor(rng() * WORLD_BLOCKS_X);
      const bz = Math.floor(rng() * WORLD_BLOCKS_Z);
      if (this.getBiome(bx, bz) !== Biome.Desert) continue;
      const surfY = this.getHeightRaw(bx, bz);
      if (surfY <= SEA_LEVEL) continue;
      if (this.getBlockRaw(bx, surfY - 1, bz) !== Block.Sand) continue;
      const h = 2 + Math.floor(rng() * 3);
      for (let dy = 0; dy < h; dy++) {
        this.setBlockRaw(bx, surfY + dy, bz, Block.Cactus);
      }
    }

    // Phase 4: Ore veins
    for (let i = 0; i < 240; i++) {
      const cx = Math.floor(rng() * WORLD_BLOCKS_X);
      const cy = 2 + Math.floor(rng() * 6);
      const cz = Math.floor(rng() * WORLD_BLOCKS_Z);
      const size = 2 + Math.floor(rng() * 3);
      for (let j = 0; j < size; j++) {
        const ox = cx + Math.floor(rng() * 3) - 1;
        const oy = cy + Math.floor(rng() * 3) - 1;
        const oz = cz + Math.floor(rng() * 3) - 1;
        if (this.getBlockRaw(ox, oy, oz) === Block.Stone) {
          this.setBlockRaw(ox, oy, oz, Block.OreBlock);
        }
      }
    }

    // Phase 5: Surface decoration (biome-aware)
    for (let bx = 0; bx < WORLD_BLOCKS_X; bx++) {
      for (let bz = 0; bz < WORLD_BLOCKS_Z; bz++) {
        const surfY = this.getHeightRaw(bx, bz);
        if (surfY <= SEA_LEVEL || surfY >= CHUNK_H - 2) continue;
        const topBlock = this.getBlockRaw(bx, surfY - 1, bz);
        const biome = this.getBiome(bx, bz);
        const r = rng();

        if (biome === Biome.Plains && (topBlock === Block.Grass)) {
          if (r < 0.05) this.setBlockRaw(bx, surfY, bz, Block.Flower);
          else if (r < 0.12) this.setBlockRaw(bx, surfY, bz, Block.TallGrass);
          else if (r < 0.20) this.setBlockRaw(bx, surfY, bz, Block.BerryBush);
        } else if (biome === Biome.Forest && (topBlock === Block.Grass)) {
          if (r < 0.04) this.setBlockRaw(bx, surfY, bz, Block.Mushroom);
          else if (r < 0.10) this.setBlockRaw(bx, surfY, bz, Block.TallGrass);
          else if (r < 0.18) this.setBlockRaw(bx, surfY, bz, Block.BerryBush);
          else if (r < 0.20) this.setBlockRaw(bx, surfY, bz, Block.Flower);
        } else if (biome === Biome.Swamp && (topBlock === Block.DarkGrass || topBlock === Block.Clay)) {
          if (r < 0.06) this.setBlockRaw(bx, surfY, bz, Block.Mushroom);
          else if (r < 0.12) this.setBlockRaw(bx, surfY, bz, Block.TallGrass);
          else if (r < 0.16) this.setBlockRaw(bx, surfY, bz, Block.BerryBush);
        } else if (biome === Biome.Desert && topBlock === Block.Sand) {
          if (r < 0.02) this.setBlockRaw(bx, surfY, bz, Block.TallGrass); // dead shrub
        } else if (biome === Biome.Tundra && (topBlock === Block.Snow || topBlock === Block.DeadGrass)) {
          if (r < 0.01) this.setBlockRaw(bx, surfY, bz, Block.BerryBush);
          else if (r < 0.03) this.setBlockRaw(bx, surfY, bz, Block.TallGrass);
        }
      }
    }

    // Phase 6: Berry cluster patches (biome-weighted)
    for (let i = 0; i < 200; i++) {
      const cx = Math.floor(rng() * WORLD_BLOCKS_X);
      const cz = Math.floor(rng() * WORLD_BLOCKS_Z);
      const biome = this.getBiome(cx, cz);
      if (biome === Biome.Desert || biome === Biome.Tundra) continue; // no berry clusters
      const clusterSize = 3 + Math.floor(rng() * 3);
      for (let j = 0; j < clusterSize; j++) {
        const bx = cx + Math.floor(rng() * 3) - 1;
        const bz = cz + Math.floor(rng() * 3) - 1;
        if (bx < 0 || bx >= WORLD_BLOCKS_X || bz < 0 || bz >= WORLD_BLOCKS_Z) continue;
        const surfY = this.getHeightRaw(bx, bz);
        if (surfY <= SEA_LEVEL || surfY >= CHUNK_H - 2) continue;
        const topBlock = this.getBlockRaw(bx, surfY - 1, bz);
        if (topBlock !== Block.Grass && topBlock !== Block.DarkGrass) continue;
        if (this.getBlockRaw(bx, surfY, bz) === Block.Air) {
          this.setBlockRaw(bx, surfY, bz, Block.BerryBush);
        }
      }
    }

    // Mark all chunks dirty for initial mesh build
    for (const chunk of this.chunks) {
      chunk.dirty = true;
    }
  }

  /** Fast raw set — no dirty marking (used during generation). */
  private setBlockRaw(bx: number, by: number, bz: number, block: Block): void {
    if (by < 0 || by >= CHUNK_H || bx < 0 || bx >= WORLD_BLOCKS_X || bz < 0 || bz >= WORLD_BLOCKS_Z) return;
    const cx = Math.floor(bx / CHUNK_W);
    const cz = Math.floor(bz / CHUNK_D);
    const lx = bx - cx * CHUNK_W;
    const lz = bz - cz * CHUNK_D;
    this.chunks[this.getChunkIdx(cx, cz)].blocks[chunkIndex(lx, by, lz)] = block;
  }

  /** Fast raw get (no bounds safety beyond array bounds). */
  private getBlockRaw(bx: number, by: number, bz: number): Block {
    if (by < 0 || by >= CHUNK_H || bx < 0 || bx >= WORLD_BLOCKS_X || bz < 0 || bz >= WORLD_BLOCKS_Z) return Block.Air;
    const cx = Math.floor(bx / CHUNK_W);
    const cz = Math.floor(bz / CHUNK_D);
    const lx = bx - cx * CHUNK_W;
    const lz = bz - cz * CHUNK_D;
    return this.chunks[this.getChunkIdx(cx, cz)].blocks[chunkIndex(lx, by, lz)] as Block;
  }

  /** Raw height scan (no world coord conversion). */
  private getHeightRaw(bx: number, bz: number): number {
    if (bx < 0 || bx >= WORLD_BLOCKS_X || bz < 0 || bz >= WORLD_BLOCKS_Z) return 0;
    const cx = Math.floor(bx / CHUNK_W);
    const cz = Math.floor(bz / CHUNK_D);
    const lx = bx - cx * CHUNK_W;
    const lz = bz - cz * CHUNK_D;
    const chunk = this.chunks[this.getChunkIdx(cx, cz)];
    for (let y = CHUNK_H - 1; y >= 0; y--) {
      const b = chunk.blocks[chunkIndex(lx, y, lz)] as Block;
      if (BLOCK_PROPS[b].solid) return y + 1; // one above top solid
    }
    return 0;
  }
}

// Y offset: world Y=0 corresponds to block Y at some offset
// We want block Y=SEA_LEVEL to be roughly world Y=0
const WORLD_HALF_Y = SEA_LEVEL * BLOCK_SIZE; // 5.0

export { WORLD_HALF, WORLD_HALF_Y };

// Simple deterministic PRNG
function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
