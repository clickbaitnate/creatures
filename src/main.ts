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
import { SocialStore, createSocial, Activity } from './components/Social';
import { EggStore } from './components/Egg';
import { BuildingStore } from './components/Building';
import { FoodStore, FoodType, SensorySystem } from './systems/SensorySystem';
import { BrainSystem } from './systems/BrainSystem';
import { InstinctSystem } from './systems/InstinctSystem';
import { BiochemistrySystem } from './systems/BiochemistrySystem';
import { MetabolismSystem } from './systems/MetabolismSystem';
import { MotorSystem } from './systems/MotorSystem';
import { EatingSystem } from './systems/EatingSystem';
import { SocialSystem } from './systems/SocialSystem';
import { ReproductionSystem } from './systems/ReproductionSystem';
import { BuildingSystem } from './systems/BuildingSystem';
import { RenderSystem } from './systems/RenderSystem';
import { createDefaultGenome, genomeToBrain, type CreatureGenome } from './genome/Genome';
import { buildCreatureMesh } from './creatures/MeshBuilder';
import { ShaderStateStore } from './components/ShaderState';
import { MatingStore, createMating } from './components/Mating';
import { ShaderSystem } from './systems/ShaderSystem';
import { ExpressionStore, createExpression } from './components/Expression';
import { ExpressionSystem } from './systems/ExpressionSystem';
import { HierarchySystem } from './world/HierarchySystem';
import { terrainY } from './world/Environment';
import { FactionManager } from './world/FactionSystem';
import { creatureName } from './world/NameGenerator';
import { SpeechBubbleManager } from './ui/SpeechBubbles';
import { ChemId } from './biochemistry/ChemicalRegistry';
import { randFloat } from './utils/Math';
import { createSeasonState, updateSeason } from './world/Seasons';
import { createDayNight, updateDayNight } from './world/DayNightCycle';
import { MonsterManager, MAX_MONSTERS } from './world/MonsterManager';
import { MonsterRenderer } from './world/MonsterRenderer';
import { MemoryStore, createMemory } from './components/Memory';
import { MemorySystem } from './systems/MemorySystem';
import { InventoryStore, createInventory, addItem, ItemType, getBestWeapon } from './components/Inventory';
import { GatheringSystem } from './systems/GatheringSystem';
import { CraftingSystem } from './systems/CraftingSystem';
import { VocabularyStore, createVocabulary, learn as learnEmoji } from './components/Vocabulary';
import { CritterManager } from './world/PreyCritters';
import { CritterRenderer } from './world/CritterRenderer';
import { HuntingSystem } from './systems/HuntingSystem';
import { TerritorySystem } from './world/TerritorySystem';
import { BorderRenderer } from './world/BorderRenderer';
import { PoliticsSystem } from './world/PoliticsSystem';
import { AnimationSystem } from './systems/AnimationSystem';
import { GoalStore, createGoal } from './components/Goal';
import { GoalSystem } from './systems/GoalSystem';
import { ZealotryStore, createZealotry } from './components/Zealotry';
import { GodMode } from './ui/GodMode';
import { ReligionSystem } from './systems/ReligionSystem';
import { SephirothSystem } from './world/Sephiroth';
import { ZodiacCycle } from './world/Zodiac';
import { MarketSystem } from './systems/MarketSystem';
import { ChartPanel } from './ui/Charts';
import { DataLogger } from './data/DataLogger';
import { Dashboard } from './ui/Dashboard';
import { GameUI } from './ui/GameUI';

// Voxel world imports
import { VoxelWorld, WORLD_HALF as VOXEL_WORLD_HALF } from './voxel/VoxelWorld';
import { VoxelRenderer } from './voxel/VoxelRenderer';
import { ConstructionSystem } from './systems/ConstructionSystem';
import { Block } from './voxel/BlockTypes';
import { WaterFlow } from './voxel/WaterFlow';

// ── Three.js Scene ──────────────────────────────────────────

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87CEEB);
scene.fog = new THREE.FogExp2(0x87CEEB, 0.005);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 500);
camera.position.set(0, 40, 60);
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);

const sunLight = new THREE.DirectionalLight(0xffe8cc, 1.3);
sunLight.position.set(30, 50, 20);
sunLight.castShadow = true;
sunLight.shadow.mapSize.set(2048, 2048);
sunLight.shadow.camera.left = -150;
sunLight.shadow.camera.right = 150;
sunLight.shadow.camera.top = 150;
sunLight.shadow.camera.bottom = -150;
scene.add(sunLight);

// ── Voxel World ──────────────────────────────────────────────

console.log('Generating voxel world...');
const voxelWorld = new VoxelWorld();
voxelWorld.generate();
console.log('Voxel world generated.');

const voxelRenderer = new VoxelRenderer(voxelWorld, scene);
const waterFlow = new WaterFlow(voxelWorld);
console.log('Building chunk meshes...');
voxelRenderer.buildAll();
console.log('Chunk meshes built.');

// ── Critters ──────────────────────────────────────────────────

const critterManager = new CritterManager();
critterManager.init();
const critterRenderer = new CritterRenderer(scene);

const monsterManager = new MonsterManager();
const monsterRenderer = new MonsterRenderer(scene);

// ── Global Managers ─────────────────────────────────────────

const seasonState = createSeasonState();
const dayNight = createDayNight();
const factionManager = new FactionManager();

const territorySystem = new TerritorySystem();
const borderRenderer = new BorderRenderer(scene);
const godMode = new GodMode();
const zodiac = new ZodiacCycle();
const sephirothSystem = new SephirothSystem();
sephirothSystem.factionManager = factionManager;

const religionSystem = new ReligionSystem();
religionSystem.factionManager = factionManager;
// religionSystem.grid no longer used (voxel world replaces resource grid)

const politicsSystem = new PoliticsSystem();
politicsSystem.factionManager = factionManager;
politicsSystem.territory = territorySystem;
sephirothSystem.politicsSystem = politicsSystem;
sephirothSystem.territory = territorySystem;

const marketSystem = new MarketSystem();
marketSystem.factionManager = factionManager;

const chartPanel = new ChartPanel();
chartPanel.factionManager = factionManager;
chartPanel.sephiroth = sephirothSystem;
chartPanel.zodiac = zodiac;

const dataLogger = new DataLogger();

const dashboard = new Dashboard();
dashboard.factionManager = factionManager;
dashboard.dataLogger = dataLogger;
const bubbleManager = new SpeechBubbleManager(camera, renderer);

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
world.registerStorage(SocialStore as any);
world.registerStorage(FoodStore as any);
world.registerStorage(EggStore as any);
world.registerStorage(BuildingStore as any);
world.registerStorage(ShaderStateStore as any);
world.registerStorage(MatingStore as any);
world.registerStorage(ExpressionStore as any);
world.registerStorage(InventoryStore as any);
world.registerStorage(GoalStore as any);
world.registerStorage(ZealotryStore as any);
world.registerStorage(MemoryStore as any);
world.registerStorage(VocabularyStore as any);

const hierarchySystem = new HierarchySystem();
hierarchySystem.factionManager = factionManager;

const socialSystem = new SocialSystem();
socialSystem.factionManager = factionManager;
socialSystem.hierarchySystem = hierarchySystem;
socialSystem.politicsSystem = politicsSystem;
socialSystem.seasonState = seasonState;

const reproSystem = new ReproductionSystem();
reproSystem.scene = scene;

const buildingSystem = new BuildingSystem();
buildingSystem.scene = scene;

const gatheringSystem = new GatheringSystem();
gatheringSystem.voxelWorld = voxelWorld;
gatheringSystem.waterFlow = waterFlow;

const sensorySystem = new SensorySystem();
sensorySystem.voxelWorld = voxelWorld;
sensorySystem.factionManager = factionManager;
sensorySystem.critterManager = critterManager;
sensorySystem.monsterManager = monsterManager;

const brainSystem = new BrainSystem();
brainSystem.seasonState = seasonState;
brainSystem.voxelWorld = voxelWorld;

const instinctSystem = new InstinctSystem();
instinctSystem.seasonState = seasonState;
instinctSystem.monsterManager = monsterManager;
instinctSystem.dayNight = dayNight;
instinctSystem.voxelWorld = voxelWorld;

const biochemistrySystem = new BiochemistrySystem();
biochemistrySystem.seasonState = seasonState;

const motorSystem = new MotorSystem();
motorSystem.voxelWorld = voxelWorld;

const constructionSystem = new ConstructionSystem();
constructionSystem.voxelWorld = voxelWorld;
buildingSystem.constructionSystem = constructionSystem;
buildingSystem.voxelWorld = voxelWorld;

const huntingSystem = new HuntingSystem();
huntingSystem.critterManager = critterManager;

// No ResourceGridSystem — voxel world replaces it
const memorySystem = new MemorySystem();
world.addSystem(sensorySystem);              // 10
world.addSystem(memorySystem);               // 11
world.addSystem(new ExpressionSystem());     // 12 (emotions before instincts)
world.addSystem(brainSystem);                // 20
world.addSystem(new GoalSystem());           // 22
world.addSystem(instinctSystem);             // 25
world.addSystem(biochemistrySystem);         // 30
world.addSystem(new MetabolismSystem());     // 35
world.addSystem(religionSystem);             // 38
world.addSystem(hierarchySystem);            // 40
world.addSystem(marketSystem);               // 44
world.addSystem(socialSystem);               // 45
world.addSystem(motorSystem);               // 50
world.addSystem(new EatingSystem());         // 55
world.addSystem(gatheringSystem);            // 57
world.addSystem(huntingSystem);              // 58
world.addSystem(reproSystem);                // 60
const craftingSystem = new CraftingSystem();
craftingSystem.voxelWorld = voxelWorld;
world.addSystem(craftingSystem);               // 63
world.addSystem(constructionSystem);         // 64
world.addSystem(buildingSystem);             // 65
world.addSystem(new ShaderSystem());         // 95
world.addSystem(new AnimationSystem());      // 96
world.addSystem(new RenderSystem());         // 100

// ── Entity Spawning ─────────────────────────────────────────

let nextNameSeed = 1;
let generation = 0;

function spawnCreature(genome: CreatureGenome, x: number, z: number): number {
  const id = world.spawn();

  const { group: mesh, uniforms } = buildCreatureMesh(genome);
  mesh.userData.entityId = id;
  scene.add(mesh);

  // Ensure spawn is not in water — spiral outward to find dry land
  if (voxelWorld.isWaterAt(x, z)) {
    let found = false;
    for (let r = 1; r <= 20 && !found; r++) {
      for (let a = 0; a < 8 && !found; a++) {
        const nx = x + Math.cos(a * Math.PI / 4) * r;
        const nz = z + Math.sin(a * Math.PI / 4) * r;
        if (!voxelWorld.isWaterAt(nx, nz)) {
          x = nx;
          z = nz;
          found = true;
        }
      }
    }
  }

  const y = voxelWorld.getHeightWorld(x, z);
  world.addComponent(id, TransformStore, { x, y, z, rotation: randFloat(0, Math.PI * 2) });
  world.addComponent(id, RenderableStore, { object: mesh });
  world.addComponent(id, ShaderStateStore, { uniforms });
  world.addComponent(id, MatingStore, createMating(genome.sex));
  world.addComponent(id, ExpressionStore, createExpression());
  world.addComponent(id, BrainStore, { brain: genomeToBrain(genome) });
  world.addComponent(id, GenomeStore, { genome });
  world.addComponent(id, BiochemStore, createBiochem());
  world.addComponent(id, MotorStore, createMotor());
  world.addComponent(id, SensesStore, createSenses());
  world.addComponent(id, LifecycleStore, createLifecycle(genome.maxAge));
  world.addComponent(id, InventoryStore, createInventory());
  world.addComponent(id, GoalStore, createGoal());
  world.addComponent(id, ZealotryStore, createZealotry());
  world.addComponent(id, MemoryStore, createMemory());
  world.addComponent(id, VocabularyStore, createVocabulary());

  // Faction assignment
  const faction = factionManager.assignFaction(id, genome);
  const name = creatureName(nextNameSeed++);
  world.addComponent(id, SocialStore, createSocial(name, faction.id));

  // Set up label
  bubbleManager.setLabel(id, faction.emoji, name, new THREE.Vector3(x, 0, z));

  return id;
}

reproSystem.onSpawn = (genome, x, z) => {
  spawnCreature(genome, x, z);
  generation++;
};


// ── Selection & RTS Camera ──────────────────────────────────

let selectedId = -1;
let selectedCreatureIndex = -1; // index into alive array for quick-nav
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

// RTS camera: top-down isometric-ish, pan with WASD/right-drag/edge-scroll, zoom with scroll
const camTarget = new THREE.Vector3(0, 0, 0); // point camera looks at on ground
let camZoom = 50;      // distance from target
let camAngle = 0;      // orbit angle around Y axis
const CAM_PITCH = Math.PI / 4; // fixed 45-degree downward angle
const CAM_PAN_SPEED = 30;
const CAM_FAST_MULT = 3;
const EDGE_SCROLL_MARGIN = 30; // pixels from screen edge
let isDragging = false;
let lastMouseX = 0;
let lastMouseY = 0;
let mouseScreenX = 0;
let mouseScreenY = 0;
const keysDown = new Set<string>();

// Creature quick-nav list
function getAliveCreatureIds(): number[] {
  return world.query(LifecycleStore.bit | TransformStore.bit)
    .filter(id => {
      const lc = LifecycleStore.get(id);
      return lc && lc.stage === LifeStage.Alive;
    });
}

function jumpToCreature(id: number): void {
  const t = TransformStore.get(id);
  if (t) {
    camTarget.set(t.x, 0, t.z);
    selectedId = id;
    gameUI.update();
  }
}

function cycleCreature(dir: number): void {
  const alive = getAliveCreatureIds();
  if (alive.length === 0) return;
  if (selectedId >= 0) {
    const curIdx = alive.indexOf(selectedId);
    if (curIdx >= 0) {
      selectedCreatureIndex = (curIdx + dir + alive.length) % alive.length;
    } else {
      selectedCreatureIndex = 0;
    }
  } else {
    selectedCreatureIndex = 0;
  }
  jumpToCreature(alive[selectedCreatureIndex]);
}

// Key tracking
window.addEventListener('keydown', (e) => {
  keysDown.add(e.key.toLowerCase());

  // Creature cycling: [ and ] or < and >
  if (e.key === '[' || e.key === ',') cycleCreature(-1);
  if (e.key === ']' || e.key === '.') cycleCreature(1);

  // F: follow selected creature (snap camera to it)
  if ((e.key === 'f' || e.key === 'F') && selectedId >= 0) {
    jumpToCreature(selectedId);
  }

  // Escape: deselect
  if (e.key === 'Escape') {
    selectedId = -1;
    gameUI.update();
  }

  // P: possess
  if (e.key === 'p' || e.key === 'P') {
    if (godMode.active) {
      godMode.release();
    } else if (selectedId >= 0) {
      godMode.possess(selectedId, world);
    }
  }

  // Q/E: rotate camera
  if (e.key === 'q' || e.key === 'Q') camAngle -= 0.1;
  if (e.key === 'e' || e.key === 'E') camAngle += 0.1;
});
window.addEventListener('keyup', (e) => {
  keysDown.delete(e.key.toLowerCase());
});

// Track mouse position for edge scrolling
window.addEventListener('mousemove', (e) => {
  mouseScreenX = e.clientX;
  mouseScreenY = e.clientY;

  if (isDragging) {
    const dx = e.clientX - lastMouseX;
    const dy = e.clientY - lastMouseY;
    // Pan camera based on drag (scaled by zoom)
    const panScale = camZoom * 0.003;
    const cosA = Math.cos(camAngle);
    const sinA = Math.sin(camAngle);
    camTarget.x -= (dx * cosA + dy * sinA) * panScale;
    camTarget.z -= (-dx * sinA + dy * cosA) * panScale;
    lastMouseX = e.clientX;
    lastMouseY = e.clientY;
  }
});

// Left-click: creature selection
renderer.domElement.addEventListener('mousedown', (e) => {
  if (e.button === 0) {
    mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    const meshes: THREE.Object3D[] = [];
    scene.traverse(obj => {
      if (obj.userData.entityId !== undefined) {
        if (obj instanceof THREE.Group) meshes.push(...obj.children);
        else meshes.push(obj);
      }
    });
    const intersects = raycaster.intersectObjects(meshes, true);
    if (intersects.length > 0) {
      let obj: THREE.Object3D | null = intersects[0].object;
      while (obj && obj.userData.entityId === undefined) obj = obj.parent;
      if (obj) selectedId = obj.userData.entityId;
    } else {
      selectedId = -1;
    }
    gameUI.update();
  }
  // Right-click: start dragging to pan
  if (e.button === 2) {
    isDragging = true;
    lastMouseX = e.clientX;
    lastMouseY = e.clientY;
  }
});
renderer.domElement.addEventListener('mouseup', (e) => {
  if (e.button === 2) isDragging = false;
});
renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());
renderer.domElement.addEventListener('wheel', (e) => {
  camZoom = Math.max(10, Math.min(200, camZoom + e.deltaY * 0.08));
});

function updateCamera(): void {
  const dt = 1 / 60;
  const speed = keysDown.has('shift') ? CAM_PAN_SPEED * CAM_FAST_MULT : CAM_PAN_SPEED;

  // WASD pan on XZ plane (relative to camera angle)
  let mx = 0, mz = 0;
  if (keysDown.has('w') || keysDown.has('arrowup')) mz -= 1;
  if (keysDown.has('s') || keysDown.has('arrowdown')) mz += 1;
  if (keysDown.has('a') || keysDown.has('arrowleft')) mx -= 1;
  if (keysDown.has('d') || keysDown.has('arrowright')) mx += 1;

  // Edge scrolling
  const w = window.innerWidth;
  const h = window.innerHeight;
  if (mouseScreenX < EDGE_SCROLL_MARGIN) mx -= 1;
  if (mouseScreenX > w - EDGE_SCROLL_MARGIN) mx += 1;
  if (mouseScreenY < EDGE_SCROLL_MARGIN) mz -= 1;
  if (mouseScreenY > h - EDGE_SCROLL_MARGIN) mz += 1;

  // Rotate movement by camera angle
  const cosA = Math.cos(camAngle);
  const sinA = Math.sin(camAngle);
  camTarget.x += (mx * cosA - mz * sinA) * speed * dt;
  camTarget.z += (mx * sinA + mz * cosA) * speed * dt;

  // Smoothly follow selected creature
  if (selectedId >= 0 && world.has(selectedId) && keysDown.has('f')) {
    const t = TransformStore.get(selectedId);
    if (t) camTarget.lerp(new THREE.Vector3(t.x, 0, t.z), 0.1);
  }

  // Position camera: orbit at camAngle, looking down at camPitch
  camera.position.set(
    camTarget.x + camZoom * Math.sin(CAM_PITCH) * Math.sin(camAngle),
    camZoom * Math.cos(CAM_PITCH),
    camTarget.z + camZoom * Math.sin(CAM_PITCH) * Math.cos(camAngle),
  );
  camera.lookAt(camTarget.x, 0, camTarget.z);
}

// Add CSS animation for speech bubbles
const style = document.createElement('style');
style.textContent = `
  @keyframes bubblePop {
    0% { transform: translate(-50%,-100%) scale(0.5); opacity: 0; }
    100% { transform: translate(-50%,-100%) scale(1); opacity: 1; }
  }
`;
document.head.appendChild(style);

const ACTIVITY_ICONS: Record<number, string> = {
  0: '',       // Idle — no icon
  1: '🚶',    // Walking
  2: '🍽️',    // Eating
  3: '💬',    // Talking
  4: '⚔️',    // Fighting
  5: '💕',    // Mating
  6: '🔨',    // Building
  7: '⛏️',    // Gathering
};

// ── Initialization: Spawn 30 creatures in 4 dispersed groups ──────

// Group definitions: center, personality bias, count
const spawnGroups: { cx: number; cz: number; count: number; bias: (g: any) => void }[] = [
  // Group 1: Builders in NW quadrant (8 creatures)
  { cx: -20, cz: 20, count: 8, bias(g) {
    g.buildAffinity = 0.5 + Math.random() * 0.3;
    g.creativity = 0.4 + Math.random() * 0.3;
    g.gatherAffinity = 0.4 + Math.random() * 0.3;
    g.sociability = 0.4 + Math.random() * 0.3;
  }},
  // Group 2: Gatherers in NE quadrant (8 creatures)
  { cx: 25, cz: 25, count: 8, bias(g) {
    g.gatherAffinity = 0.6 + Math.random() * 0.3;
    g.sociability = 0.5 + Math.random() * 0.3;
    g.curiosity = 0.3 + Math.random() * 0.3;
    g.buildAffinity = 0.2 + Math.random() * 0.3;
  }},
  // Group 3: Hunters in SW quadrant (7 creatures)
  { cx: -25, cz: -25, count: 7, bias(g) {
    g.huntAffinity = 0.6 + Math.random() * 0.3;
    g.aggression = 0.5 + Math.random() * 0.3;
    g.speed = 2.5 + Math.random() * 1.0;
    g.buildAffinity = 0.1 + Math.random() * 0.3;
  }},
  // Group 4: Explorers/mixed in SE quadrant (7 creatures)
  { cx: 25, cz: -25, count: 7, bias(g) {
    g.curiosity = 0.6 + Math.random() * 0.3;
    g.creativity = 0.3 + Math.random() * 0.4;
    g.sociability = 0.4 + Math.random() * 0.3;
    g.buildAffinity = 0.2 + Math.random() * 0.4;
  }},
];

for (const group of spawnGroups) {
  for (let i = 0; i < group.count; i++) {
    const genome = createDefaultGenome();
    group.bias(genome);

    // Spawn within ~5 units of group center
    const angle = (i / group.count) * Math.PI * 2;
    const dist = 2 + Math.random() * 3;
    const x = group.cx + Math.cos(angle) * dist;
    const z = group.cz + Math.sin(angle) * dist;

    const id = spawnCreature(genome, x, z);

    // Give starting inventory for building
    const inv = InventoryStore.get(id)!;
    addItem(inv, ItemType.RawStone, 5);
    addItem(inv, ItemType.RawWood, 3);
  }
}

// ── Pre-spawn CraftingTables near spawn areas ──────────────
for (const group of spawnGroups) {
  const [bx, , bz] = voxelWorld.worldToBlock(group.cx, 0, group.cz);
  const surfY = voxelWorld.getHeight(bx, bz);
  voxelWorld.setBlock(bx, surfY + 1, bz, Block.CraftingTable);
}

// (Grand Exchange removed — creatures trade directly with each other)

// Rebuild all dirty chunks after pre-placed structures
voxelRenderer.buildAll();

// ── Game UI ──────────────────────────────────────────────────

const gameUI = new GameUI({
  world,
  factionManager,
  politicsSystem,
  hierarchySystem,
  dayNight,
  seasonState,
  generation: () => generation,
  selectedId: () => selectedId,
  onSelectCreature: (id: number) => {
    jumpToCreature(id);
  },
  onCycleCreature: (dir: number) => {
    cycleCreature(dir);
  },
});

// ── Simulation Loop ─────────────────────────────────────────

const SIM_DT = 0.05;
let hudTimer = 0;
let diplomacyTimer = 0;

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

function animate(): void {
  requestAnimationFrame(animate);
  const time = performance.now() * 0.001;

  zodiac.advance();
  updateSeason(seasonState);
  updateDayNight(dayNight);
  world.update(SIM_DT);
  godMode.update(world, camera);
  dashboard.selectedCreatureId = selectedId;
  dashboard.tick(world, zodiac.tick);

  // Update voxel view-distance loading based on camera position
  voxelRenderer.updateCamera(camTarget.x, camTarget.z);

  // Water flow simulation
  waterFlow.tick();

  // Rebuild dirty voxel chunks (block changes from mining/construction)
  voxelRenderer.rebuildDirty();

  // Critter simulation — gather creature positions for flee behavior
  const aliveCreatures = world.query(TransformStore.bit | LifecycleStore.bit)
    .filter(id => { const lc = LifecycleStore.get(id); return lc && lc.stage === LifeStage.Alive; });
  const cxArr = new Float32Array(aliveCreatures.length);
  const czArr = new Float32Array(aliveCreatures.length);
  for (let i = 0; i < aliveCreatures.length; i++) {
    const t = TransformStore.get(aliveCreatures[i])!;
    cxArr[i] = t.x;
    czArr[i] = t.z;
  }
  critterManager.tick(cxArr, czArr, aliveCreatures.length);
  critterRenderer.update(critterManager);

  // Night monsters
  const crowdArr = new Float32Array(aliveCreatures.length);
  for (let i = 0; i < aliveCreatures.length; i++) {
    const s = SensesStore.get(aliveCreatures[i]);
    crowdArr[i] = s ? s.crowdDensity : 0;
  }
  monsterManager.tick(
    dayNight, voxelWorld,
    cxArr, czArr, crowdArr, aliveCreatures.length, aliveCreatures,
    (creatureId: number, damage: number) => {
      const social = SocialStore.get(creatureId);
      if (social) social.health = Math.max(0, social.health - damage);
      const biochem = BiochemStore.get(creatureId);
      if (biochem) {
        biochem.chemicals[ChemId.Pain] = Math.min(1, biochem.chemicals[ChemId.Pain] + damage * 2);
        biochem.chemicals[ChemId.Punishment] = Math.min(1, biochem.chemicals[ChemId.Punishment] + damage);
      }
    },
  );
  // Creature-to-monster combat: creatures with wantFightMonster damage nearby monsters
  for (let ci = 0; ci < aliveCreatures.length; ci++) {
    const cid = aliveCreatures[ci];
    const motor = MotorStore.get(cid);
    if (!motor?.wantFightMonster) continue;

    const ct = TransformStore.get(cid)!;
    const inv = InventoryStore.get(cid);
    const genome = GenomeStore.get(cid)?.genome;
    if (!genome) continue;

    for (let mi = 0; mi < MAX_MONSTERS; mi++) {
      if (!monsterManager.alive[mi]) continue;
      const dx = monsterManager.x[mi] - ct.x;
      const dz = monsterManager.z[mi] - ct.z;
      const dsq = dx * dx + dz * dz;

      if (dsq < 6) { // within ~2.5 units
        const baseDmg = 0.015 * (0.5 + genome.aggression);
        const weaponMult = inv ? getBestWeapon(inv).damage : 1.0;
        const killed = monsterManager.takeDamage(mi, baseDmg * weaponMult);

        // Reward for fighting
        const biochem = BiochemStore.get(cid);
        if (biochem) {
          biochem.chemicals[ChemId.Reward] = Math.min(1, biochem.chemicals[ChemId.Reward] + 0.03);
        }

        // Speech when fighting (vocab-gated)
        const social = SocialStore.get(cid);
        if (social) {
          social.activity = Activity.Fighting;
          if (killed) {
            const fVocab = VocabularyStore.get(cid);
            if (fVocab) {
              learnEmoji(fVocab, '⚔️');
              social.speechEmoji = '⚔️';
              social.speechTimer = 40;
            }
          }
        }

        break; // one monster per tick
      }
    }
  }

  monsterRenderer.update(monsterManager);

  // Day/Night visual cycle
  const ll = dayNight.lightLevel;

  // Sun orbits via sunAngle
  const sunDist = 80;
  sunLight.position.set(
    Math.cos(dayNight.sunAngle) * sunDist,
    Math.sin(dayNight.sunAngle) * sunDist,
    20,
  );
  sunLight.intensity = ll * 1.3;

  // Ambient light dims at night
  ambientLight.intensity = 0.15 + ll * 0.45;

  // Sky color darkens at night
  const skyLightness = 0.1 + ll * 0.6;
  (scene.background as THREE.Color).setHSL(0.58, 0.3, skyLightness);

  // Fog thickens at night
  (scene.fog as THREE.FogExp2).density = 0.005 + (1 - ll) * 0.01;

  // Sun color: warm at sunrise/sunset, white at noon
  const sunHue = 0.08 + Math.sin(dayNight.timeOfDay * Math.PI) * 0.02;
  sunLight.color.setHSL(sunHue, 0.6, 0.5 + ll * 0.3);

  // Periodic diplomacy, territory, and politics updates
  diplomacyTimer++;
  if (diplomacyTimer >= 100) {
    diplomacyTimer = 0;
    factionManager.updateDiplomacy();
    factionManager.updateBreedingCulture();
    territorySystem.tick(world);
    politicsSystem.tick(world);
    borderRenderer.update(territorySystem, factionManager);
    sephirothSystem.tick(world);
    chartPanel.tick();
  }

  // Update speech bubbles and labels
  const positions = new Map<number, THREE.Vector3>();
  const socialEntities = world.query(SocialStore.bit | TransformStore.bit);
  for (const id of socialEntities) {
    const t = TransformStore.get(id)!;
    const renderable = RenderableStore.get(id);
    const y = renderable ? renderable.object.position.y : t.y;
    positions.set(id, new THREE.Vector3(t.x, y, t.z));

    const social = SocialStore.get(id)!;
    const lifecycle = LifecycleStore.get(id);

    // Show speech bubbles — only trigger once when speechTimer is first set
    if (social.speechTimer > 0 && social.speechEmoji) {
      const isNewSpeech = social.speechTimer >= 24;
      if (isNewSpeech) {
        bubbleManager.showSpeech(id, social.speechEmoji, new THREE.Vector3(t.x, y, t.z));
      }
    }

    // Update labels with activity context
    if (lifecycle && lifecycle.stage === LifeStage.Alive) {
      const faction = factionManager.getFaction(id);
      if (faction) {
        const actIcon = ACTIVITY_ICONS[social.activity] ?? '';
        bubbleManager.setLabel(id, faction.emoji + actIcon, social.name, new THREE.Vector3(t.x, y, t.z));
      }
    } else {
      bubbleManager.removeLabel(id);
      factionManager.removeMember(id);
    }
  }
  bubbleManager.update(positions);

  hudTimer++;
  if (hudTimer >= 10) {
    hudTimer = 0;
    gameUI.update();
  }

  updateCamera();
  renderer.render(scene, camera);
}

requestAnimationFrame(animate);
