// Cellular automata water flow system for canals.
// Runs every 20 ticks, max 200 block updates per tick.
// Water at or below SEA_LEVEL is treated as infinite source (ocean/lake) and won't drain.

import { VoxelWorld, SEA_LEVEL } from './VoxelWorld';
import { Block } from './BlockTypes';

const FLOW_INTERVAL = 20;
const MAX_UPDATES_PER_TICK = 200;

export class WaterFlow {
  private world: VoxelWorld;
  private dirtyBlocks: Set<string> = new Set();
  private tickCounter = 0;

  constructor(world: VoxelWorld) {
    this.world = world;
  }

  /** Mark a block position as dirty (e.g. when mined near water). */
  markDirty(bx: number, bz: number): void {
    // Mark surrounding area
    for (let dx = -2; dx <= 2; dx++) {
      for (let dz = -2; dz <= 2; dz++) {
        this.dirtyBlocks.add(`${bx + dx},${bz + dz}`);
      }
    }
  }

  /** Tick the water flow simulation. Call every frame; internally throttled. */
  tick(): void {
    this.tickCounter++;
    if (this.tickCounter < FLOW_INTERVAL) return;
    this.tickCounter = 0;

    if (this.dirtyBlocks.size === 0) return;

    let updates = 0;
    const toRemove: string[] = [];

    for (const key of this.dirtyBlocks) {
      if (updates >= MAX_UPDATES_PER_TICK) break;

      const [bxStr, bzStr] = key.split(',');
      const bx = parseInt(bxStr);
      const bz = parseInt(bzStr);

      // Look for water blocks in this column that can flow
      // Only process water ABOVE sea level — sea-level water is infinite/permanent
      for (let by = SEA_LEVEL + 5; by > SEA_LEVEL; by--) {
        const block = this.world.getBlock(bx, by, bz);
        if (block !== Block.Water) continue;

        // Gravity: water falls into air below (only above sea level)
        const below = this.world.getBlock(bx, by - 1, bz);
        if (below === Block.Air) {
          this.world.setBlock(bx, by, bz, Block.Air);
          this.world.setBlock(bx, by - 1, bz, Block.Water);
          updates++;
          this.markDirty(bx, bz);
          continue;
        }

        // Lateral spread: water spreads to adjacent air at same level
        // Only if there's water above (source) or at sea level
        const hasSource = by <= SEA_LEVEL + 1 || this.world.getBlock(bx, by + 1, bz) === Block.Water;
        if (hasSource) {
          const neighbors: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
          for (const [dx, dz] of neighbors) {
            const nx = bx + dx;
            const nz = bz + dz;
            const neighbor = this.world.getBlock(nx, by, nz);
            if (neighbor === Block.Air) {
              // Check that there's solid below the neighbor
              const neighborBelow = this.world.getBlock(nx, by - 1, nz);
              if (neighborBelow !== Block.Air) {
                this.world.setBlock(nx, by, nz, Block.Water);
                updates++;
                this.markDirty(nx, nz);
              }
            }
          }
        }
      }

      // Sea-level water regeneration: if mining created a gap at/below sea level,
      // refill it with water (infinite ocean source)
      for (let by = 1; by < SEA_LEVEL; by++) {
        const block = this.world.getBlock(bx, by, bz);
        if (block === Block.Air) {
          // Check if there's water adjacent (ocean/lake nearby)
          const hasWaterNeighbor =
            this.world.getBlock(bx + 1, by, bz) === Block.Water ||
            this.world.getBlock(bx - 1, by, bz) === Block.Water ||
            this.world.getBlock(bx, by + 1, bz) === Block.Water ||
            this.world.getBlock(bx, by, bz + 1) === Block.Water ||
            this.world.getBlock(bx, by, bz - 1) === Block.Water;
          if (hasWaterNeighbor) {
            this.world.setBlock(bx, by, bz, Block.Water);
            updates++;
          }
        }
      }

      toRemove.push(key);
    }

    for (const key of toRemove) {
      this.dirtyBlocks.delete(key);
    }
  }
}
