// Serializer: captures entire game state into a SaveData object

import type { SaveData, SerializedEntity, SerializedBrain, SerializedFaction } from './SaveFormat';
import { SAVE_VERSION } from './SaveFormat';
import { uint8ToBase64, float32ToArray, uint8ToArray, int16ToArray, int32ToArray } from './Compression';
import type { VoxelWorld } from '../voxel/VoxelWorld';
import type { World } from '../ecs/World';
import { TransformStore } from '../components/Transform';
import { BrainStore } from '../components/Brain';
import { GenomeStore } from '../components/Genome';
import { BiochemStore } from '../components/Biochemistry';
import { MotorStore } from '../components/Motor';
import { SensesStore } from '../components/Senses';
import { LifecycleStore } from '../components/Lifecycle';
import { SocialStore } from '../components/Social';
import { InventoryStore } from '../components/Inventory';
import { MatingStore } from '../components/Mating';
import { ExpressionStore } from '../components/Expression';
import { GoalStore } from '../components/Goal';
import { ZealotryStore } from '../components/Zealotry';
import { MemoryStore } from '../components/Memory';
import { VocabularyStore } from '../components/Vocabulary';
import { CombatStore } from '../components/Combat';
import { DiaryStore } from '../components/Diary';
import { EggStore } from '../components/Egg';
import { BuildingStore } from '../components/Building';
import { getNextEntityId } from '../ecs/Entity';
import type { FactionManager } from '../world/FactionSystem';
import type { TerritorySystem } from '../world/TerritorySystem';
import type { PoliticsSystem } from '../world/PoliticsSystem';
import type { CritterManager } from '../world/PreyCritters';
import type { MonsterManager } from '../world/MonsterManager';
import type { SephirothSystem } from '../world/Sephiroth';
import type { SeasonState } from '../world/Seasons';
import type { ZodiacCycle } from '../world/Zodiac';
import type { BrainState } from '../brain/CTRNN';

export interface SerializerInput {
  voxelWorld: VoxelWorld;
  world: World;
  factionManager: FactionManager;
  territorySystem: TerritorySystem;
  politicsSystem: PoliticsSystem;
  critterManager: CritterManager;
  monsterManager: MonsterManager;
  sephirothSystem: SephirothSystem;
  seasonState: SeasonState;
  dayNight: { timeOfDay: number; dayCount: number; isNight: boolean; lightLevel: number; sunAngle: number };
  zodiac: ZodiacCycle;
  marketSystem: any;
  raidSystem?: any;
  dialecticSystem?: any;
  marketPanel?: any;
  generation: number;
  nextNameSeed: number;
  camera: { x: number; z: number; zoom: number; angle: number };
  worldName?: string;
}

export function serializeGame(input: SerializerInput): SaveData {
  const { voxelWorld, world, factionManager, territorySystem, politicsSystem,
    critterManager, monsterManager, sephirothSystem, seasonState, dayNight,
    zodiac, marketSystem, generation, nextNameSeed, camera } = input;

  // Serialize chunks as base64
  const chunks: string[] = [];
  for (const chunk of voxelWorld.chunks) {
    chunks.push(uint8ToBase64(chunk.blocks));
  }

  // Serialize all entities
  const entities: SerializedEntity[] = [];
  for (const id of world.allEntities()) {
    entities.push(serializeEntity(id));
  }

  // Serialize factions
  const factions: SerializedFaction[] = [];
  for (const f of factionManager.activeFactions) {
    factions.push({
      id: f.id,
      name: f.name,
      emoji: f.emoji,
      memberIds: Array.from(f.memberIds),
      color: f.color,
      relations: Array.from(f.relations.entries()),
      avgMonogamy: f.avgMonogamy,
      breedingNorm: f.breedingNorm,
      doctrine: f.doctrine,
      philosophy: f.philosophy,
      foundedTick: f.foundedTick,
      settlementX: f.settlementX,
      settlementZ: f.settlementZ,
      settlementTier: f.settlementTier,
      buildingCount: f.buildingCount,
    });
  }

  // Entity-faction map
  const entityFaction: [number, number][] = [];
  for (const id of world.allEntities()) {
    const social = SocialStore.get(id);
    if (social) entityFaction.push([id, social.factionId]);
  }

  // Social bonds
  const socialBonds: SaveData['socialBonds'] = [];
  if ((factionManager as any).socialBonds) {
    for (const bond of (factionManager as any).socialBonds.values()) {
      socialBonds.push({
        a: bond.entityA, b: bond.entityB,
        strength: bond.strength, interactions: bond.interactions,
      });
    }
  }

  // Territory
  const territory = {
    owner: int16ToArray((territorySystem as any).owner),
    contested: uint8ToArray((territorySystem as any).contested),
  };

  // Politics
  const nations: [number, any][] = [];
  if ((politicsSystem as any).nationData) {
    for (const [fid, nd] of (politicsSystem as any).nationData.entries()) {
      nations.push([fid, {
        territory: nd.territory,
        capital: nd.capital,
        government: nd.government,
        laws: { ...nd.laws },
        warTargets: Array.from(nd.warTargets),
        allies: Array.from(nd.allies),
        vassals: Array.from(nd.vassals),
        overlord: nd.overlord,
        warStartTick: Array.from(nd.warStartTick.entries()),
        warExhaustion: nd.warExhaustion,
        embassies: Array.from(nd.embassies),
      }]);
    }
  }
  const politics = {
    tickCounter: (politicsSystem as any).tickCounter ?? 0,
    globalTick: (politicsSystem as any).globalTick ?? 0,
    nations,
  };

  // Critters
  const cm = critterManager as any;
  const critters = {
    count: cm.count,
    x: float32ToArray(cm.x),
    z: float32ToArray(cm.z),
    type: uint8ToArray(cm.type),
    alive: uint8ToArray(cm.alive),
    heading: float32ToArray(cm.heading),
    breedTimer: cm.breedTimer ?? 0,
  };

  // Monsters
  const mm = monsterManager as any;
  const monsters = {
    count: mm.count,
    type: uint8ToArray(mm.type),
    x: float32ToArray(mm.x),
    z: float32ToArray(mm.z),
    y: float32ToArray(mm.y),
    vx: float32ToArray(mm.vx),
    vz: float32ToArray(mm.vz),
    health: float32ToArray(mm.health),
    maxHealth: float32ToArray(mm.maxHealth),
    targetCreature: int32ToArray(mm.targetCreature),
    alive: uint8ToArray(mm.alive),
    attackCooldown: float32ToArray(mm.attackCooldown),
    deathCounter: mm.deathCounter ?? 0,
    spawnTimer: mm.spawnTimer ?? 0,
  };

  // Market
  const market = { totalTrades: (marketSystem as any).totalTrades ?? 0 };

  // Sephiroth
  const sephiroth: [number, { values: number[]; lastUpdate: number }][] = [];
  for (const [fid, metrics] of (sephirothSystem as any).metrics.entries()) {
    sephiroth.push([fid, { values: float32ToArray(metrics.values), lastUpdate: metrics.lastUpdate }]);
  }

  // Raids
  const raids: any[] = [];
  if (input.raidSystem) {
    for (const raid of (input.raidSystem as any).raids ?? []) {
      if (raid.resolved) continue; // only save active raids
      raids.push({
        id: raid.id,
        attackerFaction: raid.attackerFaction,
        defenderFaction: raid.defenderFaction,
        raiders: [...raid.raiders],
        targetX: raid.targetX,
        targetZ: raid.targetZ,
        homeX: raid.homeX,
        homeZ: raid.homeZ,
        phase: raid.phase,
        phaseTick: raid.phaseTick,
        loot: Array.from(raid.loot?.entries?.() ?? []),
        casualties: raid.casualties,
        resolved: false,
      });
    }
  }

  // Dialectic states
  const dialecticStates: [number, any][] = [];
  if (input.dialecticSystem) {
    for (const [fid, state] of (input.dialecticSystem as any).states?.entries?.() ?? []) {
      dialecticStates.push([fid, { ...state }]);
    }
  }

  // Pillar states
  let pillarStates: any = undefined;
  if ((sephirothSystem as any).pillars) {
    const p = (sephirothSystem as any).pillars;
    pillarStates = {
      jachin: { ...p.jachin },
      boaz: { ...p.boaz },
      balance: p.balance,
      pulseHistory: p.pulseHistory.slice(-50), // save last 50 entries
    };
  }

  // Market ledger
  let marketLedger: any = undefined;
  if (input.marketPanel) {
    const mp = input.marketPanel as any;
    marketLedger = {
      trades: (mp.tradeRecords ?? []).slice(-500),
      totalTrades: (marketSystem as any).totalTrades ?? 0,
    };
  }

  return {
    version: SAVE_VERSION,
    seed: voxelWorld.seed,
    timestamp: Date.now(),
    worldName: input.worldName ?? `World ${voxelWorld.seed}`,
    generation,
    nextEntityId: getNextEntityId(),
    nextNameSeed,
    seasonTick: seasonState.tick,
    dayNight: { timeOfDay: dayNight.timeOfDay, dayCount: dayNight.dayCount },
    zodiacTick: zodiac.tick,
    chunks,
    camera,
    entities,
    factions,
    entityFaction,
    socialBonds,
    territory,
    politics,
    critters,
    monsters,
    market,
    sephiroth,
    raids,
    dialecticStates,
    pillarStates,
    marketLedger,
  };
}

function serializeBrain(brain: BrainState): SerializedBrain {
  return {
    states: float32ToArray(brain.states),
    outputs: float32ToArray(brain.outputs),
    biases: float32ToArray(brain.biases),
    taus: float32ToArray(brain.taus),
    connFrom: uint8ToArray(brain.connFrom),
    connTo: uint8ToArray(brain.connTo),
    connWeights: float32ToArray(brain.connWeights),
    connCount: brain.connCount,
  };
}

function serializeEntity(id: number): SerializedEntity {
  const se: SerializedEntity = { id, mask: 0 };

  const t = TransformStore.get(id);
  if (t) se.transform = { x: t.x, y: t.y, z: t.z, rotation: t.rotation };

  const b = BrainStore.get(id);
  if (b) se.brain = serializeBrain(b.brain);

  const g = GenomeStore.get(id);
  if (g) se.genome = g.genome; // Already a plain object

  const bc = BiochemStore.get(id);
  if (bc) se.biochem = float32ToArray(bc.chemicals);

  const m = MotorStore.get(id);
  if (m) se.motor = { ...m };

  // Senses: skip — regenerated each tick from environment
  // We do save a minimal placeholder so the component exists
  if (SensesStore.has(id)) se.senses = true;

  const lc = LifecycleStore.get(id);
  if (lc) se.lifecycle = { ...lc };

  const s = SocialStore.get(id);
  if (s) se.social = { ...s };

  const inv = InventoryStore.get(id);
  if (inv) se.inventory = {
    slots: inv.slots.map((sl: any) => ({ item: sl.item, count: sl.count })),
    equippedTool: inv.equippedTool,
    gatherTarget: inv.gatherTarget,
    gatherProgress: inv.gatherProgress,
  };

  const mt = MatingStore.get(id);
  if (mt) se.mating = { ...mt };

  const ex = ExpressionStore.get(id);
  if (ex) se.expression = {
    happiness: ex.happiness, fear: ex.fear, anger: ex.anger,
    curiosity: ex.curiosity, tiredness: ex.tiredness,
    pain: ex.pain, anxiety: ex.anxiety,
    mood: ex.mood, dominant: ex.dominant,
  };

  const gl = GoalStore.get(id);
  if (gl) se.goal = { ...gl };

  const z = ZealotryStore.get(id);
  if (z) se.zealotry = { ...z };

  const mem = MemoryStore.get(id);
  if (mem) se.memory = {
    entries: mem.entries.map((e: any) => ({ ...e })),
    nextSlot: mem.nextSlot,
  };

  const v = VocabularyStore.get(id);
  if (v) se.vocabulary = { known: Array.from(v.known), recent: [...v.recent] };

  const cb = CombatStore.get(id);
  if (cb) se.combat = {
    weightsIH: float32ToArray(cb.net.weightsIH),
    biasH: float32ToArray(cb.net.biasH),
    weightsHO: float32ToArray(cb.net.weightsHO),
    biasO: float32ToArray(cb.net.biasO),
  };

  const diary = DiaryStore.get(id);
  if (diary) se.diary = {
    entries: diary.entries.map(e => ({ ...e })),
    nextSlot: diary.nextSlot,
    totalEvents: diary.totalEvents,
    killCount: diary.killCount,
    tradeCount: diary.tradeCount,
    offspringCount: diary.offspringCount,
    gatherCount: diary.gatherCount,
  };

  const egg = EggStore.get(id);
  if (egg) se.egg = { genome: egg.genome, hatchTimer: egg.hatchTimer, parentFaction: egg.parentFaction };

  const bld = BuildingStore.get(id);
  if (bld) se.building = { ...bld };

  return se;
}
