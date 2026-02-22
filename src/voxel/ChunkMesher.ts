// Greedy mesher with face culling and ambient occlusion for voxel chunks.
// Returns separate solid and water geometries for proper transparency.

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

function getAO(world: VoxelWorld, bx: number, by: number, bz: number,
               face: number, vertex: number): number {
  const n = FACE_NORMALS[face];
  const v = FACE_VERTS[face][vertex];
  const corner = world.getBlock(
    bx + v[0] + n[0],
    by + v[1] + n[1],
    bz + v[2] + n[2]
  );
  const side1 = world.getBlock(
    bx + n[0] + (v[0] * 2 - 1) * (Math.abs(n[1]) + Math.abs(n[2]) > 0 ? 1 : 0),
    by + n[1] + (v[1] * 2 - 1) * (Math.abs(n[0]) + Math.abs(n[2]) > 0 ? 1 : 0),
    bz + n[2] + (v[2] * 2 - 1) * (Math.abs(n[0]) + Math.abs(n[1]) > 0 ? 1 : 0)
  );

  let occ = 0;
  if (BLOCK_PROPS[corner].solid) occ++;
  if (BLOCK_PROPS[side1].solid) occ++;
  return 1.0 - occ * 0.15;
}

export interface ChunkMeshResult {
  solidGeo: THREE.BufferGeometry | null;
  waterGeo: THREE.BufferGeometry | null;
}

/**
 * Build separate solid and water meshes for chunk at (cx, cz).
 */
export function meshChunk(world: VoxelWorld, cx: number, cz: number): ChunkMeshResult {
  // Solid geometry buffers
  const sPos: number[] = [];
  const sNorm: number[] = [];
  const sCol: number[] = [];
  const sIdx: number[] = [];
  let sVert = 0;

  // Water geometry buffers
  const wPos: number[] = [];
  const wNorm: number[] = [];
  const wCol: number[] = [];
  const wIdx: number[] = [];
  let wVert = 0;

  const baseX = cx * CHUNK_W;
  const baseZ = cz * CHUNK_D;
  const chunk = world.chunks[cz * CHUNKS_X + cx];

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
        const isWater = block === Block.Water;

        // Water: only render top face when above block is Air
        if (isWater) {
          const aboveBlock = world.getBlock(bx, by + 1, bz);
          if (aboveBlock !== Block.Air) continue; // submerged, skip

          // Render only +Y face, lowered by 15%
          const wx = bx * BLOCK_SIZE - WORLD_HALF;
          const wy = by * BLOCK_SIZE - WORLD_HALF_Y;
          const wz2 = bz * BLOCK_SIZE - WORLD_HALF;

          const r = ((props.color >> 16) & 0xFF) / 255;
          const g = ((props.color >> 8) & 0xFF) / 255;
          const b = (props.color & 0xFF) / 255;

          const topY = wy + BLOCK_SIZE * 0.85; // 15% recessed

          const fv = FACE_VERTS[2]; // +Y face
          const fn = FACE_NORMALS[2];
          for (let vi = 0; vi < 4; vi++) {
            const v = fv[vi];
            wPos.push(
              wx + v[0] * BLOCK_SIZE,
              topY,
              wz2 + v[2] * BLOCK_SIZE,
            );
            wNorm.push(fn[0], fn[1], fn[2]);
            wCol.push(r, g, b);
          }
          wIdx.push(wVert, wVert + 1, wVert + 2, wVert, wVert + 2, wVert + 3);
          wVert += 4;
          continue;
        }

        // Solid block: emit faces as before
        for (let f = 0; f < 6; f++) {
          const d = DIRS[f];
          const nbx = bx + d[0], nby = by + d[1], nbz = bz + d[2];
          const neighbor = world.getBlock(nbx, nby, nbz);
          const nProps = BLOCK_PROPS[neighbor];

          if (!nProps.solid || (nProps.transparent && !(props.transparent && block === neighbor))) {
            const fv = FACE_VERTS[f];
            const fn = FACE_NORMALS[f];

            const wx = bx * BLOCK_SIZE - WORLD_HALF;
            const wy = by * BLOCK_SIZE - WORLD_HALF_Y;
            const wz2 = bz * BLOCK_SIZE - WORLD_HALF;

            const r = ((props.color >> 16) & 0xFF) / 255;
            const g = ((props.color >> 8) & 0xFF) / 255;
            const b = (props.color & 0xFF) / 255;

            let faceBright = 1.0;
            if (f === 2) faceBright = 1.0;
            else if (f === 3) faceBright = 0.6;
            else if (f === 0 || f === 1) faceBright = 0.8;
            else faceBright = 0.85;

            for (let vi = 0; vi < 4; vi++) {
              const v = fv[vi];
              sPos.push(
                wx + v[0] * BLOCK_SIZE,
                wy + v[1] * BLOCK_SIZE,
                wz2 + v[2] * BLOCK_SIZE,
              );
              sNorm.push(fn[0], fn[1], fn[2]);

              const ao = getAO(world, bx, by, bz, f, vi);
              const bright = faceBright * ao;
              sCol.push(r * bright, g * bright, b * bright);
            }

            sIdx.push(sVert, sVert + 1, sVert + 2, sVert, sVert + 2, sVert + 3);
            sVert += 4;
          }
        }
      }
    }
  }

  let solidGeo: THREE.BufferGeometry | null = null;
  if (sVert > 0) {
    solidGeo = new THREE.BufferGeometry();
    solidGeo.setAttribute('position', new THREE.Float32BufferAttribute(sPos, 3));
    solidGeo.setAttribute('normal', new THREE.Float32BufferAttribute(sNorm, 3));
    solidGeo.setAttribute('color', new THREE.Float32BufferAttribute(sCol, 3));
    solidGeo.setIndex(sIdx);
  }

  let waterGeo: THREE.BufferGeometry | null = null;
  if (wVert > 0) {
    waterGeo = new THREE.BufferGeometry();
    waterGeo.setAttribute('position', new THREE.Float32BufferAttribute(wPos, 3));
    waterGeo.setAttribute('normal', new THREE.Float32BufferAttribute(wNorm, 3));
    waterGeo.setAttribute('color', new THREE.Float32BufferAttribute(wCol, 3));
    waterGeo.setIndex(wIdx);
  }

  return { solidGeo, waterGeo };
}
