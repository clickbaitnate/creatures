// Voxel building templates — small 3D arrays per building type
// BlockType enum for block vocabulary

export const enum BlockType {
  Air = 0,
  Wood = 1,
  Stone = 2,
  Plank = 3,
  Cobble = 4,
  Glass = 5,
  Thatch = 6,
  Ore = 7,
  Dirt = 8,
  Leaf = 9,
  Water = 10,
  Fire = 11,
}

// Colors for each block type
export const BLOCK_COLORS: Record<BlockType, number> = {
  [BlockType.Air]:    0x000000,
  [BlockType.Wood]:   0x8B5A2B,
  [BlockType.Stone]:  0x808080,
  [BlockType.Plank]:  0xC4A362,
  [BlockType.Cobble]: 0x6B6B6B,
  [BlockType.Glass]:  0xADD8E6,
  [BlockType.Thatch]: 0xDAA520,
  [BlockType.Ore]:    0xB8860B,
  [BlockType.Dirt]:   0x6B4423,
  [BlockType.Leaf]:   0x228B22,
  [BlockType.Water]:  0x4169E1,
  [BlockType.Fire]:   0xFF4500,
};

export interface VoxelTemplate {
  width: number;   // X
  height: number;  // Y
  depth: number;   // Z
  blocks: Uint8Array;
}

function template(w: number, h: number, d: number, fn: (x: number, y: number, z: number) => BlockType): VoxelTemplate {
  const blocks = new Uint8Array(w * h * d);
  for (let y = 0; y < h; y++) {
    for (let z = 0; z < d; z++) {
      for (let x = 0; x < w; x++) {
        blocks[y * d * w + z * w + x] = fn(x, y, z);
      }
    }
  }
  return { width: w, height: h, depth: d, blocks };
}

const A = BlockType.Air;
const W = BlockType.Wood;
const S = BlockType.Stone;
const P = BlockType.Plank;
const C = BlockType.Cobble;
const G = BlockType.Glass;
const T = BlockType.Thatch;
const O = BlockType.Ore;
const D = BlockType.Dirt;
const L = BlockType.Leaf;

// Shelter: 3×3×3 wood frame + thatch roof
const SHELTER = template(3, 4, 3, (x, y, z) => {
  if (y === 0) return P; // floor
  if (y === 3) return T; // roof
  if (y < 3 && (x === 0 || x === 2) && (z === 0 || z === 2)) return W; // pillars
  if (y === 1 && z === 1 && x === 1) return A; // open center
  if (y === 2 && x === 1 && z === 0) return G; // glass window front
  return A;
});

// Wall: 5×3×1 stone/cobble wall segment
const WALL = template(5, 3, 1, (x, y, _z) => {
  if (y === 0) return S;
  if (y === 1) return C;
  if (y === 2) return (x === 0 || x === 4) ? S : C;
  return A;
});

// Monument: 3×6×3 stone pillar + decorative top
const MONUMENT = template(3, 6, 3, (x, y, z) => {
  const cx = x === 1, cz = z === 1;
  if (y < 4 && cx && cz) return S;  // central pillar
  if (y < 2 && (cx || cz)) return C; // base
  if (y === 4 && cx && cz) return O; // golden cap
  if (y === 5 && cx && cz) return O; // golden top
  return A;
});

// Farm: 5×2×5 dirt plot + wood fence
const FARM = template(5, 2, 5, (x, y, z) => {
  if (y === 0 && x > 0 && x < 4 && z > 0 && z < 4) return D; // dirt plot
  if (y === 0 && (x === 0 || x === 4 || z === 0 || z === 4)) return W; // fence base
  if (y === 1 && (x === 0 || x === 4 || z === 0 || z === 4) && !(x > 1 && x < 3 && z === 0)) return W; // fence uprights with gate
  return A;
});

// Mine: 4×3×4 stone entrance + wood supports
const MINE = template(4, 3, 4, (x, y, z) => {
  if (y === 0) return z < 2 ? C : S; // floor
  if (y < 3 && (x === 0 || x === 3) && z === 0) return W; // front supports
  if (y === 2 && z === 0) return P; // lintel
  if (y < 3 && z === 3) return S; // back wall
  if (y < 3 && (x === 0 || x === 3) && z > 0) return S; // side walls
  return A;
});

// Workshop: 4×3×4 wood structure + cobble floor
const WORKSHOP = template(4, 3, 4, (x, y, z) => {
  if (y === 0) return C; // cobble floor
  if (y < 3 && (x === 0 || x === 3) && (z === 0 || z === 3)) return W; // corner posts
  if (y === 2 && z === 0) return P; // front beam
  if (y === 2 && z === 3) return P; // back beam
  if (y === 1 && x === 2 && z === 0) return G; // window
  return A;
});

// Granary: 3×5×3 wood/plank silo
const GRANARY = template(3, 5, 3, (x, y, z) => {
  const cx = x === 1, cz = z === 1;
  if (y === 0) return P; // floor
  if (y < 4 && (x === 0 || x === 2) && (z === 0 || z === 2)) return W; // corners
  if (y < 4 && cx && (z === 0 || z === 2)) return P; // walls
  if (y < 4 && cz && (x === 0 || x === 2)) return P; // walls
  if (y === 4) return T; // thatch roof
  return A;
});

// Tower: 3×7×3 stone tower + crenellations
const TOWER = template(3, 7, 3, (x, y, z) => {
  const edge = x === 0 || x === 2 || z === 0 || z === 2;
  const corner = (x === 0 || x === 2) && (z === 0 || z === 2);
  if (y < 5 && corner) return S; // corner pillars
  if (y < 5 && edge && y < 1) return S; // base
  if (y < 5 && edge && y > 0) return C; // walls
  if (y === 5 && edge) return S; // parapet base
  // Crenellations on top
  if (y === 6 && corner) return S;
  return A;
});

import { BuildingType } from '../components/Building';

export const BUILDING_TEMPLATES: Record<BuildingType, VoxelTemplate> = {
  [BuildingType.Shelter]:   SHELTER,
  [BuildingType.Wall]:      WALL,
  [BuildingType.Monument]:  MONUMENT,
  [BuildingType.Farm]:      FARM,
  [BuildingType.Mine]:      MINE,
  [BuildingType.Workshop]:  WORKSHOP,
  [BuildingType.Granary]:   GRANARY,
  [BuildingType.Tower]:     TOWER,
};
