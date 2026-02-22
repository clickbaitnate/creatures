import * as THREE from 'three';

// Vivarium environmental props — instanced meshes for performance.

const ROCK_COUNT = 80;
const TREE_COUNT = 60;
const MUSHROOM_COUNT = 40;
const TALL_GRASS_COUNT = 100;
const WORLD_HALF = 50;

// Pseudo-random scatter based on index
function scatter(i: number, seed: number): { x: number; z: number } {
  const a = Math.sin(i * 127.1 + seed * 311.7) * 43758.5453;
  const b = Math.sin(i * 269.5 + seed * 183.3) * 43758.5453;
  return {
    x: (fract(a) * 2 - 1) * (WORLD_HALF - 2),
    z: (fract(b) * 2 - 1) * (WORLD_HALF - 2),
  };
}

function fract(x: number): number { return x - Math.floor(x); }

export function terrainY(x: number, z: number): number {
  // Multi-octave terrain for 100×100 world
  return Math.sin(x * 0.15) * Math.cos(z * 0.2) * 1.2
       + Math.sin(x * 0.35 + z * 0.25) * 0.5
       + Math.sin(x * 0.7 + z * 0.5) * 0.2
       + Math.cos(x * 0.05) * Math.sin(z * 0.08) * 1.5; // large rolling hills
}

export interface EnvironmentObjects {
  rocks: THREE.InstancedMesh;
  treeTrunks: THREE.InstancedMesh;
  treeCanopies: THREE.InstancedMesh;
  mushroomStems: THREE.InstancedMesh;
  mushroomCaps: THREE.InstancedMesh;
  tallGrass: THREE.InstancedMesh;
  pond: THREE.Mesh;
  pondY: number;
}

export function createEnvironment(scene: THREE.Scene): EnvironmentObjects {
  const dummy = new THREE.Object3D();

  // ── Rocks ─────────────────────────────────────
  const rockGeo = new THREE.DodecahedronGeometry(1, 0);
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x777777, roughness: 0.9, flatShading: true });
  const rocks = new THREE.InstancedMesh(rockGeo, rockMat, ROCK_COUNT);
  rocks.castShadow = true;
  rocks.receiveShadow = true;

  for (let i = 0; i < ROCK_COUNT; i++) {
    const { x, z } = scatter(i, 1.0);
    const scale = 0.3 + fract(Math.sin(i * 13.37) * 9999) * 0.5;
    const y = terrainY(x, z);
    dummy.position.set(x, y + scale * 0.3, z);
    dummy.scale.set(scale, scale * (0.6 + fract(Math.sin(i * 7.13) * 999) * 0.6), scale);
    dummy.rotation.set(
      fract(Math.sin(i * 3.14) * 100) * 0.5,
      fract(Math.sin(i * 2.71) * 100) * Math.PI * 2,
      fract(Math.sin(i * 1.41) * 100) * 0.3,
    );
    dummy.updateMatrix();
    rocks.setMatrixAt(i, dummy.matrix);
  }
  rocks.instanceMatrix.needsUpdate = true;
  scene.add(rocks);

  // ── Trees ─────────────────────────────────────
  const trunkGeo = new THREE.CylinderGeometry(0.08, 0.12, 1.0, 5);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x8B5A2B, roughness: 0.9, flatShading: true });
  const treeTrunks = new THREE.InstancedMesh(trunkGeo, trunkMat, TREE_COUNT);
  treeTrunks.castShadow = true;

  const canopyGeo = new THREE.SphereGeometry(0.5, 5, 4);
  const canopyMat = new THREE.MeshStandardMaterial({ color: 0x2d7d2d, roughness: 0.8, flatShading: true });
  const treeCanopies = new THREE.InstancedMesh(canopyGeo, canopyMat, TREE_COUNT);
  treeCanopies.castShadow = true;
  treeCanopies.receiveShadow = true;

  for (let i = 0; i < TREE_COUNT; i++) {
    const { x, z } = scatter(i, 2.0);
    const y = terrainY(x, z);
    const trunkH = 0.8 + fract(Math.sin(i * 17.3) * 999) * 0.6;
    const canopyR = 0.4 + fract(Math.sin(i * 11.7) * 999) * 0.35;

    dummy.position.set(x, y + trunkH * 0.5, z);
    dummy.scale.set(1, trunkH, 1);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    treeTrunks.setMatrixAt(i, dummy.matrix);

    dummy.position.set(x, y + trunkH + canopyR * 0.6, z);
    dummy.scale.set(canopyR * 2, canopyR * 1.5, canopyR * 2);
    dummy.updateMatrix();
    treeCanopies.setMatrixAt(i, dummy.matrix);
  }
  treeTrunks.instanceMatrix.needsUpdate = true;
  treeCanopies.instanceMatrix.needsUpdate = true;
  scene.add(treeTrunks);
  scene.add(treeCanopies);

  // ── Mushrooms ─────────────────────────────────
  const stemGeo = new THREE.CylinderGeometry(0.03, 0.04, 0.2, 5);
  const stemMat = new THREE.MeshStandardMaterial({ color: 0xeeddcc, roughness: 0.7, flatShading: true });
  const mushroomStems = new THREE.InstancedMesh(stemGeo, stemMat, MUSHROOM_COUNT);

  const capGeo = new THREE.SphereGeometry(0.1, 5, 3);
  capGeo.scale(1, 0.5, 1);
  const capMat = new THREE.MeshStandardMaterial({ color: 0xcc3344, roughness: 0.6, flatShading: true, emissive: 0x220505 });
  const mushroomCaps = new THREE.InstancedMesh(capGeo, capMat, MUSHROOM_COUNT);

  for (let i = 0; i < MUSHROOM_COUNT; i++) {
    const { x, z } = scatter(i, 3.0);
    const y = terrainY(x, z);
    const s = 0.8 + fract(Math.sin(i * 23.1) * 999) * 0.5;

    dummy.position.set(x, y + 0.1 * s, z);
    dummy.scale.set(s, s, s);
    dummy.rotation.set(0, fract(Math.sin(i * 5.5) * 100) * Math.PI * 2, 0);
    dummy.updateMatrix();
    mushroomStems.setMatrixAt(i, dummy.matrix);

    dummy.position.set(x, y + 0.22 * s, z);
    dummy.scale.set(s, s, s);
    dummy.updateMatrix();
    mushroomCaps.setMatrixAt(i, dummy.matrix);
  }
  mushroomStems.instanceMatrix.needsUpdate = true;
  mushroomCaps.instanceMatrix.needsUpdate = true;
  scene.add(mushroomStems);
  scene.add(mushroomCaps);

  // ── Tall Grass ────────────────────────────────
  const grassGeo = new THREE.ConeGeometry(0.04, 0.35, 3);
  const grassMat = new THREE.MeshStandardMaterial({ color: 0x6b8e23, roughness: 0.8, flatShading: true });
  const tallGrass = new THREE.InstancedMesh(grassGeo, grassMat, TALL_GRASS_COUNT);

  for (let i = 0; i < TALL_GRASS_COUNT; i++) {
    const { x, z } = scatter(i, 4.0);
    const y = terrainY(x, z);
    const s = 0.7 + fract(Math.sin(i * 31.7) * 999) * 0.6;

    dummy.position.set(x, y + 0.15 * s, z);
    dummy.scale.set(s, s, s);
    dummy.rotation.set(
      (fract(Math.sin(i * 9.3) * 100) - 0.5) * 0.3,
      fract(Math.sin(i * 7.7) * 100) * Math.PI * 2,
      (fract(Math.sin(i * 4.1) * 100) - 0.5) * 0.2,
    );
    dummy.updateMatrix();
    tallGrass.setMatrixAt(i, dummy.matrix);
  }
  tallGrass.instanceMatrix.needsUpdate = true;
  scene.add(tallGrass);

  // ── Pond ──────────────────────────────────────
  const pondRadius = 6;
  const pondGeo = new THREE.CircleGeometry(pondRadius, 24);
  pondGeo.rotateX(-Math.PI / 2);
  const pondMat = new THREE.MeshStandardMaterial({
    color: 0x2266aa,
    transparent: true,
    opacity: 0.5,
    roughness: 0.1,
    metalness: 0.3,
    side: THREE.DoubleSide,
  });
  const pond = new THREE.Mesh(pondGeo, pondMat);
  const pondX = 20;
  const pondZ = -30;
  const pondY = terrainY(pondX, pondZ) - 0.1;
  pond.position.set(pondX, pondY, pondZ);
  scene.add(pond);

  return { rocks, treeTrunks, treeCanopies, mushroomStems, mushroomCaps, tallGrass, pond, pondY };
}

// Pond center for water proximity checks
export const POND_CENTER = new THREE.Vector2(20, -30);
export const POND_RADIUS = 6;

// Animate pond water surface
export function animatePond(pond: THREE.Mesh, time: number): void {
  const pos = pond.geometry.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const dist = Math.sqrt(x * x + z * z);
    const wave = Math.sin(dist * 2 - time * 2) * 0.03 + Math.sin(x * 3 + time * 1.5) * 0.02;
    pos.setY(i, wave);
  }
  pos.needsUpdate = true;
}
