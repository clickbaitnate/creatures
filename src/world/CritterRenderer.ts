import * as THREE from 'three';
import { CritterManager, CritterType } from './PreyCritters';

const MAX_PER_TYPE = 60;
const dummy = new THREE.Object3D();

export class CritterRenderer {
  private rabbitMesh: THREE.InstancedMesh;
  private bugMesh: THREE.InstancedMesh;
  private fishMesh: THREE.InstancedMesh;
  private scene: THREE.Scene;

  constructor(scene: THREE.Scene) {
    this.scene = scene;

    // Rabbit: small white sphere + ears
    const rabbitGeo = new THREE.SphereGeometry(0.12, 6, 6);
    const rabbitMat = new THREE.MeshStandardMaterial({ color: 0xddccaa, roughness: 0.9 });
    this.rabbitMesh = new THREE.InstancedMesh(rabbitGeo, rabbitMat, MAX_PER_TYPE);
    this.rabbitMesh.count = 0;
    this.rabbitMesh.frustumCulled = false;
    scene.add(this.rabbitMesh);

    // Bug: tiny dark sphere
    const bugGeo = new THREE.SphereGeometry(0.05, 4, 4);
    const bugMat = new THREE.MeshStandardMaterial({ color: 0x332211, roughness: 0.8 });
    this.bugMesh = new THREE.InstancedMesh(bugGeo, bugMat, MAX_PER_TYPE);
    this.bugMesh.count = 0;
    this.bugMesh.frustumCulled = false;
    scene.add(this.bugMesh);

    // Fish: flattened ellipsoid
    const fishGeo = new THREE.SphereGeometry(0.1, 6, 4);
    const fishMat = new THREE.MeshStandardMaterial({ color: 0x5599cc, emissive: 0x112233, roughness: 0.6 });
    this.fishMesh = new THREE.InstancedMesh(fishGeo, fishMat, MAX_PER_TYPE);
    this.fishMesh.count = 0;
    this.fishMesh.frustumCulled = false;
    scene.add(this.fishMesh);
  }

  update(manager: CritterManager): void {
    let rabbitCount = 0, bugCount = 0, fishCount = 0;

    for (let i = 0; i < manager.count; i++) {
      if (!manager.alive[i]) continue;

      const t = manager.type[i] as CritterType;
      const x = manager.x[i];
      const z = manager.z[i];
      const heading = manager.heading[i];

      dummy.rotation.y = heading;

      switch (t) {
        case CritterType.Rabbit:
          dummy.position.set(x, 0.12, z);
          dummy.scale.set(1, 1, 1.3); // slightly elongated
          dummy.updateMatrix();
          this.rabbitMesh.setMatrixAt(rabbitCount++, dummy.matrix);
          break;
        case CritterType.Bug:
          dummy.position.set(x, 0.05, z);
          dummy.scale.set(1, 0.6, 1);
          dummy.updateMatrix();
          this.bugMesh.setMatrixAt(bugCount++, dummy.matrix);
          break;
        case CritterType.Fish:
          dummy.position.set(x, 0.08, z);
          dummy.scale.set(1, 0.5, 1.5); // fish-shaped
          dummy.updateMatrix();
          this.fishMesh.setMatrixAt(fishCount++, dummy.matrix);
          break;
      }
    }

    this.rabbitMesh.count = rabbitCount;
    this.bugMesh.count = bugCount;
    this.fishMesh.count = fishCount;

    this.rabbitMesh.instanceMatrix.needsUpdate = true;
    this.bugMesh.instanceMatrix.needsUpdate = true;
    this.fishMesh.instanceMatrix.needsUpdate = true;
  }
}
