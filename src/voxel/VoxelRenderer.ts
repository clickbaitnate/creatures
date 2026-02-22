// Chunk mesh lifecycle: create/rebuild/dispose Three.js meshes for voxel chunks.

import * as THREE from 'three';
import { VoxelWorld, CHUNKS_X, CHUNKS_Z } from './VoxelWorld';
import { meshChunk } from './ChunkMesher';

const MAX_REBUILDS_PER_FRAME = 4; // limit remeshing per tick for perf

export class VoxelRenderer {
  private world: VoxelWorld;
  private scene: THREE.Scene;
  private chunkMeshes: (THREE.Mesh | null)[];
  private material: THREE.MeshLambertMaterial;

  constructor(world: VoxelWorld, scene: THREE.Scene) {
    this.world = world;
    this.scene = scene;
    this.chunkMeshes = new Array(CHUNKS_X * CHUNKS_Z).fill(null);
    this.material = new THREE.MeshLambertMaterial({
      vertexColors: true,
      side: THREE.FrontSide,
    });
  }

  /** Build all chunk meshes (call once after generate). */
  buildAll(): void {
    for (let cz = 0; cz < CHUNKS_Z; cz++) {
      for (let cx = 0; cx < CHUNKS_X; cx++) {
        this.rebuildChunk(cx, cz);
      }
    }
  }

  /** Rebuild only dirty chunks (call each frame). */
  rebuildDirty(): void {
    let rebuilt = 0;
    for (let i = 0; i < this.world.chunks.length; i++) {
      if (rebuilt >= MAX_REBUILDS_PER_FRAME) break;
      if (this.world.chunks[i].dirty) {
        const cx = i % CHUNKS_X;
        const cz = Math.floor(i / CHUNKS_X);
        this.rebuildChunk(cx, cz);
        rebuilt++;
      }
    }
  }

  private rebuildChunk(cx: number, cz: number): void {
    const idx = cz * CHUNKS_X + cx;
    const chunk = this.world.chunks[idx];

    // Remove old mesh
    const old = this.chunkMeshes[idx];
    if (old) {
      this.scene.remove(old);
      old.geometry.dispose();
    }

    const geo = meshChunk(this.world, cx, cz);
    if (geo) {
      const mesh = new THREE.Mesh(geo, this.material);
      mesh.receiveShadow = true;
      mesh.castShadow = true;
      mesh.frustumCulled = true;
      this.scene.add(mesh);
      this.chunkMeshes[idx] = mesh;
    } else {
      this.chunkMeshes[idx] = null;
    }

    chunk.dirty = false;
  }

  dispose(): void {
    for (const mesh of this.chunkMeshes) {
      if (mesh) {
        this.scene.remove(mesh);
        mesh.geometry.dispose();
      }
    }
    this.chunkMeshes.fill(null);
    this.material.dispose();
  }
}
