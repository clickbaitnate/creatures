import * as THREE from 'three';
import { ResourceGrid, GRID_SIZE, CELL_SIZE, Resource, GRID_CELLS } from './ResourceGrid';

// One InstancedMesh per resource type, scale Y by amount for growth visual

const MAX_INSTANCES = GRID_CELLS;

interface ResourceMeshDef {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  yOffset: number;
  scaleXZ: number;
}

const RESOURCE_DEFS: Partial<Record<Resource, ResourceMeshDef>> = {
  [Resource.Grass]: {
    geometry: new THREE.ConeGeometry(0.25, 0.6, 5),
    material: new THREE.MeshStandardMaterial({ color: 0x55aa22, emissive: 0x112200, roughness: 0.9 }),
    yOffset: 0.1,
    scaleXZ: 0.8,
  },
  [Resource.BerryBush]: {
    geometry: new THREE.SphereGeometry(0.3, 6, 6),
    material: new THREE.MeshStandardMaterial({ color: 0xcc2244, emissive: 0x330011, roughness: 0.8 }),
    yOffset: 0.15,
    scaleXZ: 0.7,
  },
  [Resource.RootTuber]: {
    geometry: new THREE.CylinderGeometry(0.1, 0.18, 0.4, 6),
    material: new THREE.MeshStandardMaterial({ color: 0x886633, emissive: 0x221100, roughness: 0.9 }),
    yOffset: 0.08,
    scaleXZ: 0.8,
  },
  [Resource.Wood]: {
    geometry: new THREE.CylinderGeometry(0.08, 0.12, 0.8, 6),
    material: new THREE.MeshStandardMaterial({ color: 0x6b4423, emissive: 0x1a1008, roughness: 0.9 }),
    yOffset: 0.2,
    scaleXZ: 0.6,
  },
  [Resource.Stone]: {
    geometry: new THREE.DodecahedronGeometry(0.2, 0),
    material: new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.95 }),
    yOffset: 0.1,
    scaleXZ: 0.9,
  },
  [Resource.Ore]: {
    geometry: new THREE.OctahedronGeometry(0.18, 0),
    material: new THREE.MeshStandardMaterial({ color: 0x8b6914, emissive: 0x221800, roughness: 0.7 }),
    yOffset: 0.1,
    scaleXZ: 0.8,
  },
  [Resource.Farmland]: {
    geometry: new THREE.BoxGeometry(0.4, 0.15, 0.4),
    material: new THREE.MeshStandardMaterial({ color: 0x5a8a3a, emissive: 0x112200, roughness: 0.9 }),
    yOffset: 0.05,
    scaleXZ: 1.0,
  },
};

const dummy = new THREE.Object3D();

export class ResourceRenderer {
  private meshes: Map<Resource, THREE.InstancedMesh> = new Map();
  private scene: THREE.Scene;

  constructor(scene: THREE.Scene) {
    this.scene = scene;

    for (const [resStr, def] of Object.entries(RESOURCE_DEFS)) {
      const res = Number(resStr) as Resource;
      const mesh = new THREE.InstancedMesh(def.geometry, def.material, MAX_INSTANCES);
      mesh.count = 0;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      scene.add(mesh);
      this.meshes.set(res, mesh);
    }
  }

  update(grid: ResourceGrid): void {
    if (!grid.dirty) return;
    grid.dirty = false;

    // Reset counts
    const counts = new Map<Resource, number>();
    for (const res of this.meshes.keys()) counts.set(res, 0);

    // Populate instance matrices
    for (let i = 0; i < GRID_CELLS; i++) {
      const res = grid.resource[i] as Resource;
      if (res === Resource.Empty) continue;

      const def = RESOURCE_DEFS[res];
      const mesh = this.meshes.get(res);
      if (!def || !mesh) continue;

      const amt = grid.amount[i];
      if (amt < 0.05) continue;

      const count = counts.get(res)!;
      const gx = i % GRID_SIZE;
      const gz = Math.floor(i / GRID_SIZE);
      const wx = (gx - GRID_SIZE / 2) * CELL_SIZE + CELL_SIZE / 2;
      const wz = (gz - GRID_SIZE / 2) * CELL_SIZE + CELL_SIZE / 2;

      // Slight random offset per cell for visual variety (deterministic from index)
      const ox = Math.sin(i * 7.13) * 0.3;
      const oz = Math.cos(i * 11.37) * 0.3;

      dummy.position.set(wx + ox, def.yOffset * amt, wz + oz);
      dummy.scale.set(def.scaleXZ * amt, amt, def.scaleXZ * amt);
      dummy.rotation.y = i * 1.618; // golden angle offset
      dummy.updateMatrix();
      mesh.setMatrixAt(count, dummy.matrix);

      counts.set(res, count + 1);
    }

    // Update mesh counts and upload
    for (const [res, mesh] of this.meshes) {
      mesh.count = counts.get(res) ?? 0;
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
  }
}
