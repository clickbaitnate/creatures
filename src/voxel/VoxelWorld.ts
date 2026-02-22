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

  /** World coords → surface world Y (top of highest solid block). */
  getHeightWorld(wx: number, wz: number): number {
    const [bx, , bz] = this.worldToBlock(wx, 0, wz);
    const by = this.getHeight(bx, bz);
    return (by + 1) * BLOCK_SIZE - WORLD_HALF_Y;
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

  /** Generate terrain from terrainY() heightmap. */
  generate(): void {
    const rng = mulberry32(42); // deterministic

    for (let bx = 0; bx < WORLD_BLOCKS_X; bx++) {
      for (let bz = 0; bz < WORLD_BLOCKS_Z; bz++) {
        const wx = bx * BLOCK_SIZE + BLOCK_SIZE * 0.5 - WORLD_HALF;
        const wz = bz * BLOCK_SIZE + BLOCK_SIZE * 0.5 - WORLD_HALF;

        // Map terrainY (-~3 to +~3) into block heights around sea level
        const ty = terrainY(wx, wz);
        const surfaceY = SEA_LEVEL + Math.floor(ty * 4);
        const clampedSurface = Math.max(1, Math.min(surfaceY, CHUNK_H - 10));

        for (let by = 0; by < clampedSurface; by++) {
          let block: Block;
          if (by < clampedSurface - 4) {
            block = Block.Stone;
          } else if (by < clampedSurface - 1) {
            block = Block.Dirt;
          } else {
            // Surface block
            if (clampedSurface <= SEA_LEVEL) {
              block = Block.Sand;
            } else if (clampedSurface > SEA_LEVEL + 16) {
              block = Block.Snow;
            } else {
              block = Block.Grass;
            }
          }
          this.setBlockRaw(bx, by, bz, block);
        }

        // Water fill below sea level
        for (let by = clampedSurface; by < SEA_LEVEL; by++) {
          this.setBlockRaw(bx, by, bz, Block.Water);
        }
      }
    }

    // Trees (scaled ~3.7x for larger world)
    for (let i = 0; i < 600; i++) {
      const bx = Math.floor(rng() * WORLD_BLOCKS_X);
      const bz = Math.floor(rng() * WORLD_BLOCKS_Z);
      const surfY = this.getHeightRaw(bx, bz);
      if (surfY <= SEA_LEVEL || surfY > SEA_LEVEL + 14) continue;
      const topBlock = this.getBlockRaw(bx, surfY - 1, bz);
      if (topBlock !== Block.Grass) continue;
      const trunkH = 3 + Math.floor(rng() * 3);
      // Trunk
      for (let dy = 0; dy < trunkH; dy++) {
        this.setBlockRaw(bx, surfY + dy, bz, Block.Wood);
      }
      // Canopy (sphere of leaves)
      const canopyR = 2;
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

    // Ore veins (scaled ~3.7x for larger world)
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

    // Surface decoration: flowers, tall grass, berry bushes
    for (let bx = 0; bx < WORLD_BLOCKS_X; bx++) {
      for (let bz = 0; bz < WORLD_BLOCKS_Z; bz++) {
        const surfY = this.getHeightRaw(bx, bz);
        if (surfY <= SEA_LEVEL || surfY >= CHUNK_H - 2) continue;
        const topBlock = this.getBlockRaw(bx, surfY - 1, bz);
        if (topBlock !== Block.Grass) continue;
        const r = rng();
        if (r < 0.03) {
          this.setBlockRaw(bx, surfY, bz, Block.Flower);
        } else if (r < 0.10) {
          this.setBlockRaw(bx, surfY, bz, Block.TallGrass);
        } else if (r < 0.13) {
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
