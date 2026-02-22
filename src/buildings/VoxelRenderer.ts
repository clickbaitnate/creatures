import * as THREE from 'three';
import { BlockType, BLOCK_COLORS, type VoxelTemplate, BUILDING_TEMPLATES } from './Templates';
import { BuildingType } from '../components/Building';
import { terrainY } from '../world/Environment';
import { createBuildingTexture } from '../voxel/BlockTextures';

const BLOCK_SIZE = 0.25;
const MAX_BLOCKS_PER_TYPE = 8000; // plenty for ~100 buildings

export class VoxelRenderer {
  private meshes = new Map<BlockType, THREE.InstancedMesh>();
  private textures: THREE.CanvasTexture[] = [];
  private scene: THREE.Scene;
  private dirty = false;
  private buildings: { x: number; z: number; type: BuildingType; factionColor: number }[] = [];

  constructor(scene: THREE.Scene) {
    this.scene = scene;

    const blockGeo = new THREE.BoxGeometry(BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE);

    // Create one InstancedMesh per block type (skip Air)
    for (let bt = 1; bt <= 11; bt++) {
      const tex = createBuildingTexture(bt as BlockType);
      this.textures.push(tex);
      const mat = new THREE.MeshLambertMaterial({ map: tex });
      if (bt === BlockType.Glass) {
        mat.transparent = true;
        mat.opacity = 0.5;
      }
      if (bt === BlockType.Fire) {
        mat.emissive = new THREE.Color(0xFF4400);
        mat.emissiveIntensity = 0.8;
      }
      const mesh = new THREE.InstancedMesh(blockGeo, mat, MAX_BLOCKS_PER_TYPE);
      mesh.count = 0;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      scene.add(mesh);
      this.meshes.set(bt as BlockType, mesh);
    }
  }

  addBuilding(x: number, z: number, type: BuildingType, factionColor: number = 0): void {
    this.buildings.push({ x, z, type, factionColor });
    this.dirty = true;
  }

  removeBuilding(x: number, z: number): void {
    const idx = this.buildings.findIndex(b => Math.abs(b.x - x) < 0.5 && Math.abs(b.z - z) < 0.5);
    if (idx >= 0) {
      this.buildings.splice(idx, 1);
      this.dirty = true;
    }
  }

  rebuild(): void {
    if (!this.dirty) return;
    this.dirty = false;

    const dummy = new THREE.Object3D();
    const counts = new Map<BlockType, number>();
    for (const bt of this.meshes.keys()) counts.set(bt, 0);

    for (const building of this.buildings) {
      const template = BUILDING_TEMPLATES[building.type];
      if (!template) continue;

      const groundY = terrainY(building.x, building.z);
      const halfW = template.width / 2;
      const halfD = template.depth / 2;

      for (let by = 0; by < template.height; by++) {
        for (let bz = 0; bz < template.depth; bz++) {
          for (let bx = 0; bx < template.width; bx++) {
            const block = template.blocks[by * template.depth * template.width + bz * template.width + bx] as BlockType;
            if (block === BlockType.Air) continue;

            const mesh = this.meshes.get(block);
            if (!mesh) continue;

            const count = counts.get(block)!;
            if (count >= MAX_BLOCKS_PER_TYPE) continue;

            dummy.position.set(
              building.x + (bx - halfW) * BLOCK_SIZE,
              groundY + by * BLOCK_SIZE + BLOCK_SIZE / 2,
              building.z + (bz - halfD) * BLOCK_SIZE,
            );
            dummy.scale.set(1, 1, 1);
            dummy.rotation.set(0, 0, 0);
            dummy.updateMatrix();
            mesh.setMatrixAt(count, dummy.matrix);
            counts.set(block, count + 1);
          }
        }
      }
    }

    for (const [bt, mesh] of this.meshes) {
      mesh.count = counts.get(bt) ?? 0;
      mesh.instanceMatrix.needsUpdate = true;
    }
  }

  dispose(): void {
    for (const mesh of this.meshes.values()) {
      this.scene.remove(mesh);
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    }
    this.meshes.clear();
    for (const tex of this.textures) tex.dispose();
    this.textures.length = 0;
  }
}
