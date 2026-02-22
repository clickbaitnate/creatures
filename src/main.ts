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
import { FoodStore, SensorySystem } from './systems/SensorySystem';
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
import { FactionManager, getSettlementTier } from './world/FactionSystem';
import { creatureName } from './world/NameGenerator';
import { SpeechBubbleManager } from './ui/SpeechBubbles';
import { ChemId } from './biochemistry/ChemicalRegistry';
import { randFloat } from './utils/Math';
import { createSeasonState, updateSeason } from './world/Seasons';
import type { SeasonState } from './world/Seasons';
import { createDayNight, updateDayNight } from './world/DayNightCycle';
import type { DayNightState } from './world/DayNightCycle';
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
import { TacticalCombatSystem } from './systems/TacticalCombatSystem';
import { CombatStore, createCombat } from './components/Combat';
import { DiaryStore, createDiary, addDiaryEntry, DiaryEventType } from './components/Diary';
import { MiningParticles } from './creatures/MiningParticles';
import { GoalStore, createGoal } from './components/Goal';
import { GoalSystem } from './systems/GoalSystem';
import { ZealotryStore, createZealotry } from './components/Zealotry';
import { GodMode } from './ui/GodMode';
import { GodHand, type DropResult } from './ui/GodHand';
import { GodHandVisuals } from './ui/GodHandVisuals';
import { ReligionSystem } from './systems/ReligionSystem';
import { SephirothSystem } from './world/Sephiroth';
import { ZodiacCycle } from './world/Zodiac';
import { MarketSystem } from './systems/MarketSystem';
import { ChartPanel } from './ui/Charts';
import { ResourceGrid } from './world/ResourceGrid';
import { ResourceGridSystem } from './systems/ResourceGridSystem';
import { DialecticSystem } from './world/DialecticSystem';
import { RaidSystem } from './systems/RaidSystem';
import { DataLogger } from './data/DataLogger';
import { Dashboard } from './ui/Dashboard';
import { GameUI } from './ui/GameUI';
import { createDivinePower, spendPower, POWER_COST_PICKUP, POWER_COST_BIOME_CHANGE, type DivinePowerState } from './god/DivinePower';
import { calculateDivineResponse, propagateWitnessEffect } from './systems/DivineResponseSystem';
import { CultStance } from './components/Zealotry';

// Voxel world imports
import { VoxelWorld } from './voxel/VoxelWorld';
import { VoxelRenderer } from './voxel/VoxelRenderer';
import { ConstructionSystem } from './systems/ConstructionSystem';
import { CookingSystem } from './systems/CookingSystem';
import { VoxelRenderer as BuildingVoxelRenderer } from './buildings/VoxelRenderer';
import { Block } from './voxel/BlockTypes';
import { WaterFlow } from './voxel/WaterFlow';

// Save/Load imports
import { resetEntityId } from './ecs/Entity';
import type { SaveData } from './save/SaveFormat';
import { serializeGame } from './save/Serializer';
import { deserializeGame } from './save/Deserializer';
import { compressGzip, decompressGzip, downloadFile, readFileAsUint8 } from './save/Compression';
import { MainMenu } from './ui/MainMenu';
import { simStats, resetSimStats, finalizeAndSaveRun, loadAllRuns, exportRunsCSV, exportRunsJSON } from './stats/SimStats';
import { LoadingScreen } from './ui/LoadingScreen';
import { TIMERS, STATS } from './config/Constants';

// Expose stats to browser console for backtesting
(window as any).creatureStats = {
  get current() { return simStats.summary(); },
  get live() { return simStats; },
  runs: loadAllRuns,
  csv: exportRunsCSV,
  json: exportRunsJSON,
  dump: async () => { const r = await loadAllRuns(); console.table(r.map(({snapshots, ...rest}) => rest)); return r; },
  get godActions() { return dataLogger?.godActions ?? []; },
  get divinePower() { return divinePower; },
  get cultBreakdown() {
    if (!divinePower) return {};
    return {
      followers: divinePower.followerCount,
      devotees: divinePower.devoteeCount,
      terrorized: divinePower.terrorCount,
      awed: divinePower.aweCount,
      rebels: divinePower.rebelCount,
      power: divinePower.power.toFixed(1),
      maxPower: divinePower.maxPower,
    };
  },
};

// ── Three.js Scene (persistent) ──────────────────────────────

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

// ── Persistent UI & Globals ──────────────────────────────────

const mainMenu = new MainMenu();
const loadingScreen = new LoadingScreen();
const godMode = new GodMode();
const chartPanel = new ChartPanel();
const dashboard = new Dashboard();

// Speech bubble CSS (persistent)
const bubbleCSS = document.createElement('style');
bubbleCSS.textContent = `
  @keyframes bubblePop {
    0% { transform: translate(-50%,-100%) scale(0.5); opacity: 0; }
    100% { transform: translate(-50%,-100%) scale(1); opacity: 1; }
  }
`;
document.head.appendChild(bubbleCSS);

const ACTIVITY_ICONS: Record<number, string> = {
  0: '',       // Idle — no icon
  1: '\u{1F6B6}',    // Walking
  2: '\u{1F37D}\uFE0F',    // Eating
  3: '\u{1F4AC}',    // Talking
  4: '\u2694\uFE0F',    // Fighting
  5: '\u{1F495}',    // Mating
  6: '\u{1F528}',    // Building
  7: '\u26CF\uFE0F',    // Gathering
  8: '\u{1F525}',    // Cooking
  9: '\u{1F4A4}',    // Sleeping
  10: '\u{1F3F4}',   // Raiding
};

// ── Session State ────────────────────────────────────────────

let gameActive = false;

// Game world
let voxelWorld: VoxelWorld;
let voxelRenderer: VoxelRenderer;
let waterFlow: WaterFlow;

// Creatures & Monsters
let critterManager: CritterManager;
let critterRenderer: CritterRenderer;
let monsterManager: MonsterManager;
let monsterRenderer: MonsterRenderer;

// World state
let seasonState: SeasonState;
let dayNight: DayNightState;
let factionManager: FactionManager;
let territorySystem: TerritorySystem;
let borderRenderer: BorderRenderer;
let zodiac: ZodiacCycle;
let sephirothSystem: SephirothSystem;
let politicsSystem: PoliticsSystem;
let marketSystem: MarketSystem;
let resourceGrid: ResourceGrid;
let dialecticSystem: DialecticSystem;
let raidSystem: RaidSystem;

// Per-session managed objects
let dataLogger: DataLogger;
let bubbleManager: SpeechBubbleManager;
let gameUI: GameUI;
let miningParticles: MiningParticles;
let buildingVoxelRenderer: BuildingVoxelRenderer;
let buildingSystem: BuildingSystem;

// God Hand & Divine Power
let godHand: GodHand;
let godHandVisuals: GodHandVisuals;
let divinePower: DivinePowerState;

// ECS
let world: World;
let hierarchySystem: HierarchySystem;

// Counters
let nextNameSeed = 1;
let generation = 0;
let selectedId = -1;
let selectedCreatureIndex = -1;
let selectedFactionFilter = -1; // -1 = all factions
let trackingEnabled = false;
let hudTimer = 0;
let diplomacyTimer = 0;

// ── Camera State (persistent) ────────────────────────────────

const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
const camTarget = new THREE.Vector3(0, 0, 0);
let camZoom = 50;
let camAngle = 0;
const CAM_PITCH = Math.PI / 4;
const CAM_PAN_SPEED = 30;
const CAM_FAST_MULT = 3;
let isDragging = false;
let lastMouseX = 0;
let lastMouseY = 0;
const keysDown = new Set<string>();

const SIM_DT = 0.05;

// ── Helpers ──────────────────────────────────────────────────

function frame(): Promise<void> {
  return new Promise(r => setTimeout(r, 0));
}

function getAliveCreatureIds(): number[] {
  if (!gameActive) return [];
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
    if (gameActive) gameUI.update();
  }
}

function cycleCreature(dir: number): void {
  let alive = getAliveCreatureIds();
  // Filter by selected faction if active
  if (selectedFactionFilter >= 0) {
    alive = alive.filter(id => {
      const s = SocialStore.get(id);
      return s && s.factionId === selectedFactionFilter;
    });
  }
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

// ── Divine Drop Handler ──────────────────────────────────────

function handleDivineDrop(drop: DropResult): void {
  if (!drop.valid) {
    // Bounce back to origin — already done by GodHand returning origin coords
    godHandVisuals.spawnDropBurst(drop.dropX, 1, drop.dropZ, 0xff4444);
    return;
  }

  // Calculate biomes
  const originBiome = godHand.getBiomeIndex(drop.originX, drop.originZ);
  const dropBiome = godHand.getBiomeIndex(drop.dropX, drop.dropZ);
  const distance = Math.sqrt(
    (drop.dropX - drop.originX) ** 2 + (drop.dropZ - drop.originZ) ** 2
  );

  // Spend power
  let cost = POWER_COST_PICKUP;
  if (originBiome !== dropBiome) cost += POWER_COST_BIOME_CHANGE;
  spendPower(divinePower, cost);

  // Place creature at drop position
  const transform = TransformStore.get(drop.entityId);
  if (transform) {
    transform.x = drop.dropX;
    transform.z = drop.dropZ;
    transform.y = voxelWorld.getHeightWorld(drop.dropX, drop.dropZ);
  }

  // Pre-zealotry for logging
  const z = ZealotryStore.get(drop.entityId);
  const preZealotry = z?.zealotry ?? 0;

  // Calculate divine response
  const result = calculateDivineResponse(
    drop.entityId, originBiome, dropBiome, distance, simStats.tick,
  );

  // Drop particles — color based on stance
  const burstColor =
    result.stance === CultStance.Terror ? 0xff2222 :
    result.stance === CultStance.Awe ? 0xaa88ff :
    result.stance === CultStance.Devotion ? 0xffd700 :
    result.stance === CultStance.Rebellion ? 0x333333 :
    0xffffff;
  godHandVisuals.spawnDropBurst(drop.dropX, transform?.y ?? 1, drop.dropZ, burstColor);

  // Propagate witness effect
  const aliveIds = getAliveCreatureIds();
  const witnessCount = propagateWitnessEffect(
    drop.entityId, drop.dropX, drop.dropZ, simStats.tick, aliveIds,
    (entityId, emoji, x, y, z) => {
      bubbleManager.showSpeech(entityId, emoji, new THREE.Vector3(x, y, z));
    },
  );

  // Log to DataLogger
  dataLogger.recordGodAction({
    tick: simStats.tick,
    entityId: drop.entityId,
    originX: drop.originX,
    originZ: drop.originZ,
    dropX: drop.dropX,
    dropZ: drop.dropZ,
    originBiome,
    dropBiome,
    distance,
    preZealotry,
    postZealotry: z?.zealotry ?? 0,
    stance: result.stance,
    witnessCount,
    powerCost: cost,
  });

  // SimStats
  simStats.recordGodAction(cost);

  // Speech bubble for the dropped creature
  const social = SocialStore.get(drop.entityId);
  if (social) {
    const stanceEmoji =
      result.stance === CultStance.Terror ? '😱' :
      result.stance === CultStance.Awe ? '😲' :
      result.stance === CultStance.Devotion ? '🙏' :
      result.stance === CultStance.Rebellion ? '😡' : '❓';
    social.speechEmoji = stanceEmoji;
    social.speechTimer = 60;
  }
}

// ── Game Session Management ──────────────────────────────────

function createGameSystems(): void {
  resetEntityId(0);

  // Voxel world
  voxelWorld = new VoxelWorld();
  waterFlow = new WaterFlow(voxelWorld);
  voxelRenderer = new VoxelRenderer(voxelWorld, scene);

  // Creatures & monsters
  critterManager = new CritterManager();
  critterManager.voxelWorld = voxelWorld;
  monsterManager = new MonsterManager();
  critterRenderer = new CritterRenderer(scene);
  critterRenderer.voxelWorld = voxelWorld;
  monsterRenderer = new MonsterRenderer(scene);

  // World state
  seasonState = createSeasonState();
  dayNight = createDayNight();
  factionManager = new FactionManager();
  territorySystem = new TerritorySystem();
  borderRenderer = new BorderRenderer(scene);
  zodiac = new ZodiacCycle();

  // Resource grid
  resourceGrid = new ResourceGrid();
  resourceGrid.init();

  sephirothSystem = new SephirothSystem();
  sephirothSystem.factionManager = factionManager;

  const religionSystem = new ReligionSystem();
  religionSystem.factionManager = factionManager;
  religionSystem.grid = resourceGrid;

  politicsSystem = new PoliticsSystem();
  politicsSystem.factionManager = factionManager;
  politicsSystem.territory = territorySystem;

  // Create RaidSystem and wire to PoliticsSystem
  raidSystem = new RaidSystem();
  raidSystem.factionManager = factionManager;
  raidSystem.politicsSystem = politicsSystem;
  raidSystem.territory = territorySystem;
  politicsSystem.raidSystem = raidSystem;

  // Create DialecticSystem
  dialecticSystem = new DialecticSystem();
  dialecticSystem.factionManager = factionManager;
  dialecticSystem.politicsSystem = politicsSystem;
  dialecticSystem.territory = territorySystem;

  sephirothSystem.politicsSystem = politicsSystem;
  sephirothSystem.territory = territorySystem;

  marketSystem = new MarketSystem();
  marketSystem.factionManager = factionManager;

  // Per-session objects
  dataLogger = new DataLogger();
  bubbleManager = new SpeechBubbleManager(camera, renderer);
  miningParticles = new MiningParticles(scene);
  godHand = new GodHand(scene, camera, renderer);
  godHand.setVoxelWorld(voxelWorld);
  godHandVisuals = new GodHandVisuals(scene);
  divinePower = createDivinePower();

  // ECS World
  world = new World();
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
  world.registerStorage(CombatStore as any);
  world.registerStorage(DiaryStore as any);

  // Systems
  hierarchySystem = new HierarchySystem();
  hierarchySystem.factionManager = factionManager;

  const socialSystem = new SocialSystem();
  socialSystem.factionManager = factionManager;
  socialSystem.hierarchySystem = hierarchySystem;
  socialSystem.politicsSystem = politicsSystem;
  socialSystem.seasonState = seasonState;

  const reproSystem = new ReproductionSystem();
  reproSystem.scene = scene;
  reproSystem.hierarchySystem = hierarchySystem;
  reproSystem.onSpawn = (genome: CreatureGenome, x: number, z: number) => {
    spawnCreature(genome, x, z);
    generation++;
  };

  buildingSystem = new BuildingSystem();
  buildingSystem.scene = scene;
  buildingVoxelRenderer = new BuildingVoxelRenderer(scene);
  buildingSystem.voxelRenderer = buildingVoxelRenderer;
  buildingSystem.grid = resourceGrid;

  const gatheringSystem = new GatheringSystem();
  gatheringSystem.voxelWorld = voxelWorld;
  gatheringSystem.waterFlow = waterFlow;
  gatheringSystem.miningParticles = miningParticles;

  const sensorySystem = new SensorySystem();
  sensorySystem.voxelWorld = voxelWorld;
  sensorySystem.factionManager = factionManager;
  sensorySystem.critterManager = critterManager;
  sensorySystem.monsterManager = monsterManager;
  sensorySystem.grid = resourceGrid;

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

  const goalSystem = new GoalSystem();
  goalSystem.factionManager = factionManager;

  const constructionSystem = new ConstructionSystem();
  constructionSystem.voxelWorld = voxelWorld;
  constructionSystem.miningParticles = miningParticles;
  buildingSystem.constructionSystem = constructionSystem;
  buildingSystem.voxelWorld = voxelWorld;

  const huntingSystem = new HuntingSystem();
  huntingSystem.critterManager = critterManager;
  huntingSystem.factionManager = factionManager;

  const craftingSystem = new CraftingSystem();
  craftingSystem.voxelWorld = voxelWorld;

  const cookingSystem = new CookingSystem();

  // Wire politics → building for housing ratio
  politicsSystem.buildingSystem = buildingSystem;

  // Add ResourceGridSystem early (priority 5)
  world.addSystem(new ResourceGridSystem(resourceGrid, seasonState)); // 5
  world.addSystem(sensorySystem);              // 10
  world.addSystem(new MemorySystem());         // 11
  world.addSystem(new ExpressionSystem());     // 12
  world.addSystem(brainSystem);                // 20
  world.addSystem(goalSystem);                // 22
  world.addSystem(instinctSystem);             // 25
  world.addSystem(biochemistrySystem);         // 30
  world.addSystem(new MetabolismSystem());     // 35
  world.addSystem(religionSystem);             // 38
  world.addSystem(hierarchySystem);            // 40
  world.addSystem(marketSystem);               // 44
  world.addSystem(socialSystem);               // 45
  const tacticalCombatSystem = new TacticalCombatSystem();
  tacticalCombatSystem.monsterManager = monsterManager;
  tacticalCombatSystem.dayNight = dayNight;
  tacticalCombatSystem.factionManager = factionManager;

  world.addSystem(motorSystem);                // 50
  world.addSystem(cookingSystem);              // 54
  world.addSystem(new EatingSystem());         // 55
  world.addSystem(tacticalCombatSystem);        // 56
  world.addSystem(gatheringSystem);            // 57
  world.addSystem(huntingSystem);              // 58
  world.addSystem(reproSystem);                // 60
  world.addSystem(craftingSystem);             // 63
  world.addSystem(constructionSystem);         // 64
  world.addSystem(buildingSystem);             // 65
  world.addSystem(new ShaderSystem());         // 95
  world.addSystem(new AnimationSystem());      // 96
  const renderSystem = new RenderSystem();
  renderSystem.godHand = godHand;
  world.addSystem(renderSystem);              // 100

  // Wire divine power into religion system & god hand
  religionSystem.divinePower = divinePower;
  godHand.canAfford = () => divinePower.power >= POWER_COST_PICKUP;
  godHand.onPowerFail = () => {
    // Brief flash on topbar power cell
    const topbar = document.getElementById('gui-topbar');
    if (topbar) {
      topbar.style.boxShadow = '0 0 20px rgba(255,50,50,0.5)';
      setTimeout(() => { topbar.style.boxShadow = ''; }, 300);
    }
  };
}

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
  world.addComponent(id, CombatStore, createCombat(
    genome.combatWeightsIH, genome.combatBiasH,
    genome.combatWeightsHO, genome.combatBiasO,
  ));

  // Diary component
  const diary = createDiary();
  world.addComponent(id, DiaryStore, diary);

  // Faction assignment
  const faction = factionManager.assignFaction(id, genome);
  const name = creatureName(nextNameSeed++);
  world.addComponent(id, SocialStore, createSocial(name, faction.id));

  // Born diary entry
  addDiaryEntry(diary, dayNight.dayCount * 6000, DiaryEventType.Born, {
    factionName: faction.name !== 'Wanderers' ? faction.name : '',
  });

  // Set up label
  bubbleManager.setLabel(id, faction.emoji, name, new THREE.Vector3(x, 0, z));

  simStats.recordBirth();
  return id;
}

/** Rebuild Three.js mesh for a loaded creature (after deserialization) */
function rebuildCreatureMesh(id: number): void {
  const genomeData = GenomeStore.get(id);
  if (!genomeData) return;
  const { group: mesh, uniforms } = buildCreatureMesh(genomeData.genome);
  mesh.userData.entityId = id;
  scene.add(mesh);
  world.addComponent(id, RenderableStore, { object: mesh });
  world.addComponent(id, ShaderStateStore, { uniforms });

  const t = TransformStore.get(id);
  if (t) {
    mesh.position.set(t.x, t.y, t.z);
    mesh.rotation.y = t.rotation;
  }

  const social = SocialStore.get(id);
  if (social) {
    const faction = factionManager.getFaction(id);
    if (faction) {
      bubbleManager.setLabel(id, faction.emoji, social.name, new THREE.Vector3(t?.x ?? 0, 0, t?.z ?? 0));
    }
  }
}

function spawnInitialCreatures(): void {
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

      // Give starting inventory for building and survival
      const inv = InventoryStore.get(id)!;
      addItem(inv, ItemType.RawStone, 5);
      addItem(inv, ItemType.RawWood, 3);
      addItem(inv, ItemType.RawBerry, 3);
    }
  }

  // Pre-spawn CraftingTables near spawn areas
  for (const group of spawnGroups) {
    const [bx, , bz] = voxelWorld.worldToBlock(group.cx, 0, group.cz);
    const surfY = voxelWorld.getHeight(bx, bz);
    voxelWorld.setBlock(bx, surfY + 1, bz, Block.CraftingTable);
  }
}

function cleanupGame(): void {
  // Persist run data if tracking enabled
  if (trackingEnabled && simStats.tick > 100) {
    simStats.seed = voxelWorld?.seed ?? 0;
    finalizeAndSaveRun();
  }

  gameActive = false;
  selectedId = -1;
  selectedCreatureIndex = -1;
  hudTimer = 0;
  diplomacyTimer = 0;
  nextNameSeed = 1;
  generation = 0;

  // Clear ECS data (component stores are singletons)
  if (world) world.clearAll();

  // Dispose renderers
  if (voxelRenderer) voxelRenderer.dispose();
  if (buildingVoxelRenderer) buildingVoxelRenderer.dispose();
  if (monsterRenderer) monsterRenderer.dispose();
  if (borderRenderer) borderRenderer.dispose();
  if (miningParticles) miningParticles.dispose();

  // Remove all scene children except lights
  const children = [...scene.children];
  for (const child of children) {
    if (child !== ambientLight && child !== sunLight) {
      scene.remove(child);
    }
  }

  // Hide persistent UI panels
  chartPanel.visible = false;
  (chartPanel as any).canvas.style.display = 'none';
  dashboard.visible = false;
  (dashboard as any).canvas.style.display = 'none';
  godMode.release();

  // Remove per-session DOM elements
  if (gameUI) gameUI.dispose();
  if (bubbleManager) (bubbleManager as any).container?.remove();

  // Reset camera
  camTarget.set(0, 0, 0);
  camZoom = 50;
  camAngle = 0;
}

/** Wire persistent UI panels to current session state, create per-session GameUI */
function wireSessionUI(): void {
  // ChartPanel — persistent, update refs & reset data
  chartPanel.factionManager = factionManager;
  chartPanel.sephiroth = sephirothSystem;
  chartPanel.zodiac = zodiac;
  (chartPanel as any).history.clear();
  (chartPanel as any).tickCounter = 0;

  // Dashboard — persistent, update refs & reset data
  dashboard.factionManager = factionManager;
  dashboard.dataLogger = dataLogger;
  (dashboard as any).traitHistory = [];
  (dashboard as any).eventLog = [];
  (dashboard as any).tickCounter = 0;
  (dashboard as any).startTime = performance.now();

  // GameUI — per-session
  gameUI = new GameUI({
    world,
    factionManager,
    politicsSystem,
    hierarchySystem,
    dayNight,
    seasonState,
    generation: () => generation,
    selectedId: () => selectedId,
    selectedFactionFilter: () => selectedFactionFilter,
    onSelectCreature: (id: number) => jumpToCreature(id),
    onCycleCreature: (dir: number) => cycleCreature(dir),
    onSelectFaction: (fid: number) => {
      selectedFactionFilter = fid;
      gameUI.update();
    },
    divinePower: () => divinePower ?? null,
  });
}

// ── New Game / Load Game / Save ──────────────────────────────

async function startNewGame(seed: number): Promise<void> {
  mainMenu.hide();
  loadingScreen.show('Generating world...');
  await frame();

  cleanupGame();
  resetSimStats();
  simStats.seed = seed;
  simStats.startedAt = Date.now();
  createGameSystems();

  voxelWorld.generate(seed);
  loadingScreen.setProgress(30);
  loadingScreen.setStatus('Building terrain...');
  await frame();

  voxelRenderer.buildAll();
  loadingScreen.setProgress(50);
  loadingScreen.setStatus('Spawning creatures...');
  await frame();

  critterManager.init();
  spawnInitialCreatures();

  // Rebuild dirty chunks after pre-placed crafting tables
  voxelRenderer.buildAll();
  loadingScreen.setProgress(85);
  loadingScreen.setStatus('Starting simulation...');
  await frame();

  wireSessionUI();

  gameActive = true;
  loadingScreen.setProgress(100);
  await frame();
  loadingScreen.hide();
}

async function loadGame(file: File): Promise<void> {
  mainMenu.hide();
  loadingScreen.show('Reading save file...');
  await frame();

  try {
    const raw = await readFileAsUint8(file);
    loadingScreen.setProgress(15);
    loadingScreen.setStatus('Decompressing...');
    await frame();

    const json = await decompressGzip(raw);
    loadingScreen.setProgress(30);
    loadingScreen.setStatus('Parsing...');
    await frame();

    let save: SaveData;
    try {
      save = JSON.parse(json);
    } catch (parseError) {
      throw new Error('Invalid save file format. The file may be corrupted.');
    }

    cleanupGame();
    resetSimStats();
    createGameSystems();

    loadingScreen.setStatus('Restoring world...');
    loadingScreen.setProgress(45);
    await frame();

    let result;
    try {
      result = deserializeGame(save, {
        voxelWorld, world, factionManager, territorySystem, politicsSystem,
        critterManager, monsterManager, sephirothSystem, seasonState,
        dayNight, zodiac, marketSystem, resourceGrid, raidSystem, dialecticSystem,
      });
    } catch (deserializeError) {
      throw new Error(`Failed to restore game state: ${deserializeError instanceof Error ? deserializeError.message : 'Unknown error'}`);
    }

    loadingScreen.setStatus('Building terrain...');
    loadingScreen.setProgress(60);
    await frame();

    voxelRenderer.buildAll();

    loadingScreen.setStatus('Rebuilding creatures...');
    loadingScreen.setProgress(75);
    await frame();

    // Rebuild Three.js meshes for all loaded creatures
    for (const id of result.creatureIds) {
      rebuildCreatureMesh(id);
    }

    // Restore building visuals
    for (const bid of result.buildingIds) {
      const building = BuildingStore.get(bid);
      const bt = TransformStore.get(bid);
      if (building && bt) {
        buildingVoxelRenderer.addBuilding(bt.x, bt.z, building.type, 0);
      }
    }
    buildingVoxelRenderer.rebuild();

    // Restore session state
    generation = result.generation;
    nextNameSeed = result.nextNameSeed;
    camTarget.set(result.camera.x, 0, result.camera.z);
    camZoom = result.camera.zoom;
    camAngle = result.camera.angle;

    loadingScreen.setStatus('Starting simulation...');
    loadingScreen.setProgress(90);
    await frame();

    wireSessionUI();

    gameActive = true;
    loadingScreen.setProgress(100);
    await frame();
    loadingScreen.hide();
  } catch (error) {
    loadingScreen.setStatus(`Error: ${error instanceof Error ? error.message : 'Failed to load game'}`);
    console.error('Load game error:', error);
    await new Promise(r => setTimeout(r, 3000));
    loadingScreen.hide();
    mainMenu.show();
  }
}

async function saveGame(): Promise<void> {
  if (!gameActive) return;

  loadingScreen.show('Saving...');
  await frame();

  try {
    const save = serializeGame({
      voxelWorld, world, factionManager, territorySystem, politicsSystem,
      critterManager, monsterManager, sephirothSystem, seasonState,
      dayNight, zodiac, marketSystem, generation, nextNameSeed,
      camera: { x: camTarget.x, z: camTarget.z, zoom: camZoom, angle: camAngle },
      resourceGrid, raidSystem, dialecticSystem,
    });

    loadingScreen.setProgress(40);
    loadingScreen.setStatus('Compressing...');
    await frame();

    const json = JSON.stringify(save);
    const compressed = await compressGzip(json);

    loadingScreen.setProgress(80);
    await frame();

    const worldName = save.worldName.replace(/[^a-zA-Z0-9]/g, '_');
    downloadFile(compressed, `${worldName}.creatures`);

    loadingScreen.setProgress(100);
    loadingScreen.setStatus('Saved!');
    await new Promise(r => setTimeout(r, 500));
    loadingScreen.hide();
  } catch (error) {
    loadingScreen.setStatus(`Error: ${error instanceof Error ? error.message : 'Failed to save game'}`);
    console.error('Save game error:', error);
    await new Promise(r => setTimeout(r, 3000));
    loadingScreen.hide();
  }
}

function returnToMenu(): void {
  if (!confirm('Return to menu? Unsaved progress will be lost.')) return;
  cleanupGame();
  mainMenu.show();
}

// ── Input Handlers (persistent) ──────────────────────────────

window.addEventListener('keydown', (e) => {
  keysDown.add(e.key.toLowerCase());

  // Ctrl+S: Save game
  if ((e.key === 's' || e.key === 'S') && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    saveGame();
    return;
  }

  if (!gameActive) return;

  // Creature cycling: [ and ] or < and >
  if (e.key === '[' || e.key === ',') cycleCreature(-1);
  if (e.key === ']' || e.key === '.') cycleCreature(1);

  // F: follow selected creature (snap camera to it)
  if ((e.key === 'f' || e.key === 'F') && selectedId >= 0) {
    jumpToCreature(selectedId);
  }

  // Escape: deselect or return to menu
  if (e.key === 'Escape') {
    if (selectedId >= 0) {
      selectedId = -1;
      gameUI.update();
    } else {
      returnToMenu();
    }
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

// Track mouse for right-click drag panning + god hand
window.addEventListener('mousemove', (e) => {
  // God hand drag
  if (godHand?.isActive) {
    godHand.onMouseMove(e);
  }

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

// Left-click: creature selection + god hand
renderer.domElement.addEventListener('mousedown', (e) => {
  if (!gameActive) return;

  if (e.button === 0) {
    // Try god hand first
    if (godHand && godHand.onMouseDown(e, world)) {
      return; // god hand captured this click
    }

    // Normal selection
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
  if (e.button === 0 && godHand?.isActive) {
    const drop = godHand.onMouseUp(e);
    if (drop) handleDivineDrop(drop);
    return;
  }
  if (e.button === 2) isDragging = false;
});
renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());
renderer.domElement.addEventListener('wheel', (e) => {
  camZoom = Math.max(10, Math.min(200, camZoom + e.deltaY * 0.08));
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ── Camera Update ────────────────────────────────────────────

function updateCamera(): void {
  const dt = 1 / 60;
  const speed = keysDown.has('shift') ? CAM_PAN_SPEED * CAM_FAST_MULT : CAM_PAN_SPEED;

  // WASD pan on XZ plane (relative to camera angle)
  let mx = 0, mz = 0;
  if (keysDown.has('w') || keysDown.has('arrowup')) mz -= 1;
  if (keysDown.has('s') || keysDown.has('arrowdown')) mz += 1;
  if (keysDown.has('a') || keysDown.has('arrowleft')) mx -= 1;
  if (keysDown.has('d') || keysDown.has('arrowright')) mx += 1;

  // Rotate movement by camera angle
  const cosA = Math.cos(camAngle);
  const sinA = Math.sin(camAngle);
  camTarget.x += (mx * cosA - mz * sinA) * speed * dt;
  camTarget.z += (mx * sinA + mz * cosA) * speed * dt;

  // Smoothly follow selected creature
  if (selectedId >= 0 && world?.has(selectedId) && keysDown.has('f')) {
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

// ── Simulation Loop ──────────────────────────────────────────

function animate(): void {
  requestAnimationFrame(animate);

  if (!gameActive) {
    updateCamera();
    renderer.render(scene, camera);
    return;
  }

  const time = performance.now() * 0.001;

  zodiac.advance();
  updateSeason(seasonState);
  updateDayNight(dayNight);
  world.update(SIM_DT);
  godMode.update(world, camera);

  // God Hand: update hold timer + divine particles
  godHand.update();
  if (godHand.isCarrying) {
    godHandVisuals.updateTrail(godHand.dragWorldPos.x, godHand.dragWorldPos.y + 2.0, godHand.dragWorldPos.z, SIM_DT);
  } else {
    godHandVisuals.tick(SIM_DT); // still update active particles
  }

  // GodMode possession: generate power while possessing
  if (godMode.active && godMode.possessedId >= 0) {
    divinePower.power = Math.min(divinePower.power + 0.005, divinePower.maxPower * 1.5);
    divinePower.totalGenerated += 0.005;
  }

  dashboard.selectedCreatureId = selectedId;
  dashboard.tick(world, zodiac.tick);

  // SimStats tick — compute population averages
  simStats.tick++;

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
  // SimStats population snapshot
  {
    let sumH = 0, sumE = 0, sumG = 0;
    for (let i = 0; i < aliveCreatures.length; i++) {
      const bc = BiochemStore.get(aliveCreatures[i]);
      if (bc) {
        sumH += bc.chemicals[ChemId.Hunger];
        sumE += bc.chemicals[ChemId.Energy];
        sumG += bc.chemicals[ChemId.Glucose];
      }
    }
    const n = aliveCreatures.length || 1;
    simStats.tickUpdate(aliveCreatures.length, sumH / n, sumE / n, sumG / n);
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
              learnEmoji(fVocab, '\u2694\uFE0F');
              social.speechEmoji = '\u2694\uFE0F';
              social.speechTimer = 40;
            }
            // Diary: monster kill
            const mDiary = DiaryStore.get(cid);
            const MONSTER_NAMES = ['Skeleton', 'Demon', 'Spider', 'Zombie'];
            if (mDiary) addDiaryEntry(mDiary, dayNight.dayCount * 6000, DiaryEventType.MonsterKill, {
              detail: MONSTER_NAMES[monsterManager.type[mi]] ?? 'monster',
            });
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
  if (diplomacyTimer >= TIMERS.DIPLOMACY_UPDATE_INTERVAL) {
    diplomacyTimer = 0;
    factionManager.updateDiplomacy();
    factionManager.updateBreedingCulture();
    territorySystem.tick(world);
    politicsSystem.tick(world);
    borderRenderer.update(territorySystem, factionManager);
    sephirothSystem.tick(world);
    dialecticSystem.tick(world, simStats.tick);
    raidSystem.tick(world, simStats.tick);
    chartPanel.tick();

    // Log stats every ~5000 ticks to console for backtesting
    if (simStats.tick > 0 && simStats.tick % STATS.LOG_INTERVAL < STATS.LOG_WINDOW) {
      console.log(simStats.summary());
    }

    // Update settlement data for all active factions
    for (const faction of factionManager.activeFactions) {
      const center = buildingSystem.factionCenters.get(faction.id);
      const counts = buildingSystem.factionBuildingCounts.get(faction.id);
      let totalBuildings = 0;
      if (counts) {
        for (const c of counts.values()) totalBuildings += c;
      }
      faction.buildingCount = totalBuildings;
      if (center) {
        faction.settlementX = center.x;
        faction.settlementZ = center.z;
      }
      faction.settlementTier = getSettlementTier(totalBuildings, faction.memberIds.size);

      // Update world-space settlement labels
      if (faction.settlementTier && faction.name !== 'Wanderers') {
        bubbleManager.setSettlementLabel(
          faction.id, faction.name, faction.settlementTier, faction.emoji,
          new THREE.Vector3(faction.settlementX, 0, faction.settlementZ),
        );
      } else {
        bubbleManager.removeSettlementLabel(faction.id);
      }
    }
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

  // Mining particle effects
  miningParticles.updateParticles(SIM_DT);

  updateCamera();
  renderer.render(scene, camera);
}

// ── Startup ──────────────────────────────────────────────────

mainMenu.onNewWorld = (seed) => {
  trackingEnabled = mainMenu.trackingEnabled;
  startNewGame(seed);
};
mainMenu.onLoadWorld = (file) => {
  trackingEnabled = mainMenu.trackingEnabled;
  loadGame(file);
};
mainMenu.show();

requestAnimationFrame(animate);
