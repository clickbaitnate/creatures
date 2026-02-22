// Blueprint templates for block-by-block construction, including Tower of Babel.

import { Block, BLOCK_TO_ITEM } from './BlockTypes';
import { ItemType } from '../components/Inventory';

export interface Blueprint {
  name: string;
  width: number;   // X extent in blocks
  height: number;  // Y extent
  depth: number;   // Z extent
  blocks: Uint8Array; // width * height * depth
  totalBlocks: number; // count of non-Air blocks
}

export interface ConstructionSite {
  id: number;
  blueprint: Blueprint;
  originX: number; // block coords
  originY: number;
  originZ: number;
  placed: Uint8Array;   // same size as blueprint.blocks, 1 = placed
  placedCount: number;
  progress: number;     // 0-1
  active: boolean;
}

function bpIndex(bp: Blueprint, x: number, y: number, z: number): number {
  return (y * bp.depth + z) * bp.width + x;
}

/** Get the next unplaced block (bottom-up, layer by layer). */
export function getNextUnplacedBlock(site: ConstructionSite): { bx: number; by: number; bz: number; block: Block } | null {
  const bp = site.blueprint;
  for (let y = 0; y < bp.height; y++) {
    for (let z = 0; z < bp.depth; z++) {
      for (let x = 0; x < bp.width; x++) {
        const idx = bpIndex(bp, x, y, z);
        const block = bp.blocks[idx] as Block;
        if (block !== Block.Air && !site.placed[idx]) {
          return {
            bx: site.originX + x,
            by: site.originY + y,
            bz: site.originZ + z,
            block,
          };
        }
      }
    }
  }
  return null;
}

/** Get the required ItemType for a blueprint block. */
export function getRequiredItem(block: Block): ItemType {
  return BLOCK_TO_ITEM[block] ?? ItemType.RawStone;
}

/** Mark a block as placed in the site, update progress. */
export function markPlaced(site: ConstructionSite, bx: number, by: number, bz: number): void {
  const x = bx - site.originX;
  const y = by - site.originY;
  const z = bz - site.originZ;
  const idx = bpIndex(site.blueprint, x, y, z);
  if (!site.placed[idx]) {
    site.placed[idx] = 1;
    site.placedCount++;
    site.progress = site.placedCount / site.blueprint.totalBlocks;
  }
}

// ── Tower of Babel Blueprint ──────────────────────────────────────

export function createBabelBlueprint(): Blueprint {
  // Stepped pyramid: base 20×20, narrows by 2 each layer-group, ~50 blocks tall
  const width = 20, depth = 20, height = 50;
  const blocks = new Uint8Array(width * height * depth);
  let total = 0;

  const idx = (x: number, y: number, z: number) => (y * depth + z) * width + x;

  // Build layer by layer
  for (let y = 0; y < height; y++) {
    // Determine the "tier" for step-back: every 8 blocks, inset by 2
    const tier = Math.floor(y / 8);
    const inset = tier * 2;
    const minX = inset, maxX = width - inset;
    const minZ = inset, maxZ = depth - inset;

    if (minX >= maxX || minZ >= maxZ) break; // too narrow

    for (let z = minZ; z < maxZ; z++) {
      for (let x = minX; x < maxX; x++) {
        const isEdge = x === minX || x === maxX - 1 || z === minZ || z === maxZ - 1;
        const isFloor = (y % 8 === 0) && y > 0;
        const isCorner = (x === minX || x === maxX - 1) && (z === minZ || z === maxZ - 1);

        let block: Block;
        if (y === 0) {
          // Foundation
          block = Block.StoneBrick;
        } else if (y >= height - 3) {
          // Crown
          block = Block.OreBlock;
        } else if (isCorner) {
          // Corner pillars
          block = Block.StoneBrick;
        } else if (isEdge) {
          // Walls
          if (isFloor) {
            block = Block.StoneBrick;
          } else if (y % 4 === 2 && (x + z) % 3 === 0) {
            // Window openings
            block = Block.Glass;
          } else {
            block = Block.Cobblestone;
          }
        } else if (isFloor) {
          // Interior floors
          block = (x + z) % 2 === 0 ? Block.Plank : Block.Wood;
        } else {
          // Interior air (hollow)
          continue;
        }

        blocks[idx(x, y, z)] = block;
        total++;
      }
    }
  }

  return { name: 'Tower of Babel', width, height, depth, blocks, totalBlocks: total };
}

// ── Small Blueprints ──────────────────────────────────────────────

function createSmallBlueprint(
  name: string, w: number, h: number, d: number,
  fill: (x: number, y: number, z: number, w: number, h: number, d: number) => Block
): Blueprint {
  const blocks = new Uint8Array(w * h * d);
  let total = 0;
  for (let y = 0; y < h; y++) {
    for (let z = 0; z < d; z++) {
      for (let x = 0; x < w; x++) {
        const b = fill(x, y, z, w, h, d);
        if (b !== Block.Air) {
          blocks[(y * d + z) * w + x] = b;
          total++;
        }
      }
    }
  }
  return { name, width: w, height: h, depth: d, blocks, totalBlocks: total };
}

export function createHutBlueprint(): Blueprint {
  return createSmallBlueprint('Hut', 5, 5, 5, (x, y, z, w, h, d) => {
    const edge = x === 0 || x === w-1 || z === 0 || z === d-1;
    if (y === 0) return Block.Cobblestone; // floor
    if (y < 3 && edge) {
      if (y === 1 && x === 2 && z === 0) return Block.Air; // door
      return Block.Wood;
    }
    if (y === 3 && edge) return Block.Plank; // eave
    if (y >= 3) {
      // Simple roof
      const cx = Math.abs(x - 2), cz = Math.abs(z - 2);
      if (cx + (y - 3) <= 2 && cz <= 2) return Block.Thatch;
    }
    return Block.Air;
  });
}

export function createWallSegmentBlueprint(): Blueprint {
  return createSmallBlueprint('Wall', 7, 3, 1, (x, y) => {
    if (y === 0) return Block.Stone;
    if (y === 1) return Block.Cobblestone;
    if (y === 2) return (x % 2 === 0) ? Block.Stone : Block.Air; // crenels
    return Block.Air;
  });
}

export function createWatchtowerBlueprint(): Blueprint {
  return createSmallBlueprint('Watchtower', 3, 8, 3, (x, y, z, w, h, d) => {
    const edge = x === 0 || x === w-1 || z === 0 || z === d-1;
    if (y === 0) return Block.StoneBrick;
    if (y < 6 && edge) return Block.StoneBrick;
    if (y === 6) return Block.StoneBrick; // platform
    if (y === 7 && edge) return (x + z) % 2 === 0 ? Block.StoneBrick : Block.Air; // crenels
    return Block.Air;
  });
}

export function createShrineBlueprint(): Blueprint {
  return createSmallBlueprint('Shrine', 5, 5, 5, (x, y, z, w, _h, d) => {
    const cx = Math.abs(x - 2), cz = Math.abs(z - 2);
    if (y === 0) return Block.StoneBrick;
    if (y === 1 && (cx === 2 || cz === 2)) return Block.StoneBrick; // pillars base
    if (y === 1 && cx <= 1 && cz <= 1) return Block.Air;
    if (y >= 1 && y <= 3 && cx === 2 && cz === 2) return Block.StoneBrick; // corner pillars
    if (y === 3 && (cx + cz <= 2)) return Block.StoneBrick; // lintel
    if (y === 4 && cx === 0 && cz === 0) return Block.OreBlock; // capstone
    return Block.Air;
  });
}

export function createStoragePitBlueprint(): Blueprint {
  return createSmallBlueprint('Storage', 5, 3, 5, (x, y, z, w, _h, d) => {
    const edge = x === 0 || x === w-1 || z === 0 || z === d-1;
    if (y === 0) return Block.Cobblestone;
    if (y === 1 && edge) return Block.Wood;
    if (y === 2 && edge) return Block.Plank;
    return Block.Air;
  });
}

export function createFarmPlotBlueprint(): Blueprint {
  return createSmallBlueprint('Farm', 7, 1, 7, (x, y, z, w, _h, d) => {
    const edge = x === 0 || x === w-1 || z === 0 || z === d-1;
    if (edge) return Block.Wood; // fence
    return Block.Dirt; // farmland
  });
}

// All small blueprints for tribe settlement building
export const SMALL_BLUEPRINTS = [
  createHutBlueprint,
  createWallSegmentBlueprint,
  createWatchtowerBlueprint,
  createShrineBlueprint,
  createStoragePitBlueprint,
  createFarmPlotBlueprint,
];
