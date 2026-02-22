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
import { BuildingStore, BUILDING_NAMES } from './components/Building';
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
import { createDefaultGenome, genomeToBrain, getBreedLabel, type CreatureGenome } from './genome/Genome';
import { buildCreatureMesh } from './creatures/MeshBuilder';
import { ShaderStateStore } from './components/ShaderState';
import { MatingStore, createMating } from './components/Mating';
import { Sex } from './genome/Genome';
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
import { createSeasonState, SEASON_NAMES } from './world/Seasons';
import { InventoryStore, createInventory, addItem, ITEM_NAMES, ItemType } from './components/Inventory';
import { GatheringSystem } from './systems/GatheringSystem';
import { CraftingSystem } from './systems/CraftingSystem';
import { CritterManager } from './world/PreyCritters';
import { CritterRenderer } from './world/CritterRenderer';
import { HuntingSystem } from './systems/HuntingSystem';
import { TerritorySystem } from './world/TerritorySystem';
import { BorderRenderer } from './world/BorderRenderer';
import { PoliticsSystem, GOVERNMENT_NAMES } from './world/PoliticsSystem';
import { AnimationSystem } from './systems/AnimationSystem';
import { GoalStore, createGoal } from './components/Goal';
import { GoalSystem } from './systems/GoalSystem';
import { ZealotryStore, createZealotry } from './components/Zealotry';
import { GodMode } from './ui/GodMode';
import { ReligionSystem } from './systems/ReligionSystem';
import { SephirothSystem, SEPHIRAH_NAMES } from './world/Sephiroth';
import { ZodiacCycle } from './world/Zodiac';
import { MarketSystem } from './systems/MarketSystem';
import { ChartPanel } from './ui/Charts';
import { DataLogger } from './data/DataLogger';
import { Dashboard } from './ui/Dashboard';

// Voxel world imports
import { VoxelWorld, WORLD_HALF as VOXEL_WORLD_HALF } from './voxel/VoxelWorld';
import { VoxelRenderer } from './voxel/VoxelRenderer';
import { ConstructionSystem } from './systems/ConstructionSystem';
import { createBabelBlueprint, type ConstructionSite } from './voxel/Blueprint';
import { Block } from './voxel/BlockTypes';

// ── Three.js Scene ──────────────────────────────────────────

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87CEEB);
scene.fog = new THREE.FogExp2(0x87CEEB, 0.008);

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
sunLight.shadow.camera.left = -80;
sunLight.shadow.camera.right = 80;
sunLight.shadow.camera.top = 80;
sunLight.shadow.camera.bottom = -80;
scene.add(sunLight);

// ── Voxel World ──────────────────────────────────────────────

console.log('Generating voxel world...');
const voxelWorld = new VoxelWorld();
voxelWorld.generate();
console.log('Voxel world generated.');

const voxelRenderer = new VoxelRenderer(voxelWorld, scene);
console.log('Building chunk meshes...');
voxelRenderer.buildAll();
console.log('Chunk meshes built.');

// ── Tower of Babel ───────────────────────────────────────────

const babelBlueprint = createBabelBlueprint();

// Place tower at world center
const towerCenterBX = Math.floor(voxelWorld.worldToBlock(0, 0, 0)[0]);
const towerCenterBZ = Math.floor(voxelWorld.worldToBlock(0, 0, 0)[2]);
const towerOriginX = towerCenterBX - Math.floor(babelBlueprint.width / 2);
const towerOriginZ = towerCenterBZ - Math.floor(babelBlueprint.depth / 2);

// Find ground level at tower center
const towerGroundY = voxelWorld.getHeight(towerCenterBX, towerCenterBZ);

// Clear terrain where tower will be (flatten)
for (let bx = towerOriginX - 2; bx < towerOriginX + babelBlueprint.width + 2; bx++) {
  for (let bz = towerOriginZ - 2; bz < towerOriginZ + babelBlueprint.depth + 2; bz++) {
    // Fill up to tower ground level, clear above
    for (let by = 0; by < towerGroundY; by++) {
      if (voxelWorld.getBlock(bx, by, bz) === Block.Air) {
        voxelWorld.setBlock(bx, by, bz, Block.Stone);
      }
    }
    for (let by = towerGroundY; by < towerGroundY + babelBlueprint.height + 5; by++) {
      voxelWorld.setBlock(bx, by, bz, Block.Air);
    }
  }
}

const babelSite: ConstructionSite = {
  id: 0,
  blueprint: babelBlueprint,
  originX: towerOriginX,
  originY: towerGroundY,
  originZ: towerOriginZ,
  placed: new Uint8Array(babelBlueprint.width * babelBlueprint.height * babelBlueprint.depth),
  placedCount: 0,
  progress: 0,
  active: true,
};

// Pre-place first 2 layers of the tower (visually started)
const preplaceLayers = 2;
for (let y = 0; y < preplaceLayers; y++) {
  for (let z = 0; z < babelBlueprint.depth; z++) {
    for (let x = 0; x < babelBlueprint.width; x++) {
      const idx = (y * babelBlueprint.depth + z) * babelBlueprint.width + x;
      const block = babelBlueprint.blocks[idx] as Block;
      if (block !== Block.Air) {
        voxelWorld.setBlock(
          towerOriginX + x,
          towerGroundY + y,
          towerOriginZ + z,
          block,
        );
        babelSite.placed[idx] = 1;
        babelSite.placedCount++;
      }
    }
  }
}
babelSite.progress = babelSite.placedCount / babelBlueprint.totalBlocks;

// Rebuild dirty chunks after tower placement
voxelRenderer.buildAll();

// ── Critters ──────────────────────────────────────────────────

const critterManager = new CritterManager();
critterManager.init();
const critterRenderer = new CritterRenderer(scene);

// ── Global Managers ─────────────────────────────────────────

const seasonState = createSeasonState();
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

const hierarchySystem = new HierarchySystem();
hierarchySystem.factionManager = factionManager;

const socialSystem = new SocialSystem();
socialSystem.factionManager = factionManager;
socialSystem.hierarchySystem = hierarchySystem;
socialSystem.politicsSystem = politicsSystem;

const reproSystem = new ReproductionSystem();
reproSystem.scene = scene;

const buildingSystem = new BuildingSystem();
buildingSystem.scene = scene;

const gatheringSystem = new GatheringSystem();
gatheringSystem.voxelWorld = voxelWorld;

const sensorySystem = new SensorySystem();
sensorySystem.voxelWorld = voxelWorld;
sensorySystem.factionManager = factionManager;
sensorySystem.critterManager = critterManager;

const motorSystem = new MotorSystem();
motorSystem.voxelWorld = voxelWorld;

const constructionSystem = new ConstructionSystem();
constructionSystem.voxelWorld = voxelWorld;
constructionSystem.sites.push(babelSite);
constructionSystem.babelSiteId = babelSite.id;

const huntingSystem = new HuntingSystem();
huntingSystem.critterManager = critterManager;

// No ResourceGridSystem — voxel world replaces it
world.addSystem(sensorySystem);              // 10
world.addSystem(new BrainSystem());          // 20
world.addSystem(new GoalSystem());           // 22
world.addSystem(new InstinctSystem());       // 25
world.addSystem(new BiochemistrySystem());   // 30
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
world.addSystem(new CraftingSystem());        // 63
world.addSystem(constructionSystem);         // 64
world.addSystem(buildingSystem);             // 65
world.addSystem(new ExpressionSystem());     // 92
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


// ── Selection & Camera ──────────────────────────────────────

let selectedId = -1;
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
let cameraTheta = 0;
let cameraPhi = Math.PI / 4;
let cameraDist = 50;
const cameraTarget = new THREE.Vector3(0, 0, 0);
let isDragging = false;
let lastMouseX = 0;
let lastMouseY = 0;

// God mode: P to possess/release selected creature
// E: Export data JSON
window.addEventListener('keydown', (e) => {
  if (e.key === 'p' || e.key === 'P') {
    if (godMode.active) {
      godMode.release();
    } else if (selectedId >= 0) {
      godMode.possess(selectedId, world);
    }
  }
  if (e.key === 'e' || e.key === 'E') {
    dataLogger.downloadJSON();
  }
});

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
  cameraDist = Math.max(5, Math.min(150, cameraDist + e.deltaY * 0.05));
});

function updateCamera(): void {
  if (selectedId >= 0 && world.has(selectedId)) {
    const t = TransformStore.get(selectedId);
    if (t) cameraTarget.lerp(new THREE.Vector3(t.x, t.y + 2, t.z), 0.05);
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
  position:fixed; top:10px; left:10px; color:#fff; font:12px monospace;
  background:rgba(0,0,0,0.7); padding:10px 14px; border-radius:8px;
  pointer-events:none; line-height:1.5; min-width:260px; white-space:pre;
  max-height:90vh; overflow-y:auto;
`;
document.body.appendChild(hud);

// Add CSS animation for speech bubbles
const style = document.createElement('style');
style.textContent = `
  @keyframes bubblePop {
    0% { transform: translate(-50%,-100%) scale(0.5); opacity: 0; }
    100% { transform: translate(-50%,-100%) scale(1); opacity: 1; }
  }
`;
document.head.appendChild(style);

function updateHUD(): void {
  const creatureIds = world.query(LifecycleStore.bit | TransformStore.bit);
  const alive = creatureIds.filter(id => {
    const lc = LifecycleStore.get(id);
    return lc && lc.stage === LifeStage.Alive;
  });
  const eggCount = world.query(EggStore.bit).length;
  const buildingCount = world.query(BuildingStore.bit).length;
  const activeFactions = factionManager.activeFactions;

  // Tower progress
  const towerPct = (babelSite.progress * 100).toFixed(1);

  let text = `Pop: ${alive.length}  Eggs: ${eggCount}  Gen: ${generation}  ${SEASON_NAMES[seasonState.season]}  ${zodiac.currentSignName}`;
  text += `\nTower of Babel: ${towerPct}%  ${babelSite.active ? '🏗️' : constructionSystem.exodusTriggered ? '💨 SCATTERED' : '✅'}`;
  text += `\n\n── Factions ──`;

  for (const f of activeFactions) {
    const cultureIcon = f.breedingNorm === 'conservative' ? '💍' : f.breedingNorm === 'scandalous' ? '💃' : '';
    const nation = politicsSystem.getNation(f.id);
    const govName = nation ? GOVERNMENT_NAMES[nation.government] : '';
    const terrCount = nation ? nation.territory : 0;
    const philName = f.philosophy ? ` [${f.philosophy}]` : '';
    const doctrine = f.doctrine?.length > 0 ? ' ' + f.doctrine.join('') : '';
    text += `\n${f.emoji} ${f.name} (${f.memberIds.size}) ${govName} T:${terrCount}${philName}${doctrine} ${cultureIcon}`;
    // Show relations
    for (const f2 of activeFactions) {
      if (f.id === f2.id) continue;
      const rel = f.relations.get(f2.id) ?? 0;
      const atWar = nation?.warTargets.has(f2.id);
      const allied = nation?.allies.has(f2.id);
      if (atWar) {
        text += ` ⚔️${f2.emoji}`;
      } else if (allied) {
        text += ` 🤝${f2.emoji}`;
      } else if (Math.abs(rel) > 0.2) {
        const icon = rel > 0.3 ? '🤝' : rel < -0.3 ? '😡' : '😐';
        text += ` ${icon}${f2.emoji}`;
      }
    }
  }

  if (selectedId >= 0 && world.has(selectedId)) {
    const lc = LifecycleStore.get(selectedId);
    const bio = BiochemStore.get(selectedId);
    const gen = GenomeStore.get(selectedId);
    const social = SocialStore.get(selectedId);
    if (lc && bio && gen && social) {
      const c = bio.chemicals;
      const g = gen.genome;
      const faction = factionManager.getFaction(selectedId);
      text += `\n\n── ${social.name} ──`;
      text += `\n${faction ? faction.emoji + ' ' + faction.name : 'Wanderer'} [${getBreedLabel(g)}]`;
      const sexIcon = g.sex === 0 ? '♂' : '♀';
      const rank = hierarchySystem.getRank(selectedId);
      const langLabel = social.language > 0 ? ` Lang:${social.language}` : '';
      text += `\n${sexIcon} Age:${lc.age} ${lc.stage === LifeStage.Alive ? '❤️' : '💀'} HP:${(social.health * 100).toFixed(0)}% Rank:${(rank * 100).toFixed(0)}%${langLabel}`;
      text += `\nEnergy:  ${bar(c[ChemId.Energy])}`;
      text += `\nGlucose: ${bar(c[ChemId.Glucose])}`;
      text += `\nHunger:  ${bar(c[ChemId.Hunger])}`;
      text += `\nLife:    ${bar(c[ChemId.LifeForce])}`;
      text += `\n`;
      text += `\nAggro:${pct(g.aggression)} Social:${pct(g.sociability)}`;
      text += `\nCurious:${pct(g.curiosity)} Creative:${pct(g.creativity)}`;
      text += `\nLoyal:${pct(g.loyalty)} Spd:${g.speed.toFixed(1)}`;
      text += `\nDiet B:${pct(g.dietBerry)} G:${pct(g.dietGrass)} R:${pct(g.dietRoot)}`;
      text += `\nMono:${pct(g.monogamy)} Display:${pct(g.displayIntensity)}`;
      text += `\nGather:${pct(g.gatherAffinity)} Hunt:${pct(g.huntAffinity)} Build:${pct(g.buildAffinity)} Hoard:${pct(g.hoardAffinity)}`;
      const inv = InventoryStore.get(selectedId);
      if (inv) {
        const items = inv.slots.filter(s => s.item !== -1 && s.count > 0)
          .map(s => `${ITEM_NAMES[s.item as ItemType] ?? '?'}×${s.count}`).join(' ');
        text += `\nInv: ${items || 'empty'}`;
      }
      text += `\nRes:${social.resources} ${activityName(social.activity)}`;
    }
  } else {
    text += `\n\nClick creature to inspect`;
    text += `\n[P]ossess  [Tab]Charts  [D]ashboard`;
  }

  hud.textContent = text;
}

function bar(val: number): string {
  const filled = Math.round(val * 12);
  return '█'.repeat(filled) + '░'.repeat(12 - filled) + ` ${(val * 100).toFixed(0)}%`;
}
function pct(val: number): string { return `${(val * 100).toFixed(0)}%`; }
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
function activityName(a: Activity): string {
  return ['💤', '🚶', '🍽️', '💬', '⚔️', '💕', '🔨', '⛏️'][a] ?? '?';
}

// ── Initialization: Spawn 30 creatures near tower base ──────

// Ensure "Builders" faction exists by spawning all with high buildAffinity
for (let i = 0; i < 30; i++) {
  const genome = createDefaultGenome();
  // Boost build traits for Babel builders
  genome.buildAffinity = 0.7 + Math.random() * 0.3;
  genome.creativity = 0.5 + Math.random() * 0.3;
  genome.gatherAffinity = 0.4 + Math.random() * 0.3;

  // Spawn near tower base (within ~8 world units of center)
  const angle = (i / 30) * Math.PI * 2;
  const dist = 3 + Math.random() * 5;
  const x = Math.cos(angle) * dist;
  const z = Math.sin(angle) * dist;

  const id = spawnCreature(genome, x, z);

  // Give starting inventory for building
  const inv = InventoryStore.get(id)!;
  addItem(inv, ItemType.RawStone, 5);
  addItem(inv, ItemType.RawWood, 3);
}

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
  world.update(SIM_DT);
  godMode.update(world, camera);
  dashboard.selectedCreatureId = selectedId;
  dashboard.tick(world, zodiac.tick);

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

  // Subtle sun color shift (warm→cool cycle)
  const sunHue = 0.08 + Math.sin(time * 0.05) * 0.03;
  sunLight.color.setHSL(sunHue, 0.6, 0.75);

  // Background color subtle shift
  const bgHue = 0.55 + Math.sin(time * 0.03) * 0.03;
  (scene.background as THREE.Color).setHSL(bgHue, 0.3, 0.7);

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
    updateHUD();
  }

  updateCamera();
  renderer.render(scene, camera);
}

requestAnimationFrame(animate);
