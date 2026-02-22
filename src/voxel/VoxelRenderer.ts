// Chunk mesh lifecycle: create/rebuild/dispose Three.js meshes for voxel chunks.
// View-distance based: only builds/keeps meshes within VIEW_DIST chunks of camera.

import * as THREE from 'three';
import { VoxelWorld, CHUNKS_X, CHUNKS_Z, CHUNK_W, CHUNK_D, BLOCK_SIZE } from './VoxelWorld';
import { meshChunk } from './ChunkMesher';

const MAX_REBUILDS_PER_FRAME = 4;
const VIEW_DIST = 10; // chunks around camera

export class VoxelRenderer {
  private world: VoxelWorld;
  private scene: THREE.Scene;
  private chunkMeshes: (THREE.Mesh | null)[];
  private material: THREE.MeshLambertMaterial;
  private loadedSet = new Set<number>(); // indices of currently loaded chunk meshes
  private camCX = -999; // last camera chunk X
  private camCZ = -999; // last camera chunk Z

  constructor(world: VoxelWorld, scene: THREE.Scene) {
    this.world = world;
    this.scene = scene;
    this.chunkMeshes = new Array(CHUNKS_X * CHUNKS_Z).fill(null);
    this.material = new THREE.MeshLambertMaterial({
      vertexColors: true,
      side: THREE.FrontSide,
    });
  }

  /** Build chunk meshes within view distance of world center (call once after generate). */
  buildAll(): void {
    this.updateCamera(0, 0);
  }

  /** Update which chunks are loaded based on camera world position. */
  updateCamera(wx: number, wz: number): void {
    const worldHalf = (CHUNKS_X * CHUNK_W * BLOCK_SIZE) / 2;
    const cx = Math.floor((wx + worldHalf) / (CHUNK_W * BLOCK_SIZE));
    const cz = Math.floor((wz + worldHalf) / (CHUNK_D * BLOCK_SIZE));

    // Only recompute if camera moved to a different chunk
    if (cx === this.camCX && cz === this.camCZ) return;
    this.camCX = cx;
    this.camCZ = cz;

    const newLoaded = new Set<number>();

    // Determine which chunks should be loaded
    for (let dz = -VIEW_DIST; dz <= VIEW_DIST; dz++) {
      for (let dx = -VIEW_DIST; dx <= VIEW_DIST; dx++) {
        const gcx = cx + dx;
        const gcz = cz + dz;
        if (gcx < 0 || gcx >= CHUNKS_X || gcz < 0 || gcz >= CHUNKS_Z) continue;
        const idx = gcz * CHUNKS_X + gcx;
        newLoaded.add(idx);

        // Build mesh if not already loaded
        if (!this.loadedSet.has(idx)) {
          this.rebuildChunk(gcx, gcz);
        }
      }
    }

    // Dispose meshes that left view distance
    for (const idx of this.loadedSet) {
      if (!newLoaded.has(idx)) {
        const mesh = this.chunkMeshes[idx];
        if (mesh) {
          this.scene.remove(mesh);
          mesh.geometry.dispose();
          this.chunkMeshes[idx] = null;
        }
      }
    }

    this.loadedSet = newLoaded;
  }

  /** Rebuild only dirty chunks that are within view distance (call each frame). */
  rebuildDirty(): void {
    let rebuilt = 0;
    for (const idx of this.loadedSet) {
      if (rebuilt >= MAX_REBUILDS_PER_FRAME) break;
      if (this.world.chunks[idx].dirty) {
        const gcx = idx % CHUNKS_X;
        const gcz = Math.floor(idx / CHUNKS_X);
        this.rebuildChunk(gcx, gcz);
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
    this.loadedSet.add(idx);
  }

  dispose(): void {
    for (const mesh of this.chunkMeshes) {
      if (mesh) {
        this.scene.remove(mesh);
        mesh.geometry.dispose();
      }
    }
    this.chunkMeshes.fill(null);
    this.loadedSet.clear();
    this.material.dispose();
  }
}
