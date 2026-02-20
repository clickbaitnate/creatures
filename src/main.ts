import * as THREE from 'three';
import { World } from './ecs/World';
import { TransformStore } from './components/Transform';
import { RenderableStore } from './components/Renderable';
import { BrainStore } from './components/Brain';
import { GenomeStore } from './components/Genome';
import { BiochemStore, createBiochem } from './components/Biochemistry';
import { MotorStore, createMotor } from './components/Motor';
import { SensesStore, createSenses } from './components/Senses';
import { LifecycleStore, createLifecycle, LifeStage } from './components/Lifecycle';
import { FoodStore, FoodType, SensorySystem } from './systems/SensorySystem';
import { BrainSystem } from './systems/BrainSystem';
import { InstinctSystem } from './systems/InstinctSystem';
import { BiochemistrySystem } from './systems/BiochemistrySystem';
import { MetabolismSystem } from './systems/MetabolismSystem';
import { MotorSystem } from './systems/MotorSystem';
import { EatingSystem } from './systems/EatingSystem';
import { ReproductionSystem } from './systems/ReproductionSystem';
import { RenderSystem } from './systems/RenderSystem';
import { createDefaultGenome, genomeToBrain, type CreatureGenome } from './genome/Genome';
import { buildCreatureMesh } from './creatures/MeshBuilder';
import { ChemId } from './biochemistry/ChemicalRegistry';
import { randFloat, randInt } from './utils/Math';

// ── Three.js Scene ──────────────────────────────────────────

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);
scene.fog = new THREE.FogExp2(0x87ceeb, 0.012);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 200);
camera.position.set(0, 20, 30);
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

// Lights
const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
scene.add(ambientLight);

const sunLight = new THREE.DirectionalLight(0xfff4e6, 1.2);
sunLight.position.set(15, 25, 10);
sunLight.castShadow = true;
sunLight.shadow.mapSize.set(2048, 2048);
sunLight.shadow.camera.left = -30;
sunLight.shadow.camera.right = 30;
sunLight.shadow.camera.top = 30;
sunLight.shadow.camera.bottom = -30;
scene.add(sunLight);

// ── Ground with biome zones ─────────────────────────────────

const WORLD_HALF = 25;
const groundGeo = new THREE.PlaneGeometry(WORLD_HALF * 2, WORLD_HALF * 2, 40, 40);
groundGeo.rotateX(-Math.PI / 2);

// Color the ground by biome zone
const groundColors = groundGeo.getAttribute('position');
const colors = new Float32Array(groundColors.count * 3);
for (let i = 0; i < groundColors.count; i++) {
  const x = groundColors.getX(i);
  const z = groundColors.getZ(i);
  const zone = getZone(x, z);
  let r: number, g: number, b: number;
  switch (zone) {
    case FoodType.Berry: // Lush forest (top-left quadrant area)
      r = 0.2; g = 0.55; b = 0.18;
      break;
    case FoodType.Grass: // Plains (center/right area)
      r = 0.45; g = 0.6; b = 0.22;
      break;
    case FoodType.Root: // Rocky/dry (bottom-right area)
      r = 0.55; g = 0.5; b = 0.3;
      break;
  }
  // Add some noise
  const n = (Math.sin(x * 0.5) * Math.cos(z * 0.7) * 0.05);
  colors[i * 3] = r + n;
  colors[i * 3 + 1] = g + n;
  colors[i * 3 + 2] = b + n;
}
groundGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
const groundMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });
const ground = new THREE.Mesh(groundGeo, groundMat);
ground.receiveShadow = true;
scene.add(ground);

// Zone determination: divide world into 3 biome zones
function getZone(x: number, z: number): FoodType {
  // Angle-based zones radiating from center
  const angle = Math.atan2(z, x);
  if (angle < -Math.PI / 3) return FoodType.Root;
  if (angle < Math.PI / 3) return FoodType.Grass;
  return FoodType.Berry;
}

// ── Food visuals ────────────────────────────────────────────

const berryGeo = new THREE.SphereGeometry(0.15, 8, 8);
const berryMat = new THREE.MeshStandardMaterial({ color: 0xcc2244, emissive: 0x330011 });

const grassGeo = new THREE.ConeGeometry(0.12, 0.35, 5);
const grassMat = new THREE.MeshStandardMaterial({ color: 0x55aa22, emissive: 0x112200 });

const rootGeo = new THREE.CylinderGeometry(0.06, 0.1, 0.3, 6);
const rootMat = new THREE.MeshStandardMaterial({ color: 0x886633, emissive: 0x221100 });

function foodMesh(type: FoodType): THREE.Mesh {
  switch (type) {
    case FoodType.Berry: return new THREE.Mesh(berryGeo, berryMat);
    case FoodType.Grass: return new THREE.Mesh(grassGeo, grassMat);
    case FoodType.Root:  return new THREE.Mesh(rootGeo, rootMat);
  }
}

// ── ECS World ───────────────────────────────────────────────

const world = new World();

world.registerStorage(TransformStore as any);
world.registerStorage(RenderableStore as any);
world.registerStorage(BrainStore as any);
world.registerStorage(GenomeStore as any);
world.registerStorage(BiochemStore as any);
world.registerStorage(MotorStore as any);
world.registerStorage(SensesStore as any);
world.registerStorage(LifecycleStore as any);
world.registerStorage(FoodStore as any);

const reproSystem = new ReproductionSystem();
world.addSystem(new SensorySystem());
world.addSystem(new BrainSystem());
world.addSystem(new InstinctSystem());
world.addSystem(new BiochemistrySystem());
world.addSystem(new MetabolismSystem());
world.addSystem(new MotorSystem());
world.addSystem(new EatingSystem());
world.addSystem(reproSystem);
world.addSystem(new RenderSystem());

// ── Creature Spawning ───────────────────────────────────────

function spawnCreature(genome: CreatureGenome, x: number, z: number): number {
  const id = world.spawn();

  // Build the procedural mesh
  const mesh = buildCreatureMesh(genome);
  mesh.userData.entityId = id;
  mesh.castShadow = true;
  scene.add(mesh);

  world.addComponent(id, TransformStore, { x, y: 0, z, rotation: randFloat(0, Math.PI * 2) });
  world.addComponent(id, RenderableStore, { object: mesh });
  world.addComponent(id, BrainStore, { brain: genomeToBrain(genome) });
  world.addComponent(id, GenomeStore, { genome });
  world.addComponent(id, BiochemStore, createBiochem());
  world.addComponent(id, MotorStore, createMotor());
  world.addComponent(id, SensesStore, createSenses());
  world.addComponent(id, LifecycleStore, createLifecycle(genome.maxAge));

  return id;
}

reproSystem.onSpawn = (genome, x, z) => {
  spawnCreature(genome, x, z);
  generation++;
};

// ── Food Spawning ───────────────────────────────────────────

function spawnFood(x: number, z: number, type: FoodType): number {
  const id = world.spawn();
  const energy = type === FoodType.Berry ? randFloat(0.25, 0.45)
               : type === FoodType.Grass ? randFloat(0.15, 0.3)
               : randFloat(0.2, 0.35); // roots

  world.addComponent(id, TransformStore, { x, y: 0.15, z, rotation: 0 });
  world.addComponent(id, FoodStore, { energy, type });

  const mesh = foodMesh(type);
  mesh.position.set(x, 0.15, z);
  mesh.castShadow = true;
  scene.add(mesh);
  world.addComponent(id, RenderableStore, { object: mesh });

  return id;
}

const FOOD_TARGET = 45;
const FOOD_SPAWN_INTERVAL = 30;
let foodTimer = 0;

function maintainFood(): void {
  foodTimer++;
  if (foodTimer < FOOD_SPAWN_INTERVAL) return;
  foodTimer = 0;

  const foodCount = world.query(FoodStore.bit).length;
  const toSpawn = Math.min(4, FOOD_TARGET - foodCount);
  for (let i = 0; i < toSpawn; i++) {
    const x = randFloat(-22, 22);
    const z = randFloat(-22, 22);
    const type = getZone(x, z);
    spawnFood(x, z, type);
  }
}

// ── Selection & Camera ──────────────────────────────────────

let selectedId: number = -1;
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

let cameraTheta = 0;
let cameraPhi = Math.PI / 4;
let cameraDist = 30;
const cameraTarget = new THREE.Vector3(0, 0, 0);
let isDragging = false;
let lastMouseX = 0;
let lastMouseY = 0;

renderer.domElement.addEventListener('mousedown', (e) => {
  if (e.button === 0) {
    mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);

    const meshes: THREE.Object3D[] = [];
    scene.traverse(obj => {
      if (obj instanceof THREE.Mesh && obj.userData.entityId !== undefined) meshes.push(obj);
      if (obj instanceof THREE.Group && obj.userData.entityId !== undefined) meshes.push(...obj.children);
    });
    const intersects = raycaster.intersectObjects(meshes, true);

    if (intersects.length > 0) {
      // Walk up to find entity ID
      let obj: THREE.Object3D | null = intersects[0].object;
      while (obj && obj.userData.entityId === undefined) obj = obj.parent;
      if (obj) selectedId = obj.userData.entityId;
    } else {
      selectedId = -1;
    }
    updateHUD();
  }
  if (e.button === 2 || e.button === 1) {
    isDragging = true;
    lastMouseX = e.clientX;
    lastMouseY = e.clientY;
  }
});

renderer.domElement.addEventListener('mousemove', (e) => {
  if (!isDragging) return;
  cameraTheta -= (e.clientX - lastMouseX) * 0.005;
  cameraPhi = Math.max(0.1, Math.min(Math.PI / 2 - 0.05, cameraPhi - (e.clientY - lastMouseY) * 0.005));
  lastMouseX = e.clientX;
  lastMouseY = e.clientY;
});

renderer.domElement.addEventListener('mouseup', () => { isDragging = false; });
renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());

renderer.domElement.addEventListener('wheel', (e) => {
  cameraDist = Math.max(5, Math.min(60, cameraDist + e.deltaY * 0.05));
});

function updateCamera(): void {
  if (selectedId >= 0 && world.has(selectedId)) {
    const t = TransformStore.get(selectedId);
    if (t) {
      cameraTarget.lerp(new THREE.Vector3(t.x, 0, t.z), 0.05);
    }
  }

  camera.position.set(
    cameraTarget.x + cameraDist * Math.sin(cameraPhi) * Math.sin(cameraTheta),
    cameraTarget.y + cameraDist * Math.cos(cameraPhi),
    cameraTarget.z + cameraDist * Math.sin(cameraPhi) * Math.cos(cameraTheta),
  );
  camera.lookAt(cameraTarget);
}

// ── HUD ─────────────────────────────────────────────────────

const hud = document.createElement('div');
hud.style.cssText = `
  position: fixed; top: 10px; left: 10px; color: #fff; font: 13px monospace;
  background: rgba(0,0,0,0.65); padding: 10px 14px; border-radius: 6px;
  pointer-events: none; line-height: 1.6; min-width: 240px; white-space: pre;
`;
document.body.appendChild(hud);

let generation = 0;

function updateHUD(): void {
  const creatureQuery = LifecycleStore.bit | TransformStore.bit;
  const creatures = world.query(creatureQuery);
  const alive = creatures.filter(id => {
    const lc = LifecycleStore.get(id);
    return lc && lc.stage === LifeStage.Alive;
  });
  const foodCount = world.query(FoodStore.bit).length;

  let text = `Pop: ${alive.length}  Food: ${foodCount}  Gen: ${generation}`;

  if (selectedId >= 0 && world.has(selectedId)) {
    const lc = LifecycleStore.get(selectedId);
    const bio = BiochemStore.get(selectedId);
    const gen = GenomeStore.get(selectedId);
    if (lc && bio && gen) {
      const c = bio.chemicals;
      const g = gen.genome;
      text += `\n─────────────────────────`;
      text += `\n#${selectedId}  Age:${lc.age}  ${lc.stage === LifeStage.Alive ? 'Alive' : 'Dead'}`;
      text += `\nEnergy:  ${bar(c[ChemId.Energy])}`;
      text += `\nGlucose: ${bar(c[ChemId.Glucose])}`;
      text += `\nATP:     ${bar(c[ChemId.ATP])}`;
      text += `\nHunger:  ${bar(c[ChemId.Hunger])}`;
      text += `\nLife:    ${bar(c[ChemId.LifeForce])}`;
      text += `\n─────────────────────────`;
      text += `\nSpeed:${g.speed.toFixed(1)} Size:${g.bodyScale.toFixed(1)} Legs:${g.legCount}`;
      text += `\nDiet B:${(g.dietBerry*100).toFixed(0)}% G:${(g.dietGrass*100).toFixed(0)}% R:${(g.dietRoot*100).toFixed(0)}%`;
    }
  } else {
    text += `\n\nClick creature to inspect`;
  }

  hud.textContent = text;
}

function bar(val: number): string {
  const filled = Math.round(val * 16);
  return '█'.repeat(filled) + '░'.repeat(16 - filled) + ` ${(val * 100).toFixed(0)}%`;
}

// ── Initialization ──────────────────────────────────────────

// Spawn initial creatures
for (let i = 0; i < 18; i++) {
  spawnCreature(createDefaultGenome(), randFloat(-18, 18), randFloat(-18, 18));
}

// Spawn initial food in each zone
for (let i = 0; i < FOOD_TARGET; i++) {
  const x = randFloat(-22, 22);
  const z = randFloat(-22, 22);
  spawnFood(x, z, getZone(x, z));
}

// ── Simulation Loop ─────────────────────────────────────────

const SIM_DT = 0.05;
let hudTimer = 0;
const HUD_INTERVAL = 10;

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

function animate(): void {
  requestAnimationFrame(animate);

  // Run one sim tick per frame
  world.update(SIM_DT);
  maintainFood();

  hudTimer++;
  if (hudTimer >= HUD_INTERVAL) {
    hudTimer = 0;
    updateHUD();
  }

  updateCamera();
  renderer.render(scene, camera);
}

requestAnimationFrame(animate);
