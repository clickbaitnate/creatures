// Chunk mesh lifecycle: create/rebuild/dispose Three.js meshes for voxel chunks.
// View-distance based: only builds/keeps meshes within VIEW_DIST chunks of camera.
// Separate solid and water meshes for proper transparency.

import * as THREE from 'three';
import { VoxelWorld, CHUNKS_X, CHUNKS_Z, CHUNK_W, CHUNK_D, BLOCK_SIZE } from './VoxelWorld';
import { meshChunk } from './ChunkMesher';

const MAX_REBUILDS_PER_FRAME = 4;
const VIEW_DIST = 10; // chunks around camera

export class VoxelRenderer {
  private world: VoxelWorld;
  private scene: THREE.Scene;
  private chunkMeshes: (THREE.Mesh | null)[];
  private waterMeshes: (THREE.Mesh | null)[];
  private material: THREE.MeshLambertMaterial;
  private waterMaterial: THREE.MeshStandardMaterial;
  private loadedSet = new Set<number>();
  private camCX = -999;
  private camCZ = -999;

  constructor(world: VoxelWorld, scene: THREE.Scene) {
    this.world = world;
    this.scene = scene;
    this.chunkMeshes = new Array(CHUNKS_X * CHUNKS_Z).fill(null);
    this.waterMeshes = new Array(CHUNKS_X * CHUNKS_Z).fill(null);
    this.material = new THREE.MeshLambertMaterial({
      vertexColors: true,
      side: THREE.FrontSide,
    });
    this.waterMaterial = new THREE.MeshStandardMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.6,
      color: 0x4488CC,
      roughness: 0.2,
      metalness: 0.3,
      side: THREE.DoubleSide,
    });
  }

  buildAll(): void {
    this.updateCamera(0, 0);
  }

  updateCamera(wx: number, wz: number): void {
    const worldHalf = (CHUNKS_X * CHUNK_W * BLOCK_SIZE) / 2;
    const cx = Math.floor((wx + worldHalf) / (CHUNK_W * BLOCK_SIZE));
    const cz = Math.floor((wz + worldHalf) / (CHUNK_D * BLOCK_SIZE));

    if (cx === this.camCX && cz === this.camCZ) return;
    this.camCX = cx;
    this.camCZ = cz;

    const newLoaded = new Set<number>();

    for (let dz = -VIEW_DIST; dz <= VIEW_DIST; dz++) {
      for (let dx = -VIEW_DIST; dx <= VIEW_DIST; dx++) {
        const gcx = cx + dx;
        const gcz = cz + dz;
        if (gcx < 0 || gcx >= CHUNKS_X || gcz < 0 || gcz >= CHUNKS_Z) continue;
        const idx = gcz * CHUNKS_X + gcx;
        newLoaded.add(idx);

        if (!this.loadedSet.has(idx)) {
          this.rebuildChunk(gcx, gcz);
        }
      }
    }

    for (const idx of this.loadedSet) {
      if (!newLoaded.has(idx)) {
        this.disposeChunk(idx);
      }
    }

    this.loadedSet = newLoaded;
  }

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

    // Remove old meshes
    this.disposeChunk(idx);

    const { solidGeo, waterGeo } = meshChunk(this.world, cx, cz);

    if (solidGeo) {
      const mesh = new THREE.Mesh(solidGeo, this.material);
      mesh.receiveShadow = true;
      mesh.castShadow = true;
      mesh.frustumCulled = true;
      this.scene.add(mesh);
      this.chunkMeshes[idx] = mesh;
    }

    if (waterGeo) {
      const mesh = new THREE.Mesh(waterGeo, this.waterMaterial);
      mesh.receiveShadow = true;
      mesh.frustumCulled = true;
      mesh.renderOrder = 1; // render after solid for transparency
      this.scene.add(mesh);
      this.waterMeshes[idx] = mesh;
    }

    chunk.dirty = false;
    this.loadedSet.add(idx);
  }

  private disposeChunk(idx: number): void {
    const solid = this.chunkMeshes[idx];
    if (solid) {
      this.scene.remove(solid);
      solid.geometry.dispose();
      this.chunkMeshes[idx] = null;
    }
    const water = this.waterMeshes[idx];
    if (water) {
      this.scene.remove(water);
      water.geometry.dispose();
      this.waterMeshes[idx] = null;
    }
  }

  dispose(): void {
    for (let i = 0; i < this.chunkMeshes.length; i++) {
      this.disposeChunk(i);
    }
    this.loadedSet.clear();
    this.material.dispose();
    this.waterMaterial.dispose();
  }
}
