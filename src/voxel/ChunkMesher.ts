// Greedy mesher with face culling and ambient occlusion for voxel chunks.

import { Block, BLOCK_PROPS } from './BlockTypes';
import { VoxelWorld, CHUNK_W, CHUNK_H, CHUNK_D, BLOCK_SIZE, WORLD_HALF, WORLD_HALF_Y, CHUNKS_X } from './VoxelWorld';
import * as THREE from 'three';

// 6 face directions: +X, -X, +Y, -Y, +Z, -Z
const DIRS: [number, number, number][] = [
  [1, 0, 0], [-1, 0, 0],
  [0, 1, 0], [0, -1, 0],
  [0, 0, 1], [0, 0, -1],
];

// Face vertex offsets for each direction (4 verts per face, CCW winding)
// Each entry: [dir_index, [v0, v1, v2, v3]] where vi = [dx, dy, dz] offsets from block origin
const FACE_VERTS: [number, number, number][][] = [
  // +X face
  [[1,0,0],[1,1,0],[1,1,1],[1,0,1]],
  // -X face
  [[0,0,1],[0,1,1],[0,1,0],[0,0,0]],
  // +Y face
  [[0,1,0],[0,1,1],[1,1,1],[1,1,0]],
  // -Y face
  [[0,0,1],[0,0,0],[1,0,0],[1,0,1]],
  // +Z face
  [[0,0,1],[1,0,1],[1,1,1],[0,1,1]],
  // -Z face
  [[1,0,0],[0,0,0],[0,1,0],[1,1,0]],
];

// Normals per face
const FACE_NORMALS: [number, number, number][] = [
  [1,0,0], [-1,0,0], [0,1,0], [0,-1,0], [0,0,1], [0,0,-1],
];

// AO corner offsets per face vertex (which 3 neighbors to check for occlusion)
// For each face direction and each of its 4 vertices, 2 side + 1 corner neighbor
function getAO(world: VoxelWorld, bx: number, by: number, bz: number,
               face: number, vertex: number): number {
  const n = FACE_NORMALS[face];
  // Position of the neighbor on this face
  const nx = bx + n[0], ny = by + n[1], nz = bz + n[2];
  // Get tangent/bitangent for this face
  const v = FACE_VERTS[face][vertex];
  // Determine 2 edge neighbors and 1 corner for AO
  const s1x = nx + (v[0] * 2 - 1) * (1 - Math.abs(n[0]));
  const s1y = ny + (v[1] * 2 - 1) * (1 - Math.abs(n[1]));
  const s1z = nz + (v[2] * 2 - 1) * (1 - Math.abs(n[2]));

  // Simplified AO: just check if the block at the vertex corner is solid
  const corner = world.getBlock(
    bx + v[0] + n[0] - (n[0] === 0 ? 0 : 0),
    by + v[1] + n[1] - (n[1] === 0 ? 0 : 0),
    bz + v[2] + n[2] - (n[2] === 0 ? 0 : 0)
  );
  const side1 = world.getBlock(
    bx + n[0] + (v[0] * 2 - 1) * (Math.abs(n[1]) + Math.abs(n[2]) > 0 ? 1 : 0),
    by + n[1] + (v[1] * 2 - 1) * (Math.abs(n[0]) + Math.abs(n[2]) > 0 ? 1 : 0),
    bz + n[2] + (v[2] * 2 - 1) * (Math.abs(n[0]) + Math.abs(n[1]) > 0 ? 1 : 0)
  );

  let occ = 0;
  if (BLOCK_PROPS[corner].solid) occ++;
  if (BLOCK_PROPS[side1].solid) occ++;
  // AO levels: 0 occlusions = 1.0, 1 = 0.85, 2 = 0.7
  return 1.0 - occ * 0.15;
}

/**
 * Build a mesh for chunk at (cx, cz).
 * Returns null if chunk is entirely empty/underground with no exposed faces.
 */
export function meshChunk(world: VoxelWorld, cx: number, cz: number): THREE.BufferGeometry | null {
  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];

  const baseX = cx * CHUNK_W;
  const baseZ = cz * CHUNK_D;
  const chunk = world.chunks[cz * CHUNKS_X + cx]; // direct access for speed

  let vertCount = 0;

  for (let ly = 0; ly < CHUNK_H; ly++) {
    for (let lz = 0; lz < CHUNK_D; lz++) {
      for (let lx = 0; lx < CHUNK_W; lx++) {
        const idx = (ly * CHUNK_D + lz) * CHUNK_W + lx;
        const block = chunk.blocks[idx] as Block;
        if (block === Block.Air) continue;

        const bx = baseX + lx;
        const by = ly;
        const bz = baseZ + lz;
        const props = BLOCK_PROPS[block];

        for (let f = 0; f < 6; f++) {
          const d = DIRS[f];
          const nbx = bx + d[0], nby = by + d[1], nbz = bz + d[2];
          const neighbor = world.getBlock(nbx, nby, nbz);
          const nProps = BLOCK_PROPS[neighbor];

          // Emit face if neighbor is air or transparent (and we're not both transparent same type)
          if (!nProps.solid || (nProps.transparent && !(props.transparent && block === neighbor))) {
            const fv = FACE_VERTS[f];
            const fn = FACE_NORMALS[f];

            // World-space position of block origin
            const wx = bx * BLOCK_SIZE - WORLD_HALF;
            const wy = by * BLOCK_SIZE - WORLD_HALF_Y;
            const wz = bz * BLOCK_SIZE - WORLD_HALF;

            // Color from block props
            const r = ((props.color >> 16) & 0xFF) / 255;
            const g = ((props.color >> 8) & 0xFF) / 255;
            const b = (props.color & 0xFF) / 255;

            // Slight face shading: top brightest, bottom darkest, sides mid
            let faceBright = 1.0;
            if (f === 2) faceBright = 1.0;      // +Y top
            else if (f === 3) faceBright = 0.6;  // -Y bottom
            else if (f === 0 || f === 1) faceBright = 0.8; // ±X
            else faceBright = 0.85; // ±Z

            for (let vi = 0; vi < 4; vi++) {
              const v = fv[vi];
              positions.push(
                wx + v[0] * BLOCK_SIZE,
                wy + v[1] * BLOCK_SIZE,
                wz + v[2] * BLOCK_SIZE,
              );
              normals.push(fn[0], fn[1], fn[2]);

              // Simple AO approximation
              const ao = getAO(world, bx, by, bz, f, vi);
              const bright = faceBright * ao;
              colors.push(r * bright, g * bright, b * bright);
            }

            // Two triangles per face
            indices.push(
              vertCount, vertCount + 1, vertCount + 2,
              vertCount, vertCount + 2, vertCount + 3,
            );
            vertCount += 4;
          }
        }
      }
    }
  }

  if (vertCount === 0) return null;

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(indices);
  return geo;
}
