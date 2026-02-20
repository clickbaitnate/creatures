import * as THREE from 'three';
import { World } from './ecs/World';
import { TransformStore, type TransformData } from './components/Transform';
import { RenderableStore } from './components/Renderable';
import { BrainStore } from './components/Brain';
import { GenomeStore } from './components/Genome';
import { BiochemStore, createBiochem } from './components/Biochemistry';
import { MotorStore, createMotor } from './components/Motor';
import { SensesStore, createSenses } from './components/Senses';
import { LifecycleStore, createLifecycle, LifeStage } from './components/Lifecycle';
import { FoodStore, SensorySystem } from './systems/SensorySystem';
import { BrainSystem } from './systems/BrainSystem';
import { BiochemistrySystem } from './systems/BiochemistrySystem';
import { MetabolismSystem } from './systems/MetabolismSystem';
import { MotorSystem } from './systems/MotorSystem';
import { EatingSystem } from './systems/EatingSystem';
import { ReproductionSystem } from './systems/ReproductionSystem';
import { InstinctSystem } from './systems/InstinctSystem';
import { RenderSystem } from './systems/RenderSystem';
import { createDefaultGenome, genomeToBrain, type CreatureGenome } from './genome/Genome';
import { ChemId } from './biochemistry/ChemicalRegistry';
import { randFloat } from './utils/Math';

// ── Three.js Scene ──────────────────────────────────────────

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);
scene.fog = new THREE.Fog(0x87ceeb, 40, 60);

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

// Ground
const groundGeometry = new THREE.PlaneGeometry(50, 50, 20, 20);
const groundMaterial = new THREE.MeshStandardMaterial({ color: 0x4a7c3f, roughness: 0.9 });
const ground = new THREE.Mesh(groundGeometry, groundMaterial);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// Shared geometries
const creatureGeometry = new THREE.CapsuleGeometry(0.3, 0.6, 8, 12);
const foodGeometry = new THREE.SphereGeometry(0.2, 8, 8);
const foodMaterial = new THREE.MeshStandardMaterial({ color: 0x44cc44, emissive: 0x115511 });

// ── ECS World ───────────────────────────────────────────────

const world = new World();

// Register all component storages for cleanup
world.registerStorage(TransformStore as any);
world.registerStorage(RenderableStore as any);
world.registerStorage(BrainStore as any);
world.registerStorage(GenomeStore as any);
world.registerStorage(BiochemStore as any);
world.registerStorage(MotorStore as any);
world.registerStorage(SensesStore as any);
world.registerStorage(LifecycleStore as any);
world.registerStorage(FoodStore as any);

// Register systems
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

  world.addComponent(id, TransformStore, { x, y: 0.6, z, rotation: randFloat(0, Math.PI * 2) });

  const color = new THREE.Color().setHSL(genome.colorH / 360, genome.colorS, genome.colorL);
  const material = new THREE.MeshStandardMaterial({ color });
  const mesh = new THREE.Mesh(creatureGeometry, material);
  mesh.scale.setScalar(genome.bodyScale);
  mesh.castShadow = true;
  mesh.userData.entityId = id;
  scene.add(mesh);
  world.addComponent(id, RenderableStore, { object: mesh });

  world.addComponent(id, BrainStore, { brain: genomeToBrain(genome) });
  world.addComponent(id, GenomeStore, { genome });
  world.addComponent(id, BiochemStore, createBiochem());
  world.addComponent(id, MotorStore, createMotor());
  world.addComponent(id, SensesStore, createSenses());
  world.addComponent(id, LifecycleStore, createLifecycle(genome.maxAge));

  return id;
}

// Wire reproduction spawning
reproSystem.onSpawn = (genome, x, z) => spawnCreature(genome, x, z);

// ── Food Spawning ───────────────────────────────────────────

function spawnFood(x: number, z: number, energy: number): number {
  const id = world.spawn();
  world.addComponent(id, TransformStore, { x, y: 0.2, z, rotation: 0 });
  world.addComponent(id, FoodStore, { energy });

  const mesh = new THREE.Mesh(foodGeometry, foodMaterial);
  mesh.position.set(x, 0.2, z);
  mesh.castShadow = true;
  scene.add(mesh);
  world.addComponent(id, RenderableStore, { object: mesh });

  return id;
}

const FOOD_TARGET = 30;
const FOOD_SPAWN_INTERVAL = 40; // ticks between spawn checks
let foodTimer = 0;

function maintainFood(): void {
  foodTimer++;
  if (foodTimer < FOOD_SPAWN_INTERVAL) return;
  foodTimer = 0;

  const foodCount = world.query(FoodStore.bit).length;
  const toSpawn = Math.min(3, FOOD_TARGET - foodCount);
  for (let i = 0; i < toSpawn; i++) {
    spawnFood(randFloat(-22, 22), randFloat(-22, 22), randFloat(0.15, 0.35));
  }
}

// ── Selection & Camera ──────────────────────────────────────

let selectedId: number = -1;
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

// Camera orbit state
let cameraTheta = 0;
let cameraPhi = Math.PI / 4;
let cameraDist = 30;
let cameraTarget = new THREE.Vector3(0, 0, 0);
let isDragging = false;
let lastMouseX = 0;
let lastMouseY = 0;

renderer.domElement.addEventListener('mousedown', (e) => {
  if (e.button === 0) {
    // Try to select a creature
    mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);

    const meshes: THREE.Object3D[] = [];
    scene.traverse(obj => { if (obj instanceof THREE.Mesh && obj.userData.entityId !== undefined) meshes.push(obj); });
    const intersects = raycaster.intersectObjects(meshes);

    if (intersects.length > 0) {
      selectedId = intersects[0].object.userData.entityId;
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
  const dx = e.clientX - lastMouseX;
  const dy = e.clientY - lastMouseY;
  cameraTheta -= dx * 0.005;
  cameraPhi = Math.max(0.1, Math.min(Math.PI / 2 - 0.05, cameraPhi - dy * 0.005));
  lastMouseX = e.clientX;
  lastMouseY = e.clientY;
});

renderer.domElement.addEventListener('mouseup', () => { isDragging = false; });
renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());

renderer.domElement.addEventListener('wheel', (e) => {
  cameraDist = Math.max(5, Math.min(60, cameraDist + e.deltaY * 0.05));
});

function updateCamera(): void {
  // If following a selected creature
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
  position: fixed; top: 10px; left: 10px; color: #fff; font: 14px monospace;
  background: rgba(0,0,0,0.6); padding: 10px 14px; border-radius: 6px;
  pointer-events: none; line-height: 1.6; min-width: 200px;
`;
document.body.appendChild(hud);

function updateHUD(): void {
  const creatureQuery = LifecycleStore.bit | TransformStore.bit;
  const creatures = world.query(creatureQuery);
  const alive = creatures.filter(id => {
    const lc = LifecycleStore.get(id);
    return lc && lc.stage === LifeStage.Alive;
  });
  const foodCount = world.query(FoodStore.bit).length;

  let text = `Creatures: ${alive.length}  Food: ${foodCount}`;

  if (selectedId >= 0 && world.has(selectedId)) {
    const lc = LifecycleStore.get(selectedId);
    const bio = BiochemStore.get(selectedId);
    if (lc && bio) {
      const c = bio.chemicals;
      text += `\n─────────────────────`;
      text += `\nSelected: #${selectedId}`;
      text += `\nAge: ${lc.age}  Stage: ${lc.stage === LifeStage.Alive ? 'Alive' : 'Dead'}`;
      text += `\nEnergy:  ${bar(c[ChemId.Energy])}`;
      text += `\nGlucose: ${bar(c[ChemId.Glucose])}`;
      text += `\nATP:     ${bar(c[ChemId.ATP])}`;
      text += `\nHunger:  ${bar(c[ChemId.Hunger])}`;
      text += `\nLife:    ${bar(c[ChemId.LifeForce])}`;
      text += `\nTired:   ${bar(c[ChemId.Tiredness])}`;
    }
  } else {
    text += `\n\nClick a creature to inspect`;
  }

  hud.textContent = text;
}

function bar(val: number): string {
  const filled = Math.round(val * 20);
  return '█'.repeat(filled) + '░'.repeat(20 - filled) + ` ${(val * 100).toFixed(0)}%`;
}

// ── Initialization ──────────────────────────────────────────

// Spawn initial creatures
for (let i = 0; i < 15; i++) {
  spawnCreature(createDefaultGenome(), randFloat(-18, 18), randFloat(-18, 18));
}

// Spawn initial food
for (let i = 0; i < FOOD_TARGET; i++) {
  spawnFood(randFloat(-22, 22), randFloat(-22, 22), randFloat(0.15, 0.35));
}

// ── Simulation Loop ─────────────────────────────────────────

const SIM_DT = 0.05; // 50ms fixed timestep (20 Hz)
let simAccumulator = 0;
let hudTimer = 0;
const HUD_INTERVAL = 10; // update HUD every 10 ticks

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

function animate(time: number): void {
  requestAnimationFrame(animate);

  // Fixed timestep simulation
  simAccumulator += SIM_DT; // 1 sim tick per frame for now
  while (simAccumulator >= SIM_DT) {
    simAccumulator -= SIM_DT;
    world.update(SIM_DT);
    maintainFood();

    hudTimer++;
    if (hudTimer >= HUD_INTERVAL) {
      hudTimer = 0;
      updateHUD();
    }
  }

  updateCamera();
  renderer.render(scene, camera);
}

requestAnimationFrame(animate);
